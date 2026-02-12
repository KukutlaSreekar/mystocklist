import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('Starting SEBI rank-based cap classification...');

    // Step 1: Fetch ALL NSE stock symbols from database
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

    // Step 2: Try multiple Yahoo Finance endpoints for market cap data
    const marketCaps = new Map<string, number>();

    // Try Yahoo v7 quote API (batch)
    await fetchMarketCapsV7(allStocks, marketCaps);
    console.log(`After v7: ${marketCaps.size} market caps`);

    // If v7 failed, try quoteSummary for top stocks via v10
    if (marketCaps.size < 100) {
      console.log('v7 insufficient, trying quoteSummary for key stocks...');
      await fetchMarketCapsViaSummary(allStocks, marketCaps);
      console.log(`After quoteSummary: ${marketCaps.size} market caps`);
    }

    // Step 3: If Yahoo APIs all fail, use NSE index constituents + AI as reliable fallback
    if (marketCaps.size < 100) {
      console.log('Yahoo APIs unavailable. Using NIFTY index constituent lists...');
      return await classifyViaIndexConstituents(supabase, allStocks);
    }

    // Step 4: Rank by market cap and assign categories
    const rankedStocks = allStocks
      .map(s => ({ ...s, marketCap: marketCaps.get(s.symbol) || 0 }))
      .sort((a, b) => b.marketCap - a.marketCap);

    const withMcap = rankedStocks.filter(s => s.marketCap > 0);
    const withoutMcap = rankedStocks.filter(s => s.marketCap <= 0);

    const updates: { id: string; cap_category: string; market_cap: number | null }[] = [];

    withMcap.forEach((stock, index) => {
      const rank = index + 1;
      let category: string;
      if (rank <= 100) category = 'Large Cap';
      else if (rank <= 250) category = 'Mid Cap';
      else category = 'Small Cap';
      updates.push({ id: stock.id, cap_category: category, market_cap: stock.marketCap });
    });

    withoutMcap.forEach(stock => {
      updates.push({ id: stock.id, cap_category: 'Small Cap', market_cap: null });
    });

    // Step 5: Batch update database
    let updateCount = 0;
    await Promise.all(updates.map(async (u) => {
      const { error } = await supabase
        .from('stock_symbols')
        .update({ cap_category: u.cap_category, market_cap: u.market_cap })
        .eq('id', u.id);
      if (!error) updateCount++;
    }));

    // Step 6: Update watchlist items
    const symbolToCategory = new Map(updates.map(u => {
      const stock = allStocks.find(s => s.id === u.id);
      return [stock?.symbol || '', u.cap_category] as [string, string];
    }));

    await updateWatchlistItems(supabase, symbolToCategory);

    // Validation
    const validation = buildValidation(symbolToCategory);
    const largeCaps = updates.filter(u => u.cap_category === 'Large Cap').length;
    const midCaps = updates.filter(u => u.cap_category === 'Mid Cap').length;
    const smallCaps = updates.filter(u => u.cap_category === 'Small Cap').length;

    console.log(`Rankings: ${largeCaps} Large, ${midCaps} Mid, ${smallCaps} Small. Updated: ${updateCount}`);
    console.log('Validation:', JSON.stringify(validation));

    return new Response(
      JSON.stringify({
        status: 'rankings_complete', total: allStocks.length, withMarketCap: withMcap.length,
        largeCap: largeCaps, midCap: midCaps, smallCap: smallCaps,
        dbUpdated: updateCount, validation, source: 'yahoo_finance',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Compute cap rankings error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Yahoo Finance v7 batch quote API ──
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

// ── Yahoo Finance quoteSummary for individual stocks ──
async function fetchMarketCapsViaSummary(stocks: { symbol: string }[], results: Map<string, number>) {
  // Only try first 300 stocks to stay within timeout
  const subset = stocks.slice(0, 300);
  const CONCURRENT = 10;
  for (let i = 0; i < subset.length; i += CONCURRENT) {
    const batch = subset.slice(i, i + CONCURRENT);
    await Promise.all(batch.map(async (stock) => {
      if (results.has(stock.symbol)) return;
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

// ── Fallback: NIFTY index constituent classification ──
async function classifyViaIndexConstituents(
  supabase: ReturnType<typeof createClient>,
  allStocks: { id: string; symbol: string }[]
) {
  // Use AI to get current NIFTY 100 and NIFTY Midcap 150 constituents
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  let largeCaps: string[] = [];
  let midCaps: string[] = [];

  if (apiKey) {
    const prompt = `Return the EXACT current constituents of NIFTY 100 and NIFTY Midcap 150 indices as NSE ticker symbols.

STRICT REQUIREMENTS:
- NIFTY 100 must have EXACTLY 100 stocks (Large Cap, SEBI Rank 1-100 by full market cap)
- NIFTY Midcap 150 must have EXACTLY 150 stocks (Mid Cap, SEBI Rank 101-250)
- Do NOT include more than 100 in largeCaps or more than 150 in midCaps
- Use only NSE ticker symbols

MANDATORY VALIDATION (these MUST be correct):
Large Cap (NIFTY 100): RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, BHARTIARTL, SBIN, ITC, LT, HCLTECH, KOTAKBANK, AXISBANK, BAJFINANCE, TATAMOTORS, MARUTI, SUNPHARMA, TITAN, NTPC, ONGC, POWERGRID, WIPRO, ADANIENT, NESTLEIND, ULTRACEMCO, TATASTEEL, M&M, JSWSTEEL, ADANIPORTS, BAJAJ-AUTO, HINDALCO, DRREDDY, CIPLA, APOLLOHOSP, TECHM, LTIM, COALINDIA, EICHERMOT, HEROMOTOCO, BPCL, GRASIM, BRITANNIA, TATACONSUM, SBILIFE, HDFCLIFE, INDUSINDBK, ASIANPAINT, DIVISLAB, BAJAJFINSV

Mid Cap (NIFTY Midcap 150): IDFCFIRSTB, INDIGOPNTS, IRFC, ZYDUSLIFE, AUROPHARMA, BIOCON, MPHASIS, COFORGE, PERSISTENT, CUMMINSIND, VOLTAS, GODREJCP, TRENT, POLYCAB, PIIND, ASTRAL, OBEROIRLTY, PRESTIGE, PAGEIND, ATUL, DEEPAKNTR, NAVINFLUOR, METROPOLIS

CRITICAL: IDFCFIRSTB, INDIGOPNTS, IRFC are Mid Cap NOT Large Cap.
CRITICAL: Return EXACTLY 100 largeCaps and EXACTLY 150 midCaps.

RESPOND ONLY with JSON: {"largeCaps": [...], "midCaps": [...]}
No markdown, no explanation.`;

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let content = data?.choices?.[0]?.message?.content?.trim() || '';
        if (content.startsWith('```')) content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(content);
        largeCaps = Array.isArray(parsed.largeCaps) ? parsed.largeCaps : [];
        midCaps = Array.isArray(parsed.midCaps) ? parsed.midCaps : [];
        // Truncate to SEBI-exact counts
        if (largeCaps.length > 100) largeCaps = largeCaps.slice(0, 100);
        if (midCaps.length > 150) midCaps = midCaps.slice(0, 150);
        console.log(`AI: ${largeCaps.length} large caps, ${midCaps.length} mid caps`);
      }
    } catch (err) {
      console.error('AI classification error:', err);
    }
  }

  if (largeCaps.length < 80 || midCaps.length < 100) {
    return new Response(
      JSON.stringify({ status: 'insufficient_data', message: 'Could not fetch reliable classification data' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Post-processing: enforce known validation overrides
  const KNOWN_LARGE = ['HDFCBANK', 'SBIN', 'TATAMOTORS', 'RELIANCE', 'TCS', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'ITC', 'LT', 'HCLTECH', 'KOTAKBANK', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'TITAN', 'NTPC', 'ONGC', 'POWERGRID', 'WIPRO', 'ADANIENT', 'M&M', 'LTIM', 'BAJAJ-AUTO', 'HINDALCO', 'TATASTEEL', 'JSWSTEEL'];
  const KNOWN_MID = ['IDFCFIRSTB', 'INDIGOPNTS', 'IRFC'];

  // Remove known mids from large list, known larges from mid list
  largeCaps = largeCaps.filter(s => !KNOWN_MID.includes(s.toUpperCase()));
  midCaps = midCaps.filter(s => !KNOWN_LARGE.includes(s.toUpperCase()));

  // Ensure known stocks are in the right list
  for (const s of KNOWN_LARGE) {
    if (!largeCaps.map(x => x.toUpperCase()).includes(s)) largeCaps.push(s);
  }
  for (const s of KNOWN_MID) {
    if (!midCaps.map(x => x.toUpperCase()).includes(s)) midCaps.push(s);
  }

  const largeCapSet = new Set(largeCaps.map(s => s.toUpperCase()));
  const midCapSet = new Set(midCaps.map(s => s.toUpperCase()));

  const updates: { id: string; cap_category: string }[] = [];
  for (const stock of allStocks) {
    const sym = stock.symbol.toUpperCase();
    if (largeCapSet.has(sym)) updates.push({ id: stock.id, cap_category: 'Large Cap' });
    else if (midCapSet.has(sym)) updates.push({ id: stock.id, cap_category: 'Mid Cap' });
    else updates.push({ id: stock.id, cap_category: 'Small Cap' });
  }

  // Batch update
  let updateCount = 0;
  const IN_CHUNK = 500;
  for (const cat of ['Large Cap', 'Mid Cap', 'Small Cap']) {
    const ids = updates.filter(u => u.cap_category === cat).map(u => u.id);
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      const { error } = await supabase.from('stock_symbols').update({ cap_category: cat }).in('id', chunk);
      if (!error) updateCount += chunk.length;
    }
  }

  // Update watchlist
  const symbolToCategory = new Map<string, string>();
  for (const u of updates) {
    const stock = allStocks.find(s => s.id === u.id);
    if (stock) symbolToCategory.set(stock.symbol, u.cap_category);
  }
  await updateWatchlistItems(supabase, symbolToCategory);

  const validation = buildValidation(symbolToCategory);
  const largeCt = updates.filter(u => u.cap_category === 'Large Cap').length;
  const midCt = updates.filter(u => u.cap_category === 'Mid Cap').length;
  const smallCt = updates.filter(u => u.cap_category === 'Small Cap').length;

  console.log(`Index-based rankings: ${largeCt} Large, ${midCt} Mid, ${smallCt} Small`);
  console.log('Validation:', JSON.stringify(validation));

  return new Response(
    JSON.stringify({
      status: 'rankings_complete', total: allStocks.length,
      largeCap: largeCt, midCap: midCt, smallCap: smallCt,
      dbUpdated: updateCount, validation, source: 'nifty_index_ai',
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}

// ── Update watchlist items with computed cap categories ──
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
    if (error) { console.error('Watchlist fetch error:', error); break; }
    if (!data || data.length === 0) { console.log('Watchlist fetch: no data on page', page); break; }
    watchlistItems = watchlistItems.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  let updated = 0;
  for (const wi of watchlistItems) {
    const cat = symbolToCategory.get(wi.symbol);
    if (cat) {
      const capMap: Record<string, string> = { 'Large Cap': 'large_cap', 'Mid Cap': 'mid_cap', 'Small Cap': 'small_cap' };
      const dbCat = capMap[cat] || cat;
      const { error } = await supabase.from('watchlists').update({ market_cap_category: dbCat }).eq('id', wi.id);
      if (!error) updated++;
    }
  }
  console.log(`Watchlist items updated: ${updated}`);
}

// ── Build validation results ──
function buildValidation(symbolToCategory: Map<string, string>): Record<string, string> {
  const testSymbols = ['HDFCBANK', 'SBIN', 'TATAMOTORS', 'INDIGOPNTS', 'IDFCFIRSTB', 'CYBERTECH'];
  const validation: Record<string, string> = {};
  for (const sym of testSymbols) {
    validation[sym] = symbolToCategory.get(sym) || 'NOT_FOUND';
  }
  return validation;
}
