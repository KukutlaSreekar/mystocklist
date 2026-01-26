import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Popular stocks by market for instant suggestions
const POPULAR_STOCKS: Record<string, Array<{ symbol: string; name: string }>> = {
  NYSE: [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "GOOGL", name: "Alphabet Inc." },
    { symbol: "MSFT", name: "Microsoft Corporation" },
    { symbol: "AMZN", name: "Amazon.com Inc." },
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "NVDA", name: "NVIDIA Corporation" },
    { symbol: "META", name: "Meta Platforms Inc." },
    { symbol: "JPM", name: "JPMorgan Chase & Co." },
    { symbol: "V", name: "Visa Inc." },
    { symbol: "JNJ", name: "Johnson & Johnson" },
  ],
  NASDAQ: [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "MSFT", name: "Microsoft Corporation" },
    { symbol: "GOOGL", name: "Alphabet Inc." },
    { symbol: "AMZN", name: "Amazon.com Inc." },
    { symbol: "NVDA", name: "NVIDIA Corporation" },
    { symbol: "META", name: "Meta Platforms Inc." },
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "AVGO", name: "Broadcom Inc." },
    { symbol: "COST", name: "Costco Wholesale Corporation" },
    { symbol: "NFLX", name: "Netflix Inc." },
  ],
  NSE: [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys Ltd" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd" },
    { symbol: "SBIN", name: "State Bank of India" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd" },
    { symbol: "ITC", name: "ITC Ltd" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd" },
    { symbol: "LT", name: "Larsen & Toubro Ltd" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd" },
    { symbol: "AXISBANK", name: "Axis Bank Ltd" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd" },
    { symbol: "MARUTI", name: "Maruti Suzuki India Ltd" },
    { symbol: "WIPRO", name: "Wipro Ltd" },
  ],
  BSE: [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys Ltd" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd" },
    { symbol: "SBIN", name: "State Bank of India" },
  ],
  LSE: [
    { symbol: "SHEL", name: "Shell plc" },
    { symbol: "HSBA", name: "HSBC Holdings plc" },
    { symbol: "AZN", name: "AstraZeneca plc" },
    { symbol: "BP", name: "BP plc" },
    { symbol: "ULVR", name: "Unilever plc" },
    { symbol: "RIO", name: "Rio Tinto plc" },
  ],
  TSE: [
    { symbol: "7203", name: "Toyota Motor Corp" },
    { symbol: "6758", name: "Sony Group Corp" },
    { symbol: "9984", name: "SoftBank Group Corp" },
  ],
  HKEX: [
    { symbol: "0700", name: "Tencent Holdings Ltd" },
    { symbol: "9988", name: "Alibaba Group Holding Ltd" },
    { symbol: "0939", name: "China Construction Bank" },
  ],
};

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, market } = await req.json();
    const normalizedQuery = (query || '').toLowerCase().trim();
    
    // Return empty for no query
    if (!normalizedQuery) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For very short queries (1-2 chars), filter from popular stocks first
    const popularStocks = POPULAR_STOCKS[market] || [];
    if (normalizedQuery.length <= 2) {
      const filteredPopular = popularStocks.filter(s => 
        s.symbol.toLowerCase().startsWith(normalizedQuery) ||
        s.name.toLowerCase().includes(normalizedQuery)
      ).map(s => ({
        symbol: s.symbol,
        name: s.name,
        displaySymbol: s.symbol + (MARKET_SUFFIX[market] || ''),
        market
      }));

      if (filteredPopular.length > 0) {
        return new Response(
          JSON.stringify({ results: filteredPopular.slice(0, 10), source: 'popular' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const apiKey = Deno.env.get('FINNHUB_API_KEY');
    if (!apiKey) {
      // Fallback to popular stocks if no API key
      const filteredPopular = popularStocks.filter(s => 
        s.symbol.toLowerCase().includes(normalizedQuery) ||
        s.name.toLowerCase().includes(normalizedQuery)
      ).map(s => ({
        symbol: s.symbol,
        name: s.name,
        displaySymbol: s.symbol + (MARKET_SUFFIX[market] || ''),
        market
      }));
      return new Response(
        JSON.stringify({ results: filteredPopular.slice(0, 10), source: 'fallback' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache
    const cacheKey = `search:${market}:${normalizedQuery}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(
        JSON.stringify({ results: cached.data, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const suffix = MARKET_SUFFIX[market] || '';

    // Finnhub symbol search
    const searchUrl = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      // On API error, fallback to popular stocks
      console.error(`Finnhub API error: ${response.status}`);
      const filteredPopular = popularStocks.filter(s => 
        s.symbol.toLowerCase().includes(normalizedQuery) ||
        s.name.toLowerCase().includes(normalizedQuery)
      ).map(s => ({
        symbol: s.symbol,
        name: s.name,
        displaySymbol: s.symbol + suffix,
        market
      }));
      return new Response(
        JSON.stringify({ results: filteredPopular.slice(0, 10), source: 'fallback' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Filter results based on market
    let results = data.result || [];
    
    if (suffix) {
      // For markets with suffix, filter by that suffix
      results = results.filter((r: { symbol: string }) => 
        r.symbol.endsWith(suffix)
      );
    } else if (market === 'NYSE' || market === 'NASDAQ') {
      // Filter for US stocks (no suffix typically)
      results = results.filter((r: { type: string; symbol: string }) => 
        r.type === 'Common Stock' && !r.symbol.includes('.')
      );
    }

    // Format and combine with popular stocks (popular first)
    const apiResults = results.slice(0, 10).map((r: { symbol: string; description: string }) => ({
      symbol: r.symbol.replace(suffix, ''),
      name: r.description,
      displaySymbol: r.symbol,
      market
    }));

    // Merge popular stocks that match with API results
    const popularMatches = popularStocks.filter(s => 
      s.symbol.toLowerCase().includes(normalizedQuery) ||
      s.name.toLowerCase().includes(normalizedQuery)
    ).map(s => ({
      symbol: s.symbol,
      name: s.name,
      displaySymbol: s.symbol + suffix,
      market
    }));

    // Deduplicate and prioritize popular stocks
    const seenSymbols = new Set<string>();
    const combinedResults = [...popularMatches, ...apiResults].filter(r => {
      if (seenSymbols.has(r.symbol)) return false;
      seenSymbols.add(r.symbol);
      return true;
    }).slice(0, 10);

    // Cache results
    cache.set(cacheKey, { data: combinedResults, timestamp: Date.now() });

    return new Response(
      JSON.stringify({ results: combinedResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Stock search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, results: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
