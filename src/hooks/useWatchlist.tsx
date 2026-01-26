import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, WatchlistItem } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useWatchlist() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async (): Promise<WatchlistItem[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("watchlists")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useWatchlistByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: ["watchlist-public", userId],
    queryFn: async (): Promise<WatchlistItem[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("watchlists")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useAddStock() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (stock: {
      symbol: string;
      company_name?: string;
      notes?: string;
      target_price?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("watchlists")
        .insert({
          user_id: user.id,
          symbol: stock.symbol.toUpperCase(),
          company_name: stock.company_name,
          notes: stock.notes,
          target_price: stock.target_price,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Stock added to watchlist");
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("This stock is already in your watchlist");
      } else {
        toast.error("Failed to add stock");
      }
    },
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      symbol?: string;
      company_name?: string;
      notes?: string;
      target_price?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("watchlists")
        .update({
          ...updates,
          symbol: updates.symbol?.toUpperCase(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Stock updated");
    },
    onError: () => {
      toast.error("Failed to update stock");
    },
  });
}

export function useDeleteStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Stock removed from watchlist");
    },
    onError: () => {
      toast.error("Failed to remove stock");
    },
  });
}
