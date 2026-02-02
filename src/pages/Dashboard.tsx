import { useState, useMemo } from "react";
import { useWatchlist, useUpdateStock, useDeleteStock } from "@/hooks/useWatchlist";
import { useStockPrices } from "@/hooks/useStockPrices";
import { useEnrichMetadata } from "@/hooks/useEnrichMetadata";
import { DashboardHeader } from "@/components/DashboardHeader";
import { WatchlistTable } from "@/components/WatchlistTable";
import { AddStockForm } from "@/components/AddStockForm";
import { ShareCode } from "@/components/ShareCode";
import { ProfileSettings } from "@/components/ProfileSettings";
import { StockEditDialog } from "@/components/StockEditDialog";
import { PortfolioAllocation } from "@/components/PortfolioAllocation";
import { WatchlistItem } from "@/lib/supabase";
import { Loader2, RefreshCw, TrendingUp, Clock, PieChart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: watchlist, isLoading, refetch: refetchWatchlist } = useWatchlist();
  const { data: prices = {}, isLoading: pricesLoading, refetch: refetchPrices } = useStockPrices(watchlist);
  const [editingStock, setEditingStock] = useState<WatchlistItem | null>(null);
  const [allocationFilter, setAllocationFilter] = useState<{ type: 'sector' | 'marketCap'; value: string } | null>(null);
  const updateStock = useUpdateStock();
  const deleteStock = useDeleteStock();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Enrich stock metadata (sector, market cap) from Yahoo Finance
  useEnrichMetadata(watchlist, true);

  // Filter watchlist based on allocation filter
  const filteredWatchlist = useMemo(() => {
    if (!watchlist || !allocationFilter) return watchlist || [];
    
    return watchlist.filter(stock => {
      if (allocationFilter.type === 'sector') {
        const stockSector = stock.sector || 'Other';
        return stockSector === allocationFilter.value;
      } else if (allocationFilter.type === 'marketCap') {
        const stockCap = stock.market_cap_category || 'Unknown';
        return stockCap === allocationFilter.value;
      }
      return true;
    });
  }, [watchlist, allocationFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchWatchlist(), refetchPrices()]);
    setIsRefreshing(false);
  };

  const totalStocks = watchlist?.length || 0;
  const gainers = Object.values(prices).filter(p => p.change > 0).length;
  const losers = Object.values(prices).filter(p => p.change < 0).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container py-6 space-y-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="space-y-4">
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

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Your Watchlist</h1>
                <p className="text-sm text-muted-foreground">
                  {allocationFilter 
                    ? `Showing ${allocationFilter.value} stocks`
                    : 'Track your favorite stocks with live prices'
                  }
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="hidden sm:flex"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <AddStockForm />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <WatchlistTable
                watchlist={filteredWatchlist}
                prices={prices}
                pricesLoading={pricesLoading}
                onEdit={setEditingStock}
                onDelete={(id) => deleteStock.mutate(id)}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <ProfileSettings />
            <ShareCode />

            <div className="p-5 rounded-xl bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 border border-primary/10">
              <h3 className="font-semibold mb-2 text-sm">💡 Pro Tip</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Prices auto-refresh every 30 seconds. Share your public code
                with friends to let them view your watchlist in real-time.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-card border border-border">
              <h3 className="font-semibold mb-3 text-sm">Supported Markets</h3>
              <div className="flex flex-wrap gap-1.5">
                {['NYSE', 'NASDAQ', 'NSE', 'LSE', 'TSE', 'HKEX'].map((market) => (
                  <span 
                    key={market} 
                    className="px-2 py-0.5 text-xs bg-muted rounded-md text-muted-foreground"
                  >
                    {market}
                  </span>
                ))}
                <span className="px-2 py-0.5 text-xs bg-primary/10 rounded-md text-primary font-medium">
                  +14 more
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <StockEditDialog
        stock={editingStock}
        onClose={() => setEditingStock(null)}
        onSave={(data) => {
          if (editingStock) {
            updateStock.mutate(
              { id: editingStock.id, ...data },
              { onSuccess: () => setEditingStock(null) }
            );
          }
        }}
        isLoading={updateStock.isPending}
      />
    </div>
  );
}
