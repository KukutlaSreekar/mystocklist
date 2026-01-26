import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { TrendingUp, LogOut, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

export function DashboardHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-lg gradient-primary shadow-lg shadow-primary/20 group-hover:shadow-primary/30 transition-shadow">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            Stock<span className="text-primary">Watch</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden sm:block px-2">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
