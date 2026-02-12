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
    const { market = 'NSE', batchSize = 50, offset = 0, computeOnly = false } = await req.json().catch(() => ({}));

    // If computeOnly flag set, skip fetching and just rank existing data
    if (computeOnly) {
      return await computeAndStoreRankings(supabase, market);
    }

    console.log(`Computing cap rankings for ${market}, batch offset=${offset}, size=${batchSize}`);

    // Step 1: Fetch stocks that need market_cap data
    const { data: stocks, error: fetchErr } = await supabase
      .from('stock_symbols')
      .select('id, symbol, market, market_cap')
      .eq('market', market)
      .is('market_cap', null)
      .order('symbol')
      .range(offset, offset + batchSize - 1);

    if (fetchErr) throw fetchErr;

    if (!stocks || stocks.length === 0) {
      return await computeAndStoreRankings(supabase, market);
    }

    console.log(`Fetching market caps for ${stocks.length} ${market} stocks via AI...`);

    // Use AI to estimate market caps in batches of 25
    let updated = 0;
    let failed = 0;
    const SUB_BATCH = 25;

    for (let i = 0; i < stocks.length; i += SUB_BATCH) {
      const batch = stocks.slice(i, i + SUB_BATCH);

      try {
        const aiResults = await fetchMarketCapsViaAI(batch, market);
        for (const stock of batch) {
          const cap = aiResults[stock.symbol];
          if (cap && cap > 0) {
            const { error: updateErr } = await supabase
              .from('stock_symbols')
              .update({ market_cap: cap })
              .eq('id', stock.id);
            if (!updateErr) updated++;
            else failed++;
          } else {
            failed++;
          }
        }
      } catch (err) {
        console.warn(`Batch error:`, err);
        failed += batch.length;
      }

      // Brief pause between AI calls
      if (i + SUB_BATCH < stocks.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const remaining = stocks.length === batchSize;
    console.log(`Batch complete: ${updated} updated, ${failed} failed, more=${remaining}`);

    return new Response(
      JSON.stringify({
        status: 'batch_complete',
        updated,
        failed,
        hasMore: remaining,
        nextOffset: offset + batchSize,
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

async function fetchMarketCapsViaAI(
  stocks: { symbol: string; market: string }[],
  market: string
): Promise<Record<string, number>> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return {};

  const symbolList = stocks.map(s => s.symbol).join(', ');
  const prompt = `For these ${market} Indian stock symbols, provide their approximate market capitalization in INR crores.
Symbols: ${symbolList}

Respond ONLY with a JSON object mapping symbol to market cap in INR crores (number).
Example: {"RELIANCE": 1800000, "TCS": 1500000}
Use real-world knowledge. If unknown, use 0.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) return {};
    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content?.trim() || '';
    if (content.startsWith('```')) content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    
    const parsed = JSON.parse(content);
    // Convert crores to raw number (1 crore = 10M)
    const result: Record<string, number> = {};
    for (const [sym, val] of Object.entries(parsed)) {
      result[sym] = (val as number) * 10_000_000; // crores to absolute
    }
    return result;
  } catch {
    return {};
  }
}

async function computeAndStoreRankings(supabase: any, market: string) {
  console.log(`Computing SEBI-style rankings for ${market}...`);

  // Fetch all stocks with market_cap, sorted descending
  const { data: allStocks, error } = await supabase
    .from('stock_symbols')
    .select('id, symbol, market_cap')
    .eq('market', market)
    .not('market_cap', 'is', null)
    .gt('market_cap', 0)
    .order('market_cap', { ascending: false });

  if (error) throw error;
  if (!allStocks || allStocks.length === 0) {
    return new Response(
      JSON.stringify({ status: 'no_data', message: 'No market cap data available for ranking' }),
      { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Ranking ${allStocks.length} stocks by market cap...`);

  // SEBI classification: Rank 1-100 = Large, 101-250 = Mid, 251+ = Small
  const updates: { id: string; cap_category: string }[] = [];
  allStocks.forEach((stock: any, index: number) => {
    const rank = index + 1;
    let category: string;
    if (rank <= 100) category = 'Large Cap';
    else if (rank <= 250) category = 'Mid Cap';
    else category = 'Small Cap';
    updates.push({ id: stock.id, cap_category: category });
  });

  // Batch update in chunks of 100
  let updateCount = 0;
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    for (const item of chunk) {
      const { error: upErr } = await supabase
        .from('stock_symbols')
        .update({ cap_category: item.cap_category })
        .eq('id', item.id);
      if (!upErr) updateCount++;
    }
  }

  // Also mark stocks WITHOUT market_cap as null cap_category (unknown)
  await supabase
    .from('stock_symbols')
    .update({ cap_category: null })
    .eq('market', market)
    .is('market_cap', null);

  const largeCap = updates.filter(u => u.cap_category === 'Large Cap').length;
  const midCap = updates.filter(u => u.cap_category === 'Mid Cap').length;
  const smallCap = updates.filter(u => u.cap_category === 'Small Cap').length;

  console.log(`Rankings computed: ${largeCap} Large, ${midCap} Mid, ${smallCap} Small (${updateCount} updated)`);

  return new Response(
    JSON.stringify({
      status: 'rankings_complete',
      total: allStocks.length,
      largeCap,
      midCap,
      smallCap,
      updated: updateCount,
    }),
    { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
  );
}
