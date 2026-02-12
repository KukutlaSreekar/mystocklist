import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// NSE API headers required for access
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
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

    // Strategy 1: Try NSE index constituent APIs
    let largeCaps = await fetchNseIndexConstituents('NIFTY 100');
    let midCaps = await fetchNseIndexConstituents('NIFTY MIDCAP 150');

    // Strategy 2: If NSE API fails, use AI to get the lists
    if (largeCaps.length === 0 || midCaps.length === 0) {
      console.log('NSE API unavailable, using AI for SEBI classification lists...');
      const aiLists = await fetchSebiListsViaAI();
      if (largeCaps.length === 0) largeCaps = aiLists.largeCaps;
      if (midCaps.length === 0) midCaps = aiLists.midCaps;
    }

    console.log(`Classification lists: ${largeCaps.length} Large Cap, ${midCaps.length} Mid Cap`);

    if (largeCaps.length < 50 || midCaps.length < 50) {
      return new Response(
        JSON.stringify({
          status: 'insufficient_data',
          message: `Could not fetch reliable SEBI lists. Large: ${largeCaps.length}, Mid: ${midCaps.length}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const largeCapSet = new Set(largeCaps.map(s => s.toUpperCase()));
    const midCapSet = new Set(midCaps.map(s => s.toUpperCase()));

    // Fetch ALL NSE stock symbols (paginate past 1000-row limit)
    let allStocks: { id: string; symbol: string }[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error: fetchErr } = await supabase
        .from('stock_symbols')
        .select('id, symbol')
        .eq('market', 'NSE')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (fetchErr) throw fetchErr;
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

    console.log(`Classifying ${allStocks.length} NSE stocks...`);

    // Group stocks by category
    const largeIds: string[] = [];
    const midIds: string[] = [];
    const smallIds: string[] = [];

    for (const stock of allStocks) {
      const sym = stock.symbol.toUpperCase();
      if (largeCapSet.has(sym)) {
        largeIds.push(stock.id);
      } else if (midCapSet.has(sym)) {
        midIds.push(stock.id);
      } else {
        smallIds.push(stock.id);
      }
    }

    // Batch update by category, chunking IDs to avoid query limits
    let updateCount = 0;
    const IN_CHUNK = 500;

    async function batchUpdate(ids: string[], category: string) {
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const chunk = ids.slice(i, i + IN_CHUNK);
        const { error } = await supabase
          .from('stock_symbols')
          .update({ cap_category: category })
          .in('id', chunk);
        if (!error) updateCount += chunk.length;
        else console.error(`${category} update error:`, error);
      }
    }

    await batchUpdate(largeIds, 'Large Cap');
    await batchUpdate(midIds, 'Mid Cap');
    await batchUpdate(smallIds, 'Small Cap');

    console.log(`Rankings complete: ${largeIds.length} Large, ${midIds.length} Mid, ${smallIds.length} Small (${updateCount} updated)`);

    return new Response(
      JSON.stringify({
        status: 'rankings_complete',
        total: allStocks.length,
        largeCap: largeIds.length,
        midCap: midIds.length,
        smallCap: smallIds.length,
        updated: updateCount,
        source: largeCaps.length > 0 ? 'nse_index' : 'ai_sebi_lists',
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

async function fetchNseIndexConstituents(indexName: string): Promise<string[]> {
  try {
    // First get session cookies from NSE homepage
    const sessionRes = await fetch('https://www.nseindia.com/', {
      headers: NSE_HEADERS,
    });
    const cookies = sessionRes.headers.get('set-cookie') || '';

    // Then fetch index constituents
    const encodedIndex = encodeURIComponent(indexName);
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodedIndex}`;
    
    const res = await fetch(url, {
      headers: {
        ...NSE_HEADERS,
        'Cookie': cookies,
      },
    });

    if (!res.ok) {
      console.warn(`NSE API returned ${res.status} for ${indexName}`);
      return [];
    }

    const data = await res.json();
    const stocks = data?.data || [];
    const symbols = stocks
      .map((s: any) => s.symbol)
      .filter((s: string) => s && s !== indexName && !s.startsWith('Nifty'));

    console.log(`NSE API: ${symbols.length} constituents for ${indexName}`);
    return symbols;
  } catch (err) {
    console.warn(`NSE API fetch failed for ${indexName}:`, err);
    return [];
  }
}

async function fetchSebiListsViaAI(): Promise<{ largeCaps: string[]; midCaps: string[] }> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return { largeCaps: [], midCaps: [] };

  const prompt = `List the current NIFTY 100 and NIFTY Midcap 150 index constituents as NSE ticker symbols.

These are the SEBI-defined classifications:
- NIFTY 100 constituents = Large Cap (Rank 1-100 by market cap)
- NIFTY Midcap 150 constituents = Mid Cap (Rank 101-250 by market cap)

Respond ONLY with a JSON object in this exact format:
{"largeCaps": ["RELIANCE", "TCS", "HDFCBANK", ...], "midCaps": ["IRFC", "IDFCFIRSTB", ...]}

Requirements:
- Include ALL constituents (exactly 100 large caps, exactly 150 mid caps)
- Use NSE ticker symbols only (not BSE codes)
- Base this on the latest available AMFI/SEBI classification
- Common Large Caps: RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, HINDUNILVR, SBIN, BHARTIARTL, ITC, KOTAKBANK, LT, HCLTECH, AXISBANK, BAJFINANCE, MARUTI, SUNPHARMA, TITAN, ONGC, NTPC, POWERGRID, ADANIENT, WIPRO, NESTLEIND, ULTRACEMCO, TECHM, COALINDIA, LTIM, BAJAJFINSV, TATASTEEL, INDUSINDBK, TATAMOTORS, M&M, JSWSTEEL, ADANIPORTS, DIVISLAB, DRREDDY, CIPLA, APOLLOHOSP, EICHERMOT, HEROMOTOCO, BPCL, GRASIM, BRITANNIA, TATACONSUM, HINDALCO, ASIANPAINT, SBILIFE, HDFCLIFE, BAJAJ-AUTO, UPL
- Common Mid Caps: IRFC, IDFCFIRSTB, INDIGOPNTS, ZYDUSLIFE, AUROPHARMA, BIOCON, MPHASIS, COFORGE, PERSISTENT, CUMMINSIND, VOLTAS, GODREJCP, TRENT, POLYCAB, PIIND, ASTRAL, OBEROIRLTY, PRESTIGE, PAGEIND, ATUL, DEEPAKNTR, NAVINFLUOR, METROPOLIS

No markdown, no explanation. Just the JSON.`;

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

    if (!response.ok) {
      console.error('AI SEBI list fetch failed:', response.status);
      return { largeCaps: [], midCaps: [] };
    }

    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content?.trim() || '';
    if (content.startsWith('```')) content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();

    const parsed = JSON.parse(content);
    const largeCaps = Array.isArray(parsed.largeCaps) ? parsed.largeCaps : [];
    const midCaps = Array.isArray(parsed.midCaps) ? parsed.midCaps : [];

    console.log(`AI SEBI lists: ${largeCaps.length} large caps, ${midCaps.length} mid caps`);
    return { largeCaps, midCaps };
  } catch (err) {
    console.error('AI SEBI list classification error:', err);
    return { largeCaps: [], midCaps: [] };
  }
}
