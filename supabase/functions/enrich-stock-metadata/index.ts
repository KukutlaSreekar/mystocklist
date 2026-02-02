import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Market suffix mapping for Yahoo Finance
const YAHOO_SUFFIX: Record<string, string> = {
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

// Industry to Sector mapping for Indian stocks
const INDUSTRY_TO_SECTOR: Record<string, string> = {
  // Technology
  'Software—Infrastructure': 'IT',
  'Software—Application': 'IT',
  'Information Technology Services': 'IT',
  'Semiconductor': 'IT',
  'Communication Equipment': 'IT',
  'Electronic Components': 'IT',
  'Computer Hardware': 'IT',
  'Internet Content & Information': 'IT',
  
  // Banking & Financials
  'Banks—Regional': 'Banking',
  'Banks—Diversified': 'Banking',
  'Banks - Regional': 'Banking',
  'Banks - Diversified': 'Banking',
  'Credit Services': 'Financials',
  'Asset Management': 'Financials',
  'Insurance—Life': 'Financials',
  'Insurance—Diversified': 'Financials',
  'Insurance - Life': 'Financials',
  'Insurance - Diversified': 'Financials',
  'Capital Markets': 'Financials',
  'Financial Data & Stock Exchanges': 'Financials',
  'Financial Services': 'Financials',
  
  // FMCG
  'Household & Personal Products': 'FMCG',
  'Packaged Foods': 'FMCG',
  'Beverages—Non-Alcoholic': 'FMCG',
  'Beverages - Non-Alcoholic': 'FMCG',
  'Tobacco': 'FMCG',
  'Consumer Packaged Goods': 'FMCG',
  'Food Distribution': 'FMCG',
  
  // Pharma
  'Drug Manufacturers—General': 'Pharma',
  'Drug Manufacturers - General': 'Pharma',
  'Drug Manufacturers—Specialty & Generic': 'Pharma',
  'Drug Manufacturers - Specialty & Generic': 'Pharma',
  'Biotechnology': 'Pharma',
  'Diagnostics & Research': 'Pharma',
  'Medical Instruments & Supplies': 'Pharma',
  'Healthcare Plans': 'Pharma',
  
  // Energy
  'Oil & Gas Integrated': 'Energy',
  'Oil & Gas E&P': 'Energy',
  'Oil & Gas Refining & Marketing': 'Energy',
  'Oil & Gas Midstream': 'Energy',
  'Utilities—Regulated Electric': 'Energy',
  'Utilities - Regulated Electric': 'Energy',
  'Utilities—Renewable': 'Energy',
  'Utilities - Renewable': 'Energy',
  
  // Auto
  'Auto Manufacturers': 'Auto',
  'Auto Parts': 'Auto',
  'Auto - Manufacturers': 'Auto',
  'Auto - Parts': 'Auto',
  'Recreational Vehicles': 'Auto',
  
  // Metals
  'Steel': 'Metals',
  'Aluminum': 'Metals',
  'Copper': 'Metals',
  'Other Industrial Metals & Mining': 'Metals',
  'Gold': 'Metals',
  
  // Infrastructure
  'Engineering & Construction': 'Infrastructure',
  'Infrastructure Operations': 'Infrastructure',
  'Building Materials': 'Infrastructure',
  'Airports & Air Services': 'Infrastructure',
  'Railroads': 'Infrastructure',
  
  // Telecom
  'Telecom Services': 'Telecom',
  'Telecommunication Services': 'Telecom',
  
  // Realty
  'Real Estate—Development': 'Realty',
  'Real Estate - Development': 'Realty',
  'Real Estate Services': 'Realty',
  'REIT—Diversified': 'Realty',
  'REIT - Diversified': 'Realty',
  
  // Chemicals
  'Specialty Chemicals': 'Chemicals',
  'Agricultural Inputs': 'Chemicals',
  'Chemicals': 'Chemicals',
  
  // Conglomerates
  'Conglomerates': 'Conglomerates',
};

// Yahoo Finance sector to our sector mapping
const YAHOO_SECTOR_MAP: Record<string, string> = {
  'Technology': 'IT',
  'Financial Services': 'Financials',
  'Healthcare': 'Pharma',
  'Consumer Defensive': 'FMCG',
  'Consumer Cyclical': 'Auto',
  'Energy': 'Energy',
  'Basic Materials': 'Metals',
  'Industrials': 'Infrastructure',
  'Communication Services': 'Telecom',
  'Real Estate': 'Realty',
  'Utilities': 'Energy',
};

interface StockMetadata {
  symbol: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  marketCapCategory: string | null;
}

// Market cap thresholds for Indian market (in INR)
// Large Cap: > 20,000 Cr (200B INR ≈ 2.5B USD)
// Mid Cap: 5,000 Cr - 20,000 Cr
// Small Cap: < 5,000 Cr
const LARGE_CAP_THRESHOLD = 2_500_000_000; // ~$2.5B USD
const MID_CAP_THRESHOLD = 600_000_000; // ~$600M USD

function classifyMarketCap(marketCap: number | null): string {
  if (marketCap === null || marketCap === undefined || marketCap === 0) {
    return 'Unknown';
  }
  
  if (marketCap >= LARGE_CAP_THRESHOLD) {
    return 'Large Cap';
  } else if (marketCap >= MID_CAP_THRESHOLD) {
    return 'Mid Cap';
  } else {
    return 'Small Cap';
  }
}

function mapToSector(yahooSector: string | null, industry: string | null): string {
  // First try industry mapping (more specific)
  if (industry && INDUSTRY_TO_SECTOR[industry]) {
    return INDUSTRY_TO_SECTOR[industry];
  }
  
  // Then try Yahoo sector mapping
  if (yahooSector && YAHOO_SECTOR_MAP[yahooSector]) {
    return YAHOO_SECTOR_MAP[yahooSector];
  }
  
  // Return the original sector if no mapping found
  if (yahooSector) {
    return yahooSector;
  }
  
  return 'Other';
}

async function fetchYahooMetadata(symbol: string, market: string): Promise<StockMetadata> {
  const suffix = YAHOO_SUFFIX[market] || '';
  const yahooSymbol = suffix ? `${symbol}${suffix}` : symbol;
  
  try {
    // Use Yahoo Finance quoteSummary API for detailed info
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=summaryProfile,summaryDetail,price`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.error(`Yahoo API error for ${yahooSymbol}: ${response.status}`);
      return { symbol, sector: null, industry: null, marketCap: null, marketCapCategory: 'Unknown' };
    }
    
    const data = await response.json();
    const result = data?.quoteSummary?.result?.[0];
    
    if (!result) {
      console.log(`No result for ${yahooSymbol}`);
      return { symbol, sector: null, industry: null, marketCap: null, marketCapCategory: 'Unknown' };
    }
    
    const profile = result.summaryProfile || {};
    const price = result.price || {};
    
    const yahooSector = profile.sector || price.sector || null;
    const industry = profile.industry || null;
    const marketCap = price.marketCap?.raw || null;
    
    const sector = mapToSector(yahooSector, industry);
    const marketCapCategory = classifyMarketCap(marketCap);
    
    console.log(`Metadata for ${symbol}: sector=${sector}, industry=${industry}, marketCap=${marketCap}, category=${marketCapCategory}`);
    
    return {
      symbol,
      sector,
      industry,
      marketCap,
      marketCapCategory,
    };
  } catch (err) {
    console.error(`Error fetching metadata for ${yahooSymbol}:`, err);
    return { symbol, sector: null, industry: null, marketCap: null, marketCapCategory: 'Unknown' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols, updateDatabase } = await req.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ metadata: {}, error: 'No symbols provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enriching metadata for ${symbols.length} symbols`);
    
    const metadata: Record<string, StockMetadata> = {};
    
    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (item: { symbol: string; market: string; id?: string }) => {
          const result = await fetchYahooMetadata(item.symbol, item.market);
          return { ...result, id: item.id };
        })
      );
      
      results.forEach(result => {
        metadata[result.symbol] = result;
      });
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update database if requested and we have authorization
    if (updateDatabase) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Update watchlist items with enriched metadata
        for (const item of symbols) {
          const meta = metadata[item.symbol];
          if (meta && item.id && (meta.sector || meta.marketCapCategory !== 'Unknown')) {
            const { error } = await supabase
              .from('watchlists')
              .update({
                sector: meta.sector,
                market_cap_category: meta.marketCapCategory,
              })
              .eq('id', item.id);
            
            if (error) {
              console.error(`Error updating ${item.symbol}:`, error);
            } else {
              console.log(`Updated ${item.symbol} in database`);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ metadata }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Enrich metadata error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, metadata: {} }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
