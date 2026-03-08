import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CapCategory {
  symbol: string;
  market: string;
  cap_category: string;
  market_cap: number | null;
}

export function useCapCategories(symbols: { symbol: string; market: string }[] | undefined) {
  return useQuery({
    queryKey: ["cap-categories", symbols?.map(s => `${s.symbol}-${s.market}`).sort().join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      if (!symbols || symbols.length === 0) return {};

      const uniqueSymbols = [...new Set(symbols.map(s => s.symbol))];

      const { data, error } = await supabase
        .from("stock_cap_categories")
        .select("symbol, market, cap_category")
        .in("symbol", uniqueSymbols);

      if (error) throw error;

      const result: Record<string, string> = {};
      for (const row of data || []) {
        result[row.symbol] = row.cap_category;
      }
      return result;
    },
    enabled: !!symbols && symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}
