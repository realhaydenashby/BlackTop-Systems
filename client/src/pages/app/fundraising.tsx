import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useRoute, useLocation } from "wouter";
import { CHART_COLORS, chartStyles, lineStyles, barStyles, areaStyles } from "@/lib/chartTheme";
import { TrendingDown, TrendingUp, DollarSign, Timer, Building2, Users, UserPlus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { FeatureGate } from "@/components/UpgradePrompt";

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

interface HiringData {
  hasData: boolean;
  summary: {
    currentHeadcount: number;
    plannedHeadcount: number;
    totalHeadcount: number;
    currentMonthlyPayroll: number;
    plannedMonthlyPayroll: number;
    totalMonthlyPayroll: number;
    totalAnnualPayroll: number;
  };
  hires: {
    id: string;
    role: string;
    department: string;
    monthlyCost: number;
    annualCost: number;
    startDate: string;
    status: "active" | "planned";
  }[];
  byDepartment: {
    name: string;
    count: number;
    monthlyCost: number;
  }[];
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Financial Data Connected</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Connect your bank accounts, QuickBooks, or upload transactions to see fundraising metrics.
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

export default function LiveFundraising() {
  const [, params] = useRoute("/app/fundraising/:section");
  const [, setLocation] = useLocation();
  const section = params?.section || "burn";
  const { canAccess } = usePlanAccess();
  const hasRaiseAccess = canAccess("raisePlanning");
  const hasHiringAccess = canAccess("hiringPlanning");

  const { data: analytics, isLoading, error } = useQuery<LiveAnalytics>({
    queryKey: ["/api/live/analytics/dashboard"],
  });

  const { data: hiringData } = useQuery<HiringData>({
    queryKey: ["/api/live/hiring"],
    enabled: section === "hiring",
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
              Failed to load fundraising data. Please try again later.
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
    if (value === "burn") {
      setLocation("/app/fundraising");
    } else {
      setLocation(`/app/fundraising/${value}`);
    }
  };

  const getSectionTitle = () => {
    switch (section) {
      case "runway": return "Runway Estimator";
      case "raise": return "How Much Should You Raise?";
      case "hiring": return "Hiring Plan";
      default: return "Burn Rate Analyzer";
    }
  };

  const spendTrendData = analytics.spend.trend.map((item) => ({
    month: formatMonth(item.month),
    amount: item.amount,
  }));

  const monthlyBurn = analytics.runway.monthlyBurn || analytics.burn.net;

  const calculateRaiseRecommendation = () => {
    const runwayMonths = analytics.runway.months || 12;
    const targetRunway = 18;
    const monthsToExtend = Math.max(0, targetRunway - runwayMonths);
    const buffer = 1.2;
    const recommended = monthlyBurn * monthsToExtend * buffer;
    return {
      minimum: monthlyBurn * 12,
      recommended: Math.max(recommended, monthlyBurn * 12),
      aggressive: monthlyBurn * 24,
    };
  };

  const raiseRec = calculateRaiseRecommendation();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{getSectionTitle()}</h1>
        <p className="text-muted-foreground">Financial planning for fundraising preparation</p>
      </div>

      <Tabs value={section} onValueChange={(value) => {
          if ((value === "raise" && !hasRaiseAccess) || (value === "hiring" && !hasHiringAccess)) {
            return;
          }
          handleTabChange(value);
        }}>
        <TabsList>
          <TabsTrigger value="burn" data-testid="tab-burn">Burn</TabsTrigger>
          <TabsTrigger value="runway" data-testid="tab-runway">Runway</TabsTrigger>
          <TabsTrigger 
            value="raise" 
            data-testid="tab-raise"
            disabled={!hasRaiseAccess}
            className={!hasRaiseAccess ? "opacity-50" : ""}
          >
            Raise {!hasRaiseAccess && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">Core</Badge>}
          </TabsTrigger>
          <TabsTrigger 
            value="hiring" 
            data-testid="tab-hiring"
            disabled={!hasHiringAccess}
            className={!hasHiringAccess ? "opacity-50" : ""}
          >
            Hiring {!hasHiringAccess && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">Core</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "burn" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-monthly-burn">
                  {formatCurrency(monthlyBurn)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Net burn rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payroll Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-payroll-burn">
                  {formatCurrency(analytics.burn.payroll)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.burn.gross > 0 ? `${((analytics.burn.payroll / analytics.burn.gross) * 100).toFixed(0)}%` : "0%"} of total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Non-Payroll Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-nonpayroll-burn">
                  {formatCurrency(analytics.burn.nonPayroll)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.burn.gross > 0 ? `${((analytics.burn.nonPayroll / analytics.burn.gross) * 100).toFixed(0)}%` : "0%"} of total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Recurring</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-recurring-burn">
                  {formatCurrency(analytics.burn.recurring)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Monthly recurring</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Burn Rate Trend</CardTitle>
              <CardDescription>Monthly spend over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={spendTrendData}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    name="Spend"
                    {...areaStyles}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Burn Breakdown</CardTitle>
              <CardDescription>Payroll vs non-payroll spending</CardDescription>
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
        </>
      )}

      {section === "runway" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Runway</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold flex items-center gap-2 ${analytics.runway.months && analytics.runway.months < 6 ? "text-destructive" : ""}`} data-testid="text-current-runway">
                  <Timer className="h-5 w-5" />
                  {analytics.runway.months ? `${analytics.runway.months.toFixed(1)} mo` : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(analytics.runway.currentCash)} cash
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-monthly-burn-runway">
                  {formatCurrency(monthlyBurn)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Net burn</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Cash Position</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-cash-position">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  {formatCurrency(analytics.runway.currentCash)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Bank balance</p>
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
              <CardTitle>Runway Projection</CardTitle>
              <CardDescription>Cash balance projections at current burn rate</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={(() => {
                  const projections = [];
                  let cash = analytics.runway.currentCash;
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

          {analytics.insights.filter(i => i.type === "runway").length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Runway Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.insights.filter(i => i.type === "runway").map((insight, idx) => (
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

      {section === "raise" && (
        <FeatureGate feature="raisePlanning" hasAccess={hasRaiseAccess}>
          <Card>
            <CardHeader>
              <CardTitle>Recommended Raise Amount</CardTitle>
              <CardDescription>Based on your burn rate to extend runway to 18 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                <div>
                  <div className="text-5xl font-bold text-primary mb-2" data-testid="text-recommended-raise">
                    {formatCurrency(raiseRec.recommended)}
                  </div>
                  <p className="text-muted-foreground">Recommended</p>
                </div>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Min: {formatCurrency(raiseRec.minimum)}
                  </span>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-muted-foreground">
                    Aggressive: {formatCurrency(raiseRec.aggressive)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Conservative</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-3xl font-bold mb-1" data-testid="text-raise-conservative">
                    {formatCurrency(raiseRec.minimum)}
                  </div>
                  <p className="text-sm text-muted-foreground">12 months runway</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium mb-1">Assumptions:</p>
                    <p className="text-sm text-muted-foreground">Maintain current burn rate, no major hires</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Recommended</CardTitle>
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Best Option</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-3xl font-bold mb-1" data-testid="text-raise-recommended">
                    {formatCurrency(raiseRec.recommended)}
                  </div>
                  <p className="text-sm text-muted-foreground">18 months runway</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium mb-1">Assumptions:</p>
                    <p className="text-sm text-muted-foreground">20% buffer for growth, 2-3 key hires</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Aggressive</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-3xl font-bold mb-1" data-testid="text-raise-aggressive">
                    {formatCurrency(raiseRec.aggressive)}
                  </div>
                  <p className="text-sm text-muted-foreground">24 months runway</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium mb-1">Assumptions:</p>
                    <p className="text-sm text-muted-foreground">Aggressive expansion, team doubling</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Runway Extension by Raise Amount</CardTitle>
              <CardDescription>How much runway each raise amount provides</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { amount: formatCurrency(raiseRec.minimum), runway: 12 },
                  { amount: formatCurrency(raiseRec.recommended), runway: 18 },
                  { amount: formatCurrency(raiseRec.aggressive), runway: 24 },
                ]}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="amount" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} label={{ value: 'Months', angle: -90, position: 'insideLeft' }} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => `${value} months`} />
                  <Bar dataKey="runway" fill={CHART_COLORS[0]} name="Runway (months)" {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </FeatureGate>
      )}

      {section === "cash" && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Cash</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-current-cash">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  {formatCurrency(analytics.runway.currentCash)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total bank balance</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Inflows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2 text-green-600" data-testid="text-monthly-inflows">
                  <TrendingUp className="h-5 w-5" />
                  {formatCurrency(analytics.cashFlow.inflows)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Revenue & deposits</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Outflows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2 text-destructive" data-testid="text-monthly-outflows">
                  <TrendingDown className="h-5 w-5" />
                  {formatCurrency(Math.abs(analytics.cashFlow.outflows))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Expenses & payments</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cash Flow by Month</CardTitle>
              <CardDescription>Inflows and outflows over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={analytics.cashFlow.trend.map((item) => ({
                  month: formatMonth(item.month),
                  inflows: item.inflows,
                  outflows: Math.abs(item.outflows),
                }))}>
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

          <Card>
            <CardHeader>
              <CardTitle>Net Cash Flow</CardTitle>
              <CardDescription>Monthly net change in cash</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.cashFlow.trend.map((item) => ({
                  month: formatMonth(item.month),
                  netFlow: item.netFlow,
                }))}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                  <Line
                    type="monotone"
                    dataKey="netFlow"
                    stroke={CHART_COLORS[0]}
                    name="Net Cash Flow"
                    {...lineStyles}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {section === "hiring" && (
        <FeatureGate feature="hiringPlanning" hasAccess={hasHiringAccess}>
          {hiringData?.hasData ? (
            <>
              {/* Summary Metrics */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Current Headcount</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-current-headcount">
                      <Users className="h-5 w-5 text-primary" />
                      {hiringData.summary.currentHeadcount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Active employees</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Planned Hires</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-planned-hires">
                      <UserPlus className="h-5 w-5 text-green-500" />
                      {hiringData.summary.plannedHeadcount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Future hires</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-monthly-payroll">
                      {formatCurrency(hiringData.summary.totalMonthlyPayroll)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Current + planned</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Annual Payroll</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-annual-payroll">
                      {formatCurrency(hiringData.summary.totalAnnualPayroll)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Projected yearly cost</p>
                  </CardContent>
                </Card>
              </div>

              {/* Department Breakdown Chart */}
              {hiringData.byDepartment.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Headcount by Department</CardTitle>
                    <CardDescription>Distribution of employees across departments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={hiringData.byDepartment}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, count }) => `${name}: ${count}`}
                          outerRadius={100}
                          dataKey="count"
                        >
                          {hiringData.byDepartment.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...chartStyles.tooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Payroll by Department */}
              {hiringData.byDepartment.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Payroll by Department</CardTitle>
                    <CardDescription>Cost distribution across departments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={hiringData.byDepartment} layout="vertical">
                        <CartesianGrid {...chartStyles.cartesianGrid} />
                        <XAxis type="number" {...chartStyles.xAxis} tickFormatter={(v) => formatCurrency(v)} />
                        <YAxis dataKey="name" type="category" width={120} {...chartStyles.yAxis} />
                        <Tooltip {...chartStyles.tooltip} formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="monthlyCost" fill={CHART_COLORS[0]} name="Monthly Cost" {...barStyles} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Hire List */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>All current and planned hires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {hiringData.hires.map((hire) => (
                      <div
                        key={hire.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                        data-testid={`hire-row-${hire.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="rounded-full bg-primary/10 p-2">
                            <Briefcase className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{hire.role}</p>
                            <p className="text-sm text-muted-foreground">{hire.department}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(hire.annualCost)}/yr</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(hire.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                            </p>
                          </div>
                          <Badge variant={hire.status === "active" ? "default" : "secondary"}>
                            {hire.status === "active" ? "Active" : "Planned"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Impact on Burn/Runway */}
              <Card>
                <CardHeader>
                  <CardTitle>Hiring Impact Summary</CardTitle>
                  <CardDescription>How hiring affects your financial metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Payroll</span>
                        <span className="font-medium">{formatCurrency(hiringData.summary.currentMonthlyPayroll)}/mo</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Planned Payroll Increase</span>
                        <span className="font-medium text-destructive">+{formatCurrency(hiringData.summary.plannedMonthlyPayroll)}/mo</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="font-medium">Total After Hires</span>
                        <span className="font-medium">{formatCurrency(hiringData.summary.totalMonthlyPayroll)}/mo</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Annual Current Payroll</span>
                        <span className="font-medium">{formatCurrency(hiringData.summary.currentMonthlyPayroll * 12)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Annual Planned Increase</span>
                        <span className="font-medium text-destructive">+{formatCurrency(hiringData.summary.plannedMonthlyPayroll * 12)}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="font-medium">Total Annual Payroll</span>
                        <span className="font-medium">{formatCurrency(hiringData.summary.totalAnnualPayroll)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-16 flex flex-col items-center text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Hiring Data</h3>
                <p className="text-muted-foreground max-w-md mb-6">
                  Use the AI Copilot to model hiring scenarios. Try asking "What if I hire a $90k engineer?" to see how it impacts your runway.
                </p>
                <Button asChild data-testid="button-open-copilot">
                  <Link href="/app/copilot">Open Copilot</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </FeatureGate>
      )}
    </div>
  );
}
