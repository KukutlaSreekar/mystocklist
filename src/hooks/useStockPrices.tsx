import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WatchlistItem } from "@/lib/supabase";

export interface StockPrice {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
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

      const { data, error } = await supabase.functions.invoke('stock-price', {
        body: { symbols }
      });

      if (error) throw error;
      return data?.prices || {};
    },
    enabled: !!watchlist && watchlist.length > 0,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 25000, // Consider data stale after 25 seconds
  });
}
