import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { useStockSearch, StockSearchResult } from "@/hooks/useStockSearch";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

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
  const debouncedQuery = useDebounce(inputValue, 300);
  const { results, isLoading, search, clearResults } = useStockSearch();
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="pl-9 pr-9 font-mono uppercase"
          placeholder={placeholder}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((result, index) => (
            <button
              key={`${result.symbol}-${index}`}
              type="button"
              className={cn(
                "w-full px-3 py-2 text-left hover:bg-accent transition-colors",
                "flex items-center justify-between gap-2"
              )}
              onClick={() => handleSelect(result)}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-mono font-semibold text-sm">
                  {result.symbol}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {result.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {result.market}
              </span>
            </button>
          ))}
        </div>
      )}

      {isOpen && !isLoading && results.length === 0 && debouncedQuery.length >= 1 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-3">
          <p className="text-sm text-muted-foreground text-center">
            No stocks found
          </p>
        </div>
      )}
    </div>
  );
}
