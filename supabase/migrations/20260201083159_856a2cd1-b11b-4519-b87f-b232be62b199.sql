-- Create a public view that excludes email from public access
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  display_name,
  public_code,
  created_at,
  updated_at
FROM public.profiles;
-- Note: email field is intentionally excluded for privacy

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.profiles_public TO anon;
GRANT SELECT ON public.profiles_public TO authenticated;

-- Drop the permissive public policy that exposes email
DROP POLICY IF EXISTS "Anyone can view profile by public_code" ON public.profiles;

-- Create a restrictive policy that only allows owner access for direct table queries
-- Public access will go through the profiles_public view instead
CREATE POLICY "Only owners can view own profile directly"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);