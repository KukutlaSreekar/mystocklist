import { useState, useMemo, useCallback } from "react";
import { WatchlistItem } from "@/lib/supabase";
import { StockPrice } from "@/hooks/useStockPrices";
import { PieChart, Pie, Cell, ResponsiveContainer, Sector, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, PieChart as PieChartIcon, Building2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PortfolioAllocationProps {
  watchlist: WatchlistItem[];
  prices: Record<string, StockPrice>;
  onFilterChange?: (filter: { type: 'sector' | 'marketCap'; value: string } | null) => void;
  isEnriching?: boolean;
  missingPercent?: number;
}

// Color palette for charts - TradingView inspired
const SECTOR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210, 70%, 55%)",
  "hsl(280, 65%, 55%)",
  "hsl(30, 80%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(350, 65%, 55%)",
  "hsl(120, 50%, 45%)",
  "hsl(45, 75%, 50%)",
];

const MARKET_CAP_COLORS = {
  "Large Cap": "hsl(210, 70%, 55%)",
  "Mid Cap": "hsl(160, 60%, 45%)",
  "Small Cap": "hsl(30, 80%, 55%)",
  "Unknown": "hsl(var(--muted-foreground))",
};

// Fallback sector for stocks without any metadata
const FALLBACK_SECTOR = 'Other';

interface ChartDataItem {
  name: string;
  value: number;
  stocks: WatchlistItem[];
  color: string;
}

// Custom active shape for hover effect
const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value
  } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 16}
        fill={fill}
        opacity={0.3}
      />
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fill="hsl(var(--foreground))"
        className="text-sm font-semibold"
      >
        {payload.name}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fill="hsl(var(--muted-foreground))"
        className="text-xs"
      >
        {value} stocks ({(percent * 100).toFixed(1)}%)
      </text>
    </g>
  );
};

// Custom tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        <p className="font-semibold text-foreground mb-1">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          {data.value} stock{data.value !== 1 ? 's' : ''} • {((data.value / data.total) * 100).toFixed(1)}%
        </p>
      </div>
    );
  }
  return null;
};

export function PortfolioAllocation({ watchlist, prices, onFilterChange, isEnriching, missingPercent }: PortfolioAllocationProps) {
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | undefined>(undefined);
  const [activeCapIndex, setActiveCapIndex] = useState<number | undefined>(undefined);
  const [drillDownData, setDrillDownData] = useState<{ type: string; name: string; stocks: WatchlistItem[] } | null>(null);

  // Truthful rendering: if >20% stocks lack metadata and still enriching, show syncing state
  const showSyncingState = isEnriching && (missingPercent ?? 0) > 20;

  // Calculate sector allocation
  const sectorData = useMemo<ChartDataItem[]>(() => {
    const sectorMap = new Map<string, WatchlistItem[]>();
    
    watchlist.forEach(stock => {
      // Use enriched sector data, fallback to 'Other' only if missing
      const sector = stock.sector || FALLBACK_SECTOR;
      const existing = sectorMap.get(sector) || [];
      sectorMap.set(sector, [...existing, stock]);
    });

    const data: ChartDataItem[] = [];
    let colorIndex = 0;
    
    // Sort by count descending
    const sortedEntries = Array.from(sectorMap.entries()).sort((a, b) => b[1].length - a[1].length);
    
    sortedEntries.forEach(([sector, stocks]) => {
      data.push({
        name: sector,
        value: stocks.length,
        stocks,
        color: SECTOR_COLORS[colorIndex % SECTOR_COLORS.length],
      });
      colorIndex++;
    });

    return data;
  }, [watchlist]);

  // Calculate market cap allocation
  const marketCapData = useMemo<ChartDataItem[]>(() => {
    const capMap = new Map<string, WatchlistItem[]>();
    
    watchlist.forEach(stock => {
      const category = stock.market_cap_category || 'Unknown';
      const existing = capMap.get(category) || [];
      capMap.set(category, [...existing, stock]);
    });

    const data: ChartDataItem[] = [];
    const order = ['Large Cap', 'Mid Cap', 'Small Cap', 'Unknown'];
    
    order.forEach(cap => {
      const stocks = capMap.get(cap);
      if (stocks && stocks.length > 0) {
        data.push({
          name: cap,
          value: stocks.length,
          stocks,
          color: MARKET_CAP_COLORS[cap as keyof typeof MARKET_CAP_COLORS],
        });
      }
    });

    return data;
  }, [watchlist]);

  const handleSectorClick = useCallback((data: ChartDataItem, index: number) => {
    setDrillDownData({
      type: 'Sector',
      name: data.name,
      stocks: data.stocks,
    });
  }, []);

  const handleCapClick = useCallback((data: ChartDataItem, index: number) => {
    setDrillDownData({
      type: 'Market Cap',
      name: data.name,
      stocks: data.stocks,
    });
  }, []);

  const handleFilterApply = useCallback(() => {
    if (drillDownData && onFilterChange) {
      onFilterChange({
        type: drillDownData.type === 'Sector' ? 'sector' : 'marketCap',
        value: drillDownData.name,
      });
    }
    setDrillDownData(null);
  }, [drillDownData, onFilterChange]);

  if (watchlist.length === 0) return null;

  if (showSyncingState) {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <Card key={i} className="border-border bg-card overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center h-[300px] gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm text-muted-foreground font-medium">Metadata syncing…</p>
              <p className="text-xs text-muted-foreground">Fetching sector &amp; market cap data from Yahoo Finance</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalStocks = watchlist.length;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Sector Allocation */}
        <Card className="border-border bg-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Sector Allocation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {sectorData.length > 0 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      activeIndex={activeSectorIndex}
                      activeShape={renderActiveShape}
                      data={sectorData.map(d => ({ ...d, total: totalStocks }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                      onMouseEnter={(_, index) => setActiveSectorIndex(index)}
                      onMouseLeave={() => setActiveSectorIndex(undefined)}
                      onClick={(data, index) => handleSectorClick(data, index)}
                      style={{ cursor: 'pointer' }}
                    >
                      {sectorData.map((entry, index) => (
                        <Cell 
                          key={`sector-${index}`} 
                          fill={entry.color}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No sector data available
              </div>
            )}
            
            {/* Legend */}
            <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
              {sectorData.slice(0, 6).map((entry, index) => (
                <button
                  key={entry.name}
                  onClick={() => handleSectorClick(entry, index)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all",
                    "hover:bg-muted/50 cursor-pointer",
                    activeSectorIndex === index && "bg-muted"
                  )}
                  onMouseEnter={() => setActiveSectorIndex(index)}
                  onMouseLeave={() => setActiveSectorIndex(undefined)}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-sm shrink-0" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground truncate max-w-[80px]">
                    {entry.name}
                  </span>
                  <span className="text-foreground font-medium">{entry.value}</span>
                </button>
              ))}
              {sectorData.length > 6 && (
                <Badge variant="secondary" className="text-xs">
                  +{sectorData.length - 6} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Market Cap Allocation */}
        <Card className="border-border bg-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Market Cap Allocation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {marketCapData.length > 0 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      activeIndex={activeCapIndex}
                      activeShape={renderActiveShape}
                      data={marketCapData.map(d => ({ ...d, total: totalStocks }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                      onMouseEnter={(_, index) => setActiveCapIndex(index)}
                      onMouseLeave={() => setActiveCapIndex(undefined)}
                      onClick={(data, index) => handleCapClick(data, index)}
                      style={{ cursor: 'pointer' }}
                    >
                      {marketCapData.map((entry, index) => (
                        <Cell 
                          key={`cap-${index}`} 
                          fill={entry.color}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No market cap data available
              </div>
            )}
            
            {/* Legend */}
            <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
              {marketCapData.map((entry, index) => (
                <button
                  key={entry.name}
                  onClick={() => handleCapClick(entry, index)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all",
                    "hover:bg-muted/50 cursor-pointer",
                    activeCapIndex === index && "bg-muted"
                  )}
                  onMouseEnter={() => setActiveCapIndex(index)}
                  onMouseLeave={() => setActiveCapIndex(undefined)}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-sm shrink-0" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="text-foreground font-medium">{entry.value}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Drill-down Dialog */}
      <Dialog open={!!drillDownData} onOpenChange={(open) => !open && setDrillDownData(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-primary" />
              {drillDownData?.type}: {drillDownData?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {drillDownData?.stocks.length} stock{drillDownData?.stocks.length !== 1 ? 's' : ''} in this category
            </p>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {drillDownData?.stocks.map(stock => (
                <div 
                  key={stock.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <span className="font-mono font-bold text-foreground">{stock.symbol}</span>
                    {stock.company_name && (
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {stock.company_name}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {stock.market || 'NYSE'}
                  </Badge>
                </div>
              ))}
            </div>
            {onFilterChange && (
              <Button 
                onClick={handleFilterApply}
                className="w-full"
                variant="default"
              >
                Filter Watchlist to {drillDownData?.name}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
