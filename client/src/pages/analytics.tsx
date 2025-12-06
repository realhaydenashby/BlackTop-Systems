import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area, ReferenceLine } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { CHART_COLORS, chartStyles, lineStyles, areaStyles, barStyles } from "@/lib/chartTheme";
import { ActionPlanModule, type ActionPlanItem } from "@/components/ActionPlanModule";
import { demoDataService } from "@/services/demoDataService";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

function ForecastingChart({ analytics }: { analytics: any }) {
  const [forecastHorizon, setForecastHorizon] = useState("6months");
  
  const getChartData = () => {
    if (!analytics?.forecasting) return { historical: [], forecast: [] };
    
    const { historicalData = [], currentMonth, forecast30Days = [], forecast90Days = [], forecast6Months = [] } = analytics.forecasting;
    
    let forecastData = [];
    switch (forecastHorizon) {
      case "30days":
        forecastData = forecast30Days;
        break;
      case "90days":
        forecastData = forecast90Days;
        break;
      case "6months":
      default:
        forecastData = forecast6Months;
        break;
    }
    
    const historical = [
      ...historicalData,
      ...(currentMonth ? [currentMonth] : []),
    ];
    
    const forecast = forecastData.length > 0 && historical.length > 0
      ? [historical[historical.length - 1], ...forecastData]
      : forecastData;
    
    return { historical, forecast };
  };
  
  const { historical, forecast } = getChartData();
  const allData = [...historical, ...forecast.slice(1)];
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>Financial Forecast</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Historical performance vs. projected growth
            </p>
          </div>
          <Select value={forecastHorizon} onValueChange={setForecastHorizon}>
            <SelectTrigger className="w-48" data-testid="select-forecast-horizon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30days">30 Days Forecast</SelectItem>
              <SelectItem value="90days">90 Days Forecast</SelectItem>
              <SelectItem value="6months">6 Months Forecast</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 w-8 bg-current" style={{ color: CHART_COLORS[0] }} />
            <span className="text-muted-foreground">Historical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-0.5 bg-current" style={{ color: CHART_COLORS[0] }} />
              <div className="w-1.5 h-0.5 bg-current" style={{ color: CHART_COLORS[0] }} />
              <div className="w-1.5 h-0.5 bg-current" style={{ color: CHART_COLORS[0] }} />
            </div>
            <span className="text-muted-foreground">Forecasted</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={allData}>
            <CartesianGrid {...chartStyles.cartesianGrid} />
            <XAxis dataKey="month" {...chartStyles.xAxis} />
            <YAxis {...chartStyles.yAxis} />
            <Tooltip {...chartStyles.tooltip} />
            <Legend {...chartStyles.legend} />
            
            {historical.length > 0 && (
              <ReferenceLine 
                x={historical[historical.length - 1]?.month} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="3 3"
                label={{ value: "Today", position: "top", fill: "hsl(var(--muted-foreground))" }}
              />
            )}
            
            <Area 
              type="monotone" 
              dataKey="revenue" 
              data={historical}
              stroke={CHART_COLORS[0]} 
              fill={CHART_COLORS[0]} 
              name="Revenue (Historical)" 
              {...areaStyles}
            />
            <Area 
              type="monotone" 
              dataKey="revenue" 
              data={forecast}
              stroke={CHART_COLORS[0]} 
              fill={CHART_COLORS[0]} 
              fillOpacity={0.3}
              name="Revenue (Forecast)" 
              strokeDasharray="5 5"
              {...areaStyles}
            />
            
            <Area 
              type="monotone" 
              dataKey="expenses" 
              data={historical}
              stroke={CHART_COLORS[3]} 
              fill={CHART_COLORS[3]} 
              name="Expenses (Historical)" 
              {...areaStyles}
            />
            <Area 
              type="monotone" 
              dataKey="expenses" 
              data={forecast}
              stroke={CHART_COLORS[3]} 
              fill={CHART_COLORS[3]} 
              fillOpacity={0.3}
              name="Expenses (Forecast)" 
              strokeDasharray="5 5"
              {...areaStyles}
            />
            
            <Area 
              type="monotone" 
              dataKey="profit" 
              data={historical}
              stroke={CHART_COLORS[1]} 
              fill={CHART_COLORS[1]} 
              name="Profit (Historical)" 
              {...areaStyles}
            />
            <Area 
              type="monotone" 
              dataKey="profit" 
              data={forecast}
              stroke={CHART_COLORS[1]} 
              fill={CHART_COLORS[1]} 
              fillOpacity={0.3}
              name="Profit (Forecast)" 
              strokeDasharray="5 5"
              {...areaStyles}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
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

function DemoForecastCharts({ analytics }: { analytics: any }) {
  if (!analytics?.forecasting) return null;

  const { historicalData = [], currentMonth, forecast6Months = [] } = analytics.forecasting;
  
  const historical = [
    ...historicalData,
    ...(currentMonth ? [currentMonth] : []),
  ];
  
  const forecast = forecast6Months.length > 0 && historical.length > 0
    ? [historical[historical.length - 1], ...forecast6Months]
    : forecast6Months;
  
  const allData = [...historical, ...forecast.slice(1)];
  const actualCount = historical.length;

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
              <AreaChart data={allData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="demoRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartStyles.cartesianGrid} />
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
                <Tooltip {...chartStyles.tooltip} />
                {actualCount > 0 && actualCount < allData.length && (
                  <ReferenceLine
                    x={allData[actualCount - 1]?.month}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS[0]}
                  fill="url(#demoRevenueGradient)"
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
              <AreaChart data={allData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="demoExpensesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartStyles.cartesianGrid} />
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
                <Tooltip {...chartStyles.tooltip} />
                {actualCount > 0 && actualCount < allData.length && (
                  <ReferenceLine
                    x={allData[actualCount - 1]?.month}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke={CHART_COLORS[3]}
                  fill="url(#demoExpensesGradient)"
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
              <AreaChart data={allData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="demoProfitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartStyles.cartesianGrid} />
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
                <Tooltip {...chartStyles.tooltip} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                {actualCount > 0 && actualCount < allData.length && (
                  <ReferenceLine
                    x={allData[actualCount - 1]?.month}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke={CHART_COLORS[1]}
                  fill="url(#demoProfitGradient)"
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

export default function Analytics() {
  const [, params] = useRoute("/analytics/:section");
  const [, setLocation] = useLocation();
  const section = params?.section || "spend";
  const [timeRange, setTimeRange] = useState("30");

  const { data: analytics, isLoading, error } = useQuery<any>({
    queryKey: ["analytics", "demo", timeRange],
    queryFn: () => demoDataService.getAnalytics(),
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

  const handleTabChange = (value: string) => {
    if (value === "spend") {
      setLocation("/analytics");
    } else {
      setLocation(`/analytics/${value}`);
    }
  };

  const getSectionTitle = () => {
    switch (section) {
      case "revenue": return "Revenue Analytics";
      case "profitability": return "Profitability Analytics";
      case "forecasting": return "Forecasting Analytics";
      default: return "Spend Analytics";
    }
  };

  const getSectionDescription = () => {
    switch (section) {
      case "revenue": return "Track revenue streams and growth metrics";
      case "profitability": return "Analyze margins and profitability trends";
      case "forecasting": return "Predict future financial performance";
      default: return "Deep insights into your spending patterns";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{getSectionTitle()}</h1>
          <p className="text-muted-foreground">{getSectionDescription()}</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-48" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={section} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="spend" data-testid="tab-spend">Spend</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          <TabsTrigger value="profitability" data-testid="tab-profitability">Profitability</TabsTrigger>
          <TabsTrigger value="forecasting" data-testid="tab-forecasting">Forecasting</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "spend" && (
      <>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Spend Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics?.spendTrend || []}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="date" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Legend {...chartStyles.legend} />
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
              <CardTitle>Category Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics?.categoryDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {(analytics?.categoryDistribution || []).map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartStyles.tooltip} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Spending</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics?.departmentSpending || []}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="name" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Bar dataKey="value" fill={CHART_COLORS[0]} {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics?.topVendors || []} layout="vertical">
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis type="number" {...chartStyles.xAxis} />
                  <YAxis dataKey="name" type="category" width={100} {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Bar dataKey="value" fill={CHART_COLORS[1]} {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={analytics?.monthlyComparison || []}>
                <CartesianGrid {...chartStyles.cartesianGrid} />
                <XAxis dataKey="month" {...chartStyles.xAxis} />
                <YAxis {...chartStyles.yAxis} />
                <Tooltip {...chartStyles.tooltip} />
                <Legend {...chartStyles.legend} />
                <Bar dataKey="current" fill={CHART_COLORS[0]} name="This Year" {...barStyles} />
                <Bar dataKey="previous" fill={CHART_COLORS[2]} name="Last Year" {...barStyles} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <ActionPlanModule 
          title="AI-Generated Action Plan"
          description="Actionable insights based on your spend data"
          items={analytics?.spendActionPlan || []}
        />
      </>
      )}

      {section === "revenue" && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={analytics?.revenue?.revenueGrowth || []}>
                    <CartesianGrid {...chartStyles.cartesianGrid} />
                    <XAxis dataKey="month" {...chartStyles.xAxis} />
                    <YAxis {...chartStyles.yAxis} />
                    <Tooltip {...chartStyles.tooltip} />
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
                <CardTitle>MRR vs ARR</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.revenue?.mrrArr || []}>
                    <CartesianGrid {...chartStyles.cartesianGrid} />
                    <XAxis dataKey="month" {...chartStyles.xAxis} />
                    <YAxis {...chartStyles.yAxis} />
                    <Tooltip {...chartStyles.tooltip} />
                    <Legend {...chartStyles.legend} />
                    <Line 
                      type="monotone" 
                      dataKey="mrr" 
                      stroke={CHART_COLORS[0]} 
                      name="MRR" 
                      {...lineStyles}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="arr" 
                      stroke={CHART_COLORS[1]} 
                      name="ARR" 
                      {...lineStyles}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue by Source</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics?.revenue?.revenueSources || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {(analytics?.revenue?.revenueSources || []).map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartStyles.tooltip} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <ActionPlanModule 
            title="Revenue Growth Action Plan"
            description="Strategic insights to accelerate revenue growth"
            items={analytics?.revenueActionPlan || []}
          />
        </>
      )}

      {section === "profitability" && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Profit Margins</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.profitability?.margins || []}>
                    <CartesianGrid {...chartStyles.cartesianGrid} />
                    <XAxis dataKey="month" {...chartStyles.xAxis} />
                    <YAxis {...chartStyles.yAxis} />
                    <Tooltip {...chartStyles.tooltip} />
                    <Legend {...chartStyles.legend} />
                    <Line 
                      type="monotone" 
                      dataKey="gross" 
                      stroke={CHART_COLORS[0]} 
                      name="Gross Margin %" 
                      {...lineStyles}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="operating" 
                      stroke={CHART_COLORS[1]} 
                      name="Operating Margin %" 
                      {...lineStyles}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="net" 
                      stroke={CHART_COLORS[2]} 
                      name="Net Margin %" 
                      {...lineStyles}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Net Income Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={analytics?.profitability?.netIncome || []}>
                    <CartesianGrid {...chartStyles.cartesianGrid} />
                    <XAxis dataKey="month" {...chartStyles.xAxis} />
                    <YAxis {...chartStyles.yAxis} />
                    <Tooltip {...chartStyles.tooltip} />
                    <Area 
                      type="monotone" 
                      dataKey="income" 
                      stroke={CHART_COLORS[0]} 
                      fill={CHART_COLORS[0]} 
                      name="Net Income" 
                      {...areaStyles}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics?.profitability?.costStructure || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {(analytics?.profitability?.costStructure || []).map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartStyles.tooltip} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <ActionPlanModule 
            title="Profitability Action Plan"
            description="Optimize margins and reduce costs"
            items={analytics?.profitabilityActionPlan || []}
          />
        </>
      )}

      {section === "forecasting" && (
        <>
          <DemoForecastCharts analytics={analytics} />

          <ForecastingChart analytics={analytics} />

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Scenario Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics?.forecasting?.scenarioAnalysis || []}>
                    <CartesianGrid {...chartStyles.cartesianGrid} />
                    <XAxis dataKey="scenario" {...chartStyles.xAxis} />
                    <YAxis {...chartStyles.yAxis} />
                    <Tooltip {...chartStyles.tooltip} />
                    <Legend {...chartStyles.legend} />
                    <Bar dataKey="revenue" fill={CHART_COLORS[0]} name="Revenue" {...barStyles} />
                    <Bar dataKey="expenses" fill={CHART_COLORS[3]} name="Expenses" {...barStyles} />
                    <Bar dataKey="profit" fill={CHART_COLORS[1]} name="Profit" {...barStyles} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cash Runway</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Runway</p>
                    <p className="text-2xl font-bold">{analytics?.forecasting?.cashRunway?.months || 0} mo</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Burn Rate</p>
                    <p className="text-2xl font-bold">${((analytics?.forecasting?.cashRunway?.burnRate || 0) / 1000).toFixed(0)}k</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cash</p>
                    <p className="text-2xl font-bold">${((analytics?.forecasting?.cashRunway?.currentCash || 0) / 1000).toFixed(0)}k</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <ActionPlanModule 
            title="Forecasting Action Plan"
            description="Strategic planning for future growth"
            items={analytics?.forecastingActionPlan || []}
          />
        </>
      )}
    </div>
  );
}
