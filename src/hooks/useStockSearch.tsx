import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StockSearchResult {
  symbol: string;
  name: string;
  displaySymbol: string;
  market: string;
  marketCap?: number;
  volume?: number;
}

interface SearchState {
  results: StockSearchResult[];
  total: number;
  hasMore: boolean;
  offset: number;
}

const LIMIT = 20;

export function useStockSearch() {
  const [state, setState] = useState<SearchState>({
    results: [],
    total: 0,
    hasMore: false,
    offset: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef<{ query: string; market: string } | null>(null);

  const search = useCallback(async (query: string, market: string) => {
    if (!query || query.length < 1) {
      setState({ results: [], total: 0, hasMore: false, offset: 0 });
      lastQueryRef.current = null;
      return;
    }

    lastQueryRef.current = { query, market };
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('stock-search', {
        body: { query, market, limit: LIMIT, offset: 0 }
      });

      if (fnError) throw fnError;
      
      setState({
        results: data?.results || [],
        total: data?.total || 0,
        hasMore: data?.hasMore || false,
        offset: LIMIT,
      });
    } catch (err) {
      console.error('Stock search error:', err);
      setError('Failed to search stocks');
      setState({ results: [], total: 0, hasMore: false, offset: 0 });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!lastQueryRef.current || isLoadingMore || !state.hasMore) return;

    setIsLoadingMore(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('stock-search', {
        body: { 
          query: lastQueryRef.current.query, 
          market: lastQueryRef.current.market, 
          limit: LIMIT, 
          offset: state.offset 
        }
      });

      if (fnError) throw fnError;
      
      setState(prev => ({
        results: [...prev.results, ...(data?.results || [])],
        total: data?.total || prev.total,
        hasMore: data?.hasMore || false,
        offset: prev.offset + LIMIT,
      }));
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [state.offset, state.hasMore, isLoadingMore]);

  const clearResults = useCallback(() => {
    setState({ results: [], total: 0, hasMore: false, offset: 0 });
    setError(null);
    lastQueryRef.current = null;
  }, []);

  return { 
    results: state.results, 
    total: state.total,
    hasMore: state.hasMore,
    isLoading, 
    isLoadingMore,
    error, 
    search, 
    loadMore,
    clearResults 
  };
}
