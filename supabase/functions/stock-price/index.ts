import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache with extended TTL for market closed scenarios
// This stores REAL prices from successful API calls
const priceCache = new Map<string, { data: PriceData; timestamp: number }>();
const CACHE_TTL_LIVE = 30 * 1000; // 30 seconds when market is open
const CACHE_TTL_CLOSED = 24 * 60 * 60 * 1000; // 24 hours for closed market data
const MAX_RETRIES = 2;

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  market: string;
  isMarketClosed: boolean;
  lastUpdated: number;
}

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
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 200));
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 200));
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

    const prices: Record<string, PriceData> = {};

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
          const cacheKey = `price:${finnhubSymbol}`;

          // Check if we have recent cached data
          const cached = priceCache.get(cacheKey);
          const now = Date.now();
          
          // Use shorter TTL for live data, longer for closed market data
          if (cached) {
            const cacheTTL = cached.data.isMarketClosed ? CACHE_TTL_CLOSED : CACHE_TTL_LIVE;
            if (now - cached.timestamp < cacheTTL) {
              prices[symbol] = cached.data;
              return;
            }
          }

          try {
            const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(finnhubSymbol)}&token=${apiKey}`;
            const response = await fetchWithRetry(quoteUrl);
            
            if (!response.ok) {
              console.error(`Failed to fetch price for ${finnhubSymbol}: ${response.status}`);
              // On API failure, use cached data if available (even if expired)
              if (cached) {
                console.log(`Using cached data for ${symbol}`);
                prices[symbol] = { ...cached.data, isMarketClosed: true };
              }
              return;
            }

            const data = await response.json();
            
            // Finnhub quote response:
            // c = current price
            // d = change (absolute)
            // dp = change percent
            // pc = previous close
            // h = high
            // l = low
            // o = open
            // t = timestamp (unix seconds)
            
            const currentPrice = data.c;
            const previousClose = data.pc;
            const apiChange = data.d;
            const apiChangePercent = data.dp;
            const timestamp = data.t ? data.t * 1000 : now;
            
            // Check if we have valid price data
            const hasCurrentPrice = currentPrice && currentPrice > 0;
            const hasPreviousClose = previousClose && previousClose > 0;
            
            // If API returns no data at all, try to use cached data
            if (!hasCurrentPrice && !hasPreviousClose) {
              if (cached) {
                console.log(`No API data for ${symbol}, using cached data`);
                prices[symbol] = { ...cached.data, isMarketClosed: true };
              }
              return;
            }
            
            // Determine market status:
            // - If current price equals previous close AND change is 0, likely market closed
            // - If timestamp is old (more than 1 hour), market likely closed
            // - If current price is 0 but we have previous close, market closed
            const isStale = (now - timestamp) > 60 * 60 * 1000; // 1 hour
            const noChange = apiChange === 0 && apiChangePercent === 0;
            const isMarketClosed = !hasCurrentPrice || isStale || (hasCurrentPrice && currentPrice === previousClose && noChange);
            
            // Always use the best available price
            // Priority: current price > previous close
            const displayPrice = hasCurrentPrice ? currentPrice : previousClose;
            
            // Calculate change from previous close
            let change: number;
            let changePercent: number;
            
            if (hasCurrentPrice && hasPreviousClose) {
              // Use API-provided change if available, otherwise calculate
              if (apiChange !== null && apiChange !== undefined) {
                change = apiChange;
                changePercent = apiChangePercent || 0;
              } else {
                change = currentPrice - previousClose;
                changePercent = hasPreviousClose ? (change / previousClose) * 100 : 0;
              }
            } else if (hasPreviousClose && !hasCurrentPrice) {
              // Market closed, no current price - show 0 change from close
              change = 0;
              changePercent = 0;
            } else {
              change = 0;
              changePercent = 0;
            }
            
            const priceData: PriceData = {
              price: displayPrice,
              change: Number(change.toFixed(2)),
              changePercent: Number(changePercent.toFixed(2)),
              previousClose: hasPreviousClose ? previousClose : displayPrice,
              market: stockMarket,
              isMarketClosed: isMarketClosed,
              lastUpdated: timestamp
            };
            
            prices[symbol] = priceData;
            // Cache the real data
            priceCache.set(cacheKey, { data: priceData, timestamp: now });
            
          } catch (err) {
            console.error(`Error fetching price for ${symbol}:`, err);
            // On error, use cached data if available
            if (cached) {
              console.log(`Error for ${symbol}, using cached data`);
              prices[symbol] = { ...cached.data, isMarketClosed: true };
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
