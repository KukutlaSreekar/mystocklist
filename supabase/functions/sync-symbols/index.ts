import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Yahoo Finance screener endpoints for different markets
const MARKET_SCREENERS: Record<string, { region: string; exchange?: string }> = {
  NYSE: { region: 'us' },
  NASDAQ: { region: 'us' },
  NSE: { region: 'in' },
  BSE: { region: 'in' },
  LSE: { region: 'gb' },
  TSX: { region: 'ca' },
  ASX: { region: 'au' },
  HKEX: { region: 'hk' },
  TSE: { region: 'jp' },
  XETRA: { region: 'de' },
  EURONEXT: { region: 'fr' },
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

interface StockSymbol {
  symbol: string;
  company_name: string;
  market: string;
  market_cap: number | null;
  volume: number | null;
  popularity_score: number;
}

// Fetch stocks from Yahoo Finance screener
async function fetchYahooScreener(market: string, offset = 0, count = 250): Promise<StockSymbol[]> {
  const config = MARKET_SCREENERS[market];
  if (!config) return [];

  const suffix = YAHOO_SUFFIX[market] || '';
  
  try {
    // Yahoo Finance screener API
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
        popularity_score: Math.max(0, 1000 - offset - index), // Higher score for higher market cap
      };
    }).filter((s: StockSymbol) => s.symbol);
  } catch (err) {
    console.error(`Error fetching ${market} stocks:`, err);
    return [];
  }
}

// Comprehensive stock lists for Indian markets (Yahoo doesn't have great screener coverage)
const INDIAN_STOCKS: StockSymbol[] = [
  // NIFTY 50 + Popular stocks
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
  // Additional popular stocks
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
  { symbol: "RELAXO", company_name: "Relaxo Footwears Ltd", market: "NSE", market_cap: 15000, volume: 200000, popularity_score: 865 },
  { symbol: "BATAINDIA", company_name: "Bata India Ltd", market: "NSE", market_cap: 20000, volume: 200000, popularity_score: 864 },
  { symbol: "ABFRL", company_name: "Aditya Birla Fashion and Retail Ltd", market: "NSE", market_cap: 25000, volume: 3000000, popularity_score: 863 },
  { symbol: "MANYAVAR", company_name: "Vedant Fashions Ltd", market: "NSE", market_cap: 20000, volume: 200000, popularity_score: 862 },
  { symbol: "CAMPUS", company_name: "Campus Activewear Ltd", market: "NSE", market_cap: 10000, volume: 500000, popularity_score: 861 },
  { symbol: "DEEPAKNTR", company_name: "Deepak Nitrite Ltd", market: "NSE", market_cap: 25000, volume: 500000, popularity_score: 860 },
  { symbol: "AARTIIND", company_name: "Aarti Industries Ltd", market: "NSE", market_cap: 20000, volume: 500000, popularity_score: 859 },
  { symbol: "PIIND", company_name: "PI Industries Ltd", market: "NSE", market_cap: 50000, volume: 200000, popularity_score: 858 },
  { symbol: "SRF", company_name: "SRF Ltd", market: "NSE", market_cap: 70000, volume: 300000, popularity_score: 857 },
  { symbol: "ATUL", company_name: "Atul Ltd", market: "NSE", market_cap: 20000, volume: 30000, popularity_score: 856 },
  { symbol: "NAVINFLUOR", company_name: "Navin Fluorine International Ltd", market: "NSE", market_cap: 15000, volume: 200000, popularity_score: 855 },
  { symbol: "COFORGE", company_name: "Coforge Ltd", market: "NSE", market_cap: 40000, volume: 300000, popularity_score: 854 },
  { symbol: "LTIM", company_name: "LTIMindtree Ltd", market: "NSE", market_cap: 150000, volume: 300000, popularity_score: 853 },
  { symbol: "MPHASIS", company_name: "Mphasis Ltd", market: "NSE", market_cap: 50000, volume: 300000, popularity_score: 852 },
  { symbol: "PERSISTENT", company_name: "Persistent Systems Ltd", market: "NSE", market_cap: 60000, volume: 200000, popularity_score: 851 },
  { symbol: "LTTS", company_name: "L&T Technology Services Ltd", market: "NSE", market_cap: 50000, volume: 200000, popularity_score: 850 },
  { symbol: "CYIENT", company_name: "Cyient Ltd", market: "NSE", market_cap: 15000, volume: 300000, popularity_score: 849 },
  { symbol: "BIRLASOFT", company_name: "Birlasoft Ltd", market: "NSE", market_cap: 15000, volume: 1000000, popularity_score: 848 },
  { symbol: "HAPPSTMNDS", company_name: "Happiest Minds Technologies Ltd", market: "NSE", market_cap: 12000, volume: 500000, popularity_score: 847 },
  { symbol: "ROUTE", company_name: "Route Mobile Ltd", market: "NSE", market_cap: 8000, volume: 200000, popularity_score: 846 },
  { symbol: "TANLA", company_name: "Tanla Platforms Ltd", market: "NSE", market_cap: 10000, volume: 500000, popularity_score: 845 },
  { symbol: "KPITTECH", company_name: "KPIT Technologies Ltd", market: "NSE", market_cap: 40000, volume: 1000000, popularity_score: 844 },
  { symbol: "TATAELXSI", company_name: "Tata Elxsi Ltd", market: "NSE", market_cap: 45000, volume: 200000, popularity_score: 843 },
  { symbol: "ZENSARTECH", company_name: "Zensar Technologies Ltd", market: "NSE", market_cap: 15000, volume: 300000, popularity_score: 842 },
  { symbol: "OFSS", company_name: "Oracle Financial Services Software Ltd", market: "NSE", market_cap: 80000, volume: 50000, popularity_score: 841 },
  { symbol: "SONATSOFTW", company_name: "Sonata Software Ltd", market: "NSE", market_cap: 15000, volume: 500000, popularity_score: 840 },
  { symbol: "INTELLECT", company_name: "Intellect Design Arena Ltd", market: "NSE", market_cap: 10000, volume: 500000, popularity_score: 839 },
  { symbol: "MASTEK", company_name: "Mastek Ltd", market: "NSE", market_cap: 8000, volume: 200000, popularity_score: 838 },
  { symbol: "NEWGEN", company_name: "Newgen Software Technologies Ltd", market: "NSE", market_cap: 10000, volume: 200000, popularity_score: 837 },
];

// US Stocks comprehensive list
const US_STOCKS: StockSymbol[] = [
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
  { symbol: "LRCX", company_name: "Lam Research Corporation", market: "NASDAQ", market_cap: 100000000, volume: 1500000, popularity_score: 960 },
  { symbol: "MU", company_name: "Micron Technology Inc.", market: "NASDAQ", market_cap: 100000000, volume: 20000000, popularity_score: 959 },
  { symbol: "SNPS", company_name: "Synopsys Inc.", market: "NASDAQ", market_cap: 80000000, volume: 1000000, popularity_score: 958 },
  { symbol: "CDNS", company_name: "Cadence Design Systems Inc.", market: "NASDAQ", market_cap: 80000000, volume: 1000000, popularity_score: 957 },
  { symbol: "KLAC", company_name: "KLA Corporation", market: "NASDAQ", market_cap: 80000000, volume: 1000000, popularity_score: 956 },
  { symbol: "ADI", company_name: "Analog Devices Inc.", market: "NASDAQ", market_cap: 100000000, volume: 3000000, popularity_score: 955 },
  { symbol: "MRVL", company_name: "Marvell Technology Inc.", market: "NASDAQ", market_cap: 60000000, volume: 10000000, popularity_score: 954 },
  { symbol: "ON", company_name: "ON Semiconductor Corporation", market: "NASDAQ", market_cap: 30000000, volume: 8000000, popularity_score: 953 },
  { symbol: "NXPI", company_name: "NXP Semiconductors N.V.", market: "NASDAQ", market_cap: 55000000, volume: 2000000, popularity_score: 952 },
  { symbol: "MCHP", company_name: "Microchip Technology Incorporated", market: "NASDAQ", market_cap: 40000000, volume: 3000000, popularity_score: 951 },
  { symbol: "DIS", company_name: "The Walt Disney Company", market: "NYSE", market_cap: 180000000, volume: 10000000, popularity_score: 950 },
  { symbol: "CMCSA", company_name: "Comcast Corporation", market: "NASDAQ", market_cap: 150000000, volume: 15000000, popularity_score: 949 },
  { symbol: "T", company_name: "AT&T Inc.", market: "NYSE", market_cap: 120000000, volume: 30000000, popularity_score: 948 },
  { symbol: "VZ", company_name: "Verizon Communications Inc.", market: "NYSE", market_cap: 160000000, volume: 15000000, popularity_score: 947 },
  { symbol: "TMUS", company_name: "T-Mobile US Inc.", market: "NASDAQ", market_cap: 200000000, volume: 4000000, popularity_score: 946 },
  { symbol: "NKE", company_name: "NIKE Inc.", market: "NYSE", market_cap: 130000000, volume: 8000000, popularity_score: 945 },
  { symbol: "MCD", company_name: "McDonald's Corporation", market: "NYSE", market_cap: 200000000, volume: 3000000, popularity_score: 944 },
  { symbol: "SBUX", company_name: "Starbucks Corporation", market: "NASDAQ", market_cap: 100000000, volume: 8000000, popularity_score: 943 },
  { symbol: "LOW", company_name: "Lowe's Companies Inc.", market: "NYSE", market_cap: 130000000, volume: 3000000, popularity_score: 942 },
  { symbol: "TGT", company_name: "Target Corporation", market: "NYSE", market_cap: 70000000, volume: 4000000, popularity_score: 941 },
  { symbol: "BKNG", company_name: "Booking Holdings Inc.", market: "NASDAQ", market_cap: 130000000, volume: 300000, popularity_score: 940 },
  { symbol: "ABNB", company_name: "Airbnb Inc.", market: "NASDAQ", market_cap: 80000000, volume: 5000000, popularity_score: 939 },
  { symbol: "UBER", company_name: "Uber Technologies Inc.", market: "NYSE", market_cap: 130000000, volume: 20000000, popularity_score: 938 },
  { symbol: "LYFT", company_name: "Lyft Inc.", market: "NASDAQ", market_cap: 5000000, volume: 10000000, popularity_score: 937 },
  { symbol: "DASH", company_name: "DoorDash Inc.", market: "NASDAQ", market_cap: 50000000, volume: 4000000, popularity_score: 936 },
  { symbol: "SQ", company_name: "Block Inc.", market: "NYSE", market_cap: 40000000, volume: 8000000, popularity_score: 935 },
  { symbol: "PYPL", company_name: "PayPal Holdings Inc.", market: "NASDAQ", market_cap: 70000000, volume: 10000000, popularity_score: 934 },
  { symbol: "COIN", company_name: "Coinbase Global Inc.", market: "NASDAQ", market_cap: 50000000, volume: 10000000, popularity_score: 933 },
  { symbol: "HOOD", company_name: "Robinhood Markets Inc.", market: "NASDAQ", market_cap: 15000000, volume: 20000000, popularity_score: 932 },
  { symbol: "SOFI", company_name: "SoFi Technologies Inc.", market: "NASDAQ", market_cap: 10000000, volume: 30000000, popularity_score: 931 },
  { symbol: "PLTR", company_name: "Palantir Technologies Inc.", market: "NYSE", market_cap: 40000000, volume: 40000000, popularity_score: 930 },
  { symbol: "SNOW", company_name: "Snowflake Inc.", market: "NYSE", market_cap: 50000000, volume: 3000000, popularity_score: 929 },
  { symbol: "DDOG", company_name: "Datadog Inc.", market: "NASDAQ", market_cap: 40000000, volume: 3000000, popularity_score: 928 },
  { symbol: "NET", company_name: "Cloudflare Inc.", market: "NYSE", market_cap: 30000000, volume: 5000000, popularity_score: 927 },
  { symbol: "ZS", company_name: "Zscaler Inc.", market: "NASDAQ", market_cap: 30000000, volume: 1500000, popularity_score: 926 },
  { symbol: "CRWD", company_name: "CrowdStrike Holdings Inc.", market: "NASDAQ", market_cap: 70000000, volume: 3000000, popularity_score: 925 },
  { symbol: "PANW", company_name: "Palo Alto Networks Inc.", market: "NASDAQ", market_cap: 100000000, volume: 2000000, popularity_score: 924 },
  { symbol: "FTNT", company_name: "Fortinet Inc.", market: "NASDAQ", market_cap: 50000000, volume: 2000000, popularity_score: 923 },
  { symbol: "OKTA", company_name: "Okta Inc.", market: "NASDAQ", market_cap: 15000000, volume: 2000000, popularity_score: 922 },
  { symbol: "MDB", company_name: "MongoDB Inc.", market: "NASDAQ", market_cap: 25000000, volume: 1000000, popularity_score: 921 },
  { symbol: "SPLK", company_name: "Splunk Inc.", market: "NASDAQ", market_cap: 25000000, volume: 2000000, popularity_score: 920 },
  { symbol: "TEAM", company_name: "Atlassian Corporation", market: "NASDAQ", market_cap: 50000000, volume: 1000000, popularity_score: 919 },
  { symbol: "WDAY", company_name: "Workday Inc.", market: "NASDAQ", market_cap: 60000000, volume: 1500000, popularity_score: 918 },
  { symbol: "ZM", company_name: "Zoom Video Communications Inc.", market: "NASDAQ", market_cap: 20000000, volume: 3000000, popularity_score: 917 },
  { symbol: "DOCU", company_name: "DocuSign Inc.", market: "NASDAQ", market_cap: 12000000, volume: 3000000, popularity_score: 916 },
  { symbol: "SHOP", company_name: "Shopify Inc.", market: "NYSE", market_cap: 90000000, volume: 5000000, popularity_score: 915 },
  { symbol: "TWLO", company_name: "Twilio Inc.", market: "NYSE", market_cap: 10000000, volume: 2000000, popularity_score: 914 },
  { symbol: "U", company_name: "Unity Software Inc.", market: "NYSE", market_cap: 8000000, volume: 5000000, popularity_score: 913 },
  { symbol: "RBLX", company_name: "Roblox Corporation", market: "NYSE", market_cap: 25000000, volume: 10000000, popularity_score: 912 },
  { symbol: "EA", company_name: "Electronic Arts Inc.", market: "NASDAQ", market_cap: 35000000, volume: 2000000, popularity_score: 911 },
  { symbol: "TTWO", company_name: "Take-Two Interactive Software Inc.", market: "NASDAQ", market_cap: 25000000, volume: 1000000, popularity_score: 910 },
  { symbol: "ATVI", company_name: "Activision Blizzard Inc.", market: "NASDAQ", market_cap: 70000000, volume: 5000000, popularity_score: 909 },
  { symbol: "WBD", company_name: "Warner Bros. Discovery Inc.", market: "NASDAQ", market_cap: 25000000, volume: 20000000, popularity_score: 908 },
  { symbol: "PARA", company_name: "Paramount Global", market: "NASDAQ", market_cap: 8000000, volume: 15000000, popularity_score: 907 },
  { symbol: "F", company_name: "Ford Motor Company", market: "NYSE", market_cap: 45000000, volume: 50000000, popularity_score: 906 },
  { symbol: "GM", company_name: "General Motors Company", market: "NYSE", market_cap: 50000000, volume: 15000000, popularity_score: 905 },
  { symbol: "RIVN", company_name: "Rivian Automotive Inc.", market: "NASDAQ", market_cap: 15000000, volume: 20000000, popularity_score: 904 },
  { symbol: "LCID", company_name: "Lucid Group Inc.", market: "NASDAQ", market_cap: 8000000, volume: 30000000, popularity_score: 903 },
  { symbol: "NIO", company_name: "NIO Inc.", market: "NYSE", market_cap: 10000000, volume: 40000000, popularity_score: 902 },
  { symbol: "XPEV", company_name: "XPeng Inc.", market: "NYSE", market_cap: 8000000, volume: 10000000, popularity_score: 901 },
  { symbol: "LI", company_name: "Li Auto Inc.", market: "NASDAQ", market_cap: 25000000, volume: 8000000, popularity_score: 900 },
  { symbol: "BA", company_name: "The Boeing Company", market: "NYSE", market_cap: 130000000, volume: 8000000, popularity_score: 899 },
  { symbol: "LMT", company_name: "Lockheed Martin Corporation", market: "NYSE", market_cap: 120000000, volume: 1500000, popularity_score: 898 },
  { symbol: "RTX", company_name: "RTX Corporation", market: "NYSE", market_cap: 140000000, volume: 4000000, popularity_score: 897 },
  { symbol: "NOC", company_name: "Northrop Grumman Corporation", market: "NYSE", market_cap: 70000000, volume: 800000, popularity_score: 896 },
  { symbol: "GD", company_name: "General Dynamics Corporation", market: "NYSE", market_cap: 80000000, volume: 1000000, popularity_score: 895 },
  { symbol: "CAT", company_name: "Caterpillar Inc.", market: "NYSE", market_cap: 150000000, volume: 2000000, popularity_score: 894 },
  { symbol: "DE", company_name: "Deere & Company", market: "NYSE", market_cap: 120000000, volume: 1500000, popularity_score: 893 },
  { symbol: "UNP", company_name: "Union Pacific Corporation", market: "NYSE", market_cap: 140000000, volume: 2000000, popularity_score: 892 },
  { symbol: "UPS", company_name: "United Parcel Service Inc.", market: "NYSE", market_cap: 100000000, volume: 3000000, popularity_score: 891 },
  { symbol: "FDX", company_name: "FedEx Corporation", market: "NYSE", market_cap: 70000000, volume: 2000000, popularity_score: 890 },
  { symbol: "GE", company_name: "General Electric Company", market: "NYSE", market_cap: 180000000, volume: 8000000, popularity_score: 889 },
  { symbol: "HON", company_name: "Honeywell International Inc.", market: "NASDAQ", market_cap: 130000000, volume: 3000000, popularity_score: 888 },
  { symbol: "MMM", company_name: "3M Company", market: "NYSE", market_cap: 60000000, volume: 3000000, popularity_score: 887 },
  { symbol: "UNH", company_name: "UnitedHealth Group Incorporated", market: "NYSE", market_cap: 450000000, volume: 3000000, popularity_score: 886 },
  { symbol: "CVS", company_name: "CVS Health Corporation", market: "NYSE", market_cap: 80000000, volume: 8000000, popularity_score: 885 },
  { symbol: "CI", company_name: "The Cigna Group", market: "NYSE", market_cap: 100000000, volume: 2000000, popularity_score: 884 },
  { symbol: "ELV", company_name: "Elevance Health Inc.", market: "NYSE", market_cap: 100000000, volume: 1500000, popularity_score: 883 },
  { symbol: "HUM", company_name: "Humana Inc.", market: "NYSE", market_cap: 50000000, volume: 1000000, popularity_score: 882 },
  { symbol: "LLY", company_name: "Eli Lilly and Company", market: "NYSE", market_cap: 700000000, volume: 3000000, popularity_score: 881 },
  { symbol: "BMY", company_name: "Bristol-Myers Squibb Company", market: "NYSE", market_cap: 100000000, volume: 10000000, popularity_score: 880 },
  { symbol: "GILD", company_name: "Gilead Sciences Inc.", market: "NASDAQ", market_cap: 100000000, volume: 6000000, popularity_score: 879 },
  { symbol: "AMGN", company_name: "Amgen Inc.", market: "NASDAQ", market_cap: 150000000, volume: 2500000, popularity_score: 878 },
  { symbol: "BIIB", company_name: "Biogen Inc.", market: "NASDAQ", market_cap: 30000000, volume: 1000000, popularity_score: 877 },
  { symbol: "VRTX", company_name: "Vertex Pharmaceuticals Incorporated", market: "NASDAQ", market_cap: 100000000, volume: 1500000, popularity_score: 876 },
  { symbol: "REGN", company_name: "Regeneron Pharmaceuticals Inc.", market: "NASDAQ", market_cap: 100000000, volume: 500000, popularity_score: 875 },
  { symbol: "ISRG", company_name: "Intuitive Surgical Inc.", market: "NASDAQ", market_cap: 150000000, volume: 1000000, popularity_score: 874 },
  { symbol: "DXCM", company_name: "DexCom Inc.", market: "NASDAQ", market_cap: 30000000, volume: 2000000, popularity_score: 873 },
  { symbol: "IDXX", company_name: "IDEXX Laboratories Inc.", market: "NASDAQ", market_cap: 40000000, volume: 500000, popularity_score: 872 },
  { symbol: "ZTS", company_name: "Zoetis Inc.", market: "NYSE", market_cap: 80000000, volume: 2000000, popularity_score: 871 },
  { symbol: "SYK", company_name: "Stryker Corporation", market: "NYSE", market_cap: 120000000, volume: 1000000, popularity_score: 870 },
  { symbol: "BDX", company_name: "Becton Dickinson and Company", market: "NYSE", market_cap: 70000000, volume: 1000000, popularity_score: 869 },
  { symbol: "MDT", company_name: "Medtronic plc", market: "NYSE", market_cap: 100000000, volume: 5000000, popularity_score: 868 },
  { symbol: "ABT", company_name: "Abbott Laboratories", market: "NYSE", market_cap: 180000000, volume: 5000000, popularity_score: 867 },
  { symbol: "DHR", company_name: "Danaher Corporation", market: "NYSE", market_cap: 180000000, volume: 2000000, popularity_score: 866 },
  { symbol: "GS", company_name: "The Goldman Sachs Group Inc.", market: "NYSE", market_cap: 150000000, volume: 2000000, popularity_score: 865 },
  { symbol: "MS", company_name: "Morgan Stanley", market: "NYSE", market_cap: 150000000, volume: 8000000, popularity_score: 864 },
  { symbol: "C", company_name: "Citigroup Inc.", market: "NYSE", market_cap: 100000000, volume: 15000000, popularity_score: 863 },
  { symbol: "WFC", company_name: "Wells Fargo & Company", market: "NYSE", market_cap: 180000000, volume: 15000000, popularity_score: 862 },
  { symbol: "USB", company_name: "U.S. Bancorp", market: "NYSE", market_cap: 70000000, volume: 8000000, popularity_score: 861 },
  { symbol: "PNC", company_name: "The PNC Financial Services Group Inc.", market: "NYSE", market_cap: 70000000, volume: 2000000, popularity_score: 860 },
  { symbol: "TFC", company_name: "Truist Financial Corporation", market: "NYSE", market_cap: 50000000, volume: 8000000, popularity_score: 859 },
  { symbol: "SCHW", company_name: "The Charles Schwab Corporation", market: "NYSE", market_cap: 120000000, volume: 8000000, popularity_score: 858 },
  { symbol: "BLK", company_name: "BlackRock Inc.", market: "NYSE", market_cap: 120000000, volume: 500000, popularity_score: 857 },
  { symbol: "AXP", company_name: "American Express Company", market: "NYSE", market_cap: 150000000, volume: 3000000, popularity_score: 856 },
  { symbol: "SPGI", company_name: "S&P Global Inc.", market: "NYSE", market_cap: 130000000, volume: 1000000, popularity_score: 855 },
  { symbol: "ICE", company_name: "Intercontinental Exchange Inc.", market: "NYSE", market_cap: 70000000, volume: 3000000, popularity_score: 854 },
  { symbol: "CME", company_name: "CME Group Inc.", market: "NASDAQ", market_cap: 80000000, volume: 2000000, popularity_score: 853 },
  { symbol: "CB", company_name: "Chubb Limited", market: "NYSE", market_cap: 100000000, volume: 1500000, popularity_score: 852 },
  { symbol: "AON", company_name: "Aon plc", market: "NYSE", market_cap: 70000000, volume: 800000, popularity_score: 851 },
  { symbol: "MMC", company_name: "Marsh & McLennan Companies Inc.", market: "NYSE", market_cap: 100000000, volume: 1500000, popularity_score: 850 },
  { symbol: "MET", company_name: "MetLife Inc.", market: "NYSE", market_cap: 50000000, volume: 5000000, popularity_score: 849 },
  { symbol: "PRU", company_name: "Prudential Financial Inc.", market: "NYSE", market_cap: 40000000, volume: 2000000, popularity_score: 848 },
  { symbol: "AIG", company_name: "American International Group Inc.", market: "NYSE", market_cap: 50000000, volume: 5000000, popularity_score: 847 },
  { symbol: "TRV", company_name: "The Travelers Companies Inc.", market: "NYSE", market_cap: 50000000, volume: 1000000, popularity_score: 846 },
  { symbol: "ALL", company_name: "The Allstate Corporation", market: "NYSE", market_cap: 45000000, volume: 1500000, popularity_score: 845 },
  { symbol: "AFL", company_name: "Aflac Incorporated", market: "NYSE", market_cap: 50000000, volume: 3000000, popularity_score: 844 },
  { symbol: "NEE", company_name: "NextEra Energy Inc.", market: "NYSE", market_cap: 150000000, volume: 8000000, popularity_score: 843 },
  { symbol: "DUK", company_name: "Duke Energy Corporation", market: "NYSE", market_cap: 80000000, volume: 3000000, popularity_score: 842 },
  { symbol: "SO", company_name: "The Southern Company", market: "NYSE", market_cap: 80000000, volume: 5000000, popularity_score: 841 },
  { symbol: "D", company_name: "Dominion Energy Inc.", market: "NYSE", market_cap: 45000000, volume: 5000000, popularity_score: 840 },
  { symbol: "AEP", company_name: "American Electric Power Company Inc.", market: "NASDAQ", market_cap: 50000000, volume: 3000000, popularity_score: 839 },
  { symbol: "EXC", company_name: "Exelon Corporation", market: "NASDAQ", market_cap: 40000000, volume: 5000000, popularity_score: 838 },
  { symbol: "SRE", company_name: "Sempra", market: "NYSE", market_cap: 50000000, volume: 2000000, popularity_score: 837 },
  { symbol: "XEL", company_name: "Xcel Energy Inc.", market: "NASDAQ", market_cap: 35000000, volume: 3000000, popularity_score: 836 },
  { symbol: "WEC", company_name: "WEC Energy Group Inc.", market: "NYSE", market_cap: 30000000, volume: 1500000, popularity_score: 835 },
  { symbol: "ED", company_name: "Consolidated Edison Inc.", market: "NYSE", market_cap: 35000000, volume: 1500000, popularity_score: 834 },
  { symbol: "AMT", company_name: "American Tower Corporation", market: "NYSE", market_cap: 100000000, volume: 2000000, popularity_score: 833 },
  { symbol: "PLD", company_name: "Prologis Inc.", market: "NYSE", market_cap: 120000000, volume: 4000000, popularity_score: 832 },
  { symbol: "EQIX", company_name: "Equinix Inc.", market: "NASDAQ", market_cap: 80000000, volume: 500000, popularity_score: 831 },
  { symbol: "SPG", company_name: "Simon Property Group Inc.", market: "NYSE", market_cap: 50000000, volume: 2000000, popularity_score: 830 },
  { symbol: "PSA", company_name: "Public Storage", market: "NYSE", market_cap: 55000000, volume: 800000, popularity_score: 829 },
  { symbol: "O", company_name: "Realty Income Corporation", market: "NYSE", market_cap: 45000000, volume: 5000000, popularity_score: 828 },
  { symbol: "WELL", company_name: "Welltower Inc.", market: "NYSE", market_cap: 55000000, volume: 2000000, popularity_score: 827 },
  { symbol: "DLR", company_name: "Digital Realty Trust Inc.", market: "NYSE", market_cap: 45000000, volume: 2000000, popularity_score: 826 },
  { symbol: "CCI", company_name: "Crown Castle Inc.", market: "NYSE", market_cap: 45000000, volume: 2000000, popularity_score: 825 },
  { symbol: "SBAC", company_name: "SBA Communications Corporation", market: "NASDAQ", market_cap: 25000000, volume: 800000, popularity_score: 824 },
  { symbol: "AVB", company_name: "AvalonBay Communities Inc.", market: "NYSE", market_cap: 30000000, volume: 800000, popularity_score: 823 },
  { symbol: "EQR", company_name: "Equity Residential", market: "NYSE", market_cap: 25000000, volume: 1500000, popularity_score: 822 },
  { symbol: "VTR", company_name: "Ventas Inc.", market: "NYSE", market_cap: 20000000, volume: 2000000, popularity_score: 821 },
  { symbol: "VICI", company_name: "VICI Properties Inc.", market: "NYSE", market_cap: 35000000, volume: 5000000, popularity_score: 820 },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { market } = await req.json().catch(() => ({}));
    const marketsToSync = market ? [market] : ['NSE', 'BSE', 'NYSE', 'NASDAQ'];
    
    let totalInserted = 0;
    const results: Record<string, number> = {};

    for (const mkt of marketsToSync) {
      let stocks: StockSymbol[] = [];
      
      // Use comprehensive lists for markets where Yahoo screener has limited coverage
      if (mkt === 'NSE' || mkt === 'BSE') {
        stocks = INDIAN_STOCKS.map(s => ({ ...s, market: mkt }));
      } else if (mkt === 'NYSE' || mkt === 'NASDAQ') {
        stocks = US_STOCKS.filter(s => s.market === mkt);
      } else {
        // Try Yahoo screener for other markets
        stocks = await fetchYahooScreener(mkt, 0, 500);
      }

      if (stocks.length > 0) {
        // Upsert stocks
        const { error } = await supabase
          .from('stock_symbols')
          .upsert(
            stocks.map(s => ({
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
          console.error(`Error upserting ${mkt} stocks:`, error);
        } else {
          results[mkt] = stocks.length;
          totalInserted += stocks.length;
          console.log(`Synced ${stocks.length} stocks for ${mkt}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${totalInserted} stocks`,
        details: results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
