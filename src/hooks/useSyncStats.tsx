import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MarketStats {
  market: string;
  count: number;
  lastSync: string | null;
  status: string | null;
}

interface SyncStats {
  totalSymbols: number;
  marketBreakdown: MarketStats[];
  lastSyncTime: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useSyncStats() {
  const [stats, setStats] = useState<SyncStats>({
    totalSymbols: 0,
    marketBreakdown: [],
    lastSyncTime: null,
    isLoading: true,
    error: null,
  });

  const fetchStats = useCallback(async () => {
    setStats(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get total symbols count
      const { count: totalSymbols, error: countError } = await supabase
        .from('stock_symbols')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      // Get symbols per market
      const { data: marketData, error: marketError } = await supabase
        .from('stock_symbols')
        .select('market');

      if (marketError) throw marketError;

      // Count by market
      const marketCounts: Record<string, number> = {};
      (marketData || []).forEach((row: { market: string }) => {
        marketCounts[row.market] = (marketCounts[row.market] || 0) + 1;
      });

      // Get latest sync history per market
      const { data: syncHistory, error: syncError } = await supabase
        .from('sync_history')
        .select('market, symbols_count, status, completed_at')
        .order('completed_at', { ascending: false });

      if (syncError) throw syncError;

      // Get unique latest sync per market
      const latestSyncs: Record<string, { completed_at: string; status: string }> = {};
      (syncHistory || []).forEach((row: any) => {
        if (!latestSyncs[row.market]) {
          latestSyncs[row.market] = {
            completed_at: row.completed_at,
            status: row.status,
          };
        }
      });

      // Build market breakdown
      const marketBreakdown: MarketStats[] = Object.entries(marketCounts)
        .map(([market, count]) => ({
          market,
          count,
          lastSync: latestSyncs[market]?.completed_at || null,
          status: latestSyncs[market]?.status || null,
        }))
        .sort((a, b) => b.count - a.count);

      // Get overall last sync time
      const lastSyncTime = syncHistory?.[0]?.completed_at || null;

      setStats({
        totalSymbols: totalSymbols || 0,
        marketBreakdown,
        lastSyncTime,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('Error fetching sync stats:', err);
      setStats(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch stats',
      }));
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { ...stats, refetch: fetchStats };
}
