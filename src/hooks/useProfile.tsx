import { useQuery } from "@tanstack/react-query";
import { supabase, Profile } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useProfileByCode(code: string) {
  return useQuery({
    queryKey: ["profile-by-code", code],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("public_code", code.toUpperCase())
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!code && code.length === 6,
  });
}
