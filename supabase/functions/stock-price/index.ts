import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds for price data
const MAX_RETRIES = 2;

// Market suffix mapping
const MARKET_SUFFIX: Record<string, string> = {
  NYSE: '',
  NASDAQ: '',
  TSX: '.TO',
  LSE: '.L',
  XETRA: '.DE',
  EURONEXT: '.PA',
  SIX: '.SW',
  NSE: '.NS',
  BSE: '.BO',
  TSE: '.T',
  HKEX: '.HK',
  SSE: '.SS',
  SZSE: '.SZ',
  KRX: '.KS',
  ASX: '.AX',
  SGX: '.SI',
  B3: '.SA',
  JSE: '.JO',
  MOEX: '.ME',
  TADAWUL: '.SR',
};

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || i === retries) return response;
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
    }
  }
  throw new Error('Max retries exceeded');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols } = await req.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ prices: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FINNHUB_API_KEY');
    if (!apiKey) {
      console.error('FINNHUB_API_KEY not configured');
      return new Response(
        JSON.stringify({ prices: {}, error: 'API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prices: Record<string, { 
      price: number; 
      change: number; 
      changePercent: number;
      previousClose: number;
      market: string;
      isMarketClosed?: boolean;
      lastUpdated?: number;
    }> = {};

    // Fetch prices for each symbol with batching
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (symbolData: { symbol: string; market: string }) => {
          const { symbol, market: stockMarket } = symbolData;
          
          // Build the correct symbol for Finnhub
          const suffix = MARKET_SUFFIX[stockMarket] || '';
          const finnhubSymbol = suffix ? `${symbol}${suffix}` : symbol;

          // Check cache
          const cacheKey = `price:${finnhubSymbol}`;
          const cached = cache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            prices[symbol] = cached.data as typeof prices[string];
            return;
          }

          try {
            const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(finnhubSymbol)}&token=${apiKey}`;
            const response = await fetchWithRetry(quoteUrl);
            
            if (!response.ok) {
              console.error(`Failed to fetch price for ${finnhubSymbol}: ${response.status}`);
              return;
            }

            const data = await response.json();
            
            // Finnhub quote response: c = current, d = change, dp = change percent, pc = previous close
            // IMPORTANT: Always show last available price even if market is closed
            // When market is closed, 'c' might be 0 but 'pc' (previous close) has the last price
            const currentPrice = data.c && data.c > 0 ? data.c : data.pc;
            const isMarketClosed = !data.c || data.c === 0 || data.t === 0;
            
            if (currentPrice && currentPrice > 0) {
              const priceData = {
                price: currentPrice,
                change: data.d || 0,
                changePercent: data.dp || 0,
                previousClose: data.pc || currentPrice,
                market: stockMarket,
                isMarketClosed: isMarketClosed,
                lastUpdated: data.t ? data.t * 1000 : Date.now() // Unix timestamp in ms
              };
              
              prices[symbol] = priceData;
              cache.set(cacheKey, { data: priceData, timestamp: Date.now() });
            }
          } catch (err) {
            console.error(`Error fetching price for ${symbol}:`, err);
          }
        })
      );
    }

    return new Response(
      JSON.stringify({ prices }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Stock price error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, prices: {} }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
