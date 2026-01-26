-- Create stock_symbols table for full market coverage
CREATE TABLE public.stock_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  company_name TEXT,
  market TEXT NOT NULL,
  market_cap NUMERIC,
  volume NUMERIC,
  popularity_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, market)
);

-- Create indexes for fast prefix search
CREATE INDEX idx_stock_symbols_symbol ON public.stock_symbols (symbol);
CREATE INDEX idx_stock_symbols_symbol_prefix ON public.stock_symbols USING btree (symbol text_pattern_ops);
CREATE INDEX idx_stock_symbols_company_prefix ON public.stock_symbols USING btree (company_name text_pattern_ops);
CREATE INDEX idx_stock_symbols_market ON public.stock_symbols (market);
CREATE INDEX idx_stock_symbols_market_cap ON public.stock_symbols (market_cap DESC NULLS LAST);

-- Enable RLS
ALTER TABLE public.stock_symbols ENABLE ROW LEVEL SECURITY;

-- Allow public read access (stock symbols are public data)
CREATE POLICY "Anyone can view stock symbols" 
ON public.stock_symbols 
FOR SELECT 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_stock_symbols_updated_at
BEFORE UPDATE ON public.stock_symbols
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();