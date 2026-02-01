import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Market suffix mapping for display
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
    // Stock symbols are public data - the stock_symbols table has RLS allowing public reads
    // No authentication required for search functionality
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { query, market, limit = 50, offset = 0 } = await req.json();
    const normalizedQuery = (query || '').toLowerCase().trim();
    
    // Return empty for no query
    if (!normalizedQuery) {
      return new Response(
        JSON.stringify({ results: [], total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const suffix = MARKET_SUFFIX[market] || '';

    // Query the local stock_symbols table with prefix matching
    // Using ILIKE for case-insensitive prefix matching
    let queryBuilder = supabase
      .from('stock_symbols')
      .select('symbol, company_name, market, market_cap, volume, popularity_score', { count: 'exact' })
      .eq('market', market)
      .or(`symbol.ilike.${normalizedQuery}%,company_name.ilike.${normalizedQuery}%`)
      .order('popularity_score', { ascending: false })
      .order('market_cap', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data: stocks, count, error } = await queryBuilder;

    if (error) {
      console.error('Database query error:', error);
      return new Response(
        JSON.stringify({ error: error.message, results: [], total: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = (stocks || []).map((stock: any) => ({
      symbol: stock.symbol,
      name: stock.company_name || stock.symbol,
      displaySymbol: stock.symbol + suffix,
      market: stock.market,
      marketCap: stock.market_cap,
      volume: stock.volume,
    }));

    return new Response(
      JSON.stringify({ 
        results, 
        total: count || 0,
        offset,
        limit,
        hasMore: (count || 0) > offset + limit
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Stock search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, results: [], total: 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
