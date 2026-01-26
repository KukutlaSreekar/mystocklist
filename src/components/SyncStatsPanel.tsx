import { useSyncStats } from "@/hooks/useSyncStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, Clock, Globe, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

export function SyncStatsPanel() {
  const { totalSymbols, marketBreakdown, lastSyncTime, isLoading, error, refetch } = useSyncStats();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-symbols', {
        body: {}
      });

      if (error) throw error;

      toast.success(`Sync complete: ${data?.totalSymbolsInSync || 0} symbols synced`);
      refetch();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync symbols');
    } finally {
      setIsSyncing(false);
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
            onClick={handleManualSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-2xl font-bold">{totalSymbols.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Symbols</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-2xl font-bold">{marketBreakdown.length}</div>
            <div className="text-sm text-muted-foreground">Markets</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 col-span-2 md:col-span-1">
            <div className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {lastSyncTime ? formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true }) : 'Never'}
            </div>
            <div className="text-sm text-muted-foreground">Last Sync</div>
          </div>
        </div>

        {/* Market Breakdown */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Symbols by Market
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {marketBreakdown.map((market) => (
              <div 
                key={market.market} 
                className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5"
              >
                <span className="text-sm font-medium">{market.market}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {market.count}
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
