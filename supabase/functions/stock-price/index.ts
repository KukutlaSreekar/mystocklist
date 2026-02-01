import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache for price data
const priceCache = new Map<string, { data: PriceData; timestamp: number }>();
const CACHE_TTL_LIVE = 30 * 1000; // 30 seconds when market is open
const CACHE_TTL_CLOSED = 60 * 60 * 1000; // 1 hour for closed market data

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  market: string;
  isMarketClosed: boolean;
  lastUpdated: number;
}

// Market suffix mapping for Yahoo Finance
const YAHOO_SUFFIX: Record<string, string> = {
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

async function fetchYahooQuote(symbol: string): Promise<any> {
  // Use Yahoo Finance v8 API (unofficial but widely used)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Yahoo API error: ${response.status}`);
  }
  
  return await response.json();
}

function parseYahooResponse(data: any, market: string): PriceData | null {
  try {
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    
    // Get current/regular market price
    const regularMarketPrice = meta?.regularMarketPrice;
    const previousClose = meta?.previousClose || meta?.chartPreviousClose;
    const regularMarketTime = meta?.regularMarketTime; // Unix timestamp in seconds
    
    if (!regularMarketPrice && !previousClose) {
      return null;
    }
    
    // Use the best available price
    const currentPrice = regularMarketPrice || previousClose;
    
    // Calculate change
    const change = previousClose ? currentPrice - previousClose : 0;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    
    // Determine if market is closed
    // Market is considered closed if:
    // - regularMarketTime is older than 1 hour
    // - OR the market state indicates closed
    const now = Date.now();
    const lastTradeTime = regularMarketTime ? regularMarketTime * 1000 : now;
    const timeSinceLastTrade = now - lastTradeTime;
    const isMarketClosed = timeSinceLastTrade > 60 * 60 * 1000; // More than 1 hour old
    
    return {
      price: Number(currentPrice.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      previousClose: Number((previousClose || currentPrice).toFixed(2)),
      market,
      isMarketClosed,
      lastUpdated: lastTradeTime,
    };
  } catch (err) {
    console.error('Error parsing Yahoo response:', err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require valid user token to prevent API abuse
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required', prices: {} }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dynamically import createClient for auth verification
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token', prices: {} }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { symbols } = await req.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ prices: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prices: Record<string, PriceData> = {};
    const now = Date.now();

    // Fetch prices for each symbol
    await Promise.all(
      symbols.map(async (symbolData: { symbol: string; market: string }) => {
        const { symbol, market: stockMarket } = symbolData;
        
        // Build the correct symbol for Yahoo Finance
        const suffix = YAHOO_SUFFIX[stockMarket] || '';
        const yahooSymbol = suffix ? `${symbol}${suffix}` : symbol;
        const cacheKey = `price:${yahooSymbol}`;

        // Check cache first
        const cached = priceCache.get(cacheKey);
        if (cached) {
          const cacheTTL = cached.data.isMarketClosed ? CACHE_TTL_CLOSED : CACHE_TTL_LIVE;
          if (now - cached.timestamp < cacheTTL) {
            prices[symbol] = cached.data;
            return;
          }
        }

        try {
          console.log(`Fetching price for ${yahooSymbol}`);
          const yahooData = await fetchYahooQuote(yahooSymbol);
          const priceData = parseYahooResponse(yahooData, stockMarket);
          
          if (priceData) {
            prices[symbol] = priceData;
            priceCache.set(cacheKey, { data: priceData, timestamp: now });
            console.log(`Got price for ${symbol}: ${priceData.price}`);
          } else {
            console.error(`No price data parsed for ${yahooSymbol}`);
            // Use cached data as fallback if available
            if (cached) {
              prices[symbol] = { ...cached.data, isMarketClosed: true };
            }
          }
        } catch (err) {
          console.error(`Error fetching price for ${yahooSymbol}:`, err);
          // Use cached data as fallback if available
          if (cached) {
            prices[symbol] = { ...cached.data, isMarketClosed: true };
          }
        }
      })
    );

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
