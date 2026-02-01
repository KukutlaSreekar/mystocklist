import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NSEStock {
  symbol: string;
  company_name: string;
  isin: string;
  series: string;
}

interface StockRecord {
  symbol: string;
  company_name: string;
  market: string;
  market_cap: number | null;
  volume: number | null;
  popularity_score: number;
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`Retry ${i + 1}/${retries} failed: ${lastError.message}`);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// Parse CSV data
function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

// Fetch NSE equity list from official source
async function fetchNSEEquityList(): Promise<NSEStock[]> {
  console.log('Fetching NSE equity list...');
  
  // NSE provides equity data via their official API/CSV endpoints
  // Primary: NSE India official equity list
  const endpoints = [
    'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
    'https://www1.nseindia.com/content/equities/EQUITY_L.csv',
  ];
  
  let csvText = '';
  let fetchSuccess = false;
  
  for (const url of endpoints) {
    try {
      console.log(`Trying NSE endpoint: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/csv,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.nseindia.com/',
        },
      });
      
      if (response.ok) {
        csvText = await response.text();
        if (csvText.length > 100) {
          fetchSuccess = true;
          console.log(`Successfully fetched from ${url}, size: ${csvText.length} bytes`);
          break;
        }
      }
    } catch (err) {
      console.log(`Failed to fetch from ${url}:`, err);
    }
  }
  
  // Fallback: Try NSE API for security info
  if (!fetchSuccess) {
    console.log('Trying NSE API fallback...');
    try {
      const response = await fetch('https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.nseindia.com/',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.data && Array.isArray(data.data)) {
          return data.data.map((item: any, index: number) => ({
            symbol: item.symbol || '',
            company_name: item.meta?.companyName || item.symbol || '',
            isin: item.meta?.isin || '',
            series: 'EQ',
          })).filter((s: NSEStock) => s.symbol);
        }
      }
    } catch (err) {
      console.log('NSE API fallback failed:', err);
    }
  }
  
  if (!fetchSuccess || !csvText) {
    // Use comprehensive backup list of NSE stocks
    console.log('Using backup NSE stock list...');
    return getNSEBackupList();
  }
  
  // Parse CSV
  const rows = parseCSV(csvText);
  const stocks: NSEStock[] = [];
  
  // Find header row and column indices
  let headerIndex = 0;
  let symbolCol = -1;
  let nameCol = -1;
  let isinCol = -1;
  let seriesCol = -1;
  
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i].map(cell => cell.toUpperCase());
    if (row.includes('SYMBOL') || row.includes('NAME OF COMPANY')) {
      headerIndex = i;
      symbolCol = row.findIndex(c => c === 'SYMBOL');
      nameCol = row.findIndex(c => c.includes('NAME') && c.includes('COMPANY'));
      if (nameCol === -1) nameCol = row.findIndex(c => c === 'NAME');
      isinCol = row.findIndex(c => c === 'ISIN');
      seriesCol = row.findIndex(c => c === 'SERIES');
      break;
    }
  }
  
  if (symbolCol === -1) {
    // Try simple format: SYMBOL, NAME
    symbolCol = 0;
    nameCol = 1;
  }
  
  console.log(`CSV parsing: symbolCol=${symbolCol}, nameCol=${nameCol}, isinCol=${isinCol}, seriesCol=${seriesCol}`);
  
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    
    const symbol = row[symbolCol]?.trim();
    const name = row[nameCol]?.trim() || symbol;
    const isin = isinCol >= 0 ? row[isinCol]?.trim() : '';
    const series = seriesCol >= 0 ? row[seriesCol]?.trim().toUpperCase() : 'EQ';
    
    if (!symbol || symbol === 'SYMBOL') continue;
    
    // Filter for equity series only
    if (series && !['EQ', 'BE', 'BZ', 'SM', 'ST', 'MF', ''].includes(series)) {
      continue;
    }
    
    stocks.push({
      symbol,
      company_name: name,
      isin,
      series: series || 'EQ',
    });
  }
  
  console.log(`Parsed ${stocks.length} NSE stocks from CSV`);
  return stocks;
}

// Comprehensive NSE backup list (NIFTY 500 + popular stocks)
function getNSEBackupList(): NSEStock[] {
  const nifty500 = [
    // NIFTY 50
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "SBIN", "BHARTIARTL", "ITC", "KOTAKBANK",
    "LT", "AXISBANK", "BAJFINANCE", "MARUTI", "WIPRO", "HCLTECH", "ASIANPAINT", "SUNPHARMA", "TITAN", "ULTRACEMCO",
    "NESTLEIND", "TATAMOTORS", "POWERGRID", "NTPC", "ONGC", "TECHM", "JSWSTEEL", "TATASTEEL", "ADANIENT", "ADANIPORTS",
    "M&M", "COALINDIA", "DRREDDY", "CIPLA", "DIVISLAB", "GRASIM", "BAJAJFINSV", "BPCL", "HEROMOTOCO", "EICHERMOT",
    "BRITANNIA", "INDUSINDBK", "HINDALCO", "APOLLOHOSP", "TATACONSUM", "SBILIFE", "HDFCLIFE", "VEDL", "ZOMATO", "PAYTM",
    // NIFTY Next 50
    "BANKBARODA", "CANBK", "PNB", "IOC", "GAIL", "TATAPOWER", "ADANIPOWER", "ADANIGREEN", "IDEA", "YESBANK",
    "IDFCFIRSTB", "FEDERALBNK", "BANDHANBNK", "RBLBANK", "AUBANK", "JINDALSTEL", "SAIL", "NMDC", "BHEL", "HAL",
    "BEL", "IRCTC", "IRFC", "RECLTD", "PFC", "NHPC", "SJVN", "TRENT", "DMART", "NAUKRI",
    "POLICYBZR", "NYKAA", "DELHIVERY", "LIC", "MARICO", "DABUR", "GODREJCP", "COLPAL", "PIDILITIND", "BERGEPAINT",
    "HAVELLS", "VOLTAS", "CROMPTON", "POLYCAB", "DIXON", "AUROPHARMA", "LUPIN", "BIOCON", "TORNTPHARM", "ALKEM",
    // Additional popular stocks
    "LAURUSLABS", "ZYDUSLIFE", "MAXHEALTH", "FORTIS", "SHREECEM", "AMBUJACEM", "ACC", "INDIGO", "MOTHERSON", "BOSCHLTD",
    "MRF", "BAJAJ-AUTO", "ASHOKLEY", "TVSMOTOR", "ESCORTS", "BALKRISIND", "APOLLOTYRE", "CEATLTD", "EXIDEIND", "AMARAJABAT",
    "SUNDARMFIN", "MUTHOOTFIN", "MANAPPURAM", "CHOLAFIN", "LICHSGFIN", "CANFINHOME", "SBICARD", "ICICIGI", "ICICIPRULI", "MCDOWELL-N",
    "UBL", "VBL", "JUBLFOOD", "DEVYANI", "PAGEIND", "COFORGE", "LTIM", "MPHASIS", "PERSISTENT", "LTTS",
    "KPITTECH", "TATAELXSI", "OFSS", "DLF", "GODREJPROP", "OBEROIRLTY", "PRESTIGE", "LODHA", "PIIND", "SRF",
    "DEEPAKNTR", "AARTIIND", "UPL", "TATACHEM", "NAVINFLUOR", "ATUL", "SYNGENE", "LALPATHLAB", "METROPOLIS", "THYROCARE",
    "ASTRAL", "SUPREMEIND", "FINOLEX", "KEI", "HONAUT", "SCHAEFFLER", "SIEMENS", "ABB", "CGPOWER", "THERMAX",
    "CUMMINSIND", "GRINDWELL", "CARBORUNIV", "KAJARIACER", "CENTURYPLY", "GREENPLY", "JKCEMENT", "RAMCOCEM", "DALBHARAT", "STARCEMENT",
    "JKPAPER", "TNPL", "ORIENTELEC", "VGUARD", "BATAINDIA", "RELAXO", "CAMPUS", "RAJESHEXPO", "CCL", "BIKAJI",
    "TATACOMM", "ROUTE", "TANLA", "LATENTVIEW", "HAPPSTMNDS", "CYIENT", "BIRLASOFT", "ZENSAR", "MASTEK", "NEWGEN",
    "INTELLECT", "SONATSOFTW", "NUCLEUS", "AFFLE", "NAZARA", "DATAMATICS", "NIITLTD", "QUICKHEAL", "RATEGAIN", "SAPPHIRE",
    "FSL", "CONFIPET", "IOLCP", "ANURAS", "CLEAN", "VAIBHAVGBL", "RAJRATAN", "TCPLPACK", "WONDERLA", "VTL",
    "JYOTHYLAB", "EMAMILTD", "TATAPOWER", "ADANITRANS", "TORNTPOWER", "CESC", "JPPOWER", "RPOWER", "GIPCL", "GSPL",
    "MRPL", "CASTROLIND", "HPCL", "PETRONET", "IGL", "MGL", "GUJGASLTD", "GSFC", "GNFC", "FACT",
    "CHAMBLFERT", "RCF", "NFL", "COROMANDEL", "GODREJAGRO", "RALLIS", "BAYER", "SWANENERGY", "SARDAEN", "INOXWIND",
    "SUZLON", "BOROSIL", "ASAHIINDIA", "ORIENTCEM", "HEIDELBERG", "BIRLACORPN", "INDIACEM", "PRSMJOHNSN", "JSWENERGY", "NHPC",
    "POWERGRID", "PGEL", "NESCO", "ENGINERSIN", "NCC", "PNCINFRA", "HCC", "NBCC", "KOLTEPATIL", "SOBHA",
    "BRIGADE", "MAHLIFE", "SUNTECK", "PHOENIXLTD", "INDIABULLS", "IBULHSGFIN", "HOMEFIRST", "AAVAS", "APTUS", "REPCO",
    "MASFIN", "CREDITACC", "FUSION", "FIVESTAR", "POONAWALLA", "UJJIVANSFB", "EQUITAS", "SURYODAY", "ESAFSFB", "UTKARSHBNK",
    "SHRIRAMFIN", "BAJAJHLDNG", "PIRAMALENT", "MAHINDCIE", "CRISIL", "ICRA", "CARERATING", "CDSL", "BSEINDIA", "MSEI",
    "MCX", "NCDEX", "ISEC", "MOTILALOFS", "EDELWEISS", "ANGELONE", "HDFCSEC", "GEOJITFSL", "SBICAPSEC", "VIKASECO",
    "SUVENPHAR", "NATCOPHARM", "GRANULES", "SOLARA", "SEQUENT", "CAPLIPOINT", "MARKSANS", "AJANTPHARM", "GLENMARK", "SUVEN",
    "JBPHARMA", "IPCALAB", "ERIS", "ABBOTINDIA", "PFIZER", "GLAXO", "SANOFI", "ASTRAZEN", "NOVARTIS", "PGHH",
    "GILLETTE", "HONEYWELL", "3MINDIA", "WHIRLPOOL", "BLUESTARCO", "HITACHIIND", "MTARTECH", "LAOPALA", "FLUOROCHEM", "GALAXYSURF",
    "FINEORG", "VALIANTORG", "NOCIL", "DCMSHRIRAM", "SUMICHEM", "VINATIORGA", "NEOGEN", "ROSSARI", "SHARDACROP", "LUXIND",
    "DOLLAR", "KPRMILL", "VARDHMAN", "ARVIND", "RAYMOND", "LXCHEM", "FINCABLES", "AARTIDRUGS", "SDBL", "GHCL",
    "DCBBANK", "KARNATBANK", "SOUTHBANK", "TMB", "CSB", "EQUITASBNK", "JSFB", "FINOPB", "UCOBANK", "CENTRALBK",
    "MAHABANK", "INDIANB", "BANKOFMAHARASHTRA", "PSB", "IOB", "UNIONBANK", "BANKINDIA", "J&KBANK", "CUB", "KVB",
    "INDUSINDBK", "DCBBANK", "LAKSHVILAS", "DHFL", "LTFH", "BAJAJHFL", "STFC", "L&TFH", "IBCAP", "BFIN",
  ];
  
  return nifty500.map((symbol, index) => ({
    symbol,
    company_name: symbol,
    isin: '',
    series: 'EQ',
  }));
}

// Batch upsert stocks
async function upsertStocks(
  supabase: any,
  stocks: StockRecord[],
  batchSize = 500
): Promise<{ success: number; errors: number }> {
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('stock_symbols')
      .upsert(
        batch.map((s: StockRecord) => ({
          symbol: s.symbol,
          company_name: s.company_name,
          market: s.market,
          market_cap: s.market_cap,
          volume: s.volume,
          popularity_score: s.popularity_score,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'symbol,market' }
      );
    
    if (error) {
      console.error(`Batch upsert error:`, error);
      errors += batch.length;
    } else {
      success += batch.length;
    }
  }
  
  return { success, errors };
}

// Log sync result
async function logSyncResult(
  supabase: any,
  market: string,
  count: number,
  status: string,
  errorMessage?: string,
  startedAt?: Date
) {
  await supabase.from('sync_history').insert({
    market,
    symbols_count: count,
    status,
    error_message: errorMessage,
    started_at: startedAt?.toISOString() || new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = new Date();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authentication check - require valid user token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT token
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`NSE sync triggered by authenticated user: ${claimsData.claims.sub}`);

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== Starting NSE Symbol Sync ===');
    
    // Fetch NSE stocks
    const nseStocks = await withRetry(() => fetchNSEEquityList());
    
    if (nseStocks.length === 0) {
      await logSyncResult(supabase, 'NSE', 0, 'error', 'No stocks fetched', startedAt);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch NSE stocks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Fetched ${nseStocks.length} NSE stocks`);
    
    // Convert to stock records with popularity scores
    const stockRecords: StockRecord[] = nseStocks.map((stock, index) => ({
      symbol: stock.symbol,
      company_name: stock.company_name || stock.symbol,
      market: 'NSE',
      market_cap: null,
      volume: null,
      popularity_score: Math.max(1, 1000 - index),
    }));
    
    // Upsert stocks
    const { success, errors } = await upsertStocks(supabase, stockRecords);
    
    const status = errors === 0 ? 'success' : (success > 0 ? 'partial' : 'error');
    await logSyncResult(
      supabase,
      'NSE',
      success,
      status,
      errors > 0 ? `${errors} stocks failed to insert` : undefined,
      startedAt
    );
    
    // Get total count
    const { count: dbTotal } = await supabase
      .from('stock_symbols')
      .select('*', { count: 'exact', head: true })
      .eq('market', 'NSE');
    
    const result = {
      success: true,
      message: `NSE sync complete: ${success} stocks synced`,
      stocksProcessed: nseStocks.length,
      stocksInserted: success,
      errors: errors,
      totalInDatabase: dbTotal,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`=== NSE Sync Complete: ${success} stocks ===`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('NSE sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await logSyncResult(supabase, 'NSE', 0, 'error', message, startedAt);
    }
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
