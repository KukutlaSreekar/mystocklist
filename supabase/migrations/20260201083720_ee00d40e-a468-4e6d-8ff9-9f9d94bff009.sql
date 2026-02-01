-- Fix: System Sync History Exposed to Public
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can view sync history" ON public.sync_history;

-- Create a policy that only allows authenticated users to view sync history
CREATE POLICY "Authenticated users can view sync history"
ON public.sync_history
FOR SELECT
TO authenticated
USING (true);