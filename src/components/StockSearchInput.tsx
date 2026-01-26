import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X } from "lucide-react";
import { useStockSearch, StockSearchResult } from "@/hooks/useStockSearch";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/marketConfig";

interface StockSearchInputProps {
  market: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: StockSearchResult) => void;
  placeholder?: string;
}

export function StockSearchInput({
  market,
  value,
  onChange,
  onSelect,
  placeholder = "Search stocks...",
}: StockSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debouncedQuery = useDebounce(inputValue, 200); // Faster debounce
  const { results, isLoading, search, clearResults } = useStockSearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debouncedQuery.length >= 1) {
      search(debouncedQuery, market);
      setIsOpen(true);
    } else {
      clearResults();
      setIsOpen(false);
    }
  }, [debouncedQuery, market, search, clearResults]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleSelect = (result: StockSearchResult) => {
    setInputValue(result.symbol);
    onChange(result.symbol);
    onSelect(result);
    setIsOpen(false);
    clearResults();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    clearResults();
    inputRef.current?.focus();
  };

  const currencySymbol = getCurrencySymbol(market);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-16 font-mono uppercase bg-card"
          placeholder={placeholder}
          autoComplete="off"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {inputValue && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-muted rounded transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-72 overflow-auto animate-fade-in">
          <div className="p-1">
            {results.map((result, index) => (
              <button
                key={`${result.symbol}-${index}`}
                type="button"
                className={cn(
                  "w-full px-3 py-2.5 text-left rounded-md transition-colors",
                  "flex items-center justify-between gap-2",
                  highlightedIndex === index 
                    ? "bg-primary/10 text-foreground" 
                    : "hover:bg-muted/50"
                )}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-mono font-bold text-xs text-primary">
                      {result.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-sm block">
                      {result.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      {result.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {currencySymbol} {result.market}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && !isLoading && results.length === 0 && debouncedQuery.length >= 1 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl p-4">
          <p className="text-sm text-muted-foreground text-center">
            No stocks found for "{debouncedQuery}"
          </p>
        </div>
      )}
    </div>
  );
}
