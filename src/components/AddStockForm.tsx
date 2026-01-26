import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAddStock } from "@/hooks/useWatchlist";
import { MarketSelector } from "@/components/MarketSelector";
import { StockSearchInput } from "@/components/StockSearchInput";
import { StockSearchResult } from "@/hooks/useStockSearch";
import { Plus, X } from "lucide-react";

export function AddStockForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [market, setMarket] = useState("NYSE");
  const [formData, setFormData] = useState({
    symbol: "",
    company_name: "",
    notes: "",
    target_price: "",
  });

  const addStock = useAddStock();

  const handleStockSelect = (result: StockSearchResult) => {
    setFormData({
      ...formData,
      symbol: result.symbol,
      company_name: result.name,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.symbol.trim()) return;

    addStock.mutate(
      {
        symbol: formData.symbol.trim(),
        company_name: formData.company_name.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        target_price: formData.target_price
          ? parseFloat(formData.target_price)
          : undefined,
        market,
      },
      {
        onSuccess: () => {
          setFormData({ symbol: "", company_name: "", notes: "", target_price: "" });
          setMarket("NYSE");
          setIsOpen(false);
        },
      }
    );
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="gradient-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Stock
      </Button>
    );
  }

  return (
    <Card className="p-6 glass-card animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Add to Watchlist</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Market *
            </label>
            <MarketSelector value={market} onChange={setMarket} />
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
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1 block">
            Stock Symbol *
          </label>
          <StockSearchInput
            market={market}
            value={formData.symbol}
            onChange={(value) => setFormData({ ...formData, symbol: value })}
            onSelect={handleStockSelect}
            placeholder="Search by symbol or name..."
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

        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={addStock.isPending}>
            {addStock.isPending ? "Adding..." : "Add Stock"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
