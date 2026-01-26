import { useState, useEffect } from "react";
import { WatchlistItem } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MarketSelector } from "@/components/MarketSelector";

interface StockEditDialogProps {
  stock: WatchlistItem | null;
  onClose: () => void;
  onSave: (data: {
    symbol: string;
    company_name?: string;
    notes?: string;
    target_price?: number | null;
    market: string;
  }) => void;
  isLoading: boolean;
}

export function StockEditDialog({
  stock,
  onClose,
  onSave,
  isLoading,
}: StockEditDialogProps) {
  const [formData, setFormData] = useState({
    symbol: "",
    company_name: "",
    notes: "",
    target_price: "",
    market: "NYSE",
  });

  useEffect(() => {
    if (stock) {
      setFormData({
        symbol: stock.symbol,
        company_name: stock.company_name || "",
        notes: stock.notes || "",
        target_price: stock.target_price?.toString() || "",
        market: stock.market || "NYSE",
      });
    }
  }, [stock]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      symbol: formData.symbol,
      company_name: formData.company_name || undefined,
      notes: formData.notes || undefined,
      target_price: formData.target_price
        ? parseFloat(formData.target_price)
        : null,
      market: formData.market,
    });
  };

  return (
    <Dialog open={!!stock} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Symbol
              </label>
              <Input
                value={formData.symbol}
                onChange={(e) =>
                  setFormData({ ...formData, symbol: e.target.value })
                }
                className="font-mono uppercase"
                placeholder="AAPL"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Market
              </label>
              <MarketSelector
                value={formData.market}
                onChange={(value) => setFormData({ ...formData, market: value })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Target Price
            </label>
            <Input
              type="number"
              step="0.01"
              value={formData.target_price}
              onChange={(e) =>
                setFormData({ ...formData, target_price: e.target.value })
              }
              placeholder="150.00"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Company Name
            </label>
            <Input
              value={formData.company_name}
              onChange={(e) =>
                setFormData({ ...formData, company_name: e.target.value })
              }
              placeholder="Apple Inc."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Notes
            </label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Your investment thesis..."
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
