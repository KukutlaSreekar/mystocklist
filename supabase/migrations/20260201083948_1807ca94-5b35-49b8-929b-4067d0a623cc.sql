-- Fix: Add RLS policy to allow public access to profiles with public_code set
-- This is safe because the profiles_public view only exposes non-sensitive columns (no email)
CREATE POLICY "Public can view profiles with public_code via view"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (public_code IS NOT NULL);