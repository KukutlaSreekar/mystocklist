import { StockPrice } from "@/hooks/useStockPrices";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceDisplayProps {
  price: StockPrice | undefined;
  isLoading?: boolean;
  compact?: boolean;
}

export function PriceDisplay({ price, isLoading, compact = false }: PriceDisplayProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-5 w-16 bg-muted animate-pulse rounded" />
        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!price) {
    return (
      <span className="text-sm text-muted-foreground">
        Price unavailable
      </span>
    );
  }

  const isPositive = price.change > 0;
  const isNegative = price.change < 0;
  const isNeutral = price.change === 0;

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  
  const changeColor = cn(
    isPositive && "text-success",
    isNegative && "text-destructive",
    isNeutral && "text-muted-foreground"
  );

  const bgColor = cn(
    isPositive && "bg-success/10",
    isNegative && "bg-destructive/10",
    isNeutral && "bg-muted"
  );

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-semibold tabular-nums">
          ${price.price.toFixed(2)}
        </span>
        <div className={cn("flex items-center gap-1 text-xs", changeColor)}>
          <Icon className="w-3 h-3" />
          <span className="tabular-nums">
            {isPositive ? "+" : ""}{price.change.toFixed(2)} ({isPositive ? "+" : ""}{price.changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-lg font-bold tabular-nums">
        ${price.price.toFixed(2)}
      </span>
      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-sm", bgColor, changeColor)}>
        <Icon className="w-3.5 h-3.5" />
        <span className="font-medium tabular-nums">
          {isPositive ? "+" : ""}{price.change.toFixed(2)}
        </span>
        <span className="tabular-nums">
          ({isPositive ? "+" : ""}{price.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
