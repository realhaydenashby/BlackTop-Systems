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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";

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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="text-center py-12">
        <div className="rounded-full bg-muted p-6 inline-flex mb-6">
          <Building2 className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Connect Your Financial Data</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-8">
          Link your QuickBooks account or bank accounts to see your financial health dashboard with real data.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/app/connect">
            <Button size="lg" data-testid="button-connect-accounts">
              <Plus className="h-4 w-4 mr-2" />
              Connect Accounts
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 text-left max-w-3xl mx-auto">
          <div className="p-4 rounded-lg bg-muted/50">
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground mb-2" />
            <h4 className="font-medium mb-1">QuickBooks</h4>
            <p className="text-sm text-muted-foreground">
              Sync your revenue, expenses, and vendor data from QuickBooks.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <Building2 className="h-6 w-6 text-muted-foreground mb-2" />
            <h4 className="font-medium mb-1">Bank Accounts</h4>
            <p className="text-sm text-muted-foreground">
              Connect 10,000+ banks to import transactions automatically.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <TrendingUp className="h-6 w-6 text-muted-foreground mb-2" />
            <h4 className="font-medium mb-1">Insights</h4>
            <p className="text-sm text-muted-foreground">
              Get AI-powered insights on spend, runway, and financial health.
            </p>
          </div>
        </div>
      </div>
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
