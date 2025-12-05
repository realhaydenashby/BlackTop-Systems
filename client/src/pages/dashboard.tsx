import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, FileText, AlertTriangle, Wallet, Users } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CHART_COLORS, chartStyles, lineStyles, barStyles } from "@/lib/chartTheme";
import { ActionPlanModule } from "@/components/ActionPlanModule";
import { AnomalyAlerts } from "@/components/AnomalyAlerts";
import { EnhancedInsights } from "@/components/EnhancedInsights";
import { demoDataService, type DashboardStats, type Insight } from "@/services/demoDataService";

export default function Dashboard() {
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", "demo"],
    queryFn: () => demoDataService.getDashboardStats(),
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<Insight[]>({
    queryKey: ["insights", "demo"],
    queryFn: () => demoDataService.getInsights(),
  });

  const demoAnomalies = demoDataService.getAnomalyAlerts();
  const demoInsightsData = demoDataService.getEnhancedInsights();

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your financial overview at a glance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">
              {stats?.totalRevenue !== null && stats?.totalRevenue !== undefined 
                ? `$${stats.totalRevenue.toLocaleString()}` 
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-profit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-profit">
              {stats?.totalProfit !== null && stats?.totalProfit !== undefined 
                ? `$${stats.totalProfit.toLocaleString()}` 
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>

        <Card data-testid="card-cash-position">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Cash Position</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-cash-position">
              {stats?.currentCash !== null && stats?.currentCash !== undefined 
                ? `$${stats.currentCash.toLocaleString()}` 
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Available balance</p>
          </CardContent>
        </Card>

        <Card data-testid="card-headcount">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Team Headcount</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-headcount">
              {stats?.totalHeadcount ?? "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Total employees</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-spend">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Total Spend (30d)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-spend">
              ${stats?.totalSpend?.toLocaleString() || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {(stats?.spendChange ?? 0) >= 0 ? "+" : ""}{stats?.spendChange || 0}% from last month
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-transaction-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-transaction-count">
              {stats?.transactionCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-subscriptions">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-subscription-count">
              {stats?.subscriptionCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              ${stats?.subscriptionMrr || 0}/mo recurring
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-budget-variance">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Budget Variance</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-budget-variance">
              {(stats?.budgetVariance ?? 0) >= 0 ? "+" : ""}{stats?.budgetVariance || 0}%
            </div>
            <p className="text-xs text-muted-foreground">vs. budgeted amount</p>
          </CardContent>
        </Card>
      </div>

      {!insightsLoading && insights && insights.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Financial Insights</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {insights.slice(0, 4).map((insight) => (
              <Alert
                key={insight.id}
                variant={insight.severity === "critical" || insight.severity === "high" ? "destructive" : "default"}
                data-testid={`alert-insight-${insight.type}`}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  {insight.title}
                  <Badge variant={insight.severity === "critical" || insight.severity === "high" ? "destructive" : "secondary"}>
                    {insight.severity}
                  </Badge>
                </AlertTitle>
                <AlertDescription>{insight.description}</AlertDescription>
              </Alert>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats?.spendOverTime || []}>
                <CartesianGrid {...chartStyles.cartesianGrid} />
                <XAxis dataKey="date" {...chartStyles.xAxis} />
                <YAxis {...chartStyles.yAxis} />
                <Tooltip {...chartStyles.tooltip} />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke={CHART_COLORS[0]} 
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
                  data={stats?.spendByCategory || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {(stats?.spendByCategory || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartStyles.tooltip} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {stats?.revenueOverTime && stats.revenueOverTime.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue & Profit Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.revenueOverTime}>
                <CartesianGrid {...chartStyles.cartesianGrid} />
                <XAxis dataKey="month" {...chartStyles.xAxis} />
                <YAxis {...chartStyles.yAxis} />
                <Tooltip {...chartStyles.tooltip} />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stackId="1"
                  stroke={CHART_COLORS[0]} 
                  fill={CHART_COLORS[0]}
                  fillOpacity={0.6}
                  name="Revenue"
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  stackId="2"
                  stroke={CHART_COLORS[1]} 
                  fill={CHART_COLORS[1]}
                  fillOpacity={0.6}
                  name="Expenses"
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stackId="3"
                  stroke={CHART_COLORS[2]} 
                  fill={CHART_COLORS[2]}
                  fillOpacity={0.6}
                  name="Profit"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Spend by Department</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats?.spendByDepartment || []}>
              <CartesianGrid {...chartStyles.cartesianGrid} />
              <XAxis dataKey="name" {...chartStyles.xAxis} />
              <YAxis {...chartStyles.yAxis} />
              <Tooltip {...chartStyles.tooltip} />
              <Bar dataKey="value" fill={CHART_COLORS[0]} {...barStyles} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* AI-Powered Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="demo-ai-section">
        <AnomalyAlerts maxItems={5} demoData={demoAnomalies} />
        <EnhancedInsights maxItems={5} showSource={true} demoData={demoInsightsData} />
      </div>

      <ActionPlanModule 
        title="AI-Generated Action Plan"
        description="Top priorities for your financial health"
        items={stats?.dashboardActionPlan || []}
      />
    </div>
  );
}
