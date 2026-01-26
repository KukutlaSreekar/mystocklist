import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, ArrowRight, Share2, Lock, Eye } from "lucide-react";

export default function Index() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();

  const handleViewWatchlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 6) {
      navigate(`/public/${code.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 container flex h-20 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl gradient-primary">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">StockWatch</span>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/signup">
            <Button className="gradient-primary text-primary-foreground">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10">
        <section className="container py-20 lg:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Share your{" "}
              <span className="gradient-text">stock watchlist</span>{" "}
              with anyone
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Track your favorite stocks privately, then share with friends using
              a simple 6-character code. They can view—but never modify—your picks.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="gradient-primary text-primary-foreground text-lg px-8 h-14 shadow-lg hover:shadow-xl transition-shadow"
                >
                  Create Your Watchlist
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>

            {/* View Watchlist by Code */}
            <div className="glass-card rounded-2xl p-6 max-w-md mx-auto">
              <h3 className="font-semibold mb-3">Have a code? View a watchlist</h3>
              <form onSubmit={handleViewWatchlist} className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-char code"
                  maxLength={6}
                  className="font-mono text-center text-lg tracking-widest uppercase"
                />
                <Button type="submit" disabled={code.length !== 6}>
                  <Eye className="w-4 h-4 mr-2" />
                  View
                </Button>
              </form>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container py-20 border-t border-border/50">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Everything you need
          </h2>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Track Stocks</h3>
              <p className="text-sm text-muted-foreground">
                Add symbols, set target prices, and keep notes on your investment
                thesis.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Share2 className="w-7 h-7 text-accent" />
              </div>
              <h3 className="font-semibold mb-2">Share Easily</h3>
              <p className="text-sm text-muted-foreground">
                Get a unique 6-character code to share your watchlist with anyone.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-success/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-success" />
              </div>
              <h3 className="font-semibold mb-2">Stay Secure</h3>
              <p className="text-sm text-muted-foreground">
                Only you can edit your watchlist. Viewers get read-only access.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© 2024 StockWatch. Built for investors.</p>
        </div>
      </footer>
    </div>
  );
}
