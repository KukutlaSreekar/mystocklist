import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MARKETS } from "@/lib/marketConfig";

interface MarketSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const marketGroups = [
  { label: "North America", markets: ["NYSE", "NASDAQ", "TSX"] },
  { label: "Europe", markets: ["LSE", "XETRA", "EURONEXT", "SIX"] },
  { label: "Asia Pacific", markets: ["NSE", "BSE", "TSE", "HKEX", "SSE", "SZSE", "KRX", "ASX", "SGX"] },
  { label: "Other", markets: ["B3", "JSE", "MOEX", "TADAWUL"] },
];

export function MarketSelector({ value, onChange }: MarketSelectorProps) {
  const selectedMarket = MARKETS.find(m => m.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] bg-card">
        <SelectValue placeholder="Market">
          {selectedMarket && (
            <span className="flex items-center gap-2">
              <span className="font-semibold">{selectedMarket.label}</span>
              <span className="text-muted-foreground text-xs">
                ({selectedMarket.currencySymbol})
              </span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover border border-border max-h-[300px]">
        {marketGroups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
              {group.label}
            </SelectLabel>
            {group.markets.map((marketValue) => {
              const market = MARKETS.find((m) => m.value === marketValue);
              if (!market) return null;
              return (
                <SelectItem key={market.value} value={market.value}>
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span className="font-medium">{market.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {market.currencySymbol}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
