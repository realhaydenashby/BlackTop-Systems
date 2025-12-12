import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Target, 
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Zap,
  BarChart3,
  PieChart
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from "recharts";
import { CHART_COLORS } from "@/lib/chartTheme";

interface UnitEconomics {
  saasMetrics: {
    mrr: number;
    arr: number;
    arpu: number;
    activeSubscriptions: number;
    activeCustomers: number;
    newCustomersInPeriod: number;
    churnMetrics: {
      customerChurnRate: number;
      revenueChurnRate: number;
      churningCustomers: number;
      totalCustomers: number;
      periodStartCustomers: number;
    };
    mrrBreakdown?: {
      newMRR: number;
      expansionMRR: number;
      contractionMRR: number;
      churnedMRR: number;
      netMRR: number;
    };
    trialSubscriptions: number;
    computedAt: string;
    currency: string;
  };
  cac: number;
  cacBreakdown: {
    marketingSpend: number;
    salesSpend: number;
    totalCACSpend: number;
    byCategory: Record<string, number>;
    transactionCount: number;
    lowConfidenceCount: number;
  };
  ltv: number;
  ltvMetrics: {
    ltv: number;
    ltvToCacRatio: number;
    averageCustomerLifespanMonths: number;
    arpu: number;
    monthlyChurnRate: number;
  };
  ltvToCacRatio: number;
  paybackPeriodMonths: number;
  healthScore: 'excellent' | 'good' | 'warning' | 'critical';
  healthReason: string;
  dataQuality: {
    hasStripeData: boolean;
    hasBankData: boolean;
    cacConfidence: number;
    isUsingManualOverrides: boolean;
  };
  computedAt: string;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}x`;
}

function getHealthColor(score: string): string {
  switch (score) {
    case 'excellent': return 'text-green-500';
    case 'good': return 'text-blue-500';
    case 'warning': return 'text-yellow-500';
    case 'critical': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}

function getHealthBadgeVariant(score: string): "default" | "secondary" | "destructive" | "outline" {
  switch (score) {
    case 'excellent': return 'default';
    case 'good': return 'secondary';
    case 'warning': return 'outline';
    case 'critical': return 'destructive';
    default: return 'secondary';
  }
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  trendLabel,
  tooltip
}: { 
  title: string; 
  value: string; 
  subtitle?: string; 
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  tooltip?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          {title}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`text-${title.toLowerCase().replace(/\s+/g, '-')}`}>{value}</div>
        {(subtitle || trendLabel) && (
          <div className="flex items-center gap-1 mt-1">
            {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-green-500" />}
            {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-red-500" />}
            <p className="text-xs text-muted-foreground">
              {trendLabel && <span className={trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : ''}>{trendLabel}</span>}
              {trendLabel && subtitle && ' · '}
              {subtitle}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No SaaS Metrics Data</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Connect your Stripe account and bank data to calculate your unit economics (MRR, ARR, CAC, LTV).
          </p>
          <Button asChild data-testid="button-connect-stripe">
            <Link href="/app/connect">Connect Accounts</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DataQualityBanner({ dataQuality }: { dataQuality: UnitEconomics['dataQuality'] }) {
  const issues: string[] = [];
  
  if (!dataQuality.hasStripeData) {
    issues.push("Stripe not connected - MRR/ARR/Churn are estimated");
  }
  if (!dataQuality.hasBankData) {
    issues.push("Bank data missing - CAC calculations incomplete");
  }
  if (dataQuality.cacConfidence < 0.7) {
    issues.push("Low CAC confidence - some transactions need review");
  }
  
  if (issues.length === 0) return null;
  
  return (
    <Card className="bg-amber-500/10 border-amber-500/30">
      <CardContent className="py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-amber-600 dark:text-amber-400">Data Quality Notice:</span>{' '}
            <span className="text-muted-foreground">{issues.join(' · ')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SaaSMetricsPage() {
  const [timeRange, setTimeRange] = useState("30");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: metrics, isLoading, error } = useQuery<UnitEconomics>({
    queryKey: ["/api/saas-metrics", timeRange],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-destructive">
              Failed to load SaaS metrics. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!metrics || (!metrics.dataQuality.hasStripeData && !metrics.dataQuality.hasBankData)) {
    return <EmptyState />;
  }

  const cacCategoryData = Object.entries(metrics.cacBreakdown.byCategory)
    .map(([name, value]) => ({
      name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: value as number,
    }))
    .filter(item => item.value > 0);

  const mrrBreakdownData = metrics.saasMetrics.mrrBreakdown ? [
    { name: 'New MRR', value: metrics.saasMetrics.mrrBreakdown.newMRR, color: CHART_COLORS.primary },
    { name: 'Expansion', value: metrics.saasMetrics.mrrBreakdown.expansionMRR, color: CHART_COLORS.success },
    { name: 'Churned', value: Math.abs(metrics.saasMetrics.mrrBreakdown.churnedMRR), color: CHART_COLORS.danger },
  ].filter(item => item.value > 0) : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">SaaS Unit Economics</h1>
          <p className="text-muted-foreground">
            Track your CAC, LTV, MRR, and other key SaaS metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]" data-testid="select-time-range">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataQualityBanner dataQuality={metrics.dataQuality} />

      <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${metrics.healthScore === 'excellent' ? 'bg-green-500/20' : metrics.healthScore === 'good' ? 'bg-blue-500/20' : metrics.healthScore === 'warning' ? 'bg-yellow-500/20' : 'bg-red-500/20'}`}>
                {metrics.healthScore === 'excellent' || metrics.healthScore === 'good' ? (
                  <CheckCircle className={`h-5 w-5 ${getHealthColor(metrics.healthScore)}`} />
                ) : (
                  <AlertTriangle className={`h-5 w-5 ${getHealthColor(metrics.healthScore)}`} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Unit Economics Health</span>
                  <Badge variant={getHealthBadgeVariant(metrics.healthScore)} data-testid="badge-health-score">
                    {metrics.healthScore.charAt(0).toUpperCase() + metrics.healthScore.slice(1)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{metrics.healthReason}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">LTV:CAC</span>
                <span className="ml-2 font-bold text-lg" data-testid="text-ltv-cac-ratio">{formatRatio(metrics.ltvToCacRatio)}</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="text-muted-foreground">Payback</span>
                <span className="ml-2 font-bold text-lg" data-testid="text-payback-period">{metrics.paybackPeriodMonths.toFixed(1)} mo</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          <TabsTrigger value="cac" data-testid="tab-cac">CAC Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Monthly Recurring Revenue"
              value={formatCurrency(metrics.saasMetrics.mrr)}
              icon={DollarSign}
              subtitle={`${metrics.saasMetrics.activeSubscriptions} active subscriptions`}
              tooltip="Sum of all active subscription monthly amounts"
            />
            <MetricCard
              title="Annual Recurring Revenue"
              value={formatCurrency(metrics.saasMetrics.arr)}
              icon={TrendingUp}
              subtitle="MRR × 12"
              tooltip="Monthly Recurring Revenue multiplied by 12"
            />
            <MetricCard
              title="Customer Acquisition Cost"
              value={formatCurrency(metrics.cac)}
              icon={Target}
              subtitle={`${metrics.saasMetrics.newCustomersInPeriod} new customers`}
              tooltip="Total marketing + sales spend divided by new customers"
            />
            <MetricCard
              title="Lifetime Value"
              value={formatCurrency(metrics.ltv)}
              icon={Users}
              subtitle={`${metrics.ltvMetrics.averageCustomerLifespanMonths.toFixed(0)} mo avg lifespan`}
              tooltip="ARPU × average customer lifespan in months"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="ARPU"
              value={formatCurrency(metrics.saasMetrics.arpu)}
              icon={DollarSign}
              subtitle="Per customer/month"
              tooltip="Average Revenue Per User (MRR / active customers)"
            />
            <MetricCard
              title="Customer Churn Rate"
              value={`${metrics.saasMetrics.churnMetrics.customerChurnRate.toFixed(1)}%`}
              icon={metrics.saasMetrics.churnMetrics.customerChurnRate > 5 ? TrendingDown : CheckCircle}
              trend={metrics.saasMetrics.churnMetrics.customerChurnRate > 5 ? 'down' : 'neutral'}
              subtitle={`${metrics.saasMetrics.churnMetrics.churningCustomers} churned in period`}
              tooltip="Percentage of customers who canceled in the period"
            />
            <MetricCard
              title="Active Customers"
              value={metrics.saasMetrics.activeCustomers.toString()}
              icon={Users}
              subtitle={`${metrics.saasMetrics.trialSubscriptions} in trial`}
              tooltip="Customers with active or past_due subscriptions"
            />
            <MetricCard
              title="LTV:CAC Ratio"
              value={formatRatio(metrics.ltvToCacRatio)}
              icon={metrics.ltvToCacRatio >= 3 ? Zap : AlertTriangle}
              trend={metrics.ltvToCacRatio >= 3 ? 'up' : metrics.ltvToCacRatio >= 1 ? 'neutral' : 'down'}
              subtitle={metrics.ltvToCacRatio >= 3 ? 'Healthy' : metrics.ltvToCacRatio >= 1 ? 'Needs improvement' : 'Unprofitable'}
              tooltip="Target: 3x or higher for sustainable growth"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CAC Spend Distribution</CardTitle>
                <CardDescription>Marketing vs Sales spend breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Marketing Spend</span>
                    <span className="font-medium" data-testid="text-marketing-spend">{formatCurrency(metrics.cacBreakdown.marketingSpend)}</span>
                  </div>
                  <Progress 
                    value={metrics.cacBreakdown.totalCACSpend > 0 ? (metrics.cacBreakdown.marketingSpend / metrics.cacBreakdown.totalCACSpend) * 100 : 0} 
                    className="h-2"
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Sales Spend</span>
                    <span className="font-medium" data-testid="text-sales-spend">{formatCurrency(metrics.cacBreakdown.salesSpend)}</span>
                  </div>
                  <Progress 
                    value={metrics.cacBreakdown.totalCACSpend > 0 ? (metrics.cacBreakdown.salesSpend / metrics.cacBreakdown.totalCACSpend) * 100 : 0} 
                    className="h-2"
                  />
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total CAC Spend</span>
                      <span className="font-bold" data-testid="text-total-cac-spend">{formatCurrency(metrics.cacBreakdown.totalCACSpend)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">LTV Calculation</CardTitle>
                <CardDescription>How lifetime value is computed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ARPU (Monthly)</span>
                    <span className="font-medium">{formatCurrency(metrics.ltvMetrics.arpu)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Monthly Churn Rate</span>
                    <span className="font-medium">{metrics.ltvMetrics.monthlyChurnRate.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Avg Customer Lifespan</span>
                    <span className="font-medium">{metrics.ltvMetrics.averageCustomerLifespanMonths.toFixed(1)} months</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Lifetime Value</span>
                      <span className="font-bold text-lg" data-testid="text-ltv-value">{formatCurrency(metrics.ltvMetrics.ltv)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      LTV = ARPU × (1 / Monthly Churn Rate)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="MRR"
              value={formatCurrency(metrics.saasMetrics.mrr)}
              icon={DollarSign}
              subtitle={`${metrics.saasMetrics.currency.toUpperCase()}`}
            />
            <MetricCard
              title="ARR"
              value={formatCurrency(metrics.saasMetrics.arr)}
              icon={TrendingUp}
              subtitle="Annualized"
            />
            <MetricCard
              title="Revenue Churn"
              value={`${metrics.saasMetrics.churnMetrics.revenueChurnRate.toFixed(1)}%`}
              icon={TrendingDown}
              trend={metrics.saasMetrics.churnMetrics.revenueChurnRate > 3 ? 'down' : 'neutral'}
              subtitle="Lost revenue from churned customers"
            />
          </div>

          {mrrBreakdownData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">MRR Breakdown</CardTitle>
                <CardDescription>New, expansion, and churned MRR for the period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mrrBreakdownData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                      <YAxis type="category" dataKey="name" width={100} />
                      <RechartsTooltip 
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {mrrBreakdownData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {metrics.saasMetrics.mrrBreakdown && (
                  <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <span className="font-medium">Net MRR Change</span>
                    <span className={`font-bold text-lg ${metrics.saasMetrics.mrrBreakdown.netMRR >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {metrics.saasMetrics.mrrBreakdown.netMRR >= 0 ? '+' : ''}{formatCurrency(metrics.saasMetrics.mrrBreakdown.netMRR)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cac" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total CAC Spend"
              value={formatCurrency(metrics.cacBreakdown.totalCACSpend)}
              icon={DollarSign}
              subtitle={`${metrics.cacBreakdown.transactionCount} transactions analyzed`}
            />
            <MetricCard
              title="CAC per Customer"
              value={formatCurrency(metrics.cac)}
              icon={Target}
              subtitle={`${metrics.saasMetrics.newCustomersInPeriod} new customers`}
            />
            <MetricCard
              title="Classification Confidence"
              value={`${Math.round(metrics.dataQuality.cacConfidence * 100)}%`}
              icon={CheckCircle}
              trend={metrics.dataQuality.cacConfidence >= 0.8 ? 'up' : 'down'}
              subtitle={`${metrics.cacBreakdown.lowConfidenceCount} need review`}
            />
          </div>

          {cacCategoryData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CAC by Category</CardTitle>
                <CardDescription>Breakdown of customer acquisition spend by type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={cacCategoryData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={true}
                      >
                        {cacCategoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={Object.values(CHART_COLORS)[index % Object.values(CHART_COLORS).length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {metrics.cacBreakdown.lowConfidenceCount > 0 && (
            <Card className="border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Transactions Needing Review
                </CardTitle>
                <CardDescription>
                  {metrics.cacBreakdown.lowConfidenceCount} transactions have low classification confidence and may affect CAC accuracy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild data-testid="button-review-transactions">
                  <Link href="/app/transactions?filter=needs-review">
                    Review Transactions
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground text-right">
        Last updated: {new Date(metrics.computedAt).toLocaleString()}
      </div>
    </div>
  );
}
