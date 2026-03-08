
CREATE TABLE public.stock_cap_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  market text NOT NULL DEFAULT 'NSE',
  cap_category text NOT NULL DEFAULT 'Unclassified',
  market_cap numeric,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, market)
);

ALTER TABLE public.stock_cap_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stock cap categories"
ON public.stock_cap_categories
FOR SELECT
USING (true);

-- Populate from existing stock_symbols data
INSERT INTO public.stock_cap_categories (symbol, market, cap_category, market_cap, last_updated)
SELECT symbol, market, 
  CASE 
    WHEN cap_category IS NOT NULL AND cap_category != '' THEN cap_category
    ELSE 'Unclassified'
  END,
  market_cap,
  now()
FROM public.stock_symbols
WHERE market IN ('NSE', 'BSE')
ON CONFLICT (symbol, market) DO NOTHING;
