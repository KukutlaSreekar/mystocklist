import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Market suffix mapping for Yahoo Finance
const YAHOO_SUFFIX: Record<string, string> = {
  NYSE: '', NASDAQ: '', TSX: '.TO', LSE: '.L', XETRA: '.DE',
  EURONEXT: '.PA', SIX: '.SW', NSE: '.NS', BSE: '.BO', TSE: '.T',
  HKEX: '.HK', SSE: '.SS', SZSE: '.SZ', KRX: '.KS', ASX: '.AX',
  SGX: '.SI', B3: '.SA', JSE: '.JO', MOEX: '.ME', TADAWUL: '.SR',
};

interface StockMetadata {
  symbol: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  marketCapCategory: string | null;
  fetchError?: string;
}

const LARGE_CAP_THRESHOLD = 2_500_000_000;
const MID_CAP_THRESHOLD = 600_000_000;

function classifyMarketCap(marketCap: number | null): string {
  if (!marketCap || marketCap === 0) return 'Unknown';
  if (marketCap >= LARGE_CAP_THRESHOLD) return 'Large Cap';
  if (marketCap >= MID_CAP_THRESHOLD) return 'Mid Cap';
  return 'Small Cap';
}

// Try Yahoo Finance v8 chart endpoint for market cap (doesn't need crumb)
async function fetchYahooMarketCap(symbol: string, market: string): Promise<number | null> {
  const suffix = YAHOO_SUFFIX[market] || '';
  const yahooSymbol = suffix ? `${symbol}${suffix}` : symbol;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    // regularMarketPrice * shares could give market cap, but chart doesn't have it directly
    // Try to get it from the quote response instead
    return null;
  } catch {
    return null;
  }
}

// Use AI to classify stocks when Yahoo API is unavailable
async function classifyWithAI(symbols: { symbol: string; market: string; company_name?: string }[]): Promise<Record<string, { sector: string; marketCapCategory: string; industry: string }>> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.error('LOVABLE_API_KEY not available');
    return {};
  }

  const symbolList = symbols.map(s => `${s.symbol} (${s.market}${s.company_name ? ', ' + s.company_name : ''})`).join('\n');

  const prompt = `Classify the following stocks. For each stock, provide:
1. sector: One of: IT, Banking, Financials, FMCG, Pharma, Energy, Auto, Metals, Infrastructure, Telecom, Realty, Chemicals, Conglomerates, Media, Textiles, Other
2. industry: The specific industry (e.g., "Software—Application", "Banks—Diversified")
3. marketCapCategory: One of "Large Cap", "Mid Cap", "Small Cap" based on the company's actual market capitalization (use Indian market conventions where top ~100 by market cap are Large Cap, next ~150 are Mid Cap, rest are Small Cap. For US stocks, use >$10B = Large Cap, $2B-$10B = Mid Cap, <$2B = Small Cap)

Stocks:
${symbolList}

Respond ONLY with a JSON object. No markdown, no explanation. Format:
{"SYMBOL": {"sector": "...", "industry": "...", "marketCapCategory": "..."}, ...}

Be accurate. Use real-world knowledge of these companies. Do NOT default to "Other" or "Unknown" if you know the company.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI classification failed: ${response.status} - ${errText}`);
      return {};
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const result = JSON.parse(jsonStr);
    console.log(`AI classified ${Object.keys(result).length} stocks successfully`);
    return result;
  } catch (err) {
    console.error('AI classification error:', err);
    return {};
  }
}

// Primary: Try Yahoo Finance quote endpoint (v6)
async function fetchYahooQuote(symbols: { symbol: string; market: string }[]): Promise<Record<string, { sector?: string; industry?: string; marketCap?: number }>> {
  const yahooSymbols = symbols.map(s => {
    const suffix = YAHOO_SUFFIX[s.market] || '';
    return suffix ? `${s.symbol}${suffix}` : s.symbol;
  });

  const results: Record<string, { sector?: string; industry?: string; marketCap?: number }> = {};

  // Try fetching quotes in batch
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
        // Map Yahoo symbol back to original
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
    } else {
      console.warn(`Yahoo v6 quote failed: ${res.status}`);
    }
  } catch (err) {
    console.warn('Yahoo quote fetch error:', err);
  }

  return results;
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

    console.log(`Enriching metadata for ${symbols.length} symbols: ${symbols.map((s: any) => s.symbol).join(', ')}`);

    const metadata: Record<string, StockMetadata> = {};
    const errors: string[] = [];

    // Strategy 1: Try Yahoo Finance v6 quote endpoint
    console.log('Strategy 1: Trying Yahoo Finance v6 quote...');
    const yahooData = await fetchYahooQuote(symbols);
    const yahooHits = Object.keys(yahooData).length;
    console.log(`Yahoo v6 returned data for ${yahooHits}/${symbols.length} symbols`);

    // Populate from Yahoo data
    for (const item of symbols) {
      const yData = yahooData[item.symbol];
      if (yData && (yData.sector || yData.marketCap)) {
        const sector = yData.industry ? 
          (mapIndustryToSector(yData.industry) || yData.sector || 'Other') :
          (yData.sector || 'Other');
        
        metadata[item.symbol] = {
          symbol: item.symbol,
          sector,
          industry: yData.industry || null,
          marketCap: yData.marketCap || null,
          marketCapCategory: classifyMarketCap(yData.marketCap || null),
        };
      }
    }

    // Strategy 2: For missing symbols, use AI classification
    const missingSymbols = symbols.filter((s: any) => !metadata[s.symbol]);
    if (missingSymbols.length > 0) {
      console.log(`Strategy 2: AI classifying ${missingSymbols.length} remaining symbols...`);
      const aiData = await classifyWithAI(missingSymbols);
      
      for (const item of missingSymbols) {
        const aiResult = aiData[item.symbol];
        if (aiResult) {
          metadata[item.symbol] = {
            symbol: item.symbol,
            sector: aiResult.sector || 'Other',
            industry: aiResult.industry || null,
            marketCap: null,
            marketCapCategory: aiResult.marketCapCategory || 'Unknown',
          };
        } else {
          metadata[item.symbol] = {
            symbol: item.symbol,
            sector: null,
            industry: null,
            marketCap: null,
            marketCapCategory: 'Unknown',
            fetchError: 'No data from Yahoo or AI',
          };
          errors.push(`${item.symbol}: Could not classify`);
        }
      }
    }

    // Update database if requested
    if (updateDatabase) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        for (const item of symbols) {
          const meta = metadata[item.symbol];
          if (meta && item.id && !meta.fetchError && (meta.sector || meta.marketCapCategory !== 'Unknown')) {
            const { error } = await supabase
              .from('watchlists')
              .update({
                sector: meta.sector,
                market_cap_category: meta.marketCapCategory,
              })
              .eq('id', item.id);

            if (error) {
              console.error(`DB update error for ${item.symbol}:`, error);
            } else {
              console.log(`💾 Saved ${item.symbol}: sector=${meta.sector}, cap=${meta.marketCapCategory}`);
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

// Industry to sector mapping helper
function mapIndustryToSector(industry: string): string | null {
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
  return INDUSTRY_TO_SECTOR[industry] || null;
}
