import { useSyncStats } from "@/hooks/useSyncStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, Clock, Globe, CheckCircle, AlertCircle, Loader2, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

export function SyncStatsPanel() {
  const { totalSymbols, marketBreakdown, lastSyncTime, isLoading, error, refetch } = useSyncStats();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingMarket, setSyncingMarket] = useState<string | null>(null);

  const handleManualSync = async (market?: string) => {
    setIsSyncing(true);
    setSyncingMarket(market || 'all');
    try {
      let functionName = 'sync-symbols';
      if (market === 'NSE') functionName = 'sync-nse-symbols';
      else if (market === 'BSE') functionName = 'sync-bse-symbols';

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: market ? { market } : {}
      });

      if (error) throw error;

      toast.success(`Sync complete: ${data?.stocksInserted || data?.totalSymbolsInSync || 0} symbols synced`);
      refetch();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync symbols');
    } finally {
      setIsSyncing(false);
      setSyncingMarket(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-destructive">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </CardContent>
      </Card>
    );
  }

  // Calculate Indian market stats
  const nseCount = marketBreakdown.find(m => m.market === 'NSE')?.count || 0;
  const bseCount = marketBreakdown.find(m => m.market === 'BSE')?.count || 0;
  const indianTotal = nseCount + bseCount;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Symbol Database Stats
            </CardTitle>
            <CardDescription>
              Stock symbol index for search functionality
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleManualSync()}
            disabled={isSyncing}
          >
            {isSyncing && syncingMarket === 'all' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-2xl font-bold">{totalSymbols.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Symbols</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-2xl font-bold">{marketBreakdown.length}</div>
            <div className="text-sm text-muted-foreground">Markets</div>
          </div>
          <div className="bg-gradient-to-br from-orange-500/10 to-green-500/10 rounded-lg p-3 border border-orange-500/20">
            <div className="text-2xl font-bold text-orange-600">{indianTotal.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">🇮🇳 Indian Stocks</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {lastSyncTime ? formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true }) : 'Never'}
            </div>
            <div className="text-sm text-muted-foreground">Last Sync</div>
          </div>
        </div>

        {/* Indian Market Highlight */}
        <div className="bg-gradient-to-r from-orange-500/5 via-white/5 to-green-500/5 border border-orange-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              🇮🇳 Indian Markets
            </h4>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleManualSync('NSE')}
                disabled={isSyncing}
                className="h-7 text-xs"
              >
                {isSyncing && syncingMarket === 'NSE' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Sync NSE
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleManualSync('BSE')}
                disabled={isSyncing}
                className="h-7 text-xs"
              >
                {isSyncing && syncingMarket === 'BSE' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Sync BSE
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-background/50 rounded px-3 py-2">
              <span className="text-sm font-medium">NSE</span>
              <Badge variant="secondary" className="bg-orange-500/10 text-orange-600">
                {nseCount.toLocaleString()} stocks
              </Badge>
            </div>
            <div className="flex items-center justify-between bg-background/50 rounded px-3 py-2">
              <span className="text-sm font-medium">BSE</span>
              <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                {bseCount.toLocaleString()} stocks
              </Badge>
            </div>
          </div>
        </div>

        {/* Global Market Breakdown */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            All Markets
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {marketBreakdown.map((market) => (
              <div 
                key={market.market} 
                className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5"
              >
                <span className="text-sm font-medium">{market.market}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {market.count.toLocaleString()}
                  </Badge>
                  {market.status === 'success' && (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  )}
                  {market.status === 'error' && (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}