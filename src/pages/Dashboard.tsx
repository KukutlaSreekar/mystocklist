import { useWatchlist } from "@/hooks/useWatchlist";
import { DashboardHeader } from "@/components/DashboardHeader";
import { StockCard } from "@/components/StockCard";
import { AddStockForm } from "@/components/AddStockForm";
import { ShareCode } from "@/components/ShareCode";
import { Loader2, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { data: watchlist, isLoading } = useWatchlist();

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
                  Track your favorite stocks
                </p>
              </div>
              <AddStockForm />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : watchlist && watchlist.length > 0 ? (
              <div className="grid gap-4">
                {watchlist.map((stock) => (
                  <StockCard key={stock.id} stock={stock} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-border">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  No stocks yet
                </h3>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  Start building your watchlist by adding your first stock.
                  Track companies you're interested in!
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <ShareCode />

            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
              <h3 className="font-semibold mb-2">Pro Tip</h3>
              <p className="text-sm text-muted-foreground">
                Share your public code with friends to let them view your
                watchlist. They won't be able to make changes—only you can
                edit your stocks.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
