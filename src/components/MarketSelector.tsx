import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MARKETS = [
  { value: "NYSE", label: "NYSE", description: "New York Stock Exchange" },
  { value: "NASDAQ", label: "NASDAQ", description: "NASDAQ" },
  { value: "NSE", label: "NSE", description: "National Stock Exchange (India)" },
];

interface MarketSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarketSelector({ value, onChange }: MarketSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Market" />
      </SelectTrigger>
      <SelectContent className="bg-popover border border-border">
        {MARKETS.map((market) => (
          <SelectItem key={market.value} value={market.value}>
            <span className="font-medium">{market.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
