import { useState, useEffect, useRef, useCallback } from "react";
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

// Helper to highlight matching prefix in text
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  // Check if text starts with query
  if (lowerText.startsWith(lowerQuery)) {
    return (
      <>
        <span className="text-primary font-semibold">{text.slice(0, query.length)}</span>
        {text.slice(query.length)}
      </>
    );
  }
  
  // Check if any word starts with query
  const words = text.split(' ');
  let charIndex = 0;
  
  for (let i = 0; i < words.length; i++) {
    if (words[i].toLowerCase().startsWith(lowerQuery)) {
      const beforeMatch = text.slice(0, charIndex);
      const matchPart = text.slice(charIndex, charIndex + query.length);
      const afterMatch = text.slice(charIndex + query.length);
      
      return (
        <>
          {beforeMatch}
          <span className="text-primary font-semibold">{matchPart}</span>
          {afterMatch}
        </>
      );
    }
    charIndex += words[i].length + 1; // +1 for space
  }
  
  return <>{text}</>;
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
  const debouncedQuery = useDebounce(inputValue, 200);
  const { results, total, hasMore, isLoading, isLoadingMore, search, loadMore, clearResults } = useStockSearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!listRef.current || isLoadingMore || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      loadMore();
    }
  }, [loadMore, isLoadingMore, hasMore]);

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
        <div className="absolute z-50 w-full mt-1.5 bg-popover border border-border rounded-xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden">
          {/* Result count header */}
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{results.length}</span> of{" "}
              <span className="font-semibold text-foreground">{total}</span> matches
            </p>
          </div>
          
          {/* Scrollable results */}
          <div 
            ref={listRef}
            className="max-h-72 overflow-auto p-1.5"
            onScroll={handleScroll}
          >
            {results.map((result, index) => (
              <button
                key={`${result.symbol}-${index}`}
                type="button"
                className={cn(
                  "w-full px-3 py-3 text-left rounded-lg transition-all duration-100",
                  "flex items-center justify-between gap-3",
                  highlightedIndex === index 
                    ? "bg-primary/10 scale-[1.01] shadow-sm" 
                    : "hover:bg-muted/50"
                )}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    highlightedIndex === index ? "bg-primary/20" : "bg-primary/10"
                  )}>
                    <span className="font-mono font-bold text-xs text-primary">
                      {result.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-sm block">
                      <HighlightMatch text={result.symbol} query={inputValue} />
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      <HighlightMatch text={result.name} query={inputValue} />
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-medium">
                    {currencySymbol} {result.market}
                  </span>
                </div>
              </button>
            ))}
            
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Loading more...</span>
              </div>
            )}
            
            {/* End of results */}
            {!hasMore && results.length > 0 && total > 20 && (
              <div className="text-center py-2">
                <span className="text-xs text-muted-foreground">End of results</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isOpen && !isLoading && results.length === 0 && debouncedQuery.length >= 1 && (
        <div className="absolute z-50 w-full mt-1.5 bg-popover border border-border rounded-xl shadow-2xl p-6 animate-in fade-in-0 zoom-in-95 duration-150">
          <p className="text-sm text-muted-foreground text-center">
            No stocks starting with "<span className="font-mono font-semibold text-foreground">{debouncedQuery}</span>"
          </p>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Try a different search term or check if symbols are synced
          </p>
        </div>
      )}
    </div>
  );
}
