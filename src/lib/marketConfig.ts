// Market configuration with currency mapping and popular stocks

export interface MarketConfig {
  value: string;
  label: string;
  description: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  finnhubSuffix: string;
  popularStocks: string[];
}

export const MARKETS: MarketConfig[] = [
  // North America
  {
    value: "NYSE",
    label: "NYSE",
    description: "New York Stock Exchange",
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    finnhubSuffix: "",
    popularStocks: ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "BRK.A", "V", "JPM"],
  },
  {
    value: "NASDAQ",
    label: "NASDAQ",
    description: "NASDAQ",
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    finnhubSuffix: "",
    popularStocks: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "COST", "NFLX"],
  },
  {
    value: "TSX",
    label: "TSX",
    description: "Toronto Stock Exchange",
    currency: "CAD",
    currencySymbol: "C$",
    locale: "en-CA",
    finnhubSuffix: ".TO",
    popularStocks: ["RY", "TD", "ENB", "CNR", "BNS", "BCE", "CP", "BMO", "TRP", "SU"],
  },
  // Europe
  {
    value: "LSE",
    label: "LSE",
    description: "London Stock Exchange",
    currency: "GBP",
    currencySymbol: "£",
    locale: "en-GB",
    finnhubSuffix: ".L",
    popularStocks: ["SHEL", "HSBA", "AZN", "BP", "ULVR", "RIO", "GSK", "DGE", "LLOY", "VOD"],
  },
  {
    value: "XETRA",
    label: "XETRA",
    description: "Deutsche Börse (Germany)",
    currency: "EUR",
    currencySymbol: "€",
    locale: "de-DE",
    finnhubSuffix: ".DE",
    popularStocks: ["SAP", "SIE", "ALV", "DTE", "BAS", "MRK", "BMW", "VOW3", "ADS", "DBK"],
  },
  {
    value: "EURONEXT",
    label: "EURONEXT",
    description: "Euronext",
    currency: "EUR",
    currencySymbol: "€",
    locale: "fr-FR",
    finnhubSuffix: ".PA",
    popularStocks: ["OR", "MC", "TTE", "SAN", "AIR", "BNP", "SU", "AI", "CS", "DG"],
  },
  {
    value: "SIX",
    label: "SIX",
    description: "SIX Swiss Exchange",
    currency: "CHF",
    currencySymbol: "Fr",
    locale: "de-CH",
    finnhubSuffix: ".SW",
    popularStocks: ["NESN", "ROG", "NOVN", "UBSG", "ABBN", "CSGN", "ZURN", "SREN", "GIVN", "LONN"],
  },
  // Asia Pacific
  {
    value: "NSE",
    label: "NSE",
    description: "National Stock Exchange (India)",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    finnhubSuffix: ".NS",
    popularStocks: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "KOTAKBANK", "LT"],
  },
  {
    value: "BSE",
    label: "BSE",
    description: "Bombay Stock Exchange",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    finnhubSuffix: ".BO",
    popularStocks: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "KOTAKBANK", "LT"],
  },
  {
    value: "TSE",
    label: "TSE",
    description: "Tokyo Stock Exchange",
    currency: "JPY",
    currencySymbol: "¥",
    locale: "ja-JP",
    finnhubSuffix: ".T",
    popularStocks: ["7203", "6758", "9984", "6861", "8306", "9433", "6501", "7267", "4502", "6902"],
  },
  {
    value: "HKEX",
    label: "HKEX",
    description: "Hong Kong Exchange",
    currency: "HKD",
    currencySymbol: "HK$",
    locale: "zh-HK",
    finnhubSuffix: ".HK",
    popularStocks: ["0700", "9988", "0939", "1299", "0005", "2318", "0941", "3690", "1810", "9618"],
  },
  {
    value: "SSE",
    label: "SSE",
    description: "Shanghai Stock Exchange",
    currency: "CNY",
    currencySymbol: "¥",
    locale: "zh-CN",
    finnhubSuffix: ".SS",
    popularStocks: ["600519", "601318", "600036", "601166", "600276", "601888", "600030", "601012", "600900", "601398"],
  },
  {
    value: "SZSE",
    label: "SZSE",
    description: "Shenzhen Stock Exchange",
    currency: "CNY",
    currencySymbol: "¥",
    locale: "zh-CN",
    finnhubSuffix: ".SZ",
    popularStocks: ["000858", "000333", "002594", "000651", "300750", "002415", "000001", "002475", "300059", "002142"],
  },
  {
    value: "KRX",
    label: "KRX",
    description: "Korea Exchange",
    currency: "KRW",
    currencySymbol: "₩",
    locale: "ko-KR",
    finnhubSuffix: ".KS",
    popularStocks: ["005930", "000660", "035420", "051910", "006400", "035720", "005380", "012330", "055550", "003550"],
  },
  {
    value: "ASX",
    label: "ASX",
    description: "Australian Securities Exchange",
    currency: "AUD",
    currencySymbol: "A$",
    locale: "en-AU",
    finnhubSuffix: ".AX",
    popularStocks: ["BHP", "CBA", "CSL", "NAB", "WBC", "ANZ", "WES", "MQG", "RIO", "FMG"],
  },
  {
    value: "SGX",
    label: "SGX",
    description: "Singapore Exchange",
    currency: "SGD",
    currencySymbol: "S$",
    locale: "en-SG",
    finnhubSuffix: ".SI",
    popularStocks: ["D05", "O39", "U11", "Z74", "C6L", "BN4", "C38U", "A17U", "G13", "S58"],
  },
  // Latin America
  {
    value: "B3",
    label: "B3",
    description: "B3 (Brazil)",
    currency: "BRL",
    currencySymbol: "R$",
    locale: "pt-BR",
    finnhubSuffix: ".SA",
    popularStocks: ["VALE3", "PETR4", "ITUB4", "BBDC4", "ABEV3", "B3SA3", "WEGE3", "RENT3", "SUZB3", "JBSS3"],
  },
  // Africa
  {
    value: "JSE",
    label: "JSE",
    description: "Johannesburg Stock Exchange",
    currency: "ZAR",
    currencySymbol: "R",
    locale: "en-ZA",
    finnhubSuffix: ".JO",
    popularStocks: ["NPN", "AGL", "SOL", "BTI", "CFR", "SBK", "FSR", "AMS", "SHP", "MTN"],
  },
  // Russia
  {
    value: "MOEX",
    label: "MOEX",
    description: "Moscow Exchange",
    currency: "RUB",
    currencySymbol: "₽",
    locale: "ru-RU",
    finnhubSuffix: ".ME",
    popularStocks: ["SBER", "GAZP", "LKOH", "GMKN", "NVTK", "ROSN", "YNDX", "MTSS", "MGNT", "VTBR"],
  },
  // Middle East
  {
    value: "TADAWUL",
    label: "TADAWUL",
    description: "Saudi Exchange (Tadawul)",
    currency: "SAR",
    currencySymbol: "﷼",
    locale: "ar-SA",
    finnhubSuffix: ".SR",
    popularStocks: ["2222", "1120", "2010", "1180", "2350", "1010", "2380", "4001", "2020", "1211"],
  },
];

export function getMarketConfig(marketValue: string): MarketConfig {
  return MARKETS.find((m) => m.value === marketValue) || MARKETS[0];
}

export function formatCurrency(amount: number, market: string): string {
  const config = getMarketConfig(market);
  
  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unsupported currencies
    return `${config.currencySymbol}${amount.toFixed(2)}`;
  }
}

export function formatNumber(amount: number, market: string): string {
  const config = getMarketConfig(market);
  
  try {
    return new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function getCurrencySymbol(market: string): string {
  return getMarketConfig(market).currencySymbol;
}
