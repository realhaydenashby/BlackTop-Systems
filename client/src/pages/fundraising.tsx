import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { CHART_COLORS, chartStyles, lineStyles, barStyles, areaStyles } from "@/lib/chartTheme";
import { TrendingDown, TrendingUp, AlertTriangle, Users } from "lucide-react";

export default function Fundraising() {
  const [, params] = useRoute("/fundraising/:section");
  const [, setLocation] = useLocation();
  const section = params?.section || "burn";

  const { data: analytics, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analytics"],
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

  const handleTabChange = (value: string) => {
    if (value === "burn") {
      setLocation("/fundraising");
    } else {
      setLocation(`/fundraising/${value}`);
    }
  };

  const getSectionTitle = () => {
    switch (section) {
      case "runway": return "Runway Estimator";
      case "raise": return "How Much Should You Raise?";
      case "hiring": return "Headcount Planner";
      default: return "Burn Rate Analyzer";
    }
  };

  const fundraising = analytics?.fundraising || {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{getSectionTitle()}</h1>
        <p className="text-muted-foreground">Financial planning for fundraising preparation</p>
      </div>

      <Tabs value={section} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="burn" data-testid="tab-burn">Burn</TabsTrigger>
          <TabsTrigger value="runway" data-testid="tab-runway">Runway</TabsTrigger>
          <TabsTrigger value="raise" data-testid="tab-raise">Raise</TabsTrigger>
          <TabsTrigger value="hiring" data-testid="tab-hiring">Hiring</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "burn" && (
        <>
          <div className="grid gap-6 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-monthly-burn">
                  ${(fundraising.burn?.currentMonthlyBurn / 1000).toFixed(0)}k
                </div>
                <p className="text-xs text-muted-foreground mt-1">Current rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Payroll Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-payroll-burn">
                  ${(fundraising.burn?.payrollBurn / 1000).toFixed(0)}k
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((fundraising.burn?.payrollBurn / fundraising.burn?.currentMonthlyBurn) * 100).toFixed(0)}% of total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Non-Payroll Burn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-nonpayroll-burn">
                  ${(fundraising.burn?.nonPayrollBurn / 1000).toFixed(0)}k
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((fundraising.burn?.nonPayrollBurn / fundraising.burn?.currentMonthlyBurn) * 100).toFixed(0)}% of total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Burn Drift (3mo)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-burn-drift">
                  {fundraising.burn?.burnDrift?.percentageChange}
                  <TrendingUp className="w-4 h-4 text-destructive" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last 3 months</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Burn Rate Trend</CardTitle>
              <CardDescription>Payroll vs non-payroll spending over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={fundraising.burn?.burnTrend || []}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Legend {...chartStyles.legend} />
                  <Area
                    type="monotone"
                    dataKey="payroll"
                    stackId="1"
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    name="Payroll"
                    {...areaStyles}
                  />
                  <Area
                    type="monotone"
                    dataKey="nonPayroll"
                    stackId="1"
                    stroke={CHART_COLORS[1]}
                    fill={CHART_COLORS[1]}
                    name="Non-Payroll"
                    {...areaStyles}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recurring SaaS Creep</CardTitle>
              <CardDescription>New tools added in last 2 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="text-3xl font-bold mb-1" data-testid="text-saas-cost">
                  ${fundraising.burn?.saasCreep?.monthlyCost}
                </div>
                <p className="text-sm text-muted-foreground">
                  {fundraising.burn?.saasCreep?.newTools} new tools added
                </p>
              </div>
              <div className="space-y-3">
                {fundraising.burn?.saasCreep?.tools?.map((tool: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`tool-${idx}`}>
                    <div>
                      <p className="font-medium">{tool.name}</p>
                      <p className="text-sm text-muted-foreground">{tool.addedDate}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${tool.cost}/mo</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {section === "runway" && (
        <>
          <div className="grid gap-6 md:grid-cols-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Current Runway</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-current-runway">
                  {fundraising.runway?.currentRunway} mo
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${(fundraising.runway?.currentCash / 1000).toFixed(0)}k cash
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Best Case</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-best-case-runway">
                  {fundraising.runway?.bestCaseRunway} mo
                </div>
                <p className="text-xs text-muted-foreground mt-1">With optimizations</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Worst Case</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive" data-testid="text-worst-case-runway">
                  {fundraising.runway?.worstCaseRunway} mo
                </div>
                <p className="text-xs text-muted-foreground mt-1">If burn increases</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">After Cuts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-runway-after-cuts">
                  {fundraising.runway?.runwayAfterCuts} mo
                </div>
                <p className="text-xs text-muted-foreground mt-1">Cut $15K/mo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">With Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-runway-after-revenue">
                  {fundraising.runway?.runwayAfterRevenue} mo
                </div>
                <p className="text-xs text-muted-foreground mt-1">Add $26K MRR</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Runway Scenarios</CardTitle>
              <CardDescription>Cash balance projections across different scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={fundraising.runway?.runwayProjections || []}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Legend {...chartStyles.legend} />
                  <Line
                    type="monotone"
                    dataKey="current"
                    stroke={CHART_COLORS[0]}
                    name="Current"
                    {...lineStyles}
                  />
                  <Line
                    type="monotone"
                    dataKey="bestCase"
                    stroke={CHART_COLORS[2]}
                    name="Best Case"
                    {...lineStyles}
                  />
                  <Line
                    type="monotone"
                    dataKey="worstCase"
                    stroke={CHART_COLORS[4]}
                    name="Worst Case"
                    {...lineStyles}
                  />
                  <Line
                    type="monotone"
                    dataKey="withCuts"
                    stroke={CHART_COLORS[1]}
                    name="With Cuts"
                    {...lineStyles}
                    strokeDasharray="5 5"
                  />
                  <Line
                    type="monotone"
                    dataKey="withRevenue"
                    stroke={CHART_COLORS[3]}
                    name="With Revenue"
                    {...lineStyles}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            {Object.entries(fundraising.runway?.scenarioDetails || {}).slice(0, 3).map(([key, scenario]: [string, any]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Monthly Burn:</span>
                      <span className="font-semibold">${(scenario.monthlyBurn / 1000).toFixed(0)}k</span>
                    </div>
                    <p className="text-sm text-muted-foreground pt-2">{scenario.assumptions}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {section === "raise" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Recommended Raise Amount</CardTitle>
              <CardDescription>Based on your burn rate and growth plans</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                <div>
                  <div className="text-5xl font-bold text-primary mb-2" data-testid="text-sweet-spot-raise">
                    ${(fundraising.raise?.recommendedRange?.sweet / 1000000).toFixed(1)}M
                  </div>
                  <p className="text-muted-foreground">Sweet Spot</p>
                </div>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Min: ${(fundraising.raise?.recommendedRange?.min / 1000000).toFixed(1)}M
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    Max: ${(fundraising.raise?.recommendedRange?.max / 1000000).toFixed(1)}M
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            {fundraising.raise?.scenarios?.map((scenario: any, idx: number) => (
              <Card key={idx} className={scenario.strategy === "Baseline" ? "border-primary" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{scenario.strategy}</CardTitle>
                    {scenario.strategy === "Baseline" && (
                      <Badge data-testid="badge-recommended">Recommended</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold mb-1" data-testid={`text-raise-${scenario.strategy.toLowerCase()}`}>
                      ${(scenario.raise / 1000000).toFixed(1)}M
                    </div>
                    <p className="text-sm text-muted-foreground">{scenario.runway} months runway</p>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium mb-1">Assumptions:</p>
                      <p className="text-sm text-muted-foreground">{scenario.assumptions}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Outcomes:</p>
                      <p className="text-sm text-muted-foreground">{scenario.outcomes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Milestone Costing</CardTitle>
              <CardDescription>Capital needed to reach key milestones</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fundraising.raise?.milestones || []}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="milestone" {...chartStyles.xAxis} />
                  <YAxis {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Legend {...chartStyles.legend} />
                  <Bar dataKey="cost" fill={CHART_COLORS[0]} name="Capital Required" {...barStyles} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {section === "hiring" && (
        <>
          <div className="grid gap-6 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Current Team</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-current-headcount">
                  {fundraising.hiring?.currentHeadcount}
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">People</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Planned Hires</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-planned-hires">
                  {fundraising.hiring?.plannedHires?.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Next 12 months</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Hiring Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-hiring-cost">
                  ${(fundraising.hiring?.runwayImpact?.totalHiringCost / 1000).toFixed(0)}k
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total additional</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Runway Impact</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2 text-destructive" data-testid="text-runway-impact">
                  -{fundraising.hiring?.runwayImpact?.withoutHiring - fundraising.hiring?.runwayImpact?.withPlannedHiring} mo
                  <TrendingDown className="w-4 h-4" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">With hiring plan</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hiring Schedule</CardTitle>
              <CardDescription>Planned hires with fully loaded costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {fundraising.hiring?.plannedHires?.map((hire: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-lg border" data-testid={`hire-${idx}`}>
                    <div className="flex-1">
                      <p className="font-medium">{hire.role}</p>
                      <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                        <span>Month {hire.month}</span>
                        <span>•</span>
                        <span>Salary: ${(hire.salary / 1000).toFixed(0)}k</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${(hire.fullyLoadedCost / 1000).toFixed(0)}k</p>
                      <p className="text-xs text-muted-foreground">Fully loaded</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payroll Growth Projection</CardTitle>
              <CardDescription>Monthly payroll and headcount over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={fundraising.hiring?.payrollProjection || []}>
                  <CartesianGrid {...chartStyles.cartesianGrid} />
                  <XAxis dataKey="month" {...chartStyles.xAxis} />
                  <YAxis yAxisId="left" {...chartStyles.yAxis} />
                  <YAxis yAxisId="right" orientation="right" {...chartStyles.yAxis} />
                  <Tooltip {...chartStyles.tooltip} />
                  <Legend {...chartStyles.legend} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="payroll"
                    stroke={CHART_COLORS[0]}
                    name="Monthly Payroll"
                    {...lineStyles}
                  />
                  <Line
                    yAxisId="right"
                    type="stepAfter"
                    dataKey="headcount"
                    stroke={CHART_COLORS[1]}
                    name="Headcount"
                    {...lineStyles}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
