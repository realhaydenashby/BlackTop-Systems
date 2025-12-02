import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { CHART_COLORS, chartStyles, lineStyles, areaStyles, barStyles } from "@/lib/chartTheme";
import { Building2, TrendingDown, TrendingUp, DollarSign, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface LiveAnalytics {
  hasData: boolean;
  hasBankAccounts: boolean;
  spend: {
    total: number;
    trend: { month: string; amount: number }[];
    byCategory: { id: string; name: string; amount: number; color: string }[];
  };
  revenue: {
    total: number;
    trend: { month: string; amount: number }[];
  };
  burn: {
    gross: number;
    net: number;
    payroll: number;
    nonPayroll: number;
    recurring: number;
    oneTime: number;
  };
  runway: {
    months: number | null;
    currentCash: number;
    zeroDate: string | null;
    monthlyBurn?: number;
  };
  cashFlow: {
    inflows: number;
    outflows: number;
    netFlow: number;
    trend: { month: string; inflows: number; outflows: number; netFlow: number }[];
  };
  insights: { type: string; message: string; severity: string }[];
  vendors: { name: string; amount: number }[];
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Financial Data Connected</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Connect your bank accounts, QuickBooks, or upload transactions to see your analytics.
          </p>
          <Button asChild data-testid="button-connect-accounts">
            <Link href="/app/connect">Connect Accounts</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

function formatMonth(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", { month: "short" });
}

export default function LiveAnalytics() {
  const [, params] = useRoute("/app/analytics/:section");
  const [, setLocation] = useLocation();
  const section = params?.section || "spend";
  const [timeRange, setTimeRange] = useState("90");

  const { data: analytics, isLoading, error } = useQuery<LiveAnalytics>({
    queryKey: ["/api/live/analytics/dashboard"],
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
              Failed to load analytics data. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analytics || !analytics.hasData) {
    return <EmptyState />;
  }

  const handleTabChange = (value: string) => {
    if (value === "spend") {
      setLocation("/app/analytics");
    } else {
      setLocation(`/app/analytics/${value}`);
    }
  };

  const getSectionTitle = () => {
    switch (section) {
      case "revenue": return "Revenue Analytics";
      case "profitability": return "Profitability Analytics";
      case "burn": return "Burn Rate Analytics";
      case "runway": return "Runway Analytics";
      default: return "Spend Analytics";
    }
  };

  const getSectionDescription = () => {
    switch (section) {
      case "revenue": return "Track your revenue streams and growth metrics";
      case "profitability": return "Analyze your margins and profit trends";
      case "burn": return "Understand your burn rate breakdown";
      case "runway": return "Monitor your financial runway";
      default: return "Deep insights into your spending patterns";
    }
  };

  const spendTrendData = analytics.spend.trend.map((item) => ({
    date: formatMonth(item.month),
    amount: item.amount,
  }));

  const categoryData = analytics.spend.byCategory.map((item) => ({
    name: item.name,
    value: item.amount,
  }));

  const vendorData = analytics.vendors.map((vendor) => ({
    name: vendor.name,
    value: vendor.amount,
  }));

  const revenueTrendData = analytics.revenue.trend.map((item) => ({
    month: formatMonth(item.month),
    revenue: item.amount,
  }));

  const cashFlowData = analytics.cashFlow.trend.map((item) => ({
    month: formatMonth(item.month),
    inflows: item.inflows,
    outflows: Math.abs(item.outflows),
    netFlow: item.netFlow,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{getSectionTitle()}</h1>
          <p className="text-muted-foreground">{getSectionDescription()}</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-48" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={section} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="spend" data-testid="tab-spend">Spend</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          <TabsTrigger value="profitability" data-testid="tab-profitability">Profitability</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "spend" && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-spend">
                  {formatCurrency(analytics.spend.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last 3 months</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Recurring Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-recurring-spend">
                  {formatCurrency(analytics.burn.recurring)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Monthly subscriptions & recurring</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">One-Time Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-onetime-spend">
                  {formatCurrency(analytics.burn.oneTime)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Non-recurring expenses</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spend Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={spendTrendData}>
                    <CartesianGrid {...chartStyles.cartesianGrid} />
                    <XAxis dataKey="date" {...chartStyles.xAxis} />
                    <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke={CHART_COLORS[0]} 
                      name="Spending" 
                      {...lineStyles}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spend by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendorData} layout="vertical">
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis type="number" {...chartStyles.xAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis dataKey="name" type="category" width={120} {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill={CHART_COLORS[1]} {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {analytics.insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>AI Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.insights.map((insight, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-lg border ${
                        insight.severity === "critical" ? "border-destructive/50 bg-destructive/10" :
                        insight.severity === "warning" ? "border-yellow-500/50 bg-yellow-500/10" :
                        "border-muted"
                      }`}
                      data-testid={`insight-${idx}`}
                    >
                      <p className="text-sm">{insight.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {section === "revenue" && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-total-revenue">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  {formatCurrency(analytics.revenue.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last 3 months</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold flex items-center gap-2 ${analytics.cashFlow.netFlow >= 0 ? "text-green-600" : "text-destructive"}`} data-testid="text-net-cashflow">
                  {analytics.cashFlow.netFlow >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {formatCurrency(Math.abs(analytics.cashFlow.netFlow))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{analytics.cashFlow.netFlow >= 0 ? "Positive" : "Negative"} cash flow</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueTrendData}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke={CHART_COLORS[0]} 
                    fill={CHART_COLORS[0]} 
                    name="Revenue" 
                    {...areaStyles}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cash Flow by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cashFlowData}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Legend {...chartStyles.legend} />
                  <Bar dataKey="inflows" fill={CHART_COLORS[2]} name="Inflows" {...barStyles} />
                  <Bar dataKey="outflows" fill={CHART_COLORS[4]} name="Outflows" {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {section === "profitability" && (
        <>
          {/* Profitability Metrics */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2 text-green-600" data-testid="text-profit-revenue">
                  <TrendingUp className="h-5 w-5" />
                  {formatCurrency(analytics.revenue.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last 3 months</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2 text-destructive" data-testid="text-profit-expenses">
                  <TrendingDown className="h-5 w-5" />
                  {formatCurrency(analytics.spend.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last 3 months</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Net Profit/Loss</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold flex items-center gap-2 ${analytics.revenue.total - analytics.spend.total >= 0 ? "text-green-600" : "text-destructive"}`} data-testid="text-net-profit">
                  <DollarSign className="h-5 w-5" />
                  {formatCurrency(Math.abs(analytics.revenue.total - analytics.spend.total))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.revenue.total - analytics.spend.total >= 0 ? "Profit" : "Loss"} (Last 3 months)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${analytics.revenue.total > 0 && ((analytics.revenue.total - analytics.spend.total) / analytics.revenue.total) > 0 ? "text-green-600" : "text-destructive"}`} data-testid="text-profit-margin">
                  {analytics.revenue.total > 0 
                    ? `${(((analytics.revenue.total - analytics.spend.total) / analytics.revenue.total) * 100).toFixed(1)}%`
                    : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Net margin</p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue vs Expenses Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue vs Expenses Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={(() => {
                  const combinedData = analytics.revenue.trend.map((revItem, idx) => {
                    const spendItem = analytics.spend.trend[idx];
                    return {
                      month: formatMonth(revItem.month),
                      revenue: revItem.amount,
                      expenses: spendItem?.amount || 0,
                      profit: revItem.amount - (spendItem?.amount || 0),
                    };
                  });
                  return combinedData;
                })()}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Legend {...chartStyles.legend} />
                  <Bar dataKey="revenue" fill={CHART_COLORS[2]} name="Revenue" {...barStyles} />
                  <Bar dataKey="expenses" fill={CHART_COLORS[4]} name="Expenses" {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Profit/Loss Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Profit/Loss Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={(() => {
                  return analytics.revenue.trend.map((revItem, idx) => {
                    const spendItem = analytics.spend.trend[idx];
                    return {
                      month: formatMonth(revItem.month),
                      profit: revItem.amount - (spendItem?.amount || 0),
                    };
                  });
                })()}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke={CHART_COLORS[0]} 
                    fill={CHART_COLORS[0]} 
                    name="Net Profit/Loss" 
                    {...areaStyles}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Expense Categories Breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expense Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Margin Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Operating Expenses</span>
                    <span className="font-medium">{formatCurrency(analytics.burn.nonPayroll)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payroll</span>
                    <span className="font-medium">{formatCurrency(analytics.burn.payroll)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recurring Expenses</span>
                    <span className="font-medium">{formatCurrency(analytics.burn.recurring)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="font-medium">Total Expenses</span>
                    <span className="font-medium">{formatCurrency(analytics.spend.total)}</span>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="font-semibold">Net Margin</span>
                    <span className={`font-bold ${analytics.revenue.total > 0 && ((analytics.revenue.total - analytics.spend.total) / analytics.revenue.total) > 0 ? "text-green-600" : "text-destructive"}`}>
                      {analytics.revenue.total > 0 
                        ? `${(((analytics.revenue.total - analytics.spend.total) / analytics.revenue.total) * 100).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {section === "burn" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Gross Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-gross-burn">
                  {formatCurrency(analytics.burn.gross)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total monthly spend</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Net Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-net-burn">
                  {formatCurrency(analytics.burn.net)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Spend minus revenue</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payroll</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-payroll">
                  {formatCurrency(analytics.burn.payroll)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.burn.gross > 0 ? `${((analytics.burn.payroll / analytics.burn.gross) * 100).toFixed(0)}%` : "0%"} of burn
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Non-Payroll</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-non-payroll">
                  {formatCurrency(analytics.burn.nonPayroll)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.burn.gross > 0 ? `${((analytics.burn.nonPayroll / analytics.burn.gross) * 100).toFixed(0)}%` : "0%"} of burn
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Burn Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Payroll", value: analytics.burn.payroll },
                      { name: "Non-Payroll", value: analytics.burn.nonPayroll },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    <Cell fill={CHART_COLORS[0]} />
                    <Cell fill={CHART_COLORS[1]} />
                  </Pie>
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recurring vs One-Time Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: "Recurring", value: analytics.burn.recurring },
                  { name: "One-Time", value: analytics.burn.oneTime },
                ]}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="name" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill={CHART_COLORS[0]} {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {section === "runway" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Cash</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-current-cash">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  {formatCurrency(analytics.runway.currentCash)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Bank balance</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-monthly-burn">
                  {formatCurrency(analytics.runway.monthlyBurn || analytics.burn.net)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Average net burn</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Runway</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold flex items-center gap-2 ${analytics.runway.months && analytics.runway.months < 6 ? "text-destructive" : ""}`} data-testid="text-runway-months">
                  <Timer className="h-5 w-5" />
                  {analytics.runway.months ? `${analytics.runway.months.toFixed(1)} mo` : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">At current burn rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Zero Date</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-zero-date">
                  {analytics.runway.zeroDate 
                    ? new Date(analytics.runway.zeroDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                    : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Projected cash out</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cash Runway Projection</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={(() => {
                  const projections = [];
                  let cash = analytics.runway.currentCash;
                  const monthlyBurn = analytics.runway.monthlyBurn || 0;
                  const today = new Date();
                  for (let i = 0; i <= 12 && cash > 0; i++) {
                    const date = new Date(today);
                    date.setMonth(date.getMonth() + i);
                    projections.push({
                      month: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
                      cash: Math.max(0, cash),
                    });
                    cash -= monthlyBurn;
                  }
                  return projections;
                })()}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Area 
                    type="monotone" 
                    dataKey="cash" 
                    stroke={CHART_COLORS[0]} 
                    fill={CHART_COLORS[0]} 
                    name="Projected Cash" 
                    {...areaStyles}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {analytics.insights.filter(i => i.type === "runway" || i.type === "burn").length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Runway Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.insights.filter(i => i.type === "runway" || i.type === "burn").map((insight, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-lg border ${
                        insight.severity === "critical" ? "border-destructive/50 bg-destructive/10" :
                        insight.severity === "warning" ? "border-yellow-500/50 bg-yellow-500/10" :
                        "border-muted"
                      }`}
                      data-testid={`runway-insight-${idx}`}
                    >
                      <p className="text-sm">{insight.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
