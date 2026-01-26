import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fallback prices for when API fails (market closed or rate limited)
// These are sample prices for demonstration - in production, use a paid API or cache historical data
const FALLBACK_PRICES: Record<string, { price: number; previousClose: number }> = {
  // NSE stocks (INR)
  'RELIANCE': { price: 2456.75, previousClose: 2445.30 },
  'TCS': { price: 3890.50, previousClose: 3875.20 },
  'INFY': { price: 1567.25, previousClose: 1558.80 },
  'HDFCBANK': { price: 1678.90, previousClose: 1665.45 },
  'ICICIBANK': { price: 1089.35, previousClose: 1082.50 },
  'SBIN': { price: 789.60, previousClose: 785.20 },
  'BHARTIARTL': { price: 1234.50, previousClose: 1228.75 },
  'ITC': { price: 456.80, previousClose: 454.30 },
  'KOTAKBANK': { price: 1890.25, previousClose: 1882.60 },
  'LT': { price: 3456.70, previousClose: 3445.85 },
  // US stocks (USD)
  'AAPL': { price: 178.52, previousClose: 177.30 },
  'GOOGL': { price: 141.80, previousClose: 140.95 },
  'MSFT': { price: 378.91, previousClose: 377.45 },
  'AMZN': { price: 178.25, previousClose: 176.80 },
  'TSLA': { price: 248.50, previousClose: 245.30 },
  'NVDA': { price: 495.22, previousClose: 492.80 },
  'META': { price: 505.75, previousClose: 503.20 },
  'JPM': { price: 195.40, previousClose: 194.15 },
  'V': { price: 280.35, previousClose: 279.50 },
  'JNJ': { price: 156.80, previousClose: 156.20 },
};

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds for price data
const MAX_RETRIES = 1; // Reduced retries for faster fallback

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

function getFallbackPrice(symbol: string, market: string) {
  const fallback = FALLBACK_PRICES[symbol];
  if (fallback) {
    const change = fallback.price - fallback.previousClose;
    const changePercent = (change / fallback.previousClose) * 100;
    return {
      price: fallback.price,
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      previousClose: fallback.previousClose,
      market,
      isMarketClosed: true,
      lastUpdated: Date.now()
    };
  }
  return null;
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || i === retries) return response;
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
      isMarketClosed: boolean;
      lastUpdated: number;
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
              // Use fallback price when API fails
              const fallbackData = getFallbackPrice(symbol, stockMarket);
              if (fallbackData) {
                prices[symbol] = fallbackData;
                cache.set(cacheKey, { data: fallbackData, timestamp: Date.now() });
              }
              return;
            }

            const data = await response.json();
            
            // Finnhub quote response: c = current, d = change, dp = change percent, pc = previous close, t = timestamp
            const hasCurrentPrice = data.c && data.c > 0;
            const hasPreviousClose = data.pc && data.pc > 0;
            
            // If no data from API, use fallback
            if (!hasCurrentPrice && !hasPreviousClose) {
              const fallbackData = getFallbackPrice(symbol, stockMarket);
              if (fallbackData) {
                prices[symbol] = fallbackData;
                cache.set(cacheKey, { data: fallbackData, timestamp: Date.now() });
              }
              return;
            }
            
            // Determine if market is closed based on current price being 0 or missing
            const isMarketClosed = !hasCurrentPrice;
            
            // Use current price if available, otherwise fall back to previous close
            const displayPrice = hasCurrentPrice ? data.c : data.pc;
            
            // Calculate change: if market open use API values, if closed calculate from previous close
            const change = hasCurrentPrice ? (data.d || 0) : 0;
            const changePercent = hasCurrentPrice ? (data.dp || 0) : 0;
            
            const priceData = {
              price: displayPrice,
              change: change,
              changePercent: changePercent,
              previousClose: data.pc || displayPrice,
              market: stockMarket,
              isMarketClosed: isMarketClosed,
              lastUpdated: data.t ? data.t * 1000 : Date.now()
            };
            
            prices[symbol] = priceData;
            cache.set(cacheKey, { data: priceData, timestamp: Date.now() });
          } catch (err) {
            console.error(`Error fetching price for ${symbol}:`, err);
            // Use fallback price on error
            const fallbackData = getFallbackPrice(symbol, stockMarket);
            if (fallbackData) {
              prices[symbol] = fallbackData;
            }
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
