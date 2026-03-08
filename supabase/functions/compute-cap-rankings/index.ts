import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// INR thresholds for Indian equities
// Yahoo Finance returns market cap in INR for .NS symbols
// Large Cap: >= 50,000 crore INR = 500,000,000,000
// Mid Cap: >= 5,000 crore INR = 50,000,000,000
// Small Cap: < 5,000 crore INR
const LARGE_CAP_INR = 500_000_000_000;
const MID_CAP_INR = 50_000_000_000;

function classifyByMarketCapINR(marketCap: number | null): string {
  if (!marketCap || marketCap <= 0) return 'Unclassified';
  if (marketCap >= LARGE_CAP_INR) return 'Large Cap';
  if (marketCap >= MID_CAP_INR) return 'Mid Cap';
  return 'Small Cap';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('Starting market-cap threshold classification...');

    // Step 1: Fetch ALL NSE stock symbols
    let allStocks: { id: string; symbol: string }[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('stock_symbols')
        .select('id, symbol')
        .eq('market', 'NSE')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allStocks = allStocks.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    if (allStocks.length === 0) {
      return new Response(
        JSON.stringify({ status: 'no_stocks', message: 'No NSE stocks in database' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${allStocks.length} NSE stocks`);

    // Step 2: Fetch market cap from Yahoo Finance
    const marketCaps = new Map<string, number>();
    await fetchMarketCapsV7(allStocks, marketCaps);
    console.log(`After v7: ${marketCaps.size} market caps`);

    if (marketCaps.size < 100) {
      console.log('v7 insufficient, trying quoteSummary...');
      await fetchMarketCapsViaSummary(allStocks, marketCaps);
      console.log(`After quoteSummary: ${marketCaps.size} market caps`);
    }

    if (marketCaps.size < 50) {
      return new Response(
        JSON.stringify({ status: 'insufficient_data', message: 'Could not fetch enough market cap data from Yahoo Finance' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Classify each stock by INR market-cap thresholds
    const updates: { id: string; cap_category: string; market_cap: number | null }[] = [];

    for (const stock of allStocks) {
      const mcap = marketCaps.get(stock.symbol) || null;
      const category = classifyByMarketCapINR(mcap);
      updates.push({ id: stock.id, cap_category: category, market_cap: mcap });
    }

    // Step 4: Update stock_cap_categories reference table + stock_symbols
    let updateCount = 0;
    const symbolToCategory = new Map<string, string>();

    await Promise.all(updates.map(async (u) => {
      const stock = allStocks.find(s => s.id === u.id);
      if (!stock) return;
      symbolToCategory.set(stock.symbol, u.cap_category);

      // Upsert into reference table
      await supabase
        .from('stock_cap_categories')
        .upsert({
          symbol: stock.symbol,
          market: 'NSE',
          cap_category: u.cap_category,
          market_cap: u.market_cap,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'symbol,market' });

      // Keep stock_symbols in sync
      const updateFields: Record<string, unknown> = { cap_category: u.cap_category };
      if (u.market_cap) updateFields.market_cap = u.market_cap;
      const { error } = await supabase
        .from('stock_symbols')
        .update(updateFields)
        .eq('id', u.id);
      if (!error) updateCount++;
    }));

    // Stats
    const largeCaps = updates.filter(u => u.cap_category === 'Large Cap').length;
    const midCaps = updates.filter(u => u.cap_category === 'Mid Cap').length;
    const smallCaps = updates.filter(u => u.cap_category === 'Small Cap').length;
    const unclassified = updates.filter(u => u.cap_category === 'Unclassified').length;

    // Validation
    const validation = buildValidation(symbolToCategory);
    console.log(`Classification: ${largeCaps} Large, ${midCaps} Mid, ${smallCaps} Small, ${unclassified} Unclassified. Updated: ${updateCount}`);
    console.log('Validation:', JSON.stringify(validation));

    return new Response(
      JSON.stringify({
        status: 'classification_complete',
        total: allStocks.length,
        withMarketCap: marketCaps.size,
        largeCap: largeCaps,
        midCap: midCaps,
        smallCap: smallCaps,
        unclassified,
        dbUpdated: updateCount,
        validation,
        thresholds: { largeCap: '≥50,000 Cr INR', midCap: '≥5,000 Cr INR', smallCap: '<5,000 Cr INR' },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Compute cap classification error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchMarketCapsV7(stocks: { symbol: string }[], results: Map<string, number>) {
  const BATCH = 50;
  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    const symbols = batch.map(s => encodeURIComponent(`${s.symbol}.NS`)).join(',');
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=marketCap`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!res.ok) { if (i === 0) console.warn(`v7 API returned ${res.status}`); return; }
      const data = await res.json();
      for (const q of (data?.quoteResponse?.result || [])) {
        if (q.marketCap > 0) {
          results.set(q.symbol?.replace(/\.NS$/, ''), q.marketCap);
        }
      }
    } catch { return; }
  }
}

async function fetchMarketCapsViaSummary(stocks: { symbol: string }[], results: Map<string, number>) {
  const subset = stocks.filter(s => !results.has(s.symbol)).slice(0, 300);
  const CONCURRENT = 10;
  for (let i = 0; i < subset.length; i += CONCURRENT) {
    const batch = subset.slice(i, i + CONCURRENT);
    await Promise.all(batch.map(async (stock) => {
      try {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(stock.symbol + '.NS')}?modules=price`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const mcap = data?.quoteSummary?.result?.[0]?.price?.marketCap?.raw;
        if (mcap && mcap > 0) results.set(stock.symbol, mcap);
      } catch { /* skip */ }
    }));
  }
}

async function updateWatchlistItems(
  supabase: ReturnType<typeof createClient>,
  symbolToCategory: Map<string, string>
) {
  let watchlistItems: { id: string; symbol: string }[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('watchlists')
      .select('id, symbol')
      .eq('market', 'NSE')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    watchlistItems = watchlistItems.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  let updated = 0;
  for (const wi of watchlistItems) {
    const cat = symbolToCategory.get(wi.symbol);
    if (cat && cat !== 'Unclassified') {
      const capMap: Record<string, string> = { 'Large Cap': 'large_cap', 'Mid Cap': 'mid_cap', 'Small Cap': 'small_cap' };
      const dbCat = capMap[cat] || cat;
      const { error } = await supabase.from('watchlists').update({ market_cap_category: dbCat }).eq('id', wi.id);
      if (!error) updated++;
    }
  }
  console.log(`Watchlist items updated: ${updated}`);
}

function buildValidation(symbolToCategory: Map<string, string>): Record<string, string> {
  const testSymbols = ['HDFCBANK', 'SBIN', 'TATAMOTORS', 'INDIGOPNTS', 'RBLBANK', 'CYBERTECH', 'KNRCON', 'BAJFINANCE'];
  const validation: Record<string, string> = {};
  for (const sym of testSymbols) {
    validation[sym] = symbolToCategory.get(sym) || 'NOT_FOUND';
  }
  return validation;
}
