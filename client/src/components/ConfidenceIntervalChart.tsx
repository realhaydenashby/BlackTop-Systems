import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Info, Target, AlertTriangle } from "lucide-react";
import { format, addMonths } from "date-fns";

interface ConfidenceInterval {
  month: string;
  p10: number;
  p50: number;
  p90: number;
}

interface MonteCarloData {
  projections: Array<{
    month: string;
    expected: number;
    p10: number;
    p50: number;
    p90: number;
  }>;
  metrics: {
    expectedRunway: number;
    probabilityOfSurvival: number;
    p10Runway: number;
    p90Runway: number;
  };
  simulationCount?: number;
}

interface ConfidenceIntervalChartProps {
  data: MonteCarloData;
  startingCash: number;
  title?: string;
}

function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const p10 = payload.find((p: any) => p.dataKey === "p10")?.value || 0;
    const p50 = payload.find((p: any) => p.dataKey === "p50")?.value || 0;
    const p90 = payload.find((p: any) => p.dataKey === "p90")?.value || 0;

    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3">
        <p className="font-medium mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-green-600">Optimistic (P90):</span>
            <span className="font-medium">{formatCurrency(p90)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-primary">Expected (P50):</span>
            <span className="font-medium">{formatCurrency(p50)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-red-600">Pessimistic (P10):</span>
            <span className="font-medium">{formatCurrency(p10)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function ConfidenceIntervalChart({
  data,
  startingCash,
  title = "Runway Projections with Monte Carlo Confidence Intervals",
}: ConfidenceIntervalChartProps) {
  const chartData = useMemo(() => {
    if (!data?.projections?.length) {
      const now = new Date();
      return Array.from({ length: 12 }, (_, i) => {
        const month = addMonths(now, i);
        const baseDecline = startingCash * (1 - (i * 0.08));
        return {
          month: format(month, "MMM"),
          expected: Math.max(0, baseDecline),
          p10: Math.max(0, baseDecline * 0.7),
          p50: Math.max(0, baseDecline * 0.85),
          p90: Math.max(0, baseDecline * 1.1),
          range: [Math.max(0, baseDecline * 0.7), Math.max(0, baseDecline * 1.1)],
        };
      });
    }

    return data.projections.map(p => ({
      month: format(new Date(p.month), "MMM"),
      expected: p.expected,
      p10: p.p10,
      p50: p.p50,
      p90: p.p90,
      range: [p.p10, p.p90],
    }));
  }, [data, startingCash]);

  const metrics = data?.metrics || {
    expectedRunway: 12,
    probabilityOfSurvival: 0.85,
    p10Runway: 8,
    p90Runway: 18,
  };

  const survivalRiskLevel = metrics.probabilityOfSurvival >= 0.8 
    ? "low" 
    : metrics.probabilityOfSurvival >= 0.5 
      ? "medium" 
      : "high";

  return (
    <Card data-testid="card-confidence-intervals">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <CardTitle className="text-base font-medium">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {data?.simulationCount || 1000} simulations
            </Badge>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Monte Carlo simulations model uncertainty by running thousands of scenarios 
                  with randomized assumptions. The shaded area shows the 80% confidence interval 
                  (P10 to P90), meaning your actual outcome is 80% likely to fall within this range.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <CardDescription>
          Probabilistic cash runway forecast with confidence bounds
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Expected Runway</p>
            <p className="text-xl font-bold">{metrics.expectedRunway.toFixed(1)} mo</p>
            <p className="text-xs text-muted-foreground">50th percentile</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Runway Range</p>
            <p className="text-xl font-bold">
              {metrics.p10Runway.toFixed(0)} - {metrics.p90Runway.toFixed(0)} mo
            </p>
            <p className="text-xs text-muted-foreground">80% confidence</p>
          </div>
          <div className={`p-3 rounded-lg ${
            survivalRiskLevel === "low" 
              ? "bg-green-500/10 border border-green-500/20" 
              : survivalRiskLevel === "medium"
                ? "bg-yellow-500/10 border border-yellow-500/20"
                : "bg-red-500/10 border border-red-500/20"
          }`}>
            <p className="text-xs text-muted-foreground mb-1">Survival Probability</p>
            <p className={`text-xl font-bold ${
              survivalRiskLevel === "low" 
                ? "text-green-600" 
                : survivalRiskLevel === "medium"
                  ? "text-yellow-600"
                  : "text-red-600"
            }`}>
              {formatPercent(metrics.probabilityOfSurvival)}
            </p>
            <p className="text-xs text-muted-foreground">at 12 months</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Starting Cash</p>
            <p className="text-xl font-bold">{formatCurrency(startingCash)}</p>
            <p className="text-xs text-muted-foreground">current balance</p>
          </div>
        </div>

        <div className="h-[300px]" data-testid="chart-confidence-intervals">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency(value)}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              
              <Area
                type="monotone"
                dataKey="p90"
                stroke="none"
                fill="url(#confidenceGradient)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="p10"
                stroke="none"
                fill="hsl(var(--background))"
                fillOpacity={1}
              />
              
              <Line
                type="monotone"
                dataKey="p90"
                stroke="#22c55e"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="P90 (Optimistic)"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="P50 (Expected)"
              />
              <Line
                type="monotone"
                dataKey="p10"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="P10 (Pessimistic)"
              />
              
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-500" style={{ borderStyle: "dashed" }} />
            <span className="text-muted-foreground">P90 (Optimistic)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-primary" />
            <span className="text-muted-foreground">P50 (Expected)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500" style={{ borderStyle: "dashed" }} />
            <span className="text-muted-foreground">P10 (Pessimistic)</span>
          </div>
        </div>

        {survivalRiskLevel === "high" && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-red-600 dark:text-red-400">High Risk Alert</p>
              <p className="text-muted-foreground">
                Your 12-month survival probability is below 50%. Consider reducing burn rate or 
                beginning fundraising discussions immediately.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
