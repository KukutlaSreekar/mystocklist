import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BSEStock {
  security_code: string;
  security_id: string;
  security_name: string;
  isin: string;
  group: string;
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

// Fetch BSE scrip master
async function fetchBSEScripMaster(): Promise<BSEStock[]> {
  console.log('Fetching BSE scrip master...');
  
  // BSE provides scrip master data via their official endpoints
  const endpoints = [
    'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active',
    'https://www.bseindia.com/download/BhsecurityMaster/scripmaster.csv',
  ];
  
  let data: any = null;
  let csvText = '';
  
  // Try JSON API first
  for (const url of endpoints) {
    try {
      console.log(`Trying BSE endpoint: ${url}`);
      
      if (url.includes('api.bseindia.com')) {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Referer': 'https://www.bseindia.com/',
          },
        });
        
        if (response.ok) {
          const json = await response.json();
          if (json && json.Table && Array.isArray(json.Table)) {
            data = json.Table;
            console.log(`Successfully fetched ${data.length} records from BSE API`);
            break;
          }
        }
      } else {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/csv,*/*',
            'Referer': 'https://www.bseindia.com/',
          },
        });
        
        if (response.ok) {
          csvText = await response.text();
          if (csvText.length > 100) {
            console.log(`Successfully fetched CSV, size: ${csvText.length} bytes`);
            break;
          }
        }
      }
    } catch (err) {
      console.log(`Failed to fetch from ${url}:`, err);
    }
  }
  
  // Parse API data if available
  if (data && Array.isArray(data)) {
    return data.map((item: any) => ({
      security_code: item.SCRIP_CD || item.scrip_cd || '',
      security_id: item.scripsname || item.SCRIP_NAME || item.Scripname || '',
      security_name: item.LONG_NAME || item.LongName || item.long_name || '',
      isin: item.ISIN_NO || item.isin_no || '',
      group: item.Scrip_grp || item.GROUP || item.group || 'A',
    })).filter((s: BSEStock) => s.security_id);
  }
  
  // Parse CSV if available
  if (csvText && csvText.length > 100) {
    const rows = parseCSV(csvText);
    const stocks: BSEStock[] = [];
    
    // Find header row
    let headerIndex = 0;
    let codeCol = -1;
    let idCol = -1;
    let nameCol = -1;
    let isinCol = -1;
    let groupCol = -1;
    
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i].map(cell => cell.toUpperCase().trim());
      const hasScripCode = row.some(c => c.includes('SCRIP') && c.includes('CODE'));
      const hasSecurityId = row.some(c => c.includes('SECURITY') || c.includes('SCRIP'));
      
      if (hasScripCode || hasSecurityId) {
        headerIndex = i;
        codeCol = row.findIndex(c => c.includes('CODE') || c === 'SC_CODE');
        idCol = row.findIndex(c => (c.includes('ID') || c.includes('NAME')) && !c.includes('LONG'));
        nameCol = row.findIndex(c => c.includes('LONG') || c.includes('COMPANY'));
        isinCol = row.findIndex(c => c.includes('ISIN'));
        groupCol = row.findIndex(c => c.includes('GROUP') || c.includes('GRP'));
        break;
      }
    }
    
    if (codeCol === -1) codeCol = 0;
    if (idCol === -1) idCol = 1;
    if (nameCol === -1) nameCol = 2;
    
    console.log(`CSV parsing: codeCol=${codeCol}, idCol=${idCol}, nameCol=${nameCol}`);
    
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;
      
      const code = row[codeCol]?.trim();
      const id = row[idCol]?.trim();
      const name = nameCol >= 0 ? row[nameCol]?.trim() : id;
      const isin = isinCol >= 0 ? row[isinCol]?.trim() : '';
      const group = groupCol >= 0 ? row[groupCol]?.trim().toUpperCase() : 'A';
      
      if (!id || id.toUpperCase() === 'SECURITY_ID') continue;
      
      stocks.push({
        security_code: code,
        security_id: id,
        security_name: name || id,
        isin,
        group,
      });
    }
    
    console.log(`Parsed ${stocks.length} BSE stocks from CSV`);
    return stocks;
  }
  
  // Use comprehensive backup list
  console.log('Using backup BSE stock list...');
  return getBSEBackupList();
}

// Comprehensive BSE backup list
function getBSEBackupList(): BSEStock[] {
  // Major BSE listed stocks - comprehensive list
  const bseStocks = [
    // A Group - Large Cap
    { code: "500325", id: "RELIANCE", name: "Reliance Industries Limited" },
    { code: "532540", id: "TCS", name: "Tata Consultancy Services Limited" },
    { code: "500180", id: "HDFCBANK", name: "HDFC Bank Limited" },
    { code: "500209", id: "INFY", name: "Infosys Limited" },
    { code: "532174", id: "ICICIBANK", name: "ICICI Bank Limited" },
    { code: "500696", id: "HINDUNILVR", name: "Hindustan Unilever Limited" },
    { code: "500112", id: "SBIN", name: "State Bank of India" },
    { code: "532454", id: "BHARTIARTL", name: "Bharti Airtel Limited" },
    { code: "500875", id: "ITC", name: "ITC Limited" },
    { code: "500247", id: "KOTAKBANK", name: "Kotak Mahindra Bank Limited" },
    { code: "500510", id: "LT", name: "Larsen & Toubro Limited" },
    { code: "532215", id: "AXISBANK", name: "Axis Bank Limited" },
    { code: "500034", id: "BAJFINANCE", name: "Bajaj Finance Limited" },
    { code: "532500", id: "MARUTI", name: "Maruti Suzuki India Limited" },
    { code: "507685", id: "WIPRO", name: "Wipro Limited" },
    { code: "532281", id: "HCLTECH", name: "HCL Technologies Limited" },
    { code: "500820", id: "ASIANPAINT", name: "Asian Paints Limited" },
    { code: "524715", id: "SUNPHARMA", name: "Sun Pharmaceutical Industries Limited" },
    { code: "500114", id: "TITAN", name: "Titan Company Limited" },
    { code: "532538", id: "ULTRACEMCO", name: "UltraTech Cement Limited" },
    { code: "500790", id: "NESTLEIND", name: "Nestle India Limited" },
    { code: "500570", id: "TATAMOTORS", name: "Tata Motors Limited" },
    { code: "532898", id: "POWERGRID", name: "Power Grid Corporation of India Limited" },
    { code: "532555", id: "NTPC", name: "NTPC Limited" },
    { code: "500312", id: "ONGC", name: "Oil and Natural Gas Corporation Limited" },
    { code: "532755", id: "TECHM", name: "Tech Mahindra Limited" },
    { code: "500228", id: "JSWSTEEL", name: "JSW Steel Limited" },
    { code: "500470", id: "TATASTEEL", name: "Tata Steel Limited" },
    { code: "512599", id: "ADANIENT", name: "Adani Enterprises Limited" },
    { code: "532921", id: "ADANIPORTS", name: "Adani Ports and SEZ Limited" },
    { code: "500520", id: "M&M", name: "Mahindra & Mahindra Limited" },
    { code: "533278", id: "COALINDIA", name: "Coal India Limited" },
    { code: "500124", id: "DRREDDY", name: "Dr. Reddy's Laboratories Limited" },
    { code: "500087", id: "CIPLA", name: "Cipla Limited" },
    { code: "532488", id: "DIVISLAB", name: "Divi's Laboratories Limited" },
    { code: "500300", id: "GRASIM", name: "Grasim Industries Limited" },
    { code: "532978", id: "BAJAJFINSV", name: "Bajaj Finserv Limited" },
    { code: "500547", id: "BPCL", name: "Bharat Petroleum Corporation Limited" },
    { code: "500182", id: "HEROMOTOCO", name: "Hero MotoCorp Limited" },
    { code: "505200", id: "EICHERMOT", name: "Eicher Motors Limited" },
    { code: "500825", id: "BRITANNIA", name: "Britannia Industries Limited" },
    { code: "532187", id: "INDUSINDBK", name: "IndusInd Bank Limited" },
    { code: "500440", id: "HINDALCO", name: "Hindalco Industries Limited" },
    { code: "508869", id: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Limited" },
    { code: "500800", id: "TATACONSUM", name: "Tata Consumer Products Limited" },
    { code: "540719", id: "SBILIFE", name: "SBI Life Insurance Company Limited" },
    { code: "540777", id: "HDFCLIFE", name: "HDFC Life Insurance Company Limited" },
    { code: "500295", id: "VEDL", name: "Vedanta Limited" },
    { code: "543320", id: "ZOMATO", name: "Zomato Limited" },
    { code: "543396", id: "PAYTM", name: "One97 Communications Limited" },
    // B Group and additional stocks
    { code: "532134", id: "BANKBARODA", name: "Bank of Baroda" },
    { code: "532483", id: "CANBK", name: "Canara Bank" },
    { code: "532461", id: "PNB", name: "Punjab National Bank" },
    { code: "530965", id: "IOC", name: "Indian Oil Corporation Limited" },
    { code: "532155", id: "GAIL", name: "GAIL (India) Limited" },
    { code: "500400", id: "TATAPOWER", name: "Tata Power Company Limited" },
    { code: "533096", id: "ADANIPOWER", name: "Adani Power Limited" },
    { code: "541450", id: "ADANIGREEN", name: "Adani Green Energy Limited" },
    { code: "532822", id: "IDEA", name: "Vodafone Idea Limited" },
    { code: "532648", id: "YESBANK", name: "Yes Bank Limited" },
    { code: "539437", id: "IDFCFIRSTB", name: "IDFC First Bank Limited" },
    { code: "500469", id: "FEDERALBNK", name: "Federal Bank Limited" },
    { code: "541153", id: "BANDHANBNK", name: "Bandhan Bank Limited" },
    { code: "540065", id: "RBLBANK", name: "RBL Bank Limited" },
    { code: "540611", id: "AUBANK", name: "AU Small Finance Bank Limited" },
    { code: "532286", id: "JINDALSTEL", name: "Jindal Steel & Power Limited" },
    { code: "500113", id: "SAIL", name: "Steel Authority of India Limited" },
    { code: "526371", id: "NMDC", name: "NMDC Limited" },
    { code: "500103", id: "BHEL", name: "Bharat Heavy Electricals Limited" },
    { code: "541154", id: "HAL", name: "Hindustan Aeronautics Limited" },
    { code: "500049", id: "BEL", name: "Bharat Electronics Limited" },
    { code: "542830", id: "IRCTC", name: "Indian Railway Catering and Tourism Corporation Limited" },
    { code: "543257", id: "IRFC", name: "Indian Railway Finance Corporation Limited" },
    { code: "532955", id: "RECLTD", name: "REC Limited" },
    { code: "532810", id: "PFC", name: "Power Finance Corporation Limited" },
    { code: "533098", id: "NHPC", name: "NHPC Limited" },
    { code: "533206", id: "SJVN", name: "SJVN Limited" },
    { code: "500251", id: "TRENT", name: "Trent Limited" },
    { code: "540376", id: "DMART", name: "Avenue Supermarts Limited" },
    { code: "532777", id: "NAUKRI", name: "Info Edge (India) Limited" },
    { code: "543390", id: "POLICYBZR", name: "PB Fintech Limited" },
    { code: "543384", id: "NYKAA", name: "FSN E-Commerce Ventures Limited" },
    { code: "543529", id: "DELHIVERY", name: "Delhivery Limited" },
    { code: "543526", id: "LIC", name: "Life Insurance Corporation of India" },
    { code: "531642", id: "MARICO", name: "Marico Limited" },
    { code: "500096", id: "DABUR", name: "Dabur India Limited" },
    { code: "532424", id: "GODREJCP", name: "Godrej Consumer Products Limited" },
    { code: "500830", id: "COLPAL", name: "Colgate-Palmolive (India) Limited" },
    { code: "500331", id: "PIDILITIND", name: "Pidilite Industries Limited" },
    { code: "509480", id: "BERGEPAINT", name: "Berger Paints India Limited" },
    { code: "517354", id: "HAVELLS", name: "Havells India Limited" },
    { code: "500575", id: "VOLTAS", name: "Voltas Limited" },
    { code: "539876", id: "CROMPTON", name: "Crompton Greaves Consumer Electricals Limited" },
    { code: "542652", id: "POLYCAB", name: "Polycab India Limited" },
    { code: "540699", id: "DIXON", name: "Dixon Technologies (India) Limited" },
    { code: "524804", id: "AUROPHARMA", name: "Aurobindo Pharma Limited" },
    { code: "500257", id: "LUPIN", name: "Lupin Limited" },
    { code: "532523", id: "BIOCON", name: "Biocon Limited" },
    { code: "500420", id: "TORNTPHARM", name: "Torrent Pharmaceuticals Limited" },
    { code: "539523", id: "ALKEM", name: "Alkem Laboratories Limited" },
    { code: "543240", id: "LAURUSLABS", name: "Laurus Labs Limited" },
    { code: "532321", id: "ZYDUSLIFE", name: "Zydus Lifesciences Limited" },
    { code: "543220", id: "MAXHEALTH", name: "Max Healthcare Institute Limited" },
    { code: "532843", id: "FORTIS", name: "Fortis Healthcare Limited" },
    { code: "500387", id: "SHREECEM", name: "Shree Cement Limited" },
    { code: "500425", id: "AMBUJACEM", name: "Ambuja Cements Limited" },
    { code: "500410", id: "ACC", name: "ACC Limited" },
    { code: "539448", id: "INDIGO", name: "InterGlobe Aviation Limited" },
    { code: "517334", id: "MOTHERSON", name: "Samvardhana Motherson International Limited" },
    { code: "500530", id: "BOSCHLTD", name: "Bosch Limited" },
    { code: "500290", id: "MRF", name: "MRF Limited" },
    { code: "532977", id: "BAJAJ-AUTO", name: "Bajaj Auto Limited" },
    { code: "500477", id: "ASHOKLEY", name: "Ashok Leyland Limited" },
    { code: "532343", id: "TVSMOTOR", name: "TVS Motor Company Limited" },
    { code: "500495", id: "ESCORTS", name: "Escorts Kubota Limited" },
    { code: "502355", id: "BALKRISIND", name: "Balkrishna Industries Limited" },
    { code: "500877", id: "APOLLOTYRE", name: "Apollo Tyres Limited" },
    { code: "500878", id: "CEATLTD", name: "CEAT Limited" },
    { code: "500086", id: "EXIDEIND", name: "Exide Industries Limited" },
    { code: "500008", id: "AMARAJABAT", name: "Amara Raja Energy & Mobility Limited" },
    { code: "590071", id: "SUNDARMFIN", name: "Sundaram Finance Limited" },
    { code: "533398", id: "MUTHOOTFIN", name: "Muthoot Finance Limited" },
    { code: "531213", id: "MANAPPURAM", name: "Manappuram Finance Limited" },
    { code: "511243", id: "CHOLAFIN", name: "Cholamandalam Investment and Finance Company Limited" },
    { code: "500253", id: "LICHSGFIN", name: "LIC Housing Finance Limited" },
    { code: "511196", id: "CANFINHOME", name: "Can Fin Homes Limited" },
    { code: "541557", id: "SBICARD", name: "SBI Cards and Payment Services Limited" },
    { code: "540716", id: "ICICIGI", name: "ICICI Lombard General Insurance Company Limited" },
    { code: "540133", id: "ICICIPRULI", name: "ICICI Prudential Life Insurance Company Limited" },
    { code: "532432", id: "MCDOWELL-N", name: "United Spirits Limited" },
    { code: "532478", id: "UBL", name: "United Breweries Limited" },
    { code: "540180", id: "VBL", name: "Varun Beverages Limited" },
    { code: "533155", id: "JUBLFOOD", name: "Jubilant FoodWorks Limited" },
    { code: "543330", id: "DEVYANI", name: "Devyani International Limited" },
    { code: "532827", id: "PAGEIND", name: "Page Industries Limited" },
    { code: "532892", id: "COFORGE", name: "Coforge Limited" },
    { code: "540005", id: "LTIM", name: "LTIMindtree Limited" },
    { code: "526299", id: "MPHASIS", name: "Mphasis Limited" },
    { code: "533179", id: "PERSISTENT", name: "Persistent Systems Limited" },
    { code: "540115", id: "LTTS", name: "L&T Technology Services Limited" },
    { code: "542651", id: "KPITTECH", name: "KPIT Technologies Limited" },
    { code: "500408", id: "TATAELXSI", name: "Tata Elxsi Limited" },
    { code: "532466", id: "OFSS", name: "Oracle Financial Services Software Limited" },
    { code: "532868", id: "DLF", name: "DLF Limited" },
    { code: "533150", id: "GODREJPROP", name: "Godrej Properties Limited" },
    { code: "533273", id: "OBEROIRLTY", name: "Oberoi Realty Limited" },
    { code: "533274", id: "PRESTIGE", name: "Prestige Estates Projects Limited" },
    { code: "543287", id: "LODHA", name: "Macrotech Developers Limited" },
    { code: "523642", id: "PIIND", name: "PI Industries Limited" },
    { code: "503806", id: "SRF", name: "SRF Limited" },
    { code: "506401", id: "DEEPAKNTR", name: "Deepak Nitrite Limited" },
    { code: "524208", id: "AARTIIND", name: "Aarti Industries Limited" },
    { code: "512070", id: "UPL", name: "UPL Limited" },
    // Additional popular BSE stocks for comprehensive coverage
    { code: "532667", id: "SIEMENS", name: "Siemens Limited" },
    { code: "500483", id: "ABB", name: "ABB India Limited" },
    { code: "517569", id: "CGPOWER", name: "CG Power and Industrial Solutions Limited" },
    { code: "500411", id: "THERMAX", name: "Thermax Limited" },
    { code: "500480", id: "CUMMINSIND", name: "Cummins India Limited" },
    { code: "506395", id: "GRINDWELL", name: "Grindwell Norton Limited" },
    { code: "513375", id: "CARBORUNIV", name: "Carborundum Universal Limited" },
    { code: "500233", id: "KAJARIACER", name: "Kajaria Ceramics Limited" },
    { code: "532548", id: "CENTURYPLY", name: "Century Plyboards (India) Limited" },
    { code: "526797", id: "GREENPLY", name: "Greenply Industries Limited" },
    { code: "532644", id: "JKCEMENT", name: "JK Cement Limited" },
    { code: "532714", id: "RAMCOCEM", name: "The Ramco Cements Limited" },
    { code: "538835", id: "DALBHARAT", name: "Dalmia Bharat Limited" },
    { code: "532949", id: "JKPAPER", name: "JK Paper Limited" },
    { code: "531500", id: "BATAINDIA", name: "Bata India Limited" },
    { code: "530965", id: "RELAXO", name: "Relaxo Footwears Limited" },
    { code: "543523", id: "CAMPUS", name: "Campus Activewear Limited" },
    { code: "532617", id: "JYOTHYLAB", name: "Jyothy Labs Limited" },
    { code: "531162", id: "EMAMILTD", name: "Emami Limited" },
    { code: "500378", id: "JINDALSAW", name: "Jindal Saw Limited" },
    { code: "513369", id: "WELSPUNIND", name: "Welspun India Limited" },
    { code: "532702", id: "WOCKPHARMA", name: "Wockhardt Limited" },
    { code: "509684", id: "SWANENERGY", name: "Swan Energy Limited" },
    { code: "532175", id: "CYIENT", name: "Cyient Limited" },
    { code: "532400", id: "BIRLASOFT", name: "Birlasoft Limited" },
    { code: "543227", id: "HAPPSTMNDS", name: "Happiest Minds Technologies Limited" },
    { code: "543228", id: "ROUTE", name: "Route Mobile Limited" },
    { code: "532790", id: "TANLA", name: "Tanla Platforms Limited" },
    { code: "541729", id: "LATENTVIEW", name: "LatentView Analytics Limited" },
    { code: "543272", id: "NAZARA", name: "Nazara Technologies Limited" },
    { code: "532163", id: "DATAMATICS", name: "Datamatics Global Services Limited" },
    { code: "500304", id: "NIITLTD", name: "NIIT Limited" },
    { code: "531213", id: "QUICKHEAL", name: "Quick Heal Technologies Limited" },
    { code: "532215", id: "GUJGASLTD", name: "Gujarat Gas Limited" },
    { code: "539336", id: "GSPL", name: "Gujarat State Petronet Limited" },
    { code: "540124", id: "IGL", name: "Indraprastha Gas Limited" },
    { code: "539957", id: "MGL", name: "Mahanagar Gas Limited" },
    { code: "500676", id: "GLAXO", name: "GlaxoSmithKline Pharmaceuticals Limited" },
    { code: "500087", id: "PFIZER", name: "Pfizer Limited" },
    { code: "500674", id: "SANOFI", name: "Sanofi India Limited" },
    { code: "500672", id: "ABBOTINDIA", name: "Abbott India Limited" },
    { code: "500790", id: "PGHH", name: "Procter & Gamble Hygiene and Health Care Limited" },
    { code: "507815", id: "GILLETTE", name: "Gillette India Limited" },
    { code: "517174", id: "HONEYWELL", name: "Honeywell Automation India Limited" },
    { code: "523395", id: "3MINDIA", name: "3M India Limited" },
    { code: "500238", id: "WHIRLPOOL", name: "Whirlpool of India Limited" },
    { code: "500067", id: "BLUESTARCO", name: "Blue Star Limited" },
    { code: "532531", id: "HITACHIIND", name: "Hitachi Energy India Limited" },
  ];
  
  return bseStocks.map(s => ({
    security_code: s.code,
    security_id: s.id,
    security_name: s.name,
    isin: '',
    group: 'A',
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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('=== Starting BSE Symbol Sync ===');
    
    // Fetch BSE stocks
    const bseStocks = await withRetry(() => fetchBSEScripMaster());
    
    if (bseStocks.length === 0) {
      await logSyncResult(supabase, 'BSE', 0, 'error', 'No stocks fetched', startedAt);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch BSE stocks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Fetched ${bseStocks.length} BSE stocks`);
    
    // Filter for equity stocks and convert to stock records
    const stockRecords: StockRecord[] = bseStocks
      .filter(stock => stock.security_id && stock.security_id.length > 0)
      .map((stock, index) => ({
        symbol: stock.security_id,
        company_name: stock.security_name || stock.security_id,
        market: 'BSE',
        market_cap: null,
        volume: null,
        popularity_score: Math.max(1, 1000 - index),
      }));
    
    // Upsert stocks
    const { success, errors } = await upsertStocks(supabase, stockRecords);
    
    const status = errors === 0 ? 'success' : (success > 0 ? 'partial' : 'error');
    await logSyncResult(
      supabase,
      'BSE',
      success,
      status,
      errors > 0 ? `${errors} stocks failed to insert` : undefined,
      startedAt
    );
    
    // Get total count
    const { count: dbTotal } = await supabase
      .from('stock_symbols')
      .select('*', { count: 'exact', head: true })
      .eq('market', 'BSE');
    
    const result = {
      success: true,
      message: `BSE sync complete: ${success} stocks synced`,
      stocksProcessed: bseStocks.length,
      stocksInserted: success,
      errors: errors,
      totalInDatabase: dbTotal,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`=== BSE Sync Complete: ${success} stocks ===`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('BSE sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await logSyncResult(supabase, 'BSE', 0, 'error', message, startedAt);
    }
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
