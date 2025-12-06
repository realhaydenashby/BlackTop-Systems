import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface MonthRow {
  month: Date;
  isActual: boolean;
  revenue: number;
  cogs: number;
  grossMargin: number;
  opexSoftware: number;
  opexPayroll: number;
  opexMarketing: number;
  opexOther: number;
  totalOpex: number;
  netCash: number;
  runway: number | null;
}

interface ForecastChartsProps {
  rows: MonthRow[];
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

const CustomTooltip = ({ active, payload, label, metricName }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0]?.value || 0;
    const isActual = payload[0]?.payload?.isActual;

    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3">
        <p className="font-medium mb-1">{label}</p>
        <div className="text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{metricName}:</span>
            <span className="font-medium">{formatCurrency(value)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isActual ? "Actual" : "Projected"}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export function ForecastCharts({ rows }: ForecastChartsProps) {
  const sortedRows = [...rows].sort((a, b) => a.month.getTime() - b.month.getTime());

  const chartData = sortedRows.map((row) => {
    const totalExpenses = row.cogs + row.totalOpex;
    const profit = row.revenue - totalExpenses;
    
    return {
      month: format(row.month, "MMM yyyy"),
      monthDate: row.month,
      isActual: row.isActual,
      revenue: row.revenue,
      expenses: totalExpenses,
      profit: profit,
    };
  });

  const actualCount = chartData.filter(d => d.isActual).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis 
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <RechartsTooltip content={<CustomTooltip metricName="Revenue" />} />
                {actualCount > 0 && actualCount < chartData.length && (
                  <ReferenceLine
                    x={chartData[actualCount - 1]?.month}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--chart-2))"
                  fill="url(#revenueGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis 
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <RechartsTooltip content={<CustomTooltip metricName="Expenses" />} />
                {actualCount > 0 && actualCount < chartData.length && (
                  <ReferenceLine
                    x={chartData[actualCount - 1]?.month}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="hsl(var(--chart-5))"
                  fill="url(#expensesGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-primary" />
            Profit / Loss
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitGradientPositive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGradientNegative" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis 
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <RechartsTooltip content={<CustomTooltip metricName="Profit" />} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                {actualCount > 0 && actualCount < chartData.length && (
                  <ReferenceLine
                    x={chartData[actualCount - 1]?.month}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="hsl(var(--primary))"
                  fill="url(#profitGradientPositive)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
