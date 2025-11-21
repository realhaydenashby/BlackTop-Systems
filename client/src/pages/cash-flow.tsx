import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, DollarSign } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { CHART_COLORS, chartStyles, lineStyles } from "@/lib/chartTheme";
import { ActionPlanModule } from "@/components/ActionPlanModule";

export default function CashFlow() {
  const mockCashFlowData = [
    { month: "Jan", actual: 45000, forecast: 48000, lower: 42000, upper: 54000 },
    { month: "Feb", actual: 52000, forecast: 51000, lower: 47000, upper: 57000 },
    { month: "Mar", actual: 48000, forecast: 54000, lower: 50000, upper: 60000 },
    { month: "Apr", actual: null, forecast: 58000, lower: 52000, upper: 64000 },
    { month: "May", actual: null, forecast: 62000, lower: 56000, upper: 70000 },
    { month: "Jun", actual: null, forecast: 67000, lower: 60000, upper: 76000 },
  ];

  const mockActionPlan = [
    {
      id: "cf1",
      summary: "Strong cash runway above 6-month threshold",
      metricRef: "Runway: 8.5 months",
      severity: "low" as const,
      recommendedAction: "Consider strategic investments in growth initiatives like hiring or marketing campaigns to accelerate revenue.",
      impact: "Potential 20-30% revenue increase",
    },
    {
      id: "cf2",
      summary: "Seasonal revenue dip forecasted in May",
      metricRef: "Revenue trend analysis",
      severity: "medium" as const,
      recommendedAction: "Prepare cash buffer or accelerate collections in Q2 to offset the historical 15% seasonal decrease.",
      impact: "Maintain 7+ month runway",
    },
    {
      id: "cf3",
      summary: "Burn rate trending upward from Q1",
      metricRef: "Monthly burn: $17,450",
      severity: "medium" as const,
      recommendedAction: "Review variable costs and negotiate better terms with top 3 vendors to reduce burn by 10-15%.",
      impact: "Extend runway by 1-2 months",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cash Flow</h1>
        <p className="text-muted-foreground">90-day cash flow forecast and runway analysis</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-current-cash">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Current Cash</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-current-cash">$148,250</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">+12%</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-runway">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Runway</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-runway">8.5 months</div>
            <p className="text-xs text-muted-foreground">At current burn rate</p>
          </CardContent>
        </Card>

        <Card data-testid="card-burn-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-burn-rate">$17,450</div>
            <p className="text-xs text-muted-foreground">Average last 3 months</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>90-Day Cash Flow Forecast</CardTitle>
          <CardDescription>Projected cash position with confidence intervals</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={mockCashFlowData}>
              <defs>
                <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid {...chartStyles.cartesianGrid} />
              <XAxis dataKey="month" {...chartStyles.xAxis} />
              <YAxis {...chartStyles.yAxis} />
              <Tooltip {...chartStyles.tooltip} />
              <Legend {...chartStyles.legend} />
              <Area 
                type="monotone" 
                dataKey="upper" 
                stroke="none" 
                fill={CHART_COLORS[2]} 
                fillOpacity={0.2}
                name="Upper Bound"
              />
              <Area 
                type="monotone" 
                dataKey="lower" 
                stroke="none" 
                fill="hsl(var(--background))" 
                fillOpacity={1}
              />
              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke={CHART_COLORS[1]} 
                name="Actual"
                {...lineStyles}
                dot={{ r: 5 }}
              />
              <Line 
                type="monotone" 
                dataKey="forecast" 
                stroke={CHART_COLORS[0]} 
                strokeDasharray="5 5"
                name="Forecast"
                {...lineStyles}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenario Analysis</CardTitle>
          <CardDescription>Impact of different growth scenarios on runway</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Conservative (-20% revenue)</span>
                <span className="text-sm font-bold">6.2 months</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-destructive" style={{ width: "52%" }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Base Case (current trend)</span>
                <span className="text-sm font-bold">8.5 months</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500" style={{ width: "71%" }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Optimistic (+30% revenue)</span>
                <span className="text-sm font-bold">12.3 months</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ActionPlanModule 
        title="Cash Flow Action Plan"
        description="Strategic recommendations for cash management"
        items={mockActionPlan}
      />

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button variant="outline" data-testid="button-export-forecast">
            Export Forecast
          </Button>
          <Button variant="outline" data-testid="button-scenario-builder">
            Scenario Builder
          </Button>
          <Button variant="outline" data-testid="button-hiring-planner">
            Hiring Capacity Planner
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
