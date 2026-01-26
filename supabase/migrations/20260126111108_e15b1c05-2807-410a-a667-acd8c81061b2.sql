-- Create sync_history table for tracking sync operations
CREATE TABLE IF NOT EXISTS public.sync_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market TEXT NOT NULL,
  symbols_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- Anyone can view sync history (public stats)
CREATE POLICY "Anyone can view sync history"
  ON public.sync_history
  FOR SELECT
  USING (true);

-- Create index for querying by market and time
CREATE INDEX idx_sync_history_market ON public.sync_history(market);
CREATE INDEX idx_sync_history_completed_at ON public.sync_history(completed_at DESC);

-- Add index on stock_symbols for faster market-based queries
CREATE INDEX IF NOT EXISTS idx_stock_symbols_market_popularity 
  ON public.stock_symbols(market, popularity_score DESC);

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;