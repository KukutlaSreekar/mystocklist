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

interface TradingHours {
  timeZone: string;
  openHour: number;
  closeHour: number;
}

const MARKET_TRADING_HOURS: Record<string, TradingHours> = {
  NYSE: { timeZone: 'America/New_York', openHour: 9.5, closeHour: 16 },
  NASDAQ: { timeZone: 'America/New_York', openHour: 9.5, closeHour: 16 },
  TSX: { timeZone: 'America/Toronto', openHour: 9.5, closeHour: 16 },
  LSE: { timeZone: 'Europe/London', openHour: 8, closeHour: 16.5 },
  XETRA: { timeZone: 'Europe/Berlin', openHour: 9, closeHour: 17.5 },
  EURONEXT: { timeZone: 'Europe/Paris', openHour: 9, closeHour: 17.3 },
  SIX: { timeZone: 'Europe/Zurich', openHour: 9, closeHour: 17.3 },
  NSE: { timeZone: 'Asia/Kolkata', openHour: 9.25, closeHour: 15.5 },
  BSE: { timeZone: 'Asia/Kolkata', openHour: 9.25, closeHour: 15.5 },
  TSE: { timeZone: 'Asia/Tokyo', openHour: 9, closeHour: 15 },
  HKEX: { timeZone: 'Asia/Hong_Kong', openHour: 9.5, closeHour: 16 },
  SSE: { timeZone: 'Asia/Shanghai', openHour: 9.5, closeHour: 15 },
  SZSE: { timeZone: 'Asia/Shanghai', openHour: 9.5, closeHour: 15 },
  KRX: { timeZone: 'Asia/Seoul', openHour: 9, closeHour: 15.5 },
  ASX: { timeZone: 'Australia/Sydney', openHour: 10, closeHour: 16 },
  SGX: { timeZone: 'Asia/Singapore', openHour: 9, closeHour: 17 },
  B3: { timeZone: 'America/Sao_Paulo', openHour: 10, closeHour: 17 },
  JSE: { timeZone: 'Africa/Johannesburg', openHour: 9, closeHour: 17 },
  MOEX: { timeZone: 'Europe/Moscow', openHour: 10, closeHour: 18.5 },
  TADAWUL: { timeZone: 'Asia/Riyadh', openHour: 10, closeHour: 14.5 },
};

function getLocalTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return {
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function isMarketOpenNow(market: string, now = Date.now()) {
  const tradingHours = MARKET_TRADING_HOURS[market];
  if (!tradingHours) return false;

  const { timeZone, openHour, closeHour } = tradingHours;
  const { weekday, hour, minute } = getLocalTimeParts(new Date(now), timeZone);
  const currentTime = hour + minute / 60;

  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return currentTime >= openHour && currentTime < closeHour;
}

async function fetchYahooQuote(symbol: string): Promise<any> {
  // Use Yahoo Finance v8 chart API with 1mo range to ensure we get enough trading days
  // (5d can fail during extended closures like weekends + holidays)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  
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

function shouldTryFallbackForLiveQuote(market: string, priceData: PriceData) {
  if (!isMarketOpenNow(market)) return false;
  const ageMs = Date.now() - priceData.lastUpdated;
  return ageMs > 5 * 60 * 1000;
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
    
    // Try to get the last two distinct trading day closes from the time series
    let bestPrice = regularMarketPrice;
    let bestTime = regularMarketTime ? regularMarketTime * 1000 : Date.now();
    let bestPrevClose = previousClose;
    
    if (timestamps && quotes && timestamps.length > 1) {
      // Collect all valid daily closes, deduplicated by calendar date
      // Yahoo can return multiple candles for the same trading day
      const closesByDate = new Map<string, { price: number; time: number }>();
      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close?.[i];
        if (close != null && close > 0) {
          const dateKey = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
          // Keep the latest entry for each date
          closesByDate.set(dateKey, { price: close, time: timestamps[i] * 1000 });
        }
      }
      
      const validCloses = Array.from(closesByDate.values());
      
      if (validCloses.length >= 2) {
        const latestClose = validCloses[validCloses.length - 1];
        const previousCloseEntry = validCloses[validCloses.length - 2];

        // Prefer the live market timestamp when available.
        if (!regularMarketTime || latestClose.time > bestTime) {
          bestPrice = latestClose.price;
          bestTime = latestClose.time;
        }
        bestPrevClose = previousCloseEntry.price;
        console.log(`Change: ${bestPrice} - ${bestPrevClose} = ${(bestPrice - bestPrevClose).toFixed(2)}`);
      } else if (validCloses.length === 1) {
        const latestClose = validCloses[0];
        if (!regularMarketTime || latestClose.time > bestTime) {
          bestPrice = latestClose.price;
          bestTime = latestClose.time;
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
    const marketHasHours = Boolean(MARKET_TRADING_HOURS[market]);
    const marketOpen = marketHasHours ? isMarketOpenNow(market, now) : false;
    const isMarketClosed = marketHasHours
      ? (!marketOpen || timeSinceLastTrade > 60 * 60 * 1000)
      : timeSinceLastTrade > 60 * 60 * 1000;
    
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
        const { symbol: originalSymbol, market: stockMarket } = symbolData;
        
        // Resolve alias to canonical symbol for fetching
        const canonical = aliasMap[`${originalSymbol}:${stockMarket}`] || originalSymbol;
        
        // Build the correct symbol for Yahoo Finance
        const suffix = YAHOO_SUFFIX[stockMarket] || '';
        const yahooSymbol = suffix ? `${canonical}${suffix}` : canonical;
        const cacheKey = `price:${yahooSymbol}`;

        // Check cache first
        const cached = priceCache.get(cacheKey);
        if (cached) {
          const cacheTTL = cached.data.isMarketClosed ? CACHE_TTL_CLOSED : CACHE_TTL_LIVE;
          if (now - cached.timestamp < cacheTTL) {
            prices[originalSymbol] = cached.data;
            return;
          }
        }

        try {
          console.log(`Fetching price for ${yahooSymbol}`);
          const yahooData = await fetchYahooQuote(yahooSymbol);
          let priceData = parseYahooResponse(yahooData, stockMarket);

          // If the market is currently open and the quote is stale, try a live 1m fallback.
          if (priceData && shouldTryFallbackForLiveQuote(stockMarket, priceData)) {
            console.log(`Open market stale data for ${yahooSymbol}, trying live fallback...`);
            const fallback = await fetchYahooQuoteSummary(yahooSymbol);
            if (fallback && fallback.lastUpdated > priceData.lastUpdated) {
              fallback.market = stockMarket;
              priceData = fallback;
              console.log(`Live fallback succeeded for ${originalSymbol}: ${priceData.price}`);
            }
          }
          
          // If data is stale (>2 days old), try fallback for fresher data
          // Don't fallback just because change is 0 — that's normal on weekends
          const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
          if (priceData && now - priceData.lastUpdated > TWO_DAYS) {
            console.log(`Stale data for ${yahooSymbol} (>${Math.round((now - priceData.lastUpdated) / 86400000)}d old), trying fallback...`);
            const fallback = await fetchYahooQuoteSummary(yahooSymbol);
            // Only use fallback if it has fresher data AND meaningful change info
            if (fallback && fallback.lastUpdated > priceData.lastUpdated) {
              fallback.market = stockMarket;
              // Prefer fallback only if it has non-zero change or is significantly newer
              if (fallback.change !== 0 || fallback.lastUpdated - priceData.lastUpdated > 86400000) {
                priceData = fallback;
                console.log(`Fallback succeeded for ${originalSymbol}: ${priceData.price}`);
              }
            }
          }
          
          if (priceData) {
            prices[originalSymbol] = priceData;
            priceCache.set(cacheKey, { data: priceData, timestamp: now });
            console.log(`Got price for ${originalSymbol}: ${priceData.price}`);
          } else {
            console.error(`No price data parsed for ${yahooSymbol}`);
            // Use cached data as fallback if available
            if (cached) {
              prices[originalSymbol] = { ...cached.data, isMarketClosed: true };
            }
          }
        } catch (err) {
          console.error(`Error fetching price for ${yahooSymbol}:`, err);
          // Use cached data as fallback if available
          if (cached) {
            prices[originalSymbol] = { ...cached.data, isMarketClosed: true };
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
