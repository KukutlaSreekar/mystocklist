import { useState } from "react";
import { useWatchlist, useUpdateStock, useDeleteStock } from "@/hooks/useWatchlist";
import { useStockPrices } from "@/hooks/useStockPrices";
import { DashboardHeader } from "@/components/DashboardHeader";
import { WatchlistTable } from "@/components/WatchlistTable";
import { AddStockForm } from "@/components/AddStockForm";
import { ShareCode } from "@/components/ShareCode";
import { StockEditDialog } from "@/components/StockEditDialog";
import { WatchlistItem } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const { data: watchlist, isLoading } = useWatchlist();
  const { data: prices = {}, isLoading: pricesLoading } = useStockPrices(watchlist);
  const [editingStock, setEditingStock] = useState<WatchlistItem | null>(null);
  const updateStock = useUpdateStock();
  const deleteStock = useDeleteStock();

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Your Watchlist</h1>
                <p className="text-muted-foreground">
                  Track your favorite stocks with live prices
                </p>
              </div>
              <AddStockForm />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <WatchlistTable
                watchlist={watchlist || []}
                prices={prices}
                pricesLoading={pricesLoading}
                onEdit={setEditingStock}
                onDelete={(id) => deleteStock.mutate(id)}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <ShareCode />

            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
              <h3 className="font-semibold mb-2">Pro Tip</h3>
              <p className="text-sm text-muted-foreground">
                Prices auto-refresh every 30 seconds. Share your public code
                with friends to let them view your watchlist in real-time.
              </p>
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
