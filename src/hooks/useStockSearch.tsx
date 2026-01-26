import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StockSearchResult {
  symbol: string;
  name: string;
  displaySymbol: string;
  market: string;
}

export function useStockSearch() {
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, market: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('stock-search', {
        body: { query, market }
      });

      if (fnError) throw fnError;
      
      setResults(data?.results || []);
    } catch (err) {
      console.error('Stock search error:', err);
      setError('Failed to search stocks');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, isLoading, error, search, clearResults };
}
