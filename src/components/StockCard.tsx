import { useState } from "react";
import { WatchlistItem } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateStock, useDeleteStock } from "@/hooks/useWatchlist";
import { Pencil, Trash2, X, Check, TrendingUp } from "lucide-react";
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

interface StockCardProps {
  stock: WatchlistItem;
  readOnly?: boolean;
}

export function StockCard({ stock, readOnly = false }: StockCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    symbol: stock.symbol,
    company_name: stock.company_name || "",
    notes: stock.notes || "",
    target_price: stock.target_price?.toString() || "",
  });

  const updateStock = useUpdateStock();
  const deleteStock = useDeleteStock();

  const handleSave = () => {
    updateStock.mutate(
      {
        id: stock.id,
        symbol: editData.symbol,
        company_name: editData.company_name || undefined,
        notes: editData.notes || undefined,
        target_price: editData.target_price
          ? parseFloat(editData.target_price)
          : null,
      },
      {
        onSuccess: () => setIsEditing(false),
      }
    );
  };

  const handleCancel = () => {
    setEditData({
      symbol: stock.symbol,
      company_name: stock.company_name || "",
      notes: stock.notes || "",
      target_price: stock.target_price?.toString() || "",
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Card className="p-6 glass-card animate-fade-in">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Symbol
              </label>
              <Input
                value={editData.symbol}
                onChange={(e) =>
                  setEditData({ ...editData, symbol: e.target.value })
                }
                className="font-mono uppercase"
                placeholder="AAPL"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Target Price
              </label>
              <Input
                type="number"
                step="0.01"
                value={editData.target_price}
                onChange={(e) =>
                  setEditData({ ...editData, target_price: e.target.value })
                }
                placeholder="150.00"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Company Name
            </label>
            <Input
              value={editData.company_name}
              onChange={(e) =>
                setEditData({ ...editData, company_name: e.target.value })
              }
              placeholder="Apple Inc."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Notes
            </label>
            <Textarea
              value={editData.notes}
              onChange={(e) =>
                setEditData({ ...editData, notes: e.target.value })
              }
              placeholder="Your investment thesis..."
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateStock.isPending}
            >
              <Check className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-card hover:border-primary/30 transition-all duration-300 animate-fade-in group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-lg tracking-wide">
                {stock.symbol}
              </h3>
              {stock.company_name && (
                <p className="text-sm text-muted-foreground truncate">
                  {stock.company_name}
                </p>
              )}
            </div>
          </div>

          {stock.target_price && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-sm font-medium">
              Target: ${stock.target_price.toFixed(2)}
            </div>
          )}

          {stock.notes && (
            <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
              {stock.notes}
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsEditing(true)}
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
                    onClick={() => deleteStock.mutate(stock.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </Card>
  );
}
