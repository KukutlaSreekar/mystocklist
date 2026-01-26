import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WatchlistItem } from "@/lib/supabase";

export interface StockPrice {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  market?: string;
  isMarketClosed?: boolean;
  lastUpdated?: number;
}

export function useStockPrices(watchlist: WatchlistItem[] | undefined) {
  return useQuery({
    queryKey: ["stock-prices", watchlist?.map(s => `${s.symbol}-${s.market}`).join(",")],
    queryFn: async (): Promise<Record<string, StockPrice>> => {
      if (!watchlist || watchlist.length === 0) return {};

      const symbols = watchlist.map(stock => ({
        symbol: stock.symbol,
        market: stock.market || 'NYSE'
      }));

      try {
        const { data, error } = await supabase.functions.invoke('stock-price', {
          body: { symbols }
        });

        if (error) {
          console.error('Stock price fetch error:', error);
          return {};
        }
        
        return data?.prices || {};
      } catch (err) {
        console.error('Stock price fetch failed:', err);
        return {};
      }
    },
    enabled: !!watchlist && watchlist.length > 0,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 25000, // Consider data stale after 25 seconds
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}
