import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  companyName?: string;
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
  // Use Yahoo Finance v8 chart API
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  
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

// Fallback: use Yahoo Finance quote summary for fresher data
async function fetchYahooQuoteSummary(symbol: string): Promise<PriceData | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    const prevClose = meta?.previousClose || meta?.chartPreviousClose;
    if (!price) return null;
    
    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;
    const lastTime = meta?.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
    const isOld = Date.now() - lastTime > 60 * 60 * 1000;
    
    return {
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePct.toFixed(2)),
      previousClose: Number((prevClose || price).toFixed(2)),
      market: '',
      isMarketClosed: isOld,
      lastUpdated: lastTime,
      companyName: meta?.shortName || meta?.longName || undefined,
    };
  } catch {
    return null;
  }
}

function parseYahooResponse(data: any, market: string): PriceData | null {
  try {
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    
    const meta = result.meta;
    const timestamps = result.timestamp;
    const quotes = result.indicators?.quote?.[0];
    
    // Get current/regular market price
    const regularMarketPrice = meta?.regularMarketPrice;
    const previousClose = meta?.previousClose || meta?.chartPreviousClose;
    const regularMarketTime = meta?.regularMarketTime; // Unix timestamp in seconds
    
    if (!regularMarketPrice && !previousClose) {
      return null;
    }
    
    // Try to get the most recent valid close from the time series (range=5d)
    // This helps when regularMarketPrice is stale
    let bestPrice = regularMarketPrice;
    let bestTime = regularMarketTime ? regularMarketTime * 1000 : Date.now();
    let bestPrevClose = previousClose;
    
    if (timestamps && quotes && timestamps.length > 1) {
      // Walk backwards to find most recent trading day with valid data
      for (let i = timestamps.length - 1; i >= 0; i--) {
        const close = quotes.close?.[i];
        if (close != null && close > 0) {
          bestPrice = close;
          bestTime = timestamps[i] * 1000;
          // Use the previous day's close for change calculation
          if (i > 0) {
            for (let j = i - 1; j >= 0; j--) {
              const prevClose = quotes.close?.[j];
              if (prevClose != null && prevClose > 0) {
                bestPrevClose = prevClose;
                break;
              }
            }
          }
          break;
        }
      }
    }
    
    const currentPrice = bestPrice || previousClose;
    const effectivePrevClose = bestPrevClose || previousClose || currentPrice;
    
    // Calculate change
    const change = effectivePrevClose ? currentPrice - effectivePrevClose : 0;
    const changePercent = effectivePrevClose ? (change / effectivePrevClose) * 100 : 0;
    
    // Determine if market is closed
    const now = Date.now();
    const timeSinceLastTrade = now - bestTime;
    const isMarketClosed = timeSinceLastTrade > 60 * 60 * 1000;
    
    return {
      price: Number(currentPrice.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      previousClose: Number((effectivePrevClose || currentPrice).toFixed(2)),
      market,
      isMarketClosed,
      lastUpdated: bestTime,
      companyName: meta?.shortName || meta?.longName || undefined,
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
    // Stock prices are public data from Yahoo Finance
    // No authentication required - this is read-only public information
    // Rate limiting is handled by caching (30s live, 1hr closed)
    
    const { symbols } = await req.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ prices: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve symbol aliases
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const allSymbols = symbols.map((s: any) => s.symbol);
    const { data: aliases } = await supabase
      .from('symbol_aliases')
      .select('alias_symbol, canonical_symbol, market')
      .in('alias_symbol', allSymbols);

    const aliasMap: Record<string, string> = {};
    for (const a of aliases || []) {
      aliasMap[`${a.alias_symbol}:${a.market}`] = a.canonical_symbol;
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
          let priceData = parseYahooResponse(yahooData, stockMarket);
          
          // If data is stale (>2 days old) or change is 0 with old data, try fallback
          const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
          if (priceData && (now - priceData.lastUpdated > TWO_DAYS || 
              (priceData.change === 0 && priceData.changePercent === 0 && now - priceData.lastUpdated > 60 * 60 * 1000))) {
            console.log(`Stale data for ${yahooSymbol}, trying fallback...`);
            const fallback = await fetchYahooQuoteSummary(yahooSymbol);
            if (fallback && fallback.lastUpdated > priceData.lastUpdated) {
              fallback.market = stockMarket;
              priceData = fallback;
              console.log(`Fallback succeeded for ${symbol}: ${priceData.price}`);
            }
          }
          
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
