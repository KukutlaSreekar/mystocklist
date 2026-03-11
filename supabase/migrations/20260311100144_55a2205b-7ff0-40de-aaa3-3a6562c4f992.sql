
-- Symbol aliases table for handling ticker changes
CREATE TABLE public.symbol_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_symbol text NOT NULL,
  canonical_symbol text NOT NULL,
  isin text,
  market text NOT NULL DEFAULT 'NSE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_symbol, market)
);

ALTER TABLE public.symbol_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view symbol aliases"
ON public.symbol_aliases
FOR SELECT
USING (true);

-- Add ISIN column to stock_symbols if not exists
ALTER TABLE public.stock_symbols ADD COLUMN IF NOT EXISTS isin text;

-- Add ISIN column to watchlists if not exists  
ALTER TABLE public.watchlists ADD COLUMN IF NOT EXISTS isin text;

-- Seed known aliases
INSERT INTO public.symbol_aliases (alias_symbol, canonical_symbol, isin, market) VALUES
  ('LTI', 'LTM', 'INE214T01019', 'NSE'),
  ('LTIM', 'LTM', 'INE214T01019', 'NSE'),
  ('MINDTREE', 'LTM', 'INE214T01019', 'NSE'),
  ('HDFC', 'HDFCBANK', 'INE040A01034', 'NSE'),
  ('SRTRANSFIN', 'SHRIRAMFIN', 'INE721A01013', 'NSE'),
  ('MOTHERSUMI', 'MOTHERSON', 'INE775A01035', 'NSE'),
  ('MCDOWELL-N', 'UNITDSPR', '', 'NSE')
ON CONFLICT (alias_symbol, market) DO NOTHING;
