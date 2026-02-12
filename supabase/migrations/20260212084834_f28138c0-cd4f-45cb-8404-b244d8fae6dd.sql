-- Add cap_category column to stock_symbols for precomputed SEBI rankings
ALTER TABLE public.stock_symbols ADD COLUMN IF NOT EXISTS cap_category text;

-- Add index for efficient ranking queries
CREATE INDEX IF NOT EXISTS idx_stock_symbols_market_cap ON public.stock_symbols (market, market_cap DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_stock_symbols_cap_category ON public.stock_symbols (market, cap_category);
