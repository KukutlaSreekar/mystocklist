import { supabase } from "@/integrations/supabase/client";

export { supabase };

export type Profile = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  public_code: string | null;
  created_at: string;
  updated_at: string;
};

export type WatchlistItem = {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  notes: string | null;
  target_price: number | null;
  created_at: string;
  updated_at: string;
};
