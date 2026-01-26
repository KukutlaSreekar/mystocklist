import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, market } = await req.json();
    
    if (!query || query.length < 1) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FINNHUB_API_KEY');
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    // Check cache
    const cacheKey = `search:${market}:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(
        JSON.stringify({ results: cached.data, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map market to exchange suffix for Finnhub
    const exchangeMap: Record<string, string> = {
      'NSE': '.NS',
      'NYSE': '',
      'NASDAQ': ''
    };

    // Finnhub symbol search
    const searchUrl = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter results based on market
    let results = data.result || [];
    
    if (market === 'NSE') {
      results = results.filter((r: { symbol: string }) => 
        r.symbol.endsWith('.NS') || r.symbol.endsWith('.BO')
      );
    } else if (market === 'NYSE' || market === 'NASDAQ') {
      // Filter for US stocks (no suffix typically)
      results = results.filter((r: { type: string; symbol: string }) => 
        r.type === 'Common Stock' && !r.symbol.includes('.')
      );
    }

    // Limit results and format
    const formattedResults = results.slice(0, 10).map((r: { symbol: string; description: string }) => ({
      symbol: r.symbol.replace('.NS', '').replace('.BO', ''),
      name: r.description,
      displaySymbol: r.symbol,
      market
    }));

    // Cache results
    cache.set(cacheKey, { data: formattedResults, timestamp: Date.now() });

    return new Response(
      JSON.stringify({ results: formattedResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Stock search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
