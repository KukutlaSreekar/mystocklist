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

    // Step 1: Look up precomputed cap_category from stock_symbols (SEBI rank-based)
    const symbolNames = symbols.map((s: any) => s.symbol);
    const { data: stockSymbolsData } = await supabase
      .from('stock_symbols')
      .select('symbol, market, cap_category')
      .in('symbol', symbolNames);

    const capLookup = new Map<string, string | null>();
    if (stockSymbolsData) {
      for (const row of stockSymbolsData) {
        capLookup.set(`${row.symbol}-${row.market}`, row.cap_category);
      }
    }

    // Step 2: Try Yahoo Finance for sector/industry
    console.log('Fetching sector data from Yahoo Finance...');
    const yahooData = await fetchYahooQuote(symbols);

    // Step 3: Populate metadata using Yahoo sector + precomputed cap_category
    for (const item of symbols) {
      const yData = yahooData[item.symbol];
      const capCategory = capLookup.get(`${item.symbol}-${item.market}`);

      if (yData && (yData.sector || yData.industry)) {
        const sector = yData.industry
          ? (INDUSTRY_TO_SECTOR[yData.industry] || yData.sector || 'Other')
          : (yData.sector || 'Other');

        metadata[item.symbol] = {
          symbol: item.symbol,
          sector,
          industry: yData.industry || null,
          marketCap: yData.marketCap || null,
          // ALWAYS use precomputed SEBI cap_category for Indian markets
          marketCapCategory: capCategory || (item.market === 'NSE' || item.market === 'BSE' ? 'Unclassified' : classifyByThreshold(yData.marketCap)),
        };
      } else if (capCategory) {
        // No Yahoo data but have precomputed cap from ranking
        metadata[item.symbol] = {
          symbol: item.symbol,
          sector: null,
          industry: null,
          marketCap: null,
          marketCapCategory: capCategory,
        };
      }
    }

    // Step 4: AI fallback for missing sector/industry
    const missingSymbols = symbols.filter((s: any) => !metadata[s.symbol] || !metadata[s.symbol]?.sector);
    if (missingSymbols.length > 0) {
      console.log(`AI classifying ${missingSymbols.length} remaining symbols...`);
      const aiData = await classifyWithAI(missingSymbols);

      for (const item of missingSymbols) {
        const aiResult = aiData[item.symbol];
        const capCategory = capLookup.get(`${item.symbol}-${item.market}`);
        const existing = metadata[item.symbol];

        if (aiResult) {
          metadata[item.symbol] = {
            symbol: item.symbol,
            sector: aiResult.sector || existing?.sector || 'Other',
            industry: aiResult.industry || existing?.industry || null,
            marketCap: existing?.marketCap || null,
            // ALWAYS prefer precomputed SEBI ranking
            marketCapCategory: capCategory || existing?.marketCapCategory || (item.market === 'NSE' || item.market === 'BSE' ? 'Unclassified' : (aiResult.marketCapCategory || 'Unclassified')),
          };
        } else if (!existing) {
          metadata[item.symbol] = {
            symbol: item.symbol,
            sector: null,
            industry: null,
            marketCap: null,
            marketCapCategory: capCategory || 'Unclassified',
            fetchError: 'No data from Yahoo or AI',
          };
          errors.push(`${item.symbol}: Could not classify`);
        }
      }
    }

    // Step 5: Update watchlist database if requested
    if (updateDatabase) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        for (const item of symbols) {
          const meta = metadata[item.symbol];
          if (meta && item.id && !meta.fetchError && (meta.sector || (meta.marketCapCategory && meta.marketCapCategory !== 'Unclassified'))) {
            await supabase
              .from('watchlists')
              .update({
                sector: meta.sector,
                market_cap_category: meta.marketCapCategory,
              })
              .eq('id', item.id);
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

// Threshold-based classification (for non-Indian markets only)
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
    return suffix ? `${s.symbol}${suffix}` : s.symbol;
  });

  try {
    const symbolStr = yahooSymbols.map(s => encodeURIComponent(s)).join(',');
    const url = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbolStr}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (res.ok) {
      const data = await res.json();
      const quotes = data?.quoteResponse?.result || [];
      for (const quote of quotes) {
        const origSymbol = symbols.find(s => {
          const suffix = YAHOO_SUFFIX[s.market] || '';
          const ySymbol = suffix ? `${s.symbol}${suffix}` : s.symbol;
          return ySymbol === quote.symbol;
        });
        if (origSymbol) {
          results[origSymbol.symbol] = {
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

async function classifyWithAI(symbols: { symbol: string; market: string; company_name?: string }[]): Promise<Record<string, { sector: string; marketCapCategory: string; industry: string }>> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return {};

  const symbolList = symbols.map(s => `${s.symbol} (${s.market}${s.company_name ? ', ' + s.company_name : ''})`).join('\n');

  const prompt = `Classify the following stocks by SECTOR and INDUSTRY only.
For each stock, provide:
1. sector: One of: IT, Banking, Financials, FMCG, Pharma, Energy, Auto, Metals, Infrastructure, Telecom, Realty, Chemicals, Conglomerates, Media, Textiles, Other
2. industry: The specific industry (e.g., "Software—Application", "Banks—Diversified")
3. marketCapCategory: Leave as "Unknown" - this will be filled from SEBI rankings separately

Stocks:
${symbolList}

Respond ONLY with a JSON object. No markdown, no explanation. Format:
{"SYMBOL": {"sector": "...", "industry": "...", "marketCapCategory": "Unknown"}, ...}`;

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
