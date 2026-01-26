import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds for price data

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols, market } = await req.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ prices: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FINNHUB_API_KEY');
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    const prices: Record<string, { 
      price: number; 
      change: number; 
      changePercent: number;
      previousClose: number;
    }> = {};

    // Fetch prices for each symbol
    await Promise.all(
      symbols.map(async (symbolData: { symbol: string; market: string }) => {
        const { symbol, market: stockMarket } = symbolData;
        
        // Build the correct symbol for Finnhub
        let finnhubSymbol = symbol;
        if (stockMarket === 'NSE') {
          finnhubSymbol = `${symbol}.NS`;
        }

        // Check cache
        const cacheKey = `price:${finnhubSymbol}`;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          prices[symbol] = cached.data as typeof prices[string];
          return;
        }

        try {
          const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(finnhubSymbol)}&token=${apiKey}`;
          const response = await fetch(quoteUrl);
          
          if (!response.ok) {
            console.error(`Failed to fetch price for ${finnhubSymbol}: ${response.status}`);
            return;
          }

          const data = await response.json();
          
          // Finnhub quote response: c = current, d = change, dp = change percent, pc = previous close
          if (data.c && data.c > 0) {
            const priceData = {
              price: data.c,
              change: data.d || 0,
              changePercent: data.dp || 0,
              previousClose: data.pc || 0
            };
            
            prices[symbol] = priceData;
            cache.set(cacheKey, { data: priceData, timestamp: Date.now() });
          }
        } catch (err) {
          console.error(`Error fetching price for ${symbol}:`, err);
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
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
