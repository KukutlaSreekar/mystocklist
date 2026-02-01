import { useState, useMemo, useCallback } from "react";
import { WatchlistItem } from "@/lib/supabase";
import { StockPrice } from "@/hooks/useStockPrices";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, TrendingUp, TrendingDown, Minus, AlertCircle, Clock, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrencySymbol, formatNumber } from "@/lib/marketConfig";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WatchlistTableProps {
  watchlist: WatchlistItem[];
  prices: Record<string, StockPrice>;
  pricesLoading: boolean;
  readOnly?: boolean;
  onEdit?: (stock: WatchlistItem) => void;
  onDelete?: (id: string) => void;
}

type SortColumn = 'stock' | 'market' | 'price' | 'change' | 'changePercent' | 'status' | null;
type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

function formatLastUpdated(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  currentSort: SortState;
  onSort: (column: SortColumn) => void;
  align?: 'left' | 'center' | 'right';
}

function SortableHeader({ label, column, currentSort, onSort, align = 'left' }: SortableHeaderProps) {
  const isActive = currentSort.column === column;
  
  return (
    <TableHead 
      className={cn(
        "font-semibold text-foreground cursor-pointer select-none transition-colors hover:bg-muted/50 group",
        align === 'right' && "text-right",
        align === 'center' && "text-center"
      )}
      onClick={() => onSort(column)}
    >
      <div className={cn(
        "flex items-center gap-1.5",
        align === 'right' && "justify-end",
        align === 'center' && "justify-center"
      )}>
        <span>{label}</span>
        <span className={cn(
          "transition-all duration-200",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"
        )}>
          {isActive && currentSort.direction === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : isActive && currentSort.direction === 'desc' ? (
            <ArrowDown className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5" />
          )}
        </span>
      </div>
    </TableHead>
  );
}

export function WatchlistTable({
  watchlist,
  prices,
  pricesLoading,
  readOnly = false,
  onEdit,
  onDelete,
}: WatchlistTableProps) {
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleSort = useCallback((column: SortColumn) => {
    setSortState(prev => {
      if (prev.column !== column) {
        // First click on new column: ascending
        return { column, direction: 'asc' };
      } else if (prev.direction === 'asc') {
        // Second click: descending
        return { column, direction: 'desc' };
      } else {
        // Third click: reset
        return { column: null, direction: null };
      }
    });
  }, []);

  const sortedWatchlist = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return watchlist;
    }

    const sorted = [...watchlist].sort((a, b) => {
      const priceA = prices[a.symbol];
      const priceB = prices[b.symbol];
      
      let comparison = 0;
      
      switch (sortState.column) {
        case 'stock':
          // Sort by company name, fallback to symbol
          const nameA = (a.company_name || a.symbol).toLowerCase();
          const nameB = (b.company_name || b.symbol).toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
          
        case 'market':
          comparison = (a.market || 'NYSE').localeCompare(b.market || 'NYSE');
          break;
          
        case 'price':
          const valPriceA = priceA?.price ?? -Infinity;
          const valPriceB = priceB?.price ?? -Infinity;
          comparison = valPriceA - valPriceB;
          break;
          
        case 'change':
          const valChangeA = priceA?.change ?? -Infinity;
          const valChangeB = priceB?.change ?? -Infinity;
          comparison = valChangeA - valChangeB;
          break;
          
        case 'changePercent':
          const valPercentA = priceA?.changePercent ?? -Infinity;
          const valPercentB = priceB?.changePercent ?? -Infinity;
          comparison = valPercentA - valPercentB;
          break;
          
        case 'status':
          // Sort by market status: Live (false) comes before Closed (true)
          const statusA = priceA?.isMarketClosed ? 1 : 0;
          const statusB = priceB?.isMarketClosed ? 1 : 0;
          comparison = statusA - statusB;
          break;
          
        default:
          comparison = 0;
      }
      
      return sortState.direction === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [watchlist, prices, sortState]);

  if (watchlist.length === 0) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-border bg-card/50">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No stocks yet</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Start building your watchlist by adding your first stock.
          Track companies you're interested in!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border">
            <SortableHeader 
              label="Stock" 
              column="stock" 
              currentSort={sortState} 
              onSort={handleSort} 
            />
            <SortableHeader 
              label="Market" 
              column="market" 
              currentSort={sortState} 
              onSort={handleSort} 
            />
            <SortableHeader 
              label="Price" 
              column="price" 
              currentSort={sortState} 
              onSort={handleSort}
              align="right"
            />
            <SortableHeader 
              label="Change" 
              column="change" 
              currentSort={sortState} 
              onSort={handleSort}
              align="right"
            />
            <SortableHeader 
              label="Status" 
              column="status" 
              currentSort={sortState} 
              onSort={handleSort}
              align="center"
            />
            {!readOnly && <TableHead className="w-[100px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedWatchlist.map((stock, index) => {
            const price = prices[stock.symbol];
            const isPositive = price?.change > 0;
            const isNegative = price?.change < 0;
            const market = stock.market || 'NYSE';
            const currencySymbol = getCurrencySymbol(market);
            const isMarketClosed = price?.isMarketClosed;

            return (
              <TableRow 
                key={stock.id} 
                className={cn(
                  "group transition-all duration-200 hover:bg-muted/20",
                  index % 2 === 0 ? "bg-transparent" : "bg-muted/5"
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg transition-colors",
                      isPositive ? "bg-success/10" : isNegative ? "bg-destructive/10" : "bg-primary/10"
                    )}>
                      {isPositive ? (
                        <TrendingUp className="w-4 h-4 text-success" />
                      ) : isNegative ? (
                        <TrendingDown className="w-4 h-4 text-destructive" />
                      ) : pricesLoading ? (
                        <Minus className="w-4 h-4 text-muted-foreground animate-pulse" />
                      ) : (
                        <Minus className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <div className="font-mono font-bold text-foreground">{stock.symbol}</div>
                      {stock.company_name && (
                        <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {stock.company_name}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-medium bg-muted/50 w-fit">
                    <span className="mr-1 text-muted-foreground">{currencySymbol}</span>
                    {market}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {pricesLoading ? (
                    <Skeleton className="h-5 w-20 ml-auto" />
                  ) : price ? (
                    <div className="flex flex-col items-end">
                      <span className="font-semibold tabular-nums text-foreground">
                        {currencySymbol}{formatNumber(price.price, market)}
                      </span>
                      {isMarketClosed && price.lastUpdated && (
                        <span className="text-xs text-muted-foreground">
                          {formatLastUpdated(price.lastUpdated)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-sm">—</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {pricesLoading ? (
                    <Skeleton className="h-5 w-24 ml-auto" />
                  ) : price ? (
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-sm font-medium",
                      isPositive ? "text-success bg-success/10" : 
                      isNegative ? "text-destructive bg-destructive/10" : 
                      "text-muted-foreground bg-muted"
                    )}>
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : isNegative ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : null}
                      <span className="tabular-nums">
                        {isPositive ? '+' : ''}{price.change.toFixed(2)}
                      </span>
                      <span className="tabular-nums text-xs opacity-80">
                        ({isPositive ? '+' : ''}{price.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {pricesLoading ? (
                    <Skeleton className="h-5 w-16 mx-auto" />
                  ) : price?.isMarketClosed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex flex-col items-center gap-0.5 cursor-help">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning/10 text-warning">
                            <Clock className="w-3 h-3" />
                            Closed
                          </div>
                          {price.lastUpdated && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatTime(price.lastUpdated)}
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Market closed • Last trade: {price.lastUpdated ? new Date(price.lastUpdated).toLocaleString() : 'N/A'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : price ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success/10 text-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Live
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit?.(stock)}
                        className="h-8 w-8 hover:bg-primary/10"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {stock.symbol}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove {stock.symbol} from your watchlist. This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDelete?.(stock.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
