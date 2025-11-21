import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Analytics() {
  const [, params] = useRoute("/analytics/:section");
  const [, setLocation] = useLocation();
  const section = params?.section || "spend";
  const [timeRange, setTimeRange] = useState("30");

  const { data: analytics } = useQuery<any>({
    queryKey: ["/api/analytics", { days: timeRange }],
  });

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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" name="Spending" strokeWidth={2} />
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
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {(analytics?.categoryDistribution || []).map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--accent))" />
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="current" fill="hsl(var(--primary))" name="This Year" />
                <Bar dataKey="previous" fill="hsl(var(--muted))" name="Last Year" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </>
      )}

      {section === "revenue" && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Revenue analytics coming soon...</p>
            </CardContent>
          </Card>
        </div>
      )}

      {section === "profitability" && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profitability Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Profitability analytics coming soon...</p>
            </CardContent>
          </Card>
        </div>
      )}

      {section === "forecasting" && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Financial Forecasting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Forecasting analytics coming soon...</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
