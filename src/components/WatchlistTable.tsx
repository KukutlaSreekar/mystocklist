import { WatchlistItem } from "@/lib/supabase";
import { StockPrice } from "@/hooks/useStockPrices";
import { PriceDisplay } from "@/components/PriceDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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

interface WatchlistTableProps {
  watchlist: WatchlistItem[];
  prices: Record<string, StockPrice>;
  pricesLoading: boolean;
  readOnly?: boolean;
  onEdit?: (stock: WatchlistItem) => void;
  onDelete?: (id: string) => void;
}

export function WatchlistTable({
  watchlist,
  prices,
  pricesLoading,
  readOnly = false,
  onEdit,
  onDelete,
}: WatchlistTableProps) {
  if (watchlist.length === 0) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-border">
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
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="font-semibold">Stock</TableHead>
            <TableHead className="font-semibold">Market</TableHead>
            <TableHead className="font-semibold text-right">Price</TableHead>
            <TableHead className="font-semibold text-right">Change</TableHead>
            {!readOnly && <TableHead className="w-[100px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {watchlist.map((stock) => {
            const price = prices[stock.symbol];
            const isPositive = price?.change > 0;
            const isNegative = price?.change < 0;

            return (
              <TableRow key={stock.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-mono font-bold">{stock.symbol}</div>
                      {stock.company_name && (
                        <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {stock.company_name}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-medium">
                    {stock.market || 'NYSE'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {pricesLoading ? (
                    <Skeleton className="h-5 w-20 ml-auto" />
                  ) : price ? (
                    <span className="font-semibold tabular-nums">
                      ${price.price.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {pricesLoading ? (
                    <Skeleton className="h-5 w-24 ml-auto" />
                  ) : price ? (
                    <div className={`flex items-center justify-end gap-1 text-sm font-medium ${
                      isPositive ? 'text-success' : isNegative ? 'text-destructive' : 'text-muted-foreground'
                    }`}>
                      <span className="tabular-nums">
                        {isPositive ? '+' : ''}{price.change.toFixed(2)}
                      </span>
                      <span className="tabular-nums">
                        ({isPositive ? '+' : ''}{price.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit?.(stock)}
                        className="h-8 w-8"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
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
