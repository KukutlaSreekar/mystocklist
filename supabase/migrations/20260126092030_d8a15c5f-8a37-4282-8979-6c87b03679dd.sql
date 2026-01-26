-- Add market column to watchlists table
ALTER TABLE public.watchlists 
ADD COLUMN market text NOT NULL DEFAULT 'NYSE';

-- Add index for market column
CREATE INDEX idx_watchlists_market ON public.watchlists(market);