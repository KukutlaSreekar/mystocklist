import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Profile } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

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

// Public profile type without email
export type PublicProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  public_code: string | null;
  created_at: string;
  updated_at: string;
};

export function useProfileByCode(code: string) {
  return useQuery({
    queryKey: ["profile-by-code", code],
    queryFn: async (): Promise<PublicProfile | null> => {
      // Use the public view that excludes email for privacy
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles_public?public_code=eq.${code.toUpperCase()}&select=*`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch profile');
      
      const profiles = await response.json();
      return profiles.length > 0 ? profiles[0] as PublicProfile : null;
    },
    enabled: !!code && code.length === 6,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: { display_name: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({ display_name: data.display_name })
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update profile: " + error.message);
    },
  });
}
