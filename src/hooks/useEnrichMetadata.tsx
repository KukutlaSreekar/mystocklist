import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, WatchlistItem } from "@/lib/supabase";

interface StockMetadata {
  symbol: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  marketCapCategory: string | null;
  fetchError?: string;
}

// Track enrichment attempts per page load
const enrichAttempted = new Set<string>();

export interface EnrichmentState {
  isEnriching: boolean;
  totalStocks: number;
  missingMetadata: number;
  missingPercent: number;
  errors: string[];
}

export function useEnrichMetadata(watchlist: WatchlistItem[] | undefined, isAuthenticated: boolean = false) {
  const queryClient = useQueryClient();
  const enrichingRef = useRef(false);
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState>({
    isEnriching: false, totalStocks: 0, missingMetadata: 0, missingPercent: 0, errors: [],
  });

  const computeStats = useCallback((items: WatchlistItem[]) => {
    const total = items.length;
    const missing = items.filter(i => !i.sector || !i.market_cap_category || i.market_cap_category === 'Unknown' || i.market_cap_category === 'Unclassified').length;
    return { totalStocks: total, missingMetadata: missing, missingPercent: total > 0 ? (missing / total) * 100 : 0 };
  }, []);

  useEffect(() => {
    if (!watchlist || watchlist.length === 0 || enrichingRef.current) return;

    const stats = computeStats(watchlist);
    setEnrichmentState(prev => ({ ...prev, ...stats }));

    // Find items that need enrichment AND haven't been attempted this session
    const itemsToEnrich = watchlist.filter(item => {
      const needsEnrichment = !item.sector || !item.market_cap_category || item.market_cap_category === 'Unknown' || item.market_cap_category === 'Unclassified';
      const key = `${item.id}`;
      return needsEnrichment && !enrichAttempted.has(key);
    });

    if (itemsToEnrich.length === 0) return;

    const enrichItems = async () => {
      enrichingRef.current = true;
      setEnrichmentState(prev => ({ ...prev, isEnriching: true, errors: [] }));

      // Mark as attempted immediately to prevent duplicate calls
      itemsToEnrich.forEach(item => enrichAttempted.add(item.id));

      try {
        console.log(`Enriching metadata for ${itemsToEnrich.length} items`);

        const { data: { session } } = await supabase.auth.getSession();

        const response = await supabase.functions.invoke('enrich-stock-metadata', {
          body: {
            symbols: itemsToEnrich.map(item => ({
              symbol: item.symbol,
              market: item.market,
              id: item.id,
              company_name: item.company_name,
            })),
            updateDatabase: isAuthenticated && !!session,
          },
        });

        if (response.error) {
          console.error('Enrichment invocation error:', response.error);
          // Allow retry on next load
          itemsToEnrich.forEach(item => enrichAttempted.delete(item.id));
          setEnrichmentState(prev => ({ ...prev, errors: [response.error.message || 'Enrichment failed'] }));
          return;
        }

        const metadata: Record<string, StockMetadata> = response.data?.metadata || {};
        const apiErrors: string[] = response.data?.errors || [];

        // Update local query cache with enriched data
        const enrichedWatchlist = watchlist.map(item => {
          const meta = metadata[item.symbol];
          if (meta && !meta.fetchError) {
            return {
              ...item,
              sector: meta.sector || item.sector,
              market_cap_category: meta.marketCapCategory || item.market_cap_category,
            };
          }
          return item;
        });

        if (isAuthenticated) {
          queryClient.setQueryData(["watchlist", session?.user?.id], enrichedWatchlist);
        } else {
          const userId = watchlist[0]?.user_id;
          if (userId) queryClient.setQueryData(["watchlist-public", userId], enrichedWatchlist);
        }

        const newStats = computeStats(enrichedWatchlist);
        setEnrichmentState(prev => ({ ...prev, ...newStats, errors: apiErrors }));

        console.log(`Enrichment complete: ${response.data?.stats?.success || 0} success, ${response.data?.stats?.failed || 0} failed`);
      } catch (err) {
        console.error('Failed to enrich metadata:', err);
        itemsToEnrich.forEach(item => enrichAttempted.delete(item.id));
        setEnrichmentState(prev => ({ ...prev, errors: ['Enrichment request failed'] }));
      } finally {
        enrichingRef.current = false;
        setEnrichmentState(prev => ({ ...prev, isEnriching: false }));
      }
    };

    const timeoutId = setTimeout(enrichItems, 500);
    return () => clearTimeout(timeoutId);
  }, [watchlist, isAuthenticated, queryClient, computeStats]);

  return enrichmentState;
}
