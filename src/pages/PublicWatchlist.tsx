import { useParams, Link } from "react-router-dom";
import { useProfileByCode } from "@/hooks/useProfile";
import { useWatchlistByUserId } from "@/hooks/useWatchlist";
import { StockCard } from "@/components/StockCard";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2, AlertCircle, ArrowLeft } from "lucide-react";

export default function PublicWatchlist() {
  const { code } = useParams<{ code: string }>();
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfileByCode(code || "");
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlistByUserId(profile?.user_id);

  const isLoading = profileLoading || watchlistLoading;

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
            <span className="font-bold text-lg">StockWatch</span>
          </Link>

          <Link to="/login">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="container py-8 max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <span className="font-mono tracking-wider">{code?.toUpperCase()}</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {profile.display_name}'s Watchlist
          </h1>
          <p className="text-muted-foreground">
            Viewing {watchlist?.length || 0} stocks • Read-only access
          </p>
        </div>

        {watchlist && watchlist.length > 0 ? (
          <div className="grid gap-4">
            {watchlist.map((stock) => (
              <StockCard key={stock.id} stock={stock} readOnly />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-border">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No stocks yet</h3>
            <p className="text-muted-foreground">
              This watchlist is empty. Check back later!
            </p>
          </div>
        )}

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
