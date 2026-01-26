import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// All 20 supported markets with Yahoo Finance configuration
const MARKETS_CONFIG: Record<string, { suffix: string; region: string; exchanges?: string[] }> = {
  // North America
  NYSE: { suffix: '', region: 'us', exchanges: ['NYQ', 'NYS'] },
  NASDAQ: { suffix: '', region: 'us', exchanges: ['NMS', 'NGM', 'NCM'] },
  TSX: { suffix: '.TO', region: 'ca', exchanges: ['TOR'] },
  // Europe
  LSE: { suffix: '.L', region: 'gb', exchanges: ['LSE'] },
  XETRA: { suffix: '.DE', region: 'de', exchanges: ['GER'] },
  EURONEXT: { suffix: '.PA', region: 'fr', exchanges: ['PAR'] },
  SIX: { suffix: '.SW', region: 'ch', exchanges: ['EBS'] },
  // Asia Pacific
  NSE: { suffix: '.NS', region: 'in', exchanges: ['NSI'] },
  BSE: { suffix: '.BO', region: 'in', exchanges: ['BOM'] },
  TSE: { suffix: '.T', region: 'jp', exchanges: ['JPX'] },
  HKEX: { suffix: '.HK', region: 'hk', exchanges: ['HKG'] },
  SSE: { suffix: '.SS', region: 'cn', exchanges: ['SHH'] },
  SZSE: { suffix: '.SZ', region: 'cn', exchanges: ['SHZ'] },
  KRX: { suffix: '.KS', region: 'kr', exchanges: ['KSC', 'KOE'] },
  ASX: { suffix: '.AX', region: 'au', exchanges: ['ASX'] },
  SGX: { suffix: '.SI', region: 'sg', exchanges: ['SES'] },
  // Latin America
  B3: { suffix: '.SA', region: 'br', exchanges: ['SAO'] },
  // Africa
  JSE: { suffix: '.JO', region: 'za', exchanges: ['JNB'] },
  // Russia
  MOEX: { suffix: '.ME', region: 'ru', exchanges: ['MCX'] },
  // Middle East
  TADAWUL: { suffix: '.SR', region: 'sa', exchanges: ['SAU'] },
};

interface StockSymbol {
  symbol: string;
  company_name: string;
  market: string;
  market_cap: number | null;
  volume: number | null;
  popularity_score: number;
}

interface SyncResult {
  market: string;
  count: number;
  status: 'success' | 'error' | 'partial';
  error?: string;
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

// Fetch stocks from Yahoo Finance screener API
async function fetchYahooScreener(
  market: string,
  offset = 0,
  count = 250
): Promise<StockSymbol[]> {
  const config = MARKETS_CONFIG[market];
  if (!config) return [];

  try {
    const body = {
      size: count,
      offset: offset,
      sortField: "intradaymarketcap",
      sortType: "DESC",
      quoteType: "EQUITY",
      query: {
        operator: "AND",
        operands: [
          { operator: "eq", operands: ["region", config.region] }
        ]
      },
      userId: "",
      userIdType: "guid"
    };

    const response = await fetch(
      "https://query2.finance.yahoo.com/v1/finance/screener?crumb=&lang=en-US&region=US&formatted=true&corsDomain=finance.yahoo.com",
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error(`Yahoo screener error for ${market}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    const suffix = config.suffix;

    return quotes.map((quote: any, index: number) => {
      let symbol = quote.symbol || '';
      // Remove suffix to get clean symbol
      if (suffix && symbol.endsWith(suffix)) {
        symbol = symbol.slice(0, -suffix.length);
      }

      return {
        symbol: symbol,
        company_name: quote.shortName || quote.longName || symbol,
        market: market,
        market_cap: quote.marketCap?.raw || null,
        volume: quote.averageDailyVolume3Month?.raw || quote.regularMarketVolume?.raw || null,
        popularity_score: Math.max(0, 1000 - offset - index),
      };
    }).filter((s: StockSymbol) => s.symbol && s.symbol.length > 0);
  } catch (err) {
    console.error(`Error fetching ${market} stocks from Yahoo:`, err);
    return [];
  }
}

// Fetch all pages from Yahoo screener for complete coverage
async function fetchAllYahooStocks(market: string, maxStocks = 2000): Promise<StockSymbol[]> {
  const allStocks: StockSymbol[] = [];
  const pageSize = 250;
  let offset = 0;

  while (offset < maxStocks) {
    const stocks = await withRetry(() => fetchYahooScreener(market, offset, pageSize));
    if (stocks.length === 0) break;

    allStocks.push(...stocks);
    console.log(`Fetched ${stocks.length} stocks for ${market} at offset ${offset}`);

    if (stocks.length < pageSize) break;
    offset += pageSize;

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allStocks;
}

// Comprehensive stock lists for markets where Yahoo screener has limited coverage
// These are high-coverage curated lists based on market indices and popular stocks

const INDIAN_NSE_STOCKS: StockSymbol[] = [
  // NIFTY 50
  { symbol: "RELIANCE", company_name: "Reliance Industries Ltd", market: "NSE", market_cap: 1800000, volume: 5000000, popularity_score: 1000 },
  { symbol: "TCS", company_name: "Tata Consultancy Services Ltd", market: "NSE", market_cap: 1400000, volume: 2000000, popularity_score: 999 },
  { symbol: "HDFCBANK", company_name: "HDFC Bank Ltd", market: "NSE", market_cap: 1200000, volume: 8000000, popularity_score: 998 },
  { symbol: "INFY", company_name: "Infosys Ltd", market: "NSE", market_cap: 700000, volume: 5000000, popularity_score: 997 },
  { symbol: "ICICIBANK", company_name: "ICICI Bank Ltd", market: "NSE", market_cap: 700000, volume: 10000000, popularity_score: 996 },
  { symbol: "HINDUNILVR", company_name: "Hindustan Unilever Ltd", market: "NSE", market_cap: 600000, volume: 1500000, popularity_score: 995 },
  { symbol: "SBIN", company_name: "State Bank of India", market: "NSE", market_cap: 600000, volume: 15000000, popularity_score: 994 },
  { symbol: "BHARTIARTL", company_name: "Bharti Airtel Ltd", market: "NSE", market_cap: 500000, volume: 3000000, popularity_score: 993 },
  { symbol: "ITC", company_name: "ITC Ltd", market: "NSE", market_cap: 500000, volume: 8000000, popularity_score: 992 },
  { symbol: "KOTAKBANK", company_name: "Kotak Mahindra Bank Ltd", market: "NSE", market_cap: 400000, volume: 2000000, popularity_score: 991 },
  { symbol: "LT", company_name: "Larsen & Toubro Ltd", market: "NSE", market_cap: 400000, volume: 1500000, popularity_score: 990 },
  { symbol: "AXISBANK", company_name: "Axis Bank Ltd", market: "NSE", market_cap: 350000, volume: 10000000, popularity_score: 989 },
  { symbol: "BAJFINANCE", company_name: "Bajaj Finance Ltd", market: "NSE", market_cap: 450000, volume: 2000000, popularity_score: 988 },
  { symbol: "MARUTI", company_name: "Maruti Suzuki India Ltd", market: "NSE", market_cap: 350000, volume: 800000, popularity_score: 987 },
  { symbol: "WIPRO", company_name: "Wipro Ltd", market: "NSE", market_cap: 250000, volume: 3000000, popularity_score: 986 },
  { symbol: "HCLTECH", company_name: "HCL Technologies Ltd", market: "NSE", market_cap: 350000, volume: 2000000, popularity_score: 985 },
  { symbol: "ASIANPAINT", company_name: "Asian Paints Ltd", market: "NSE", market_cap: 300000, volume: 1000000, popularity_score: 984 },
  { symbol: "SUNPHARMA", company_name: "Sun Pharmaceutical Industries Ltd", market: "NSE", market_cap: 300000, volume: 3000000, popularity_score: 983 },
  { symbol: "TITAN", company_name: "Titan Company Ltd", market: "NSE", market_cap: 280000, volume: 1500000, popularity_score: 982 },
  { symbol: "ULTRACEMCO", company_name: "UltraTech Cement Ltd", market: "NSE", market_cap: 250000, volume: 500000, popularity_score: 981 },
  { symbol: "NESTLEIND", company_name: "Nestle India Ltd", market: "NSE", market_cap: 230000, volume: 200000, popularity_score: 980 },
  { symbol: "TATAMOTORS", company_name: "Tata Motors Ltd", market: "NSE", market_cap: 250000, volume: 15000000, popularity_score: 979 },
  { symbol: "POWERGRID", company_name: "Power Grid Corporation of India Ltd", market: "NSE", market_cap: 250000, volume: 8000000, popularity_score: 978 },
  { symbol: "NTPC", company_name: "NTPC Ltd", market: "NSE", market_cap: 300000, volume: 10000000, popularity_score: 977 },
  { symbol: "ONGC", company_name: "Oil and Natural Gas Corporation Ltd", market: "NSE", market_cap: 250000, volume: 8000000, popularity_score: 976 },
  { symbol: "TECHM", company_name: "Tech Mahindra Ltd", market: "NSE", market_cap: 130000, volume: 2000000, popularity_score: 975 },
  { symbol: "JSWSTEEL", company_name: "JSW Steel Ltd", market: "NSE", market_cap: 200000, volume: 3000000, popularity_score: 974 },
  { symbol: "TATASTEEL", company_name: "Tata Steel Ltd", market: "NSE", market_cap: 180000, volume: 10000000, popularity_score: 973 },
  { symbol: "ADANIENT", company_name: "Adani Enterprises Ltd", market: "NSE", market_cap: 350000, volume: 5000000, popularity_score: 972 },
  { symbol: "ADANIPORTS", company_name: "Adani Ports and SEZ Ltd", market: "NSE", market_cap: 250000, volume: 5000000, popularity_score: 971 },
  { symbol: "M&M", company_name: "Mahindra & Mahindra Ltd", market: "NSE", market_cap: 280000, volume: 3000000, popularity_score: 970 },
  { symbol: "COALINDIA", company_name: "Coal India Ltd", market: "NSE", market_cap: 250000, volume: 8000000, popularity_score: 969 },
  { symbol: "DRREDDY", company_name: "Dr. Reddy's Laboratories Ltd", market: "NSE", market_cap: 100000, volume: 500000, popularity_score: 968 },
  { symbol: "CIPLA", company_name: "Cipla Ltd", market: "NSE", market_cap: 100000, volume: 2000000, popularity_score: 967 },
  { symbol: "DIVISLAB", company_name: "Divi's Laboratories Ltd", market: "NSE", market_cap: 100000, volume: 500000, popularity_score: 966 },
  { symbol: "GRASIM", company_name: "Grasim Industries Ltd", market: "NSE", market_cap: 150000, volume: 1000000, popularity_score: 965 },
  { symbol: "BAJAJFINSV", company_name: "Bajaj Finserv Ltd", market: "NSE", market_cap: 250000, volume: 500000, popularity_score: 964 },
  { symbol: "BPCL", company_name: "Bharat Petroleum Corporation Ltd", market: "NSE", market_cap: 120000, volume: 5000000, popularity_score: 963 },
  { symbol: "HEROMOTOCO", company_name: "Hero MotoCorp Ltd", market: "NSE", market_cap: 80000, volume: 500000, popularity_score: 962 },
  { symbol: "EICHERMOT", company_name: "Eicher Motors Ltd", market: "NSE", market_cap: 100000, volume: 300000, popularity_score: 961 },
  { symbol: "BRITANNIA", company_name: "Britannia Industries Ltd", market: "NSE", market_cap: 120000, volume: 300000, popularity_score: 960 },
  { symbol: "INDUSINDBK", company_name: "IndusInd Bank Ltd", market: "NSE", market_cap: 80000, volume: 3000000, popularity_score: 959 },
  { symbol: "HINDALCO", company_name: "Hindalco Industries Ltd", market: "NSE", market_cap: 120000, volume: 5000000, popularity_score: 958 },
  { symbol: "APOLLOHOSP", company_name: "Apollo Hospitals Enterprise Ltd", market: "NSE", market_cap: 80000, volume: 500000, popularity_score: 957 },
  { symbol: "TATACONSUM", company_name: "Tata Consumer Products Ltd", market: "NSE", market_cap: 100000, volume: 2000000, popularity_score: 956 },
  { symbol: "SBILIFE", company_name: "SBI Life Insurance Company Ltd", market: "NSE", market_cap: 130000, volume: 1000000, popularity_score: 955 },
  { symbol: "HDFCLIFE", company_name: "HDFC Life Insurance Company Ltd", market: "NSE", market_cap: 130000, volume: 2000000, popularity_score: 954 },
  { symbol: "VEDL", company_name: "Vedanta Ltd", market: "NSE", market_cap: 150000, volume: 10000000, popularity_score: 953 },
  { symbol: "ZOMATO", company_name: "Zomato Ltd", market: "NSE", market_cap: 150000, volume: 20000000, popularity_score: 952 },
  { symbol: "PAYTM", company_name: "One97 Communications Ltd", market: "NSE", market_cap: 50000, volume: 5000000, popularity_score: 951 },
  // NIFTY Next 50 and additional popular stocks
  { symbol: "BANKBARODA", company_name: "Bank of Baroda", market: "NSE", market_cap: 100000, volume: 20000000, popularity_score: 950 },
  { symbol: "CANBK", company_name: "Canara Bank", market: "NSE", market_cap: 80000, volume: 15000000, popularity_score: 949 },
  { symbol: "PNB", company_name: "Punjab National Bank", market: "NSE", market_cap: 100000, volume: 30000000, popularity_score: 948 },
  { symbol: "IOC", company_name: "Indian Oil Corporation Ltd", market: "NSE", market_cap: 150000, volume: 10000000, popularity_score: 947 },
  { symbol: "GAIL", company_name: "GAIL (India) Ltd", market: "NSE", market_cap: 100000, volume: 5000000, popularity_score: 946 },
  { symbol: "TATAPOWER", company_name: "Tata Power Company Ltd", market: "NSE", market_cap: 100000, volume: 15000000, popularity_score: 945 },
  { symbol: "ADANIPOWER", company_name: "Adani Power Ltd", market: "NSE", market_cap: 150000, volume: 10000000, popularity_score: 944 },
  { symbol: "ADANIGREEN", company_name: "Adani Green Energy Ltd", market: "NSE", market_cap: 200000, volume: 3000000, popularity_score: 943 },
  { symbol: "IDEA", company_name: "Vodafone Idea Ltd", market: "NSE", market_cap: 50000, volume: 100000000, popularity_score: 942 },
  { symbol: "YESBANK", company_name: "Yes Bank Ltd", market: "NSE", market_cap: 50000, volume: 50000000, popularity_score: 941 },
  { symbol: "IDFCFIRSTB", company_name: "IDFC First Bank Ltd", market: "NSE", market_cap: 50000, volume: 20000000, popularity_score: 940 },
  { symbol: "FEDERALBNK", company_name: "Federal Bank Ltd", market: "NSE", market_cap: 40000, volume: 10000000, popularity_score: 939 },
  { symbol: "BANDHANBNK", company_name: "Bandhan Bank Ltd", market: "NSE", market_cap: 30000, volume: 5000000, popularity_score: 938 },
  { symbol: "RBLBANK", company_name: "RBL Bank Ltd", market: "NSE", market_cap: 15000, volume: 5000000, popularity_score: 937 },
  { symbol: "AUBANK", company_name: "AU Small Finance Bank Ltd", market: "NSE", market_cap: 40000, volume: 2000000, popularity_score: 936 },
  { symbol: "JINDALSTEL", company_name: "Jindal Steel & Power Ltd", market: "NSE", market_cap: 80000, volume: 5000000, popularity_score: 935 },
  { symbol: "SAIL", company_name: "Steel Authority of India Ltd", market: "NSE", market_cap: 50000, volume: 20000000, popularity_score: 934 },
  { symbol: "NMDC", company_name: "NMDC Ltd", market: "NSE", market_cap: 60000, volume: 10000000, popularity_score: 933 },
  { symbol: "BHEL", company_name: "Bharat Heavy Electricals Ltd", market: "NSE", market_cap: 80000, volume: 20000000, popularity_score: 932 },
  { symbol: "HAL", company_name: "Hindustan Aeronautics Ltd", market: "NSE", market_cap: 250000, volume: 1000000, popularity_score: 931 },
  { symbol: "BEL", company_name: "Bharat Electronics Ltd", market: "NSE", market_cap: 150000, volume: 5000000, popularity_score: 930 },
  { symbol: "IRCTC", company_name: "Indian Railway Catering and Tourism Corporation Ltd", market: "NSE", market_cap: 60000, volume: 2000000, popularity_score: 929 },
  { symbol: "IRFC", company_name: "Indian Railway Finance Corporation Ltd", market: "NSE", market_cap: 150000, volume: 50000000, popularity_score: 928 },
  { symbol: "RECLTD", company_name: "REC Ltd", market: "NSE", market_cap: 120000, volume: 10000000, popularity_score: 927 },
  { symbol: "PFC", company_name: "Power Finance Corporation Ltd", market: "NSE", market_cap: 130000, volume: 10000000, popularity_score: 926 },
  { symbol: "NHPC", company_name: "NHPC Ltd", market: "NSE", market_cap: 80000, volume: 20000000, popularity_score: 925 },
  { symbol: "SJVN", company_name: "SJVN Ltd", market: "NSE", market_cap: 50000, volume: 30000000, popularity_score: 924 },
  { symbol: "TRENT", company_name: "Trent Ltd", market: "NSE", market_cap: 150000, volume: 1000000, popularity_score: 923 },
  { symbol: "DMART", company_name: "Avenue Supermarts Ltd", market: "NSE", market_cap: 250000, volume: 500000, popularity_score: 922 },
  { symbol: "NAUKRI", company_name: "Info Edge (India) Ltd", market: "NSE", market_cap: 60000, volume: 200000, popularity_score: 921 },
  { symbol: "POLICYBZR", company_name: "PB Fintech Ltd", market: "NSE", market_cap: 50000, volume: 2000000, popularity_score: 920 },
  { symbol: "NYKAA", company_name: "FSN E-Commerce Ventures Ltd", market: "NSE", market_cap: 40000, volume: 3000000, popularity_score: 919 },
  { symbol: "DELHIVERY", company_name: "Delhivery Ltd", market: "NSE", market_cap: 30000, volume: 2000000, popularity_score: 918 },
  { symbol: "LIC", company_name: "Life Insurance Corporation of India", market: "NSE", market_cap: 500000, volume: 5000000, popularity_score: 917 },
  { symbol: "MARICO", company_name: "Marico Ltd", market: "NSE", market_cap: 70000, volume: 1000000, popularity_score: 916 },
  { symbol: "DABUR", company_name: "Dabur India Ltd", market: "NSE", market_cap: 90000, volume: 1500000, popularity_score: 915 },
  { symbol: "GODREJCP", company_name: "Godrej Consumer Products Ltd", market: "NSE", market_cap: 100000, volume: 800000, popularity_score: 914 },
  { symbol: "COLPAL", company_name: "Colgate-Palmolive (India) Ltd", market: "NSE", market_cap: 70000, volume: 300000, popularity_score: 913 },
  { symbol: "PIDILITIND", company_name: "Pidilite Industries Ltd", market: "NSE", market_cap: 130000, volume: 500000, popularity_score: 912 },
  { symbol: "BERGEPAINT", company_name: "Berger Paints India Ltd", market: "NSE", market_cap: 60000, volume: 300000, popularity_score: 911 },
  { symbol: "HAVELLS", company_name: "Havells India Ltd", market: "NSE", market_cap: 90000, volume: 500000, popularity_score: 910 },
  { symbol: "VOLTAS", company_name: "Voltas Ltd", market: "NSE", market_cap: 40000, volume: 1000000, popularity_score: 909 },
  { symbol: "CROMPTON", company_name: "Crompton Greaves Consumer Electricals Ltd", market: "NSE", market_cap: 25000, volume: 1500000, popularity_score: 908 },
  { symbol: "POLYCAB", company_name: "Polycab India Ltd", market: "NSE", market_cap: 80000, volume: 300000, popularity_score: 907 },
  { symbol: "DIXON", company_name: "Dixon Technologies (India) Ltd", market: "NSE", market_cap: 60000, volume: 300000, popularity_score: 906 },
  { symbol: "AUROPHARMA", company_name: "Aurobindo Pharma Ltd", market: "NSE", market_cap: 60000, volume: 2000000, popularity_score: 905 },
  { symbol: "LUPIN", company_name: "Lupin Ltd", market: "NSE", market_cap: 70000, volume: 1500000, popularity_score: 904 },
  { symbol: "BIOCON", company_name: "Biocon Ltd", market: "NSE", market_cap: 40000, volume: 2000000, popularity_score: 903 },
  { symbol: "TORNTPHARM", company_name: "Torrent Pharmaceuticals Ltd", market: "NSE", market_cap: 70000, volume: 300000, popularity_score: 902 },
  { symbol: "ALKEM", company_name: "Alkem Laboratories Ltd", market: "NSE", market_cap: 50000, volume: 200000, popularity_score: 901 },
  { symbol: "LAURUSLABS", company_name: "Laurus Labs Ltd", market: "NSE", market_cap: 25000, volume: 2000000, popularity_score: 900 },
  { symbol: "ZYDUSLIFE", company_name: "Zydus Lifesciences Ltd", market: "NSE", market_cap: 70000, volume: 1000000, popularity_score: 899 },
  { symbol: "MAXHEALTH", company_name: "Max Healthcare Institute Ltd", market: "NSE", market_cap: 80000, volume: 1000000, popularity_score: 898 },
  { symbol: "FORTIS", company_name: "Fortis Healthcare Ltd", market: "NSE", market_cap: 40000, volume: 1500000, popularity_score: 897 },
  { symbol: "SHREECEM", company_name: "Shree Cement Ltd", market: "NSE", market_cap: 90000, volume: 100000, popularity_score: 896 },
  { symbol: "AMBUJACEM", company_name: "Ambuja Cements Ltd", market: "NSE", market_cap: 120000, volume: 5000000, popularity_score: 895 },
  { symbol: "ACC", company_name: "ACC Ltd", market: "NSE", market_cap: 40000, volume: 1000000, popularity_score: 894 },
  { symbol: "INDIGO", company_name: "InterGlobe Aviation Ltd", market: "NSE", market_cap: 100000, volume: 1000000, popularity_score: 893 },
  { symbol: "MOTHERSON", company_name: "Samvardhana Motherson International Ltd", market: "NSE", market_cap: 70000, volume: 5000000, popularity_score: 892 },
  { symbol: "BOSCHLTD", company_name: "Bosch Ltd", market: "NSE", market_cap: 80000, volume: 50000, popularity_score: 891 },
  { symbol: "MRF", company_name: "MRF Ltd", market: "NSE", market_cap: 50000, volume: 10000, popularity_score: 890 },
  { symbol: "BAJAJ-AUTO", company_name: "Bajaj Auto Ltd", market: "NSE", market_cap: 200000, volume: 500000, popularity_score: 889 },
  { symbol: "ASHOKLEY", company_name: "Ashok Leyland Ltd", market: "NSE", market_cap: 60000, volume: 10000000, popularity_score: 888 },
  { symbol: "TVSMOTOR", company_name: "TVS Motor Company Ltd", market: "NSE", market_cap: 100000, volume: 1000000, popularity_score: 887 },
  { symbol: "ESCORTS", company_name: "Escorts Kubota Ltd", market: "NSE", market_cap: 40000, volume: 300000, popularity_score: 886 },
  { symbol: "BALKRISIND", company_name: "Balkrishna Industries Ltd", market: "NSE", market_cap: 50000, volume: 300000, popularity_score: 885 },
  { symbol: "APOLLOTYRE", company_name: "Apollo Tyres Ltd", market: "NSE", market_cap: 30000, volume: 3000000, popularity_score: 884 },
  { symbol: "CEATLTD", company_name: "CEAT Ltd", market: "NSE", market_cap: 10000, volume: 200000, popularity_score: 883 },
  { symbol: "EXIDEIND", company_name: "Exide Industries Ltd", market: "NSE", market_cap: 30000, volume: 3000000, popularity_score: 882 },
  { symbol: "AMARAJABAT", company_name: "Amara Raja Energy & Mobility Ltd", market: "NSE", market_cap: 15000, volume: 500000, popularity_score: 881 },
  { symbol: "SUNDARMFIN", company_name: "Sundaram Finance Ltd", market: "NSE", market_cap: 40000, volume: 100000, popularity_score: 880 },
  { symbol: "MUTHOOTFIN", company_name: "Muthoot Finance Ltd", market: "NSE", market_cap: 60000, volume: 1000000, popularity_score: 879 },
  { symbol: "MANAPPURAM", company_name: "Manappuram Finance Ltd", market: "NSE", market_cap: 20000, volume: 5000000, popularity_score: 878 },
  { symbol: "CHOLAFIN", company_name: "Cholamandalam Investment and Finance Company Ltd", market: "NSE", market_cap: 100000, volume: 1000000, popularity_score: 877 },
  { symbol: "LICHSGFIN", company_name: "LIC Housing Finance Ltd", market: "NSE", market_cap: 30000, volume: 3000000, popularity_score: 876 },
  { symbol: "CANFINHOME", company_name: "Can Fin Homes Ltd", market: "NSE", market_cap: 10000, volume: 1000000, popularity_score: 875 },
  { symbol: "SBICARD", company_name: "SBI Cards and Payment Services Ltd", market: "NSE", market_cap: 70000, volume: 1500000, popularity_score: 874 },
  { symbol: "ICICIGI", company_name: "ICICI Lombard General Insurance Company Ltd", market: "NSE", market_cap: 80000, volume: 500000, popularity_score: 873 },
  { symbol: "ICICIPRULI", company_name: "ICICI Prudential Life Insurance Company Ltd", market: "NSE", market_cap: 70000, volume: 1000000, popularity_score: 872 },
  { symbol: "MCDOWELL-N", company_name: "United Spirits Ltd", market: "NSE", market_cap: 100000, volume: 500000, popularity_score: 871 },
  { symbol: "UBL", company_name: "United Breweries Ltd", market: "NSE", market_cap: 50000, volume: 200000, popularity_score: 870 },
  { symbol: "VBL", company_name: "Varun Beverages Ltd", market: "NSE", market_cap: 150000, volume: 1000000, popularity_score: 869 },
  { symbol: "JUBLFOOD", company_name: "Jubilant FoodWorks Ltd", market: "NSE", market_cap: 30000, volume: 500000, popularity_score: 868 },
  { symbol: "DEVYANI", company_name: "Devyani International Ltd", market: "NSE", market_cap: 20000, volume: 2000000, popularity_score: 867 },
  { symbol: "PAGEIND", company_name: "Page Industries Ltd", market: "NSE", market_cap: 45000, volume: 30000, popularity_score: 866 },
  { symbol: "COFORGE", company_name: "Coforge Ltd", market: "NSE", market_cap: 40000, volume: 300000, popularity_score: 854 },
  { symbol: "LTIM", company_name: "LTIMindtree Ltd", market: "NSE", market_cap: 150000, volume: 300000, popularity_score: 853 },
  { symbol: "MPHASIS", company_name: "Mphasis Ltd", market: "NSE", market_cap: 50000, volume: 300000, popularity_score: 852 },
  { symbol: "PERSISTENT", company_name: "Persistent Systems Ltd", market: "NSE", market_cap: 60000, volume: 200000, popularity_score: 851 },
  { symbol: "LTTS", company_name: "L&T Technology Services Ltd", market: "NSE", market_cap: 50000, volume: 200000, popularity_score: 850 },
  { symbol: "KPITTECH", company_name: "KPIT Technologies Ltd", market: "NSE", market_cap: 40000, volume: 1000000, popularity_score: 844 },
  { symbol: "TATAELXSI", company_name: "Tata Elxsi Ltd", market: "NSE", market_cap: 45000, volume: 200000, popularity_score: 843 },
  { symbol: "OFSS", company_name: "Oracle Financial Services Software Ltd", market: "NSE", market_cap: 80000, volume: 50000, popularity_score: 841 },
  { symbol: "DLF", company_name: "DLF Ltd", market: "NSE", market_cap: 150000, volume: 3000000, popularity_score: 840 },
  { symbol: "GODREJPROP", company_name: "Godrej Properties Ltd", market: "NSE", market_cap: 60000, volume: 1000000, popularity_score: 839 },
  { symbol: "OBEROIRLTY", company_name: "Oberoi Realty Ltd", market: "NSE", market_cap: 50000, volume: 500000, popularity_score: 838 },
  { symbol: "PRESTIGE", company_name: "Prestige Estates Projects Ltd", market: "NSE", market_cap: 40000, volume: 500000, popularity_score: 837 },
  { symbol: "LODHA", company_name: "Macrotech Developers Ltd", market: "NSE", market_cap: 80000, volume: 1000000, popularity_score: 836 },
  { symbol: "PIIND", company_name: "PI Industries Ltd", market: "NSE", market_cap: 50000, volume: 200000, popularity_score: 835 },
  { symbol: "SRF", company_name: "SRF Ltd", market: "NSE", market_cap: 70000, volume: 300000, popularity_score: 834 },
  { symbol: "DEEPAKNTR", company_name: "Deepak Nitrite Ltd", market: "NSE", market_cap: 25000, volume: 500000, popularity_score: 833 },
  { symbol: "AARTIIND", company_name: "Aarti Industries Ltd", market: "NSE", market_cap: 20000, volume: 500000, popularity_score: 832 },
  { symbol: "UPL", company_name: "UPL Ltd", market: "NSE", market_cap: 40000, volume: 3000000, popularity_score: 831 },
];

const US_STOCKS: StockSymbol[] = [
  // Mega caps and popular stocks
  { symbol: "AAPL", company_name: "Apple Inc.", market: "NASDAQ", market_cap: 3000000000, volume: 50000000, popularity_score: 1000 },
  { symbol: "MSFT", company_name: "Microsoft Corporation", market: "NASDAQ", market_cap: 2800000000, volume: 25000000, popularity_score: 999 },
  { symbol: "GOOGL", company_name: "Alphabet Inc.", market: "NASDAQ", market_cap: 1800000000, volume: 20000000, popularity_score: 998 },
  { symbol: "AMZN", company_name: "Amazon.com Inc.", market: "NASDAQ", market_cap: 1600000000, volume: 30000000, popularity_score: 997 },
  { symbol: "NVDA", company_name: "NVIDIA Corporation", market: "NASDAQ", market_cap: 1200000000, volume: 40000000, popularity_score: 996 },
  { symbol: "META", company_name: "Meta Platforms Inc.", market: "NASDAQ", market_cap: 900000000, volume: 15000000, popularity_score: 995 },
  { symbol: "TSLA", company_name: "Tesla Inc.", market: "NASDAQ", market_cap: 800000000, volume: 100000000, popularity_score: 994 },
  { symbol: "BRK.B", company_name: "Berkshire Hathaway Inc.", market: "NYSE", market_cap: 750000000, volume: 3000000, popularity_score: 993 },
  { symbol: "JPM", company_name: "JPMorgan Chase & Co.", market: "NYSE", market_cap: 500000000, volume: 10000000, popularity_score: 992 },
  { symbol: "V", company_name: "Visa Inc.", market: "NYSE", market_cap: 500000000, volume: 6000000, popularity_score: 991 },
  { symbol: "JNJ", company_name: "Johnson & Johnson", market: "NYSE", market_cap: 400000000, volume: 7000000, popularity_score: 990 },
  { symbol: "WMT", company_name: "Walmart Inc.", market: "NYSE", market_cap: 400000000, volume: 8000000, popularity_score: 989 },
  { symbol: "MA", company_name: "Mastercard Incorporated", market: "NYSE", market_cap: 400000000, volume: 3000000, popularity_score: 988 },
  { symbol: "PG", company_name: "The Procter & Gamble Company", market: "NYSE", market_cap: 350000000, volume: 6000000, popularity_score: 987 },
  { symbol: "HD", company_name: "The Home Depot Inc.", market: "NYSE", market_cap: 350000000, volume: 4000000, popularity_score: 986 },
  { symbol: "XOM", company_name: "Exxon Mobil Corporation", market: "NYSE", market_cap: 450000000, volume: 15000000, popularity_score: 985 },
  { symbol: "CVX", company_name: "Chevron Corporation", market: "NYSE", market_cap: 300000000, volume: 8000000, popularity_score: 984 },
  { symbol: "AVGO", company_name: "Broadcom Inc.", market: "NASDAQ", market_cap: 500000000, volume: 3000000, popularity_score: 983 },
  { symbol: "COST", company_name: "Costco Wholesale Corporation", market: "NASDAQ", market_cap: 300000000, volume: 2000000, popularity_score: 982 },
  { symbol: "ABBV", company_name: "AbbVie Inc.", market: "NYSE", market_cap: 280000000, volume: 6000000, popularity_score: 981 },
  { symbol: "PFE", company_name: "Pfizer Inc.", market: "NYSE", market_cap: 150000000, volume: 30000000, popularity_score: 980 },
  { symbol: "MRK", company_name: "Merck & Co. Inc.", market: "NYSE", market_cap: 280000000, volume: 8000000, popularity_score: 979 },
  { symbol: "KO", company_name: "The Coca-Cola Company", market: "NYSE", market_cap: 260000000, volume: 12000000, popularity_score: 978 },
  { symbol: "PEP", company_name: "PepsiCo Inc.", market: "NASDAQ", market_cap: 230000000, volume: 5000000, popularity_score: 977 },
  { symbol: "TMO", company_name: "Thermo Fisher Scientific Inc.", market: "NYSE", market_cap: 220000000, volume: 1500000, popularity_score: 976 },
  { symbol: "BAC", company_name: "Bank of America Corporation", market: "NYSE", market_cap: 250000000, volume: 40000000, popularity_score: 975 },
  { symbol: "CSCO", company_name: "Cisco Systems Inc.", market: "NASDAQ", market_cap: 200000000, volume: 20000000, popularity_score: 974 },
  { symbol: "ACN", company_name: "Accenture plc", market: "NYSE", market_cap: 200000000, volume: 2000000, popularity_score: 973 },
  { symbol: "ADBE", company_name: "Adobe Inc.", market: "NASDAQ", market_cap: 250000000, volume: 3000000, popularity_score: 972 },
  { symbol: "NFLX", company_name: "Netflix Inc.", market: "NASDAQ", market_cap: 250000000, volume: 5000000, popularity_score: 971 },
  { symbol: "CRM", company_name: "Salesforce Inc.", market: "NYSE", market_cap: 250000000, volume: 5000000, popularity_score: 970 },
  { symbol: "AMD", company_name: "Advanced Micro Devices Inc.", market: "NASDAQ", market_cap: 200000000, volume: 50000000, popularity_score: 969 },
  { symbol: "INTC", company_name: "Intel Corporation", market: "NASDAQ", market_cap: 100000000, volume: 40000000, popularity_score: 968 },
  { symbol: "QCOM", company_name: "QUALCOMM Incorporated", market: "NASDAQ", market_cap: 180000000, volume: 8000000, popularity_score: 967 },
  { symbol: "TXN", company_name: "Texas Instruments Incorporated", market: "NASDAQ", market_cap: 170000000, volume: 5000000, popularity_score: 966 },
  { symbol: "ORCL", company_name: "Oracle Corporation", market: "NYSE", market_cap: 300000000, volume: 8000000, popularity_score: 965 },
  { symbol: "IBM", company_name: "International Business Machines Corporation", market: "NYSE", market_cap: 150000000, volume: 4000000, popularity_score: 964 },
  { symbol: "NOW", company_name: "ServiceNow Inc.", market: "NYSE", market_cap: 150000000, volume: 1000000, popularity_score: 963 },
  { symbol: "INTU", company_name: "Intuit Inc.", market: "NASDAQ", market_cap: 150000000, volume: 1500000, popularity_score: 962 },
  { symbol: "AMAT", company_name: "Applied Materials Inc.", market: "NASDAQ", market_cap: 150000000, volume: 6000000, popularity_score: 961 },
  { symbol: "MU", company_name: "Micron Technology Inc.", market: "NASDAQ", market_cap: 100000000, volume: 20000000, popularity_score: 959 },
  { symbol: "DIS", company_name: "The Walt Disney Company", market: "NYSE", market_cap: 180000000, volume: 10000000, popularity_score: 950 },
  { symbol: "CMCSA", company_name: "Comcast Corporation", market: "NASDAQ", market_cap: 150000000, volume: 15000000, popularity_score: 949 },
  { symbol: "VZ", company_name: "Verizon Communications Inc.", market: "NYSE", market_cap: 160000000, volume: 15000000, popularity_score: 947 },
  { symbol: "T", company_name: "AT&T Inc.", market: "NYSE", market_cap: 120000000, volume: 30000000, popularity_score: 948 },
  { symbol: "NKE", company_name: "NIKE Inc.", market: "NYSE", market_cap: 130000000, volume: 8000000, popularity_score: 945 },
  { symbol: "MCD", company_name: "McDonald's Corporation", market: "NYSE", market_cap: 200000000, volume: 3000000, popularity_score: 944 },
  { symbol: "SBUX", company_name: "Starbucks Corporation", market: "NASDAQ", market_cap: 100000000, volume: 8000000, popularity_score: 943 },
  { symbol: "UBER", company_name: "Uber Technologies Inc.", market: "NYSE", market_cap: 130000000, volume: 20000000, popularity_score: 938 },
  { symbol: "PYPL", company_name: "PayPal Holdings Inc.", market: "NASDAQ", market_cap: 70000000, volume: 10000000, popularity_score: 934 },
  { symbol: "SQ", company_name: "Block Inc.", market: "NYSE", market_cap: 40000000, volume: 8000000, popularity_score: 935 },
  { symbol: "COIN", company_name: "Coinbase Global Inc.", market: "NASDAQ", market_cap: 50000000, volume: 10000000, popularity_score: 933 },
  { symbol: "PLTR", company_name: "Palantir Technologies Inc.", market: "NYSE", market_cap: 40000000, volume: 40000000, popularity_score: 930 },
  { symbol: "SNOW", company_name: "Snowflake Inc.", market: "NYSE", market_cap: 50000000, volume: 3000000, popularity_score: 929 },
  { symbol: "CRWD", company_name: "CrowdStrike Holdings Inc.", market: "NASDAQ", market_cap: 70000000, volume: 3000000, popularity_score: 925 },
  { symbol: "PANW", company_name: "Palo Alto Networks Inc.", market: "NASDAQ", market_cap: 100000000, volume: 2000000, popularity_score: 924 },
  { symbol: "WFC", company_name: "Wells Fargo & Company", market: "NYSE", market_cap: 180000000, volume: 15000000, popularity_score: 920 },
  { symbol: "C", company_name: "Citigroup Inc.", market: "NYSE", market_cap: 100000000, volume: 15000000, popularity_score: 919 },
  { symbol: "GS", company_name: "The Goldman Sachs Group Inc.", market: "NYSE", market_cap: 130000000, volume: 2000000, popularity_score: 918 },
  { symbol: "MS", company_name: "Morgan Stanley", market: "NYSE", market_cap: 150000000, volume: 8000000, popularity_score: 917 },
  { symbol: "BLK", company_name: "BlackRock Inc.", market: "NYSE", market_cap: 120000000, volume: 500000, popularity_score: 916 },
  { symbol: "SCHW", company_name: "The Charles Schwab Corporation", market: "NYSE", market_cap: 120000000, volume: 8000000, popularity_score: 915 },
  { symbol: "UNH", company_name: "UnitedHealth Group Incorporated", market: "NYSE", market_cap: 450000000, volume: 3000000, popularity_score: 914 },
  { symbol: "CVS", company_name: "CVS Health Corporation", market: "NYSE", market_cap: 80000000, volume: 8000000, popularity_score: 913 },
  { symbol: "ELV", company_name: "Elevance Health Inc.", market: "NYSE", market_cap: 100000000, volume: 1000000, popularity_score: 912 },
  { symbol: "CI", company_name: "The Cigna Group", market: "NYSE", market_cap: 90000000, volume: 1500000, popularity_score: 911 },
  { symbol: "LLY", company_name: "Eli Lilly and Company", market: "NYSE", market_cap: 700000000, volume: 3000000, popularity_score: 910 },
  { symbol: "UNP", company_name: "Union Pacific Corporation", market: "NYSE", market_cap: 140000000, volume: 3000000, popularity_score: 909 },
  { symbol: "CAT", company_name: "Caterpillar Inc.", market: "NYSE", market_cap: 150000000, volume: 2000000, popularity_score: 908 },
  { symbol: "DE", company_name: "Deere & Company", market: "NYSE", market_cap: 110000000, volume: 1500000, popularity_score: 907 },
  { symbol: "RTX", company_name: "RTX Corporation", market: "NYSE", market_cap: 130000000, volume: 4000000, popularity_score: 906 },
  { symbol: "LMT", company_name: "Lockheed Martin Corporation", market: "NYSE", market_cap: 120000000, volume: 1000000, popularity_score: 905 },
  { symbol: "BA", company_name: "The Boeing Company", market: "NYSE", market_cap: 100000000, volume: 5000000, popularity_score: 904 },
  { symbol: "GE", company_name: "General Electric Company", market: "NYSE", market_cap: 150000000, volume: 5000000, popularity_score: 903 },
  { symbol: "HON", company_name: "Honeywell International Inc.", market: "NASDAQ", market_cap: 130000000, volume: 2000000, popularity_score: 902 },
  { symbol: "MMM", company_name: "3M Company", market: "NYSE", market_cap: 60000000, volume: 3000000, popularity_score: 901 },
  { symbol: "NEE", company_name: "NextEra Energy Inc.", market: "NYSE", market_cap: 150000000, volume: 8000000, popularity_score: 900 },
  { symbol: "AMT", company_name: "American Tower Corporation", market: "NYSE", market_cap: 100000000, volume: 2000000, popularity_score: 899 },
  { symbol: "PLD", company_name: "Prologis Inc.", market: "NYSE", market_cap: 120000000, volume: 4000000, popularity_score: 898 },
  { symbol: "SPG", company_name: "Simon Property Group Inc.", market: "NYSE", market_cap: 50000000, volume: 2000000, popularity_score: 897 },
  { symbol: "O", company_name: "Realty Income Corporation", market: "NYSE", market_cap: 45000000, volume: 5000000, popularity_score: 896 },
  { symbol: "AXP", company_name: "American Express Company", market: "NYSE", market_cap: 150000000, volume: 3000000, popularity_score: 895 },
  { symbol: "SPGI", company_name: "S&P Global Inc.", market: "NYSE", market_cap: 140000000, volume: 1000000, popularity_score: 894 },
  { symbol: "ICE", company_name: "Intercontinental Exchange Inc.", market: "NYSE", market_cap: 75000000, volume: 2000000, popularity_score: 893 },
  { symbol: "CME", company_name: "CME Group Inc.", market: "NASDAQ", market_cap: 75000000, volume: 1500000, popularity_score: 892 },
  { symbol: "MCO", company_name: "Moody's Corporation", market: "NYSE", market_cap: 70000000, volume: 500000, popularity_score: 891 },
  { symbol: "F", company_name: "Ford Motor Company", market: "NYSE", market_cap: 50000000, volume: 50000000, popularity_score: 890 },
  { symbol: "GM", company_name: "General Motors Company", market: "NYSE", market_cap: 50000000, volume: 15000000, popularity_score: 889 },
  { symbol: "RIVN", company_name: "Rivian Automotive Inc.", market: "NASDAQ", market_cap: 15000000, volume: 20000000, popularity_score: 888 },
  { symbol: "LCID", company_name: "Lucid Group Inc.", market: "NASDAQ", market_cap: 8000000, volume: 30000000, popularity_score: 887 },
];

// Additional market curated lists for high-coverage fallback
const GLOBAL_MARKET_STOCKS: Record<string, StockSymbol[]> = {
  LSE: [
    { symbol: "SHEL", company_name: "Shell plc", market: "LSE", market_cap: 200000000, volume: 10000000, popularity_score: 1000 },
    { symbol: "HSBA", company_name: "HSBC Holdings plc", market: "LSE", market_cap: 150000000, volume: 15000000, popularity_score: 999 },
    { symbol: "AZN", company_name: "AstraZeneca PLC", market: "LSE", market_cap: 200000000, volume: 3000000, popularity_score: 998 },
    { symbol: "BP", company_name: "BP p.l.c.", market: "LSE", market_cap: 100000000, volume: 20000000, popularity_score: 997 },
    { symbol: "ULVR", company_name: "Unilever PLC", market: "LSE", market_cap: 120000000, volume: 5000000, popularity_score: 996 },
    { symbol: "RIO", company_name: "Rio Tinto Group", market: "LSE", market_cap: 100000000, volume: 3000000, popularity_score: 995 },
    { symbol: "GSK", company_name: "GSK plc", market: "LSE", market_cap: 80000000, volume: 5000000, popularity_score: 994 },
    { symbol: "DGE", company_name: "Diageo plc", market: "LSE", market_cap: 80000000, volume: 3000000, popularity_score: 993 },
    { symbol: "LLOY", company_name: "Lloyds Banking Group plc", market: "LSE", market_cap: 30000000, volume: 100000000, popularity_score: 992 },
    { symbol: "VOD", company_name: "Vodafone Group Plc", market: "LSE", market_cap: 25000000, volume: 50000000, popularity_score: 991 },
    { symbol: "BARC", company_name: "Barclays PLC", market: "LSE", market_cap: 30000000, volume: 30000000, popularity_score: 990 },
    { symbol: "GLEN", company_name: "Glencore plc", market: "LSE", market_cap: 60000000, volume: 20000000, popularity_score: 989 },
    { symbol: "AAL", company_name: "Anglo American plc", market: "LSE", market_cap: 40000000, volume: 5000000, popularity_score: 988 },
    { symbol: "REL", company_name: "RELX PLC", market: "LSE", market_cap: 70000000, volume: 2000000, popularity_score: 987 },
    { symbol: "CPG", company_name: "Compass Group PLC", market: "LSE", market_cap: 50000000, volume: 3000000, popularity_score: 986 },
  ],
  TSX: [
    { symbol: "RY", company_name: "Royal Bank of Canada", market: "TSX", market_cap: 180000000, volume: 5000000, popularity_score: 1000 },
    { symbol: "TD", company_name: "Toronto-Dominion Bank", market: "TSX", market_cap: 150000000, volume: 8000000, popularity_score: 999 },
    { symbol: "ENB", company_name: "Enbridge Inc.", market: "TSX", market_cap: 100000000, volume: 5000000, popularity_score: 998 },
    { symbol: "CNR", company_name: "Canadian National Railway", market: "TSX", market_cap: 100000000, volume: 2000000, popularity_score: 997 },
    { symbol: "BNS", company_name: "Bank of Nova Scotia", market: "TSX", market_cap: 80000000, volume: 5000000, popularity_score: 996 },
    { symbol: "BCE", company_name: "BCE Inc.", market: "TSX", market_cap: 50000000, volume: 3000000, popularity_score: 995 },
    { symbol: "CP", company_name: "Canadian Pacific Kansas City", market: "TSX", market_cap: 100000000, volume: 2000000, popularity_score: 994 },
    { symbol: "BMO", company_name: "Bank of Montreal", market: "TSX", market_cap: 80000000, volume: 3000000, popularity_score: 993 },
    { symbol: "TRP", company_name: "TC Energy Corporation", market: "TSX", market_cap: 50000000, volume: 3000000, popularity_score: 992 },
    { symbol: "SU", company_name: "Suncor Energy Inc.", market: "TSX", market_cap: 60000000, volume: 8000000, popularity_score: 991 },
    { symbol: "CM", company_name: "Canadian Imperial Bank of Commerce", market: "TSX", market_cap: 60000000, volume: 3000000, popularity_score: 990 },
    { symbol: "CNQ", company_name: "Canadian Natural Resources", market: "TSX", market_cap: 80000000, volume: 5000000, popularity_score: 989 },
    { symbol: "MFC", company_name: "Manulife Financial Corporation", market: "TSX", market_cap: 50000000, volume: 5000000, popularity_score: 988 },
    { symbol: "ATD", company_name: "Alimentation Couche-Tard Inc.", market: "TSX", market_cap: 70000000, volume: 2000000, popularity_score: 987 },
    { symbol: "SHOP", company_name: "Shopify Inc.", market: "TSX", market_cap: 100000000, volume: 3000000, popularity_score: 986 },
  ],
  XETRA: [
    { symbol: "SAP", company_name: "SAP SE", market: "XETRA", market_cap: 200000000, volume: 2000000, popularity_score: 1000 },
    { symbol: "SIE", company_name: "Siemens AG", market: "XETRA", market_cap: 150000000, volume: 2000000, popularity_score: 999 },
    { symbol: "ALV", company_name: "Allianz SE", market: "XETRA", market_cap: 100000000, volume: 1000000, popularity_score: 998 },
    { symbol: "DTE", company_name: "Deutsche Telekom AG", market: "XETRA", market_cap: 120000000, volume: 5000000, popularity_score: 997 },
    { symbol: "BAS", company_name: "BASF SE", market: "XETRA", market_cap: 50000000, volume: 3000000, popularity_score: 996 },
    { symbol: "MRK", company_name: "Merck KGaA", market: "XETRA", market_cap: 80000000, volume: 500000, popularity_score: 995 },
    { symbol: "BMW", company_name: "Bayerische Motoren Werke AG", market: "XETRA", market_cap: 70000000, volume: 1500000, popularity_score: 994 },
    { symbol: "VOW3", company_name: "Volkswagen AG", market: "XETRA", market_cap: 80000000, volume: 1000000, popularity_score: 993 },
    { symbol: "ADS", company_name: "adidas AG", market: "XETRA", market_cap: 40000000, volume: 800000, popularity_score: 992 },
    { symbol: "DBK", company_name: "Deutsche Bank AG", market: "XETRA", market_cap: 30000000, volume: 8000000, popularity_score: 991 },
    { symbol: "RWE", company_name: "RWE AG", market: "XETRA", market_cap: 40000000, volume: 2000000, popularity_score: 990 },
    { symbol: "MBG", company_name: "Mercedes-Benz Group AG", market: "XETRA", market_cap: 80000000, volume: 2000000, popularity_score: 989 },
    { symbol: "IFX", company_name: "Infineon Technologies AG", market: "XETRA", market_cap: 50000000, volume: 3000000, popularity_score: 988 },
    { symbol: "DPW", company_name: "Deutsche Post AG", market: "XETRA", market_cap: 60000000, volume: 2000000, popularity_score: 987 },
    { symbol: "MUV2", company_name: "Munich Re", market: "XETRA", market_cap: 50000000, volume: 300000, popularity_score: 986 },
  ],
  EURONEXT: [
    { symbol: "OR", company_name: "L'Oréal S.A.", market: "EURONEXT", market_cap: 200000000, volume: 500000, popularity_score: 1000 },
    { symbol: "MC", company_name: "LVMH Moët Hennessy Louis Vuitton", market: "EURONEXT", market_cap: 400000000, volume: 500000, popularity_score: 999 },
    { symbol: "TTE", company_name: "TotalEnergies SE", market: "EURONEXT", market_cap: 150000000, volume: 5000000, popularity_score: 998 },
    { symbol: "SAN", company_name: "Sanofi S.A.", market: "EURONEXT", market_cap: 130000000, volume: 2000000, popularity_score: 997 },
    { symbol: "AIR", company_name: "Airbus SE", market: "EURONEXT", market_cap: 120000000, volume: 1000000, popularity_score: 996 },
    { symbol: "BNP", company_name: "BNP Paribas S.A.", market: "EURONEXT", market_cap: 70000000, volume: 3000000, popularity_score: 995 },
    { symbol: "SU", company_name: "Schneider Electric SE", market: "EURONEXT", market_cap: 100000000, volume: 1000000, popularity_score: 994 },
    { symbol: "AI", company_name: "Air Liquide S.A.", market: "EURONEXT", market_cap: 90000000, volume: 500000, popularity_score: 993 },
    { symbol: "CS", company_name: "AXA SA", market: "EURONEXT", market_cap: 70000000, volume: 5000000, popularity_score: 992 },
    { symbol: "DG", company_name: "Vinci SA", market: "EURONEXT", market_cap: 70000000, volume: 800000, popularity_score: 991 },
    { symbol: "KER", company_name: "Kering SA", market: "EURONEXT", market_cap: 50000000, volume: 200000, popularity_score: 990 },
    { symbol: "RMS", company_name: "Hermès International", market: "EURONEXT", market_cap: 200000000, volume: 100000, popularity_score: 989 },
    { symbol: "EL", company_name: "EssilorLuxottica SA", market: "EURONEXT", market_cap: 90000000, volume: 300000, popularity_score: 988 },
    { symbol: "CAP", company_name: "Capgemini SE", market: "EURONEXT", market_cap: 40000000, volume: 300000, popularity_score: 987 },
    { symbol: "DSY", company_name: "Dassault Systèmes SE", market: "EURONEXT", market_cap: 50000000, volume: 500000, popularity_score: 986 },
  ],
  TSE: [
    { symbol: "7203", company_name: "Toyota Motor Corporation", market: "TSE", market_cap: 300000000, volume: 15000000, popularity_score: 1000 },
    { symbol: "6758", company_name: "Sony Group Corporation", market: "TSE", market_cap: 150000000, volume: 5000000, popularity_score: 999 },
    { symbol: "9984", company_name: "SoftBank Group Corp.", market: "TSE", market_cap: 100000000, volume: 10000000, popularity_score: 998 },
    { symbol: "6861", company_name: "Keyence Corporation", market: "TSE", market_cap: 150000000, volume: 500000, popularity_score: 997 },
    { symbol: "8306", company_name: "Mitsubishi UFJ Financial Group", market: "TSE", market_cap: 120000000, volume: 30000000, popularity_score: 996 },
    { symbol: "9433", company_name: "KDDI Corporation", market: "TSE", market_cap: 80000000, volume: 8000000, popularity_score: 995 },
    { symbol: "6501", company_name: "Hitachi Ltd.", market: "TSE", market_cap: 100000000, volume: 5000000, popularity_score: 994 },
    { symbol: "7267", company_name: "Honda Motor Co., Ltd.", market: "TSE", market_cap: 70000000, volume: 8000000, popularity_score: 993 },
    { symbol: "4502", company_name: "Takeda Pharmaceutical Co., Ltd.", market: "TSE", market_cap: 60000000, volume: 5000000, popularity_score: 992 },
    { symbol: "6902", company_name: "DENSO Corporation", market: "TSE", market_cap: 60000000, volume: 2000000, popularity_score: 991 },
    { symbol: "9432", company_name: "Nippon Telegraph and Telephone", market: "TSE", market_cap: 100000000, volume: 10000000, popularity_score: 990 },
    { symbol: "6954", company_name: "FANUC Corporation", market: "TSE", market_cap: 50000000, volume: 1000000, popularity_score: 989 },
    { symbol: "8035", company_name: "Tokyo Electron Limited", market: "TSE", market_cap: 100000000, volume: 2000000, popularity_score: 988 },
    { symbol: "4063", company_name: "Shin-Etsu Chemical Co., Ltd.", market: "TSE", market_cap: 80000000, volume: 1000000, popularity_score: 987 },
    { symbol: "6367", company_name: "Daikin Industries, Ltd.", market: "TSE", market_cap: 70000000, volume: 500000, popularity_score: 986 },
  ],
  HKEX: [
    { symbol: "0700", company_name: "Tencent Holdings Limited", market: "HKEX", market_cap: 500000000, volume: 20000000, popularity_score: 1000 },
    { symbol: "9988", company_name: "Alibaba Group Holding Limited", market: "HKEX", market_cap: 200000000, volume: 30000000, popularity_score: 999 },
    { symbol: "0939", company_name: "China Construction Bank Corporation", market: "HKEX", market_cap: 150000000, volume: 100000000, popularity_score: 998 },
    { symbol: "1299", company_name: "AIA Group Limited", market: "HKEX", market_cap: 100000000, volume: 15000000, popularity_score: 997 },
    { symbol: "0005", company_name: "HSBC Holdings plc", market: "HKEX", market_cap: 150000000, volume: 20000000, popularity_score: 996 },
    { symbol: "2318", company_name: "Ping An Insurance", market: "HKEX", market_cap: 100000000, volume: 30000000, popularity_score: 995 },
    { symbol: "0941", company_name: "China Mobile Limited", market: "HKEX", market_cap: 150000000, volume: 20000000, popularity_score: 994 },
    { symbol: "3690", company_name: "Meituan", market: "HKEX", market_cap: 100000000, volume: 20000000, popularity_score: 993 },
    { symbol: "1810", company_name: "Xiaomi Corporation", market: "HKEX", market_cap: 50000000, volume: 50000000, popularity_score: 992 },
    { symbol: "9618", company_name: "JD.com, Inc.", market: "HKEX", market_cap: 50000000, volume: 15000000, popularity_score: 991 },
    { symbol: "0388", company_name: "Hong Kong Exchanges and Clearing", market: "HKEX", market_cap: 50000000, volume: 3000000, popularity_score: 990 },
    { symbol: "1398", company_name: "Industrial and Commercial Bank of China", market: "HKEX", market_cap: 200000000, volume: 80000000, popularity_score: 989 },
    { symbol: "2628", company_name: "China Life Insurance Company", market: "HKEX", market_cap: 80000000, volume: 30000000, popularity_score: 988 },
    { symbol: "0883", company_name: "CNOOC Limited", market: "HKEX", market_cap: 80000000, volume: 30000000, popularity_score: 987 },
    { symbol: "0016", company_name: "Sun Hung Kai Properties Limited", market: "HKEX", market_cap: 40000000, volume: 3000000, popularity_score: 986 },
  ],
  ASX: [
    { symbol: "BHP", company_name: "BHP Group Limited", market: "ASX", market_cap: 200000000, volume: 10000000, popularity_score: 1000 },
    { symbol: "CBA", company_name: "Commonwealth Bank of Australia", market: "ASX", market_cap: 150000000, volume: 5000000, popularity_score: 999 },
    { symbol: "CSL", company_name: "CSL Limited", market: "ASX", market_cap: 120000000, volume: 1000000, popularity_score: 998 },
    { symbol: "NAB", company_name: "National Australia Bank Limited", market: "ASX", market_cap: 80000000, volume: 8000000, popularity_score: 997 },
    { symbol: "WBC", company_name: "Westpac Banking Corporation", market: "ASX", market_cap: 70000000, volume: 10000000, popularity_score: 996 },
    { symbol: "ANZ", company_name: "Australia and New Zealand Banking Group", market: "ASX", market_cap: 70000000, volume: 8000000, popularity_score: 995 },
    { symbol: "WES", company_name: "Wesfarmers Limited", market: "ASX", market_cap: 60000000, volume: 2000000, popularity_score: 994 },
    { symbol: "MQG", company_name: "Macquarie Group Limited", market: "ASX", market_cap: 70000000, volume: 1000000, popularity_score: 993 },
    { symbol: "RIO", company_name: "Rio Tinto Limited", market: "ASX", market_cap: 100000000, volume: 2000000, popularity_score: 992 },
    { symbol: "FMG", company_name: "Fortescue Metals Group Limited", market: "ASX", market_cap: 60000000, volume: 10000000, popularity_score: 991 },
    { symbol: "TLS", company_name: "Telstra Group Limited", market: "ASX", market_cap: 40000000, volume: 15000000, popularity_score: 990 },
    { symbol: "WOW", company_name: "Woolworths Group Limited", market: "ASX", market_cap: 40000000, volume: 3000000, popularity_score: 989 },
    { symbol: "COL", company_name: "Coles Group Limited", market: "ASX", market_cap: 20000000, volume: 5000000, popularity_score: 988 },
    { symbol: "GMG", company_name: "Goodman Group", market: "ASX", market_cap: 50000000, volume: 3000000, popularity_score: 987 },
    { symbol: "ALL", company_name: "Aristocrat Leisure Limited", market: "ASX", market_cap: 30000000, volume: 2000000, popularity_score: 986 },
  ],
  SGX: [
    { symbol: "D05", company_name: "DBS Group Holdings Ltd", market: "SGX", market_cap: 80000000, volume: 5000000, popularity_score: 1000 },
    { symbol: "O39", company_name: "Oversea-Chinese Banking Corporation", market: "SGX", market_cap: 50000000, volume: 3000000, popularity_score: 999 },
    { symbol: "U11", company_name: "United Overseas Bank Limited", market: "SGX", market_cap: 50000000, volume: 2000000, popularity_score: 998 },
    { symbol: "Z74", company_name: "Singapore Telecommunications Limited", market: "SGX", market_cap: 40000000, volume: 10000000, popularity_score: 997 },
    { symbol: "C6L", company_name: "Singapore Airlines Limited", market: "SGX", market_cap: 20000000, volume: 5000000, popularity_score: 996 },
    { symbol: "BN4", company_name: "Keppel Corporation Limited", market: "SGX", market_cap: 15000000, volume: 5000000, popularity_score: 995 },
    { symbol: "C38U", company_name: "CapitaLand Integrated Commercial Trust", market: "SGX", market_cap: 15000000, volume: 8000000, popularity_score: 994 },
    { symbol: "A17U", company_name: "CapitaLand Ascendas REIT", market: "SGX", market_cap: 12000000, volume: 5000000, popularity_score: 993 },
    { symbol: "G13", company_name: "Genting Singapore Limited", market: "SGX", market_cap: 10000000, volume: 15000000, popularity_score: 992 },
    { symbol: "S58", company_name: "SATS Ltd.", market: "SGX", market_cap: 5000000, volume: 3000000, popularity_score: 991 },
  ],
  SIX: [
    { symbol: "NESN", company_name: "Nestlé S.A.", market: "SIX", market_cap: 300000000, volume: 3000000, popularity_score: 1000 },
    { symbol: "ROG", company_name: "Roche Holding AG", market: "SIX", market_cap: 250000000, volume: 1500000, popularity_score: 999 },
    { symbol: "NOVN", company_name: "Novartis AG", market: "SIX", market_cap: 200000000, volume: 3000000, popularity_score: 998 },
    { symbol: "UBSG", company_name: "UBS Group AG", market: "SIX", market_cap: 100000000, volume: 8000000, popularity_score: 997 },
    { symbol: "ABBN", company_name: "ABB Ltd", market: "SIX", market_cap: 100000000, volume: 3000000, popularity_score: 996 },
    { symbol: "ZURN", company_name: "Zurich Insurance Group AG", market: "SIX", market_cap: 80000000, volume: 500000, popularity_score: 995 },
    { symbol: "SREN", company_name: "Swiss Re AG", market: "SIX", market_cap: 35000000, volume: 1000000, popularity_score: 994 },
    { symbol: "GIVN", company_name: "Givaudan SA", market: "SIX", market_cap: 40000000, volume: 50000, popularity_score: 993 },
    { symbol: "LONN", company_name: "Lonza Group AG", market: "SIX", market_cap: 50000000, volume: 200000, popularity_score: 992 },
    { symbol: "CFR", company_name: "Compagnie Financière Richemont SA", market: "SIX", market_cap: 80000000, volume: 1000000, popularity_score: 991 },
  ],
  KRX: [
    { symbol: "005930", company_name: "Samsung Electronics Co., Ltd.", market: "KRX", market_cap: 350000000, volume: 15000000, popularity_score: 1000 },
    { symbol: "000660", company_name: "SK Hynix Inc.", market: "KRX", market_cap: 100000000, volume: 5000000, popularity_score: 999 },
    { symbol: "035420", company_name: "NAVER Corporation", market: "KRX", market_cap: 50000000, volume: 2000000, popularity_score: 998 },
    { symbol: "051910", company_name: "LG Chem, Ltd.", market: "KRX", market_cap: 40000000, volume: 500000, popularity_score: 997 },
    { symbol: "006400", company_name: "Samsung SDI Co., Ltd.", market: "KRX", market_cap: 40000000, volume: 500000, popularity_score: 996 },
    { symbol: "035720", company_name: "Kakao Corp.", market: "KRX", market_cap: 30000000, volume: 3000000, popularity_score: 995 },
    { symbol: "005380", company_name: "Hyundai Motor Company", market: "KRX", market_cap: 50000000, volume: 2000000, popularity_score: 994 },
    { symbol: "012330", company_name: "Hyundai Mobis Co., Ltd.", market: "KRX", market_cap: 25000000, volume: 300000, popularity_score: 993 },
    { symbol: "055550", company_name: "Shinhan Financial Group Co., Ltd.", market: "KRX", market_cap: 20000000, volume: 1500000, popularity_score: 992 },
    { symbol: "003550", company_name: "LG Corp.", market: "KRX", market_cap: 15000000, volume: 300000, popularity_score: 991 },
  ],
  SSE: [
    { symbol: "600519", company_name: "Kweichow Moutai Co., Ltd.", market: "SSE", market_cap: 300000000, volume: 3000000, popularity_score: 1000 },
    { symbol: "601318", company_name: "Ping An Insurance", market: "SSE", market_cap: 150000000, volume: 30000000, popularity_score: 999 },
    { symbol: "600036", company_name: "China Merchants Bank Co., Ltd.", market: "SSE", market_cap: 100000000, volume: 20000000, popularity_score: 998 },
    { symbol: "601166", company_name: "Industrial Bank Co., Ltd.", market: "SSE", market_cap: 50000000, volume: 30000000, popularity_score: 997 },
    { symbol: "600276", company_name: "Jiangsu Hengrui Medicine Co., Ltd.", market: "SSE", market_cap: 50000000, volume: 10000000, popularity_score: 996 },
    { symbol: "601888", company_name: "China Tourism Group Duty Free", market: "SSE", market_cap: 80000000, volume: 5000000, popularity_score: 995 },
    { symbol: "600030", company_name: "CITIC Securities Company Limited", market: "SSE", market_cap: 40000000, volume: 30000000, popularity_score: 994 },
    { symbol: "601012", company_name: "LONGi Green Energy Technology", market: "SSE", market_cap: 50000000, volume: 20000000, popularity_score: 993 },
    { symbol: "600900", company_name: "China Yangtze Power Co., Ltd.", market: "SSE", market_cap: 100000000, volume: 15000000, popularity_score: 992 },
    { symbol: "601398", company_name: "Industrial and Commercial Bank of China", market: "SSE", market_cap: 200000000, volume: 50000000, popularity_score: 991 },
  ],
  SZSE: [
    { symbol: "000858", company_name: "Wuliangye Yibin Co., Ltd.", market: "SZSE", market_cap: 100000000, volume: 5000000, popularity_score: 1000 },
    { symbol: "000333", company_name: "Midea Group Co., Ltd.", market: "SZSE", market_cap: 80000000, volume: 10000000, popularity_score: 999 },
    { symbol: "002594", company_name: "BYD Company Limited", market: "SZSE", market_cap: 100000000, volume: 15000000, popularity_score: 998 },
    { symbol: "000651", company_name: "Gree Electric Appliances", market: "SZSE", market_cap: 40000000, volume: 8000000, popularity_score: 997 },
    { symbol: "300750", company_name: "Contemporary Amperex Technology", market: "SZSE", market_cap: 150000000, volume: 10000000, popularity_score: 996 },
    { symbol: "002415", company_name: "Hangzhou Hikvision Digital Technology", market: "SZSE", market_cap: 50000000, volume: 15000000, popularity_score: 995 },
    { symbol: "000001", company_name: "Ping An Bank Co., Ltd.", market: "SZSE", market_cap: 30000000, volume: 30000000, popularity_score: 994 },
    { symbol: "002475", company_name: "Luxshare Precision Industry", market: "SZSE", market_cap: 40000000, volume: 10000000, popularity_score: 993 },
    { symbol: "300059", company_name: "East Money Information Co., Ltd.", market: "SZSE", market_cap: 40000000, volume: 30000000, popularity_score: 992 },
    { symbol: "002142", company_name: "Bank of Ningbo Co., Ltd.", market: "SZSE", market_cap: 30000000, volume: 10000000, popularity_score: 991 },
  ],
  B3: [
    { symbol: "VALE3", company_name: "Vale S.A.", market: "B3", market_cap: 80000000, volume: 30000000, popularity_score: 1000 },
    { symbol: "PETR4", company_name: "Petróleo Brasileiro S.A. - Petrobras", market: "B3", market_cap: 100000000, volume: 50000000, popularity_score: 999 },
    { symbol: "ITUB4", company_name: "Itaú Unibanco Holding S.A.", market: "B3", market_cap: 60000000, volume: 30000000, popularity_score: 998 },
    { symbol: "BBDC4", company_name: "Banco Bradesco S.A.", market: "B3", market_cap: 40000000, volume: 30000000, popularity_score: 997 },
    { symbol: "ABEV3", company_name: "Ambev S.A.", market: "B3", market_cap: 40000000, volume: 20000000, popularity_score: 996 },
    { symbol: "B3SA3", company_name: "B3 S.A. - Brasil, Bolsa, Balcão", market: "B3", market_cap: 20000000, volume: 30000000, popularity_score: 995 },
    { symbol: "WEGE3", company_name: "WEG S.A.", market: "B3", market_cap: 50000000, volume: 10000000, popularity_score: 994 },
    { symbol: "RENT3", company_name: "Localiza Rent a Car S.A.", market: "B3", market_cap: 30000000, volume: 8000000, popularity_score: 993 },
    { symbol: "SUZB3", company_name: "Suzano S.A.", market: "B3", market_cap: 20000000, volume: 10000000, popularity_score: 992 },
    { symbol: "JBSS3", company_name: "JBS S.A.", market: "B3", market_cap: 30000000, volume: 15000000, popularity_score: 991 },
  ],
  JSE: [
    { symbol: "NPN", company_name: "Naspers Limited", market: "JSE", market_cap: 80000000, volume: 2000000, popularity_score: 1000 },
    { symbol: "AGL", company_name: "Anglo American plc", market: "JSE", market_cap: 50000000, volume: 3000000, popularity_score: 999 },
    { symbol: "SOL", company_name: "Sasol Limited", market: "JSE", market_cap: 15000000, volume: 3000000, popularity_score: 998 },
    { symbol: "BTI", company_name: "British American Tobacco p.l.c.", market: "JSE", market_cap: 80000000, volume: 1000000, popularity_score: 997 },
    { symbol: "CFR", company_name: "Compagnie Financière Richemont", market: "JSE", market_cap: 80000000, volume: 500000, popularity_score: 996 },
    { symbol: "SBK", company_name: "Standard Bank Group Limited", market: "JSE", market_cap: 20000000, volume: 3000000, popularity_score: 995 },
    { symbol: "FSR", company_name: "FirstRand Limited", market: "JSE", market_cap: 25000000, volume: 5000000, popularity_score: 994 },
    { symbol: "AMS", company_name: "Anglo American Platinum Limited", market: "JSE", market_cap: 15000000, volume: 500000, popularity_score: 993 },
    { symbol: "SHP", company_name: "Shoprite Holdings Limited", market: "JSE", market_cap: 12000000, volume: 1000000, popularity_score: 992 },
    { symbol: "MTN", company_name: "MTN Group Limited", market: "JSE", market_cap: 15000000, volume: 5000000, popularity_score: 991 },
  ],
  MOEX: [
    { symbol: "SBER", company_name: "Sberbank of Russia", market: "MOEX", market_cap: 80000000, volume: 50000000, popularity_score: 1000 },
    { symbol: "GAZP", company_name: "Gazprom PJSC", market: "MOEX", market_cap: 60000000, volume: 30000000, popularity_score: 999 },
    { symbol: "LKOH", company_name: "PJSC LUKOIL", market: "MOEX", market_cap: 60000000, volume: 3000000, popularity_score: 998 },
    { symbol: "GMKN", company_name: "MMC Norilsk Nickel", market: "MOEX", market_cap: 40000000, volume: 1000000, popularity_score: 997 },
    { symbol: "NVTK", company_name: "NOVATEK PJSC", market: "MOEX", market_cap: 50000000, volume: 2000000, popularity_score: 996 },
    { symbol: "ROSN", company_name: "Rosneft Oil Company", market: "MOEX", market_cap: 80000000, volume: 10000000, popularity_score: 995 },
    { symbol: "YNDX", company_name: "Yandex N.V.", market: "MOEX", market_cap: 20000000, volume: 5000000, popularity_score: 994 },
    { symbol: "MTSS", company_name: "Mobile TeleSystems PJSC", market: "MOEX", market_cap: 10000000, volume: 10000000, popularity_score: 993 },
    { symbol: "MGNT", company_name: "Magnit PJSC", market: "MOEX", market_cap: 10000000, volume: 1000000, popularity_score: 992 },
    { symbol: "VTBR", company_name: "VTB Bank", market: "MOEX", market_cap: 10000000, volume: 100000000, popularity_score: 991 },
  ],
  TADAWUL: [
    { symbol: "2222", company_name: "Saudi Arabian Oil Company (Aramco)", market: "TADAWUL", market_cap: 2000000000, volume: 10000000, popularity_score: 1000 },
    { symbol: "1120", company_name: "Al Rajhi Bank", market: "TADAWUL", market_cap: 100000000, volume: 10000000, popularity_score: 999 },
    { symbol: "2010", company_name: "SABIC", market: "TADAWUL", market_cap: 80000000, volume: 3000000, popularity_score: 998 },
    { symbol: "1180", company_name: "Saudi Telecom Company", market: "TADAWUL", market_cap: 50000000, volume: 3000000, popularity_score: 997 },
    { symbol: "2350", company_name: "Saudi Kayan Petrochemical Company", market: "TADAWUL", market_cap: 10000000, volume: 20000000, popularity_score: 996 },
    { symbol: "1010", company_name: "Riyad Bank", market: "TADAWUL", market_cap: 30000000, volume: 5000000, popularity_score: 995 },
    { symbol: "2380", company_name: "Petro Rabigh", market: "TADAWUL", market_cap: 15000000, volume: 5000000, popularity_score: 994 },
    { symbol: "4001", company_name: "Abdullah Al Othaim Markets", market: "TADAWUL", market_cap: 5000000, volume: 1000000, popularity_score: 993 },
    { symbol: "2020", company_name: "SABIC Agri-Nutrients Company", market: "TADAWUL", market_cap: 20000000, volume: 500000, popularity_score: 992 },
    { symbol: "1211", company_name: "Ma'aden", market: "TADAWUL", market_cap: 30000000, volume: 10000000, popularity_score: 991 },
  ],
};

// Get stocks for a market - uses curated lists or Yahoo screener
async function getMarketStocks(market: string): Promise<StockSymbol[]> {
  // Check for curated lists first
  if (market === 'NSE') {
    return INDIAN_NSE_STOCKS;
  }
  
  if (market === 'BSE') {
    // Use NSE stocks mapped to BSE
    return INDIAN_NSE_STOCKS.map(s => ({ ...s, market: 'BSE' }));
  }
  
  if (market === 'NYSE' || market === 'NASDAQ') {
    return US_STOCKS.filter(s => s.market === market);
  }
  
  // Check global market stocks
  if (GLOBAL_MARKET_STOCKS[market]) {
    return GLOBAL_MARKET_STOCKS[market];
  }
  
  // Try Yahoo screener for markets without curated lists
  console.log(`Fetching ${market} stocks from Yahoo screener...`);
  const yahooStocks = await fetchAllYahooStocks(market, 1000);
  
  if (yahooStocks.length > 0) {
    return yahooStocks;
  }
  
  // Return empty if no data available
  console.warn(`No stock data available for ${market}`);
  return [];
}

// Upsert stocks in batches for better performance
async function upsertStocksBatch(
  supabase: any,
  stocks: StockSymbol[],
  batchSize = 500
): Promise<{ success: number; errors: number }> {
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('stock_symbols')
      .upsert(
        batch.map((s: StockSymbol) => ({
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

// Log sync result to history
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

// All supported markets
const ALL_MARKETS = [
  'NYSE', 'NASDAQ', 'TSX',
  'LSE', 'XETRA', 'EURONEXT', 'SIX',
  'NSE', 'BSE', 'TSE', 'HKEX', 'SSE', 'SZSE', 'KRX', 'ASX', 'SGX',
  'B3', 'JSE', 'MOEX', 'TADAWUL'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const requestedMarkets = body.markets || body.market;
    
    // Determine which markets to sync
    let marketsToSync: string[];
    if (requestedMarkets) {
      marketsToSync = Array.isArray(requestedMarkets) ? requestedMarkets : [requestedMarkets];
    } else {
      marketsToSync = ALL_MARKETS;
    }
    
    console.log(`Starting sync for ${marketsToSync.length} markets: ${marketsToSync.join(', ')}`);
    
    const results: SyncResult[] = [];
    let totalSymbols = 0;

    for (const market of marketsToSync) {
      const startedAt = new Date();
      console.log(`\n=== Syncing ${market} ===`);
      
      try {
        const stocks = await withRetry(() => getMarketStocks(market));
        
        if (stocks.length === 0) {
          console.warn(`No stocks found for ${market}`);
          await logSyncResult(supabase, market, 0, 'error', 'No stocks found', startedAt);
          results.push({ market, count: 0, status: 'error', error: 'No stocks found' });
          continue;
        }
        
        const { success, errors } = await upsertStocksBatch(supabase, stocks);
        
        const status = errors === 0 ? 'success' : (success > 0 ? 'partial' : 'error');
        await logSyncResult(
          supabase,
          market,
          success,
          status,
          errors > 0 ? `${errors} stocks failed to insert` : undefined,
          startedAt
        );
        
        results.push({ market, count: success, status });
        totalSymbols += success;
        console.log(`✓ ${market}: Synced ${success} stocks (${errors} errors)`);
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`✗ ${market}: ${errorMsg}`);
        await logSyncResult(supabase, market, 0, 'error', errorMsg, startedAt);
        results.push({ market, count: 0, status: 'error', error: errorMsg });
      }
      
      // Small delay between markets to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Get total count from database
    const { count: dbTotal } = await supabase
      .from('stock_symbols')
      .select('*', { count: 'exact', head: true });

    const summary = {
      success: true,
      message: `Sync complete: ${totalSymbols} symbols synced across ${marketsToSync.length} markets`,
      totalSymbolsInSync: totalSymbols,
      totalSymbolsInDatabase: dbTotal,
      marketsProcessed: marketsToSync.length,
      results,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`\n=== SYNC COMPLETE ===`);
    console.log(`Total: ${totalSymbols} symbols synced`);
    console.log(`Database total: ${dbTotal} symbols`);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
