import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const YAHOO_SUFFIX: Record<string, string> = {
  NYSE: '', NASDAQ: '', TSX: '.TO', LSE: '.L', XETRA: '.DE',
  EURONEXT: '.PA', SIX: '.SW', NSE: '.NS', BSE: '.BO', TSE: '.T',
  HKEX: '.HK', SSE: '.SS', SZSE: '.SZ', KRX: '.KS', ASX: '.AX',
  SGX: '.SI', B3: '.SA', JSE: '.JO', MOEX: '.ME', TADAWUL: '.SR',
};

const INDUSTRY_TO_SECTOR: Record<string, string> = {
  'Software—Infrastructure': 'IT', 'Software—Application': 'IT',
  'Information Technology Services': 'IT', 'Semiconductor': 'IT',
  'Communication Equipment': 'IT', 'Electronic Components': 'IT',
  'Computer Hardware': 'IT', 'Internet Content & Information': 'IT',
  'Software - Infrastructure': 'IT', 'Software - Application': 'IT',
  'Semiconductors': 'IT', 'Semiconductor Equipment & Materials': 'IT',
  'Banks—Regional': 'Banking', 'Banks—Diversified': 'Banking',
  'Banks - Regional': 'Banking', 'Banks - Diversified': 'Banking',
  'Credit Services': 'Financials', 'Asset Management': 'Financials',
  'Insurance—Life': 'Financials', 'Insurance—Diversified': 'Financials',
  'Insurance - Life': 'Financials', 'Insurance - Diversified': 'Financials',
  'Capital Markets': 'Financials', 'Financial Data & Stock Exchanges': 'Financials',
  'Financial Services': 'Financials', 'Financial Conglomerates': 'Financials',
  'Household & Personal Products': 'FMCG', 'Packaged Foods': 'FMCG',
  'Beverages—Non-Alcoholic': 'FMCG', 'Tobacco': 'FMCG',
  'Drug Manufacturers—General': 'Pharma', 'Drug Manufacturers—Specialty & Generic': 'Pharma',
  'Biotechnology': 'Pharma', 'Diagnostics & Research': 'Pharma',
  'Medical Instruments & Supplies': 'Pharma',
  'Oil & Gas Integrated': 'Energy', 'Oil & Gas E&P': 'Energy',
  'Oil & Gas Refining & Marketing': 'Energy', 'Solar': 'Energy',
  'Utilities—Regulated Electric': 'Energy', 'Utilities—Renewable': 'Energy',
  'Auto Manufacturers': 'Auto', 'Auto Parts': 'Auto',
  'Farm & Heavy Construction Machinery': 'Auto',
  'Steel': 'Metals', 'Aluminum': 'Metals', 'Copper': 'Metals',
  'Other Industrial Metals & Mining': 'Metals', 'Gold': 'Metals',
  'Engineering & Construction': 'Infrastructure',
  'Infrastructure Operations': 'Infrastructure',
  'Building Materials': 'Infrastructure', 'Railroads': 'Infrastructure',
  'Telecom Services': 'Telecom', 'Telecommunication Services': 'Telecom',
  'Real Estate—Development': 'Realty', 'Real Estate Services': 'Realty',
  'Specialty Chemicals': 'Chemicals', 'Agricultural Inputs': 'Chemicals',
  'Chemicals': 'Chemicals',
  'Conglomerates': 'Conglomerates',
};

interface StockMetadata {
  symbol: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  marketCapCategory: string | null;
  fetchError?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols, updateDatabase } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ metadata: {}, errors: [], stats: { success: 0, failed: 0, total: 0 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enriching metadata for ${symbols.length} symbols`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metadata: Record<string, StockMetadata> = {};
    const errors: string[] = [];

    // STEP 1: Look up precomputed cap_category from stock_symbols (SEBI rank-based)
    // This is the ONLY source of truth for Indian market cap classification
    const symbolNames = symbols.map((s: any) => s.symbol);
    const { data: stockSymbolsData } = await supabase
      .from('stock_symbols')
      .select('symbol, market, cap_category, market_cap')
      .in('symbol', symbolNames);

    const capLookup = new Map<string, { cap_category: string | null; market_cap: number | null }>();
    if (stockSymbolsData) {
      for (const row of stockSymbolsData) {
        capLookup.set(`${row.symbol}-${row.market}`, {
          cap_category: row.cap_category,
          market_cap: row.market_cap,
        });
      }
    }

    // STEP 2: Fetch sector/industry from Yahoo Finance
    console.log('Fetching sector data from Yahoo Finance...');
    const yahooData = await fetchYahooQuote(symbols);

    // STEP 3: Build metadata using Yahoo sector + precomputed cap_category
    for (const item of symbols) {
      const yData = yahooData[item.symbol];
      const lookup = capLookup.get(`${item.symbol}-${item.market}`);
      const isIndian = item.market === 'NSE' || item.market === 'BSE';

      // For Indian markets, ALWAYS use precomputed cap_category from stock_symbols
      // For other markets, use threshold-based classification from Yahoo marketCap
      const capCategory = isIndian
        ? (lookup?.cap_category || 'Unclassified')
        : classifyByThreshold(yData?.marketCap);

      const sector = yData?.industry
        ? (INDUSTRY_TO_SECTOR[yData.industry] || yData.sector || null)
        : (yData?.sector || null);

      metadata[item.symbol] = {
        symbol: item.symbol,
        sector,
        industry: yData?.industry || null,
        marketCap: lookup?.market_cap || yData?.marketCap || null,
        marketCapCategory: capCategory,
      };
    }

    // STEP 4: AI fallback for missing sector/industry only
    const missingSector = symbols.filter((s: any) => !metadata[s.symbol]?.sector);
    if (missingSector.length > 0) {
      console.log(`AI classifying sector for ${missingSector.length} symbols...`);
      const aiData = await classifyWithAI(missingSector);

      for (const item of missingSector) {
        const aiResult = aiData[item.symbol];
        const existing = metadata[item.symbol];
        if (aiResult && existing) {
          existing.sector = aiResult.sector || existing.sector;
          existing.industry = aiResult.industry || existing.industry;
          // NEVER override cap_category from AI for Indian stocks
        }
      }
    }

    // STEP 5: Update watchlist database if requested
    if (updateDatabase) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        for (const item of symbols) {
          const meta = metadata[item.symbol];
          if (meta && item.id) {
            const updateFields: Record<string, unknown> = {};
            if (meta.sector) updateFields.sector = meta.sector;
            if (meta.marketCapCategory && meta.marketCapCategory !== 'Unclassified') {
              // Convert to snake_case for watchlist check constraint
              const capMap: Record<string, string> = { 'Large Cap': 'large_cap', 'Mid Cap': 'mid_cap', 'Small Cap': 'small_cap' };
              updateFields.market_cap_category = capMap[meta.marketCapCategory] || meta.marketCapCategory;
            }
            if (Object.keys(updateFields).length > 0) {
              await supabase
                .from('watchlists')
                .update(updateFields)
                .eq('id', item.id);
            }
          }
        }
      }
    }

    const successCount = Object.values(metadata).filter(m => !m.fetchError).length;
    const failCount = Object.values(metadata).filter(m => m.fetchError).length;
    console.log(`Enrichment complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ metadata, errors, stats: { success: successCount, failed: failCount, total: symbols.length } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Enrich metadata error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, metadata: {}, errors: [message] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function classifyByThreshold(marketCap?: number): string {
  if (!marketCap) return 'Unclassified';
  if (marketCap >= 10_000_000_000) return 'Large Cap';
  if (marketCap >= 2_000_000_000) return 'Mid Cap';
  return 'Small Cap';
}

async function fetchYahooQuote(symbols: { symbol: string; market: string }[]): Promise<Record<string, { sector?: string; industry?: string; marketCap?: number }>> {
  const results: Record<string, { sector?: string; industry?: string; marketCap?: number }> = {};

  const yahooSymbols = symbols.map(s => {
    const suffix = YAHOO_SUFFIX[s.market] || '';
    return { orig: s.symbol, yahoo: suffix ? `${s.symbol}${suffix}` : s.symbol, market: s.market };
  });

  try {
    const symbolStr = yahooSymbols.map(s => encodeURIComponent(s.yahoo)).join(',');
    const url = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbolStr}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (res.ok) {
      const data = await res.json();
      const quotes = data?.quoteResponse?.result || [];
      for (const quote of quotes) {
        const match = yahooSymbols.find(s => s.yahoo === quote.symbol);
        if (match) {
          results[match.orig] = {
            sector: quote.sector || undefined,
            industry: quote.industry || undefined,
            marketCap: quote.marketCap || undefined,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Yahoo quote fetch error:', err);
  }

  return results;
}

async function classifyWithAI(symbols: { symbol: string; market: string; company_name?: string }[]): Promise<Record<string, { sector: string; industry: string }>> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return {};

  const symbolList = symbols.map(s => `${s.symbol} (${s.market}${s.company_name ? ', ' + s.company_name : ''})`).join('\n');

  const prompt = `Classify the following stocks by SECTOR and INDUSTRY only.
For each stock, provide:
1. sector: One of: IT, Banking, Financials, FMCG, Pharma, Energy, Auto, Metals, Infrastructure, Telecom, Realty, Chemicals, Conglomerates, Media, Textiles, Other
2. industry: The specific industry (e.g., "Software—Application", "Banks—Diversified")

Stocks:
${symbolList}

Respond ONLY with a JSON object. No markdown, no explanation. Format:
{"SYMBOL": {"sector": "...", "industry": "..."}, ...}`;

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
    return JSON.parse(content);
  } catch (err) {
    console.error('AI classification error:', err);
    return {};
  }
}
