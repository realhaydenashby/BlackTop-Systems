import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Clock,
  Target,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Building2,
  FileSpreadsheet,
  Calendar,
  Sparkles,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { format, parseISO, addMonths } from "date-fns";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface WeeklyChange {
  type: string;
  title: string;
  description: string;
  change: number;
  severity: "info" | "warning" | "success";
}

interface WeeklyChangesData {
  changes: WeeklyChange[];
  period: { start: string | null; end: string | null };
  stats?: {
    thisWeekSpend: number;
    lastWeekSpend: number;
    thisWeekRevenue: number;
    lastWeekRevenue: number;
    transactionCount: number;
  };
}

interface DashboardAnalytics {
  hasData: boolean;
  hasBankAccounts: boolean;
  spend: {
    total: number;
    trend: Array<{ month: string; amount: number }>;
    byCategory: Array<{ id: string; name: string; amount: number; color: string }>;
  };
  revenue: {
    total: number;
    trend: Array<{ month: string; amount: number }>;
  };
  burn: {
    gross: number;
    net: number;
    payroll: number;
    nonPayroll: number;
    recurring?: number;
    oneTime?: number;
  };
  runway: {
    months: number | null;
    currentCash: number;
    zeroDate: string | null;
    monthlyBurn: number;
  };
  cashFlow: {
    inflows: number;
    outflows: number;
    netFlow: number;
    trend: Array<{ month: string; inflows: number; outflows: number; netFlow: number }>;
  };
  insights: Array<{ type: string; message: string; severity: string }>;
  vendors: Array<{ name: string; amount: number }>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
  teal: "#14b8a6",
  pink: "#ec4899",
};

const CATEGORY_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.purple,
  CHART_COLORS.orange,
  CHART_COLORS.teal,
  CHART_COLORS.pink,
  CHART_COLORS.yellow,
];

function formatCompactCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function CashFlowChart({ data }: { data: Array<{ month: string; inflows: number; outflows: number; netFlow: number }> }) {
  if (!data || data.length === 0) return null;

  const chartData = data.map(d => ({
    month: format(parseISO(d.month), "MMM"),
    inflows: d.inflows,
    outflows: Math.abs(d.outflows),
    net: d.netFlow,
  }));

  return (
    <Card data-testid="chart-cash-flow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Cash Flow Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={0} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={formatCompactCurrency}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px"
                }}
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === "inflows" ? "Money In" : name === "outflows" ? "Money Out" : "Net"
                ]}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="inflows" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} name="inflows" />
              <Bar dataKey="outflows" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} name="outflows" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.green }} />
            <span className="text-muted-foreground">Money In</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.red }} />
            <span className="text-muted-foreground">Money Out</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BurnTrendChart({ data }: { data: Array<{ month: string; amount: number }> }) {
  if (!data || data.length === 0) return null;

  const chartData = data.map(d => ({
    month: format(parseISO(d.month), "MMM"),
    burn: d.amount,
  }));

  const avgBurn = chartData.reduce((sum, d) => sum + d.burn, 0) / chartData.length;

  return (
    <Card data-testid="chart-burn-trend">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          Monthly Burn Rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="burnGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.red} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={formatCompactCurrency}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px"
                }}
                formatter={(value: number) => [formatCurrency(value), "Monthly Burn"]}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <ReferenceLine 
                y={avgBurn} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                label={{ 
                  value: `Avg: ${formatCompactCurrency(avgBurn)}`, 
                  position: "right",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 11
                }}
              />
              <Area 
                type="monotone" 
                dataKey="burn" 
                stroke={CHART_COLORS.red}
                strokeWidth={2}
                fill="url(#burnGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryDonutChart({ data }: { data: Array<{ id: string; name: string; amount: number; color: string }> }) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const chartData = data.slice(0, 6).map((d, i) => ({
    name: d.name,
    value: d.amount,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    percent: total > 0 ? ((d.amount / total) * 100).toFixed(0) : 0,
  }));

  return (
    <Card data-testid="chart-category-breakdown">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <PieChartIcon className="h-4 w-4" />
          Spending by Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="h-[180px] w-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--popover))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "13px"
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Spend"]}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {chartData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }} 
                  />
                  <span className="text-muted-foreground truncate max-w-[100px]">{item.name}</span>
                </div>
                <span className="font-medium">{item.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RunwayProjectionChart({ 
  currentCash, 
  monthlyBurn, 
  runwayMonths 
}: { 
  currentCash: number; 
  monthlyBurn: number;
  runwayMonths: number | null;
}) {
  if (!currentCash || monthlyBurn <= 0) return null;

  const months = Math.min(runwayMonths || 24, 24);
  const chartData = [];
  let cash = currentCash;
  const now = new Date();

  for (let i = 0; i <= months; i++) {
    chartData.push({
      month: format(addMonths(now, i), "MMM yy"),
      cash: Math.max(0, cash),
      isNow: i === 0,
    });
    cash -= monthlyBurn;
  }

  const dangerThreshold = currentCash * 0.2;

  return (
    <Card data-testid="chart-runway-projection">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Runway Projection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="runwayGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tickFormatter={formatCompactCurrency}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px"
                }}
                formatter={(value: number) => [formatCurrency(value), "Projected Cash"]}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <ReferenceLine 
                y={dangerThreshold} 
                stroke={CHART_COLORS.yellow}
                strokeDasharray="5 5"
                label={{ 
                  value: "Danger Zone", 
                  position: "right",
                  fill: CHART_COLORS.yellow,
                  fontSize: 11
                }}
              />
              <ReferenceLine 
                y={0} 
                stroke={CHART_COLORS.red}
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="cash" 
                stroke={CHART_COLORS.blue}
                strokeWidth={2}
                fill="url(#runwayGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {runwayMonths && (
          <p className="text-center text-sm text-muted-foreground mt-2">
            At current burn rate, cash reaches zero in <span className="font-medium text-foreground">{runwayMonths.toFixed(1)} months</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  change,
  icon: Icon,
  trend,
  isLoading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card data-testid={`card-metric-${title.toLowerCase().replace(/\s/g, "-")}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-11 w-11 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`card-metric-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1" data-testid={`value-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {trend === "up" ? (
                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                ) : trend === "down" ? (
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                ) : null}
                <span
                  className={`text-sm ${
                    trend === "up"
                      ? "text-green-500"
                      : trend === "down"
                      ? "text-red-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatPercent(change)}
                </span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightCard({ insight }: { insight: { type: string; message: string; severity: string } }) {
  const severityColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-500 border-red-500/20",
    warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };

  return (
    <div
      className={`p-4 rounded-lg border ${severityColors[insight.severity] || severityColors.info}`}
      data-testid={`insight-${insight.type}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm">{insight.message}</p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between p-4 h-auto hover-elevate"
          data-testid={`section-trigger-${title.toLowerCase().replace(/\s/g, "-")}`}
        >
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5" />
            <span className="font-medium">{title}</span>
          </div>
          <ChevronDown
            className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmptyState() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Hero Section */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <CardContent className="pt-8 pb-8 relative">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Get Started in 60 Seconds</span>
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight">
              Your Financial Autopilot Awaits
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Connect your bank accounts or QuickBooks and we'll instantly build your complete 
              financial model — burn rate, runway, forecasts, and AI-powered insights. No spreadsheets. No setup.
            </p>
            
            <div className="flex items-center justify-center gap-4 pt-4">
              <Link href="/app/connect">
                <Button size="lg" className="h-12 px-8" data-testid="button-connect-accounts">
                  <Building2 className="h-5 w-5 mr-2" />
                  Connect Bank Accounts
                </Button>
              </Link>
              <Link href="/app/copilot">
                <Button size="lg" variant="outline" className="h-12 px-8" data-testid="button-talk-to-ai">
                  <Sparkles className="h-5 w-5 mr-2" />
                  Talk to AI Copilot
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What You'll Get */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <span className="font-medium">Runway</span>
            </div>
            <p className="text-2xl font-bold text-muted-foreground/50">—</p>
            <p className="text-xs text-muted-foreground mt-1">Auto-calculated from your data</p>
          </CardContent>
        </Card>
        
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-red-500/10">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <span className="font-medium">Monthly Burn</span>
            </div>
            <p className="text-2xl font-bold text-muted-foreground/50">—</p>
            <p className="text-xs text-muted-foreground mt-1">Gross & net burn breakdown</p>
          </CardContent>
        </Card>
        
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-blue-500/10">
                <Target className="h-5 w-5 text-blue-500" />
              </div>
              <span className="font-medium">12-Mo Forecast</span>
            </div>
            <p className="text-2xl font-bold text-muted-foreground/50">—</p>
            <p className="text-xs text-muted-foreground mt-1">AI-generated projections</p>
          </CardContent>
        </Card>
        
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-yellow-500/10">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <span className="font-medium">Insights</span>
            </div>
            <p className="text-2xl font-bold text-muted-foreground/50">—</p>
            <p className="text-xs text-muted-foreground mt-1">Proactive alerts & anomalies</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Starter Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            What Your AI Copilot Can Do
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-blue-600 dark:text-blue-400">Runway Planning</p>
                <p className="text-sm text-muted-foreground">
                  "How much runway do I have?" → Instant calculation based on your bank balance and burn rate
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-600 dark:text-green-400">Hiring Analysis</p>
                <p className="text-sm text-muted-foreground">
                  "What if I hire a $120k engineer?" → Full impact on burn, runway, and when to fundraise
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-yellow-600 dark:text-yellow-400">Anomaly Detection</p>
                <p className="text-sm text-muted-foreground">
                  Automatic alerts when vendors spike, burn accelerates, or unusual transactions appear
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Methods */}
      <Card>
        <CardHeader>
          <CardTitle>Connect Your Data Source</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/app/connect">
              <div className="p-6 rounded-lg border-2 border-dashed hover-elevate cursor-pointer transition-colors hover:border-primary/50">
                <Building2 className="h-8 w-8 text-muted-foreground mb-3" />
                <h4 className="font-semibold mb-1">Bank Accounts</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect 10,000+ banks via Yodlee. Transactions sync automatically.
                </p>
                <Badge variant="secondary">Recommended</Badge>
              </div>
            </Link>
            
            <Link href="/app/settings">
              <div className="p-6 rounded-lg border-2 border-dashed hover-elevate cursor-pointer transition-colors hover:border-primary/50">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground mb-3" />
                <h4 className="font-semibold mb-1">QuickBooks</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Sync categorized transactions, invoices, and vendor data.
                </p>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
            </Link>
            
            <Link href="/app/transactions">
              <div className="p-6 rounded-lg border-2 border-dashed hover-elevate cursor-pointer transition-colors hover:border-primary/50">
                <Calendar className="h-8 w-8 text-muted-foreground mb-3" />
                <h4 className="font-semibold mb-1">CSV Upload</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload bank statements or accounting exports manually.
                </p>
                <Badge variant="outline">Available</Badge>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Startup Finance Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Startup Finance Benchmarks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium mb-1">Healthy Runway</p>
              <p className="text-2xl font-bold">12-18 mo</p>
              <p className="text-xs text-muted-foreground">Standard for Series A</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium mb-1">Seed Burn Rate</p>
              <p className="text-2xl font-bold">$50-150k</p>
              <p className="text-xs text-muted-foreground">Per month typical</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium mb-1">Payroll %</p>
              <p className="text-2xl font-bold">60-80%</p>
              <p className="text-xs text-muted-foreground">Of total OpEx</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium mb-1">Start Fundraising</p>
              <p className="text-2xl font-bold">6-9 mo</p>
              <p className="text-xs text-muted-foreground">Before runway ends</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyChangesCard() {
  const { data: weeklyData, isLoading } = useQuery<WeeklyChangesData>({
    queryKey: ["/api/live/weekly-changes"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <CardTitle className="text-lg">What Changed This Week</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!weeklyData || weeklyData.changes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <CardTitle className="text-lg">What Changed This Week</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No significant changes detected this week
          </p>
        </CardContent>
      </Card>
    );
  }

  const severityColors = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-600",
    success: "bg-green-500/10 border-green-500/20 text-green-600",
  };

  const severityIcons = {
    info: <Calendar className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    success: <TrendingUp className="h-4 w-4" />,
  };

  return (
    <Card data-testid="card-weekly-changes">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <CardTitle className="text-lg">What Changed This Week</CardTitle>
          </div>
          {weeklyData.period.start && (
            <Badge variant="outline" className="text-xs">
              {format(parseISO(weeklyData.period.start), "MMM d")} - {format(new Date(), "MMM d")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {weeklyData.changes.map((change, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border ${severityColors[change.severity]}`}
            data-testid={`change-item-${i}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {severityIcons[change.severity]}
              </div>
              <div>
                <p className="font-medium text-sm">{change.title}</p>
                <p className="text-sm opacity-80">{change.description}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AppDashboard() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<DashboardAnalytics>({
    queryKey: ["/api/live/analytics/dashboard"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <MetricCard key={i} title="" value="" icon={DollarSign} isLoading />
          ))}
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.hasData && !data?.hasBankAccounts) {
    return <EmptyState />;
  }

  if (!data?.hasData) {
    return <EmptyState />;
  }

  const payrollPercent = data.burn.gross > 0 
    ? Math.round((data.burn.payroll / data.burn.gross) * 100) 
    : 0;

  const zeroDateFormatted = data.runway.zeroDate 
    ? format(parseISO(data.runway.zeroDate), "MMMM yyyy")
    : "N/A";

  const runwayMonths = data.runway.months;
  const runwayStatus = !runwayMonths ? "profitable" : runwayMonths < 6 ? "critical" : runwayMonths < 12 ? "warning" : "healthy";
  const statusColors = {
    profitable: "text-green-500",
    healthy: "text-green-500",
    warning: "text-yellow-500",
    critical: "text-red-500",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-dashboard">
            Financial Health
          </h1>
          <p className="text-muted-foreground">
            Your company's financial diagnostic at a glance
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          Updated: {format(new Date(), "MMM d, h:mm a")}
        </Badge>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardContent className="pt-8 pb-8 relative">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Current Runway</span>
            </div>
            
            <div className="space-y-2" data-testid="hero-runway">
              {runwayMonths ? (
                <>
                  <p className={`text-7xl font-bold tracking-tight ${statusColors[runwayStatus]}`}>
                    {runwayMonths.toFixed(1)}
                  </p>
                  <p className="text-xl text-muted-foreground">months</p>
                </>
              ) : (
                <p className={`text-5xl font-bold tracking-tight ${statusColors[runwayStatus]}`}>
                  Cash flow positive
                </p>
              )}
            </div>

            {runwayMonths && (
              <p className="text-muted-foreground">
                Cash runs out {zeroDateFormatted}
              </p>
            )}

            <div className="flex items-center justify-center gap-8 pt-4">
              <div className="text-center">
                <p className="text-2xl font-semibold">{formatCurrency(data.runway.currentCash)}</p>
                <p className="text-sm text-muted-foreground">Cash Balance</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-semibold">{formatCurrency(data.burn.net)}</p>
                <p className="text-sm text-muted-foreground">Monthly Burn</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-semibold">{formatCurrency(data.revenue.total / 3)}</p>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Cash Balance"
          value={formatCurrency(data.runway.currentCash)}
          icon={DollarSign}
        />
        <MetricCard
          title="Monthly Burn"
          value={formatCurrency(data.burn.net)}
          subtitle={`Gross: ${formatCurrency(data.burn.gross)}`}
          icon={TrendingDown}
        />
        <MetricCard
          title="Monthly Revenue"
          value={formatCurrency(data.revenue.total / 3)}
          subtitle="3-month average"
          icon={TrendingUp}
        />
      </div>

      {/* Charts Section - only shows when data is available */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="charts-section">
        <CashFlowChart data={data.cashFlow.trend} />
        <BurnTrendChart data={data.spend.trend} />
        <CategoryDonutChart data={data.spend.byCategory} />
        <RunwayProjectionChart 
          currentCash={data.runway.currentCash}
          monthlyBurn={data.runway.monthlyBurn}
          runwayMonths={data.runway.months}
        />
      </div>

      <WeeklyChangesCard />

      {data.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Action Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 divide-y">
          <Section title="Spend by Category" icon={TrendingDown} defaultOpen>
            <div className="space-y-3">
              {data.spend.byCategory.length > 0 ? (
                data.spend.byCategory.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No categorized spend data yet
                </p>
              )}
            </div>
          </Section>

          <Section title="Top Vendors" icon={Building2}>
            <div className="space-y-3">
              {data.vendors.length > 0 ? (
                data.vendors.slice(0, 8).map((vendor, i) => (
                  <div
                    key={vendor.name}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="font-medium">{vendor.name}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(vendor.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No vendor data yet
                </p>
              )}
            </div>
          </Section>

          <Section title="Revenue" icon={TrendingUp}>
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span>Total Revenue (3 months)</span>
                <span className="font-medium">
                  {formatCurrency(data.revenue.total)}
                </span>
              </div>
              {data.revenue.trend.length > 0 && (
                <div className="grid grid-cols-6 gap-2">
                  {data.revenue.trend.map((m) => (
                    <div key={m.month} className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(m.month), "MMM")}
                      </p>
                      <p className="text-sm font-medium">
                        {formatCurrency(m.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Burn Rate Details" icon={TrendingDown}>
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span>Gross Burn</span>
                <span className="font-medium">
                  {formatCurrency(data.burn.gross)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Net Burn</span>
                <span className="font-medium">
                  {formatCurrency(data.burn.net)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Payroll</span>
                <span className="font-medium">
                  {formatCurrency(data.burn.payroll)} ({payrollPercent}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Non-Payroll</span>
                <span className="font-medium">
                  {formatCurrency(data.burn.nonPayroll)}
                </span>
              </div>
              {data.burn.recurring !== undefined && (
                <div className="flex justify-between">
                  <span>Recurring</span>
                  <span className="font-medium">
                    {formatCurrency(data.burn.recurring)}
                  </span>
                </div>
              )}
            </div>
          </Section>

          <Section title="Runway Analysis" icon={Clock}>
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span>Current Runway</span>
                <span className="font-bold text-lg">
                  {data.runway.months ? `${data.runway.months.toFixed(1)} months` : "Profitable"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Monthly Burn</span>
                <span>{formatCurrency(data.runway.monthlyBurn)}</span>
              </div>
              {data.runway.zeroDate && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Zero Cash Date</span>
                  <span>{zeroDateFormatted}</span>
                </div>
              )}
              {data.runway.months && data.runway.months < 12 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Consider starting fundraising conversations. A typical raise takes 3-6 months.
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section title="Cash Flow" icon={DollarSign}>
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span>Inflows (3 months)</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(data.cashFlow.inflows)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Outflows (3 months)</span>
                <span className="font-medium text-red-500">
                  {formatCurrency(data.cashFlow.outflows)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Net Flow</span>
                <span className={`font-bold ${data.cashFlow.netFlow >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {formatCurrency(data.cashFlow.netFlow)}
                </span>
              </div>
              {data.cashFlow.trend.length > 0 && (
                <div className="grid grid-cols-6 gap-2 mt-4">
                  {data.cashFlow.trend.map((m) => (
                    <div key={m.month} className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(m.month), "MMM")}
                      </p>
                      <p className={`text-sm font-medium ${m.netFlow >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(m.netFlow)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Forecast" icon={Target}>
            <div className="py-4">
              {data.runway.monthlyBurn > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((month) => (
                    <div key={month} className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">
                        Month {month}
                      </p>
                      <p className="font-medium">
                        {formatCurrency(data.runway.currentCash - month * data.runway.monthlyBurn)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">
                  Cash flow positive - no burn projection needed
                </p>
              )}
            </div>
          </Section>

          <Section title="Hiring Plan" icon={Users}>
            <div className="py-4 text-center text-muted-foreground">
              <p>No planned hires configured</p>
              <Button variant="outline" className="mt-3" data-testid="button-add-hire">
                Add Planned Hire
              </Button>
            </div>
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}
