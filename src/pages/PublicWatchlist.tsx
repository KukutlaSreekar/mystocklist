import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useProfileByCode } from "@/hooks/useProfile";
import { useWatchlistByUserId } from "@/hooks/useWatchlist";
import { useStockPrices } from "@/hooks/useStockPrices";
import { WatchlistTable } from "@/components/WatchlistTable";
import { PortfolioAllocation } from "@/components/PortfolioAllocation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Loader2, AlertCircle, ArrowLeft, PieChart, X, Clock } from "lucide-react";

// Default sector mapping for stocks without sector data
const DEFAULT_SECTORS: Record<string, string> = {
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'META': 'Technology',
  'NVDA': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology', 'TSLA': 'Technology',
  'TCS': 'Technology', 'INFY': 'Technology', 'WIPRO': 'Technology', 'HCLTECH': 'Technology',
  'HDFCBANK': 'Banking', 'ICICIBANK': 'Banking', 'SBIN': 'Banking', 'KOTAKBANK': 'Banking',
  'HINDUNILVR': 'FMCG', 'ITC': 'FMCG', 'NESTLEIND': 'FMCG', 'BRITANNIA': 'FMCG',
  'SUNPHARMA': 'Pharma', 'DRREDDY': 'Pharma', 'CIPLA': 'Pharma',
  'TATAMOTORS': 'Auto', 'MARUTI': 'Auto', 'M&M': 'Auto',
  'RELIANCE': 'Energy', 'ONGC': 'Energy', 'BPCL': 'Energy',
  'TATASTEEL': 'Metals', 'HINDALCO': 'Metals', 'JSWSTEEL': 'Metals',
  'LT': 'Infrastructure', 'ADANIENT': 'Infrastructure',
};

export default function PublicWatchlist() {
  const { code } = useParams<{ code: string }>();
  const [allocationFilter, setAllocationFilter] = useState<{ type: 'sector' | 'marketCap'; value: string } | null>(null);
  
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError
  } = useProfileByCode(code || "");
  
  const {
    data: watchlist,
    isLoading: watchlistLoading
  } = useWatchlistByUserId(profile?.user_id);
  
  const {
    data: prices = {},
    isLoading: pricesLoading
  } = useStockPrices(watchlist);

  // Filter watchlist based on allocation filter
  const filteredWatchlist = useMemo(() => {
    if (!watchlist || !allocationFilter) return watchlist || [];
    
    return watchlist.filter(stock => {
      if (allocationFilter.type === 'sector') {
        const stockSector = stock.sector || DEFAULT_SECTORS[stock.symbol] || 'Other';
        return stockSector === allocationFilter.value;
      } else if (allocationFilter.type === 'marketCap') {
        const stockCap = stock.market_cap_category || 'Unknown';
        return stockCap === allocationFilter.value;
      }
      return true;
    });
  }, [watchlist, allocationFilter]);

  const isLoading = profileLoading || watchlistLoading;
  
  // Calculate stats
  const totalStocks = watchlist?.length || 0;
  const gainers = Object.values(prices).filter(p => p.change > 0).length;
  const losers = Object.values(prices).filter(p => p.change < 0).length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading watchlist...</p>
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Watchlist Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The code "{code}" doesn't match any watchlist. Please check the code
            and try again.
          </p>
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg gradient-primary">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">​MyStockList</span>
          </Link>

          <Link to="/login">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="container py-8 max-w-5xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <span className="font-mono tracking-wider">{code?.toUpperCase()}</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {profile.display_name}'s Watchlist
          </h1>
          <p className="text-muted-foreground">
            Viewing {totalStocks} stocks • Read-only access • Live prices
          </p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Total Stocks
            </div>
            <div className="text-2xl font-bold">{totalStocks}</div>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center gap-2 text-success text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Gainers
            </div>
            <div className="text-2xl font-bold text-success">{gainers}</div>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center gap-2 text-destructive text-sm mb-1">
              <TrendingUp className="w-4 h-4 rotate-180" />
              Losers
            </div>
            <div className="text-2xl font-bold text-destructive">{losers}</div>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="w-4 h-4" />
              Auto-refresh
            </div>
            <div className="text-lg font-semibold">30s</div>
          </div>
        </div>

        {/* Portfolio Allocation Section */}
        {watchlist && watchlist.length > 0 && (
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Portfolio Allocation</h2>
              </div>
              {allocationFilter && (
                <Badge 
                  variant="secondary" 
                  className="flex items-center gap-1.5 cursor-pointer hover:bg-secondary/80"
                  onClick={() => setAllocationFilter(null)}
                >
                  Filtered: {allocationFilter.value}
                  <X className="w-3 h-3" />
                </Badge>
              )}
            </div>
            <PortfolioAllocation 
              watchlist={watchlist} 
              prices={prices}
              onFilterChange={setAllocationFilter}
            />
          </div>
        )}

        {/* Watchlist Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Stock List</h2>
              <p className="text-sm text-muted-foreground">
                {allocationFilter 
                  ? `Showing ${filteredWatchlist.length} ${allocationFilter.value} stocks`
                  : 'All stocks in this watchlist'
                }
              </p>
            </div>
            {allocationFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAllocationFilter(null)}
                className="text-muted-foreground"
              >
                <X className="w-4 h-4 mr-1" />
                Clear Filter
              </Button>
            )}
          </div>
          
          <WatchlistTable 
            watchlist={filteredWatchlist} 
            prices={prices} 
            pricesLoading={pricesLoading} 
            readOnly 
          />
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Want to create your own watchlist?
          </p>
          <Link to="/signup">
            <Button className="gradient-primary text-primary-foreground">
              Create Free Account
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}