import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface DemoDataPoint {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  isHistorical?: boolean;
  isPartial?: boolean;
}

interface ForecastChartsProps {
  rows?: MonthRow[];
  demoData?: {
    historicalData?: DemoDataPoint[];
    currentMonth?: DemoDataPoint;
    forecast30Days?: DemoDataPoint[];
    forecast90Days?: DemoDataPoint[];
    forecast6Months?: DemoDataPoint[];
  };
}

type TimeRange = "30d" | "90d" | "6m";

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
    const dataPoint = payload[0]?.payload;
    const value = dataPoint?.[metricName.toLowerCase()] || payload[0]?.value || 0;
    const isActual = dataPoint?.isActual;

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

interface ChartCardProps {
  title: string;
  icon: React.ReactNode;
  dataKey: string;
  gradientId: string;
  strokeColor: string;
  chartData: any[];
  actualCount: number;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  showZeroLine?: boolean;
}

function ChartCard({
  title,
  icon,
  dataKey,
  gradientId,
  strokeColor,
  chartData,
  actualCount,
  timeRange,
  onTimeRangeChange,
  showZeroLine = false,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
            <SelectTrigger className="w-[100px] h-8" data-testid={`select-timerange-${dataKey}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">30 Day</SelectItem>
              <SelectItem value="90d">90 Day</SelectItem>
              <SelectItem value="6m">6 Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`${gradientId}-actual`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`${gradientId}-projected`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickFormatter={(v) => formatCurrency(v)}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={65}
              />
              <RechartsTooltip content={<CustomTooltip metricName={title} />} />
              {showZeroLine && (
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
              )}
              {actualCount > 0 && actualCount < chartData.length && (
                <ReferenceLine
                  x={chartData[actualCount - 1]?.month}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  label={{ value: "Now", position: "top", fontSize: 11 }}
                />
              )}
              <Area
                type="monotone"
                dataKey={`${dataKey}Actual`}
                stroke={strokeColor}
                fill={`url(#${gradientId}-actual)`}
                strokeWidth={2}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey={`${dataKey}Projected`}
                stroke={strokeColor}
                fill={`url(#${gradientId}-projected)`}
                strokeWidth={2}
                strokeDasharray="5 5"
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ForecastCharts({ rows, demoData }: ForecastChartsProps) {
  const [revenueRange, setRevenueRange] = useState<TimeRange>("6m");
  const [expensesRange, setExpensesRange] = useState<TimeRange>("6m");
  const [profitRange, setProfitRange] = useState<TimeRange>("6m");

  const getChartData = (timeRange: TimeRange) => {
    if (rows && rows.length > 0) {
      const sortedRows = [...rows].sort((a, b) => a.month.getTime() - b.month.getTime());
      
      const forecastMonths = timeRange === "30d" ? 1 : timeRange === "90d" ? 3 : 6;
      const actualRows = sortedRows.filter(r => r.isActual);
      const projectedRows = sortedRows.filter(r => !r.isActual).slice(0, forecastMonths);
      const filteredRows = [...actualRows, ...projectedRows];
      
      const chartData = filteredRows.map((row, index, arr) => {
        const totalExpenses = row.cogs + row.totalOpex;
        const profit = row.revenue - totalExpenses;
        const isLastActual = row.isActual && index < arr.length - 1 && !arr[index + 1].isActual;

        return {
          month: format(row.month, "MMM yyyy"),
          monthDate: row.month,
          isActual: row.isActual,
          revenue: row.revenue,
          expenses: totalExpenses,
          profit: profit,
          revenueActual: row.isActual ? row.revenue : null,
          revenueProjected: !row.isActual || isLastActual ? row.revenue : null,
          expensesActual: row.isActual ? totalExpenses : null,
          expensesProjected: !row.isActual || isLastActual ? totalExpenses : null,
          profitActual: row.isActual ? profit : null,
          profitProjected: !row.isActual || isLastActual ? profit : null,
        };
      });

      return chartData;
    }

    if (demoData) {
      const { historicalData = [], currentMonth, forecast30Days = [], forecast90Days = [], forecast6Months = [] } = demoData;

      const historical: DemoDataPoint[] = [
        ...historicalData.map(d => ({ ...d, isHistorical: true })),
        ...(currentMonth ? [{ ...currentMonth, isHistorical: true }] : []),
      ];

      const forecastData = timeRange === "30d" ? forecast30Days
        : timeRange === "90d" ? forecast90Days
        : forecast6Months;

      const allData = [...historical, ...forecastData];

      const chartData = allData.map((item, index, arr) => {
        const isActual = item.isHistorical === true;
        const isLastActual = isActual && index < arr.length - 1 && arr[index + 1].isHistorical !== true;

        return {
          month: item.month,
          isActual,
          revenue: item.revenue,
          expenses: item.expenses,
          profit: item.profit,
          revenueActual: isActual ? item.revenue : null,
          revenueProjected: !isActual || isLastActual ? item.revenue : null,
          expensesActual: isActual ? item.expenses : null,
          expensesProjected: !isActual || isLastActual ? item.expenses : null,
          profitActual: isActual ? item.profit : null,
          profitProjected: !isActual || isLastActual ? item.profit : null,
        };
      });

      return chartData;
    }

    return [];
  };

  const getActualCount = (chartData: any[]) => {
    return chartData.filter(d => d.isActual).length;
  };

  const revenueData = getChartData(revenueRange);
  const expensesData = getChartData(expensesRange);
  const profitData = getChartData(profitRange);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <ChartCard
        title="Revenue"
        icon={<TrendingUp className="h-4 w-4 text-green-500" />}
        dataKey="revenue"
        gradientId="revenueGradient"
        strokeColor="hsl(var(--chart-2))"
        chartData={revenueData}
        actualCount={getActualCount(revenueData)}
        timeRange={revenueRange}
        onTimeRangeChange={setRevenueRange}
      />

      <ChartCard
        title="Expenses"
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        dataKey="expenses"
        gradientId="expensesGradient"
        strokeColor="hsl(var(--chart-5))"
        chartData={expensesData}
        actualCount={getActualCount(expensesData)}
        timeRange={expensesRange}
        onTimeRangeChange={setExpensesRange}
      />

      <ChartCard
        title="Profit / Loss"
        icon={<DollarSign className="h-4 w-4 text-primary" />}
        dataKey="profit"
        gradientId="profitGradient"
        strokeColor="hsl(var(--primary))"
        chartData={profitData}
        actualCount={getActualCount(profitData)}
        timeRange={profitRange}
        onTimeRangeChange={setProfitRange}
        showZeroLine
      />
    </div>
  );
}
