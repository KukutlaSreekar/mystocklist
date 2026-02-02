import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, WatchlistItem } from "@/lib/supabase";

interface StockMetadata {
  symbol: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  marketCapCategory: string | null;
}

// Cache to track which symbols we've already enriched in this session
const enrichedSymbols = new Set<string>();

export function useEnrichMetadata(watchlist: WatchlistItem[] | undefined, isAuthenticated: boolean = false) {
  const queryClient = useQueryClient();
  const enrichingRef = useRef(false);

  useEffect(() => {
    if (!watchlist || watchlist.length === 0 || enrichingRef.current) return;

    // Find items that need enrichment (missing sector or have Unknown market cap)
    const itemsToEnrich = watchlist.filter(item => {
      const needsEnrichment = !item.sector || item.market_cap_category === 'Unknown' || !item.market_cap_category;
      const notYetEnriched = !enrichedSymbols.has(`${item.symbol}-${item.market}`);
      return needsEnrichment && notYetEnriched;
    });

    if (itemsToEnrich.length === 0) return;

    const enrichItems = async () => {
      enrichingRef.current = true;
      
      try {
        console.log(`Enriching metadata for ${itemsToEnrich.length} items`);
        
        // Mark these as being enriched to prevent duplicate calls
        itemsToEnrich.forEach(item => {
          enrichedSymbols.add(`${item.symbol}-${item.market}`);
        });

        const { data: { session } } = await supabase.auth.getSession();

        const response = await supabase.functions.invoke('enrich-stock-metadata', {
          body: {
            symbols: itemsToEnrich.map(item => ({
              symbol: item.symbol,
              market: item.market,
              id: item.id,
            })),
            updateDatabase: isAuthenticated && !!session,
          },
        });

        if (response.error) {
          console.error('Enrichment error:', response.error);
          return;
        }

        const metadata: Record<string, StockMetadata> = response.data?.metadata || {};
        
        // Update local query cache with enriched data
        const enrichedWatchlist = watchlist.map(item => {
          const meta = metadata[item.symbol];
          if (meta) {
            return {
              ...item,
              sector: meta.sector || item.sector,
              market_cap_category: meta.marketCapCategory || item.market_cap_category,
            };
          }
          return item;
        });

        // Update query cache - use the correct query key based on auth state
        if (isAuthenticated) {
          queryClient.setQueryData(["watchlist", session?.user?.id], enrichedWatchlist);
        } else {
          // For public watchlist, find the user_id from the first item
          const userId = watchlist[0]?.user_id;
          if (userId) {
            queryClient.setQueryData(["watchlist-public", userId], enrichedWatchlist);
          }
        }

        console.log('Metadata enrichment complete');
      } catch (err) {
        console.error('Failed to enrich metadata:', err);
      } finally {
        enrichingRef.current = false;
      }
    };

    // Debounce the enrichment to avoid too many calls
    const timeoutId = setTimeout(enrichItems, 500);
    return () => clearTimeout(timeoutId);
  }, [watchlist, isAuthenticated, queryClient]);
}
