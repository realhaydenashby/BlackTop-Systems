import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { notificationsService } from "@/services/notificationsService";

interface Insight {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  recommendation?: string;
}

interface DashboardData {
  metrics: {
    grossBurn: number;
    netBurn: number;
    revenue: number;
    runway: number;
    cashBalance: number;
    burnChange: number;
    revenueChange: number;
  };
  insights: Insight[];
  spendByCategory: Array<{ category: string; amount: number; change: number }>;
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
  change,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  change?: number;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card data-testid={`card-metric-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1" data-testid={`value-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {value}
            </p>
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

function InsightCard({ insight }: { insight: Insight }) {
  const severityColors = {
    critical: "bg-red-500/10 text-red-500 border-red-500/20",
    warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };

  return (
    <div
      className={`p-4 rounded-lg border ${severityColors[insight.severity]}`}
      data-testid={`insight-${insight.id}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium">{insight.title}</h4>
          <p className="text-sm mt-1 opacity-80">{insight.description}</p>
          {insight.recommendation && (
            <p className="text-sm mt-2 font-medium">{insight.recommendation}</p>
          )}
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
          data-testid={`section-trigger-${title.toLowerCase()}`}
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

const fallbackData: DashboardData = {
  metrics: {
    grossBurn: 85000,
    netBurn: 65000,
    revenue: 20000,
    runway: 8.5,
    cashBalance: 552500,
    burnChange: 12,
    revenueChange: 8,
  },
  insights: [
    {
      id: "1",
      type: "runway_warning",
      severity: "warning",
      title: "8.5 months of runway remaining",
      description:
        "At your current burn rate, you will run out of cash in approximately 8.5 months.",
      recommendation:
        "Consider starting fundraising conversations or identify areas to reduce burn.",
    },
    {
      id: "2",
      type: "vendor_spike",
      severity: "info",
      title: "AWS spend up 42% this month",
      description:
        "Spending on AWS increased from $4,200 to $5,964 this month.",
      recommendation: "Review AWS charges for unexpected increases.",
    },
    {
      id: "3",
      type: "subscription_creep",
      severity: "info",
      title: "Recurring SaaS spend is $3,450/month",
      description:
        "Your subscription costs have increased 15% over the past 3 months.",
      recommendation: "Suggested potential savings: $900-$1,400/month.",
    },
  ],
  spendByCategory: [
    { category: "Payroll", amount: 45000, change: 5 },
    { category: "Software", amount: 12500, change: 18 },
    { category: "Infrastructure", amount: 8500, change: 42 },
    { category: "Marketing", amount: 6500, change: -10 },
    { category: "Office", amount: 4500, change: 0 },
    { category: "Other", amount: 8000, change: 25 },
  ],
};

export default function AppDashboard() {
  const { user } = useAuth();
  const alertCheckDone = useRef(false);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/live/dashboard"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!alertCheckDone.current && data) {
      alertCheckDone.current = true;
      notificationsService.checkBurnThreshold(data.metrics.grossBurn);
      notificationsService.checkRunwayThreshold(data.metrics.runway);
    }
  }, [data]);

  const displayData = data || fallbackData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
      </div>
    );
  }

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
          Last synced: Today, 10:30 AM
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Cash Balance"
          value={formatCurrency(displayData.metrics.cashBalance)}
          icon={DollarSign}
        />
        <MetricCard
          title="Monthly Burn"
          value={formatCurrency(displayData.metrics.netBurn)}
          change={displayData.metrics.burnChange}
          trend={displayData.metrics.burnChange > 0 ? "down" : "up"}
          icon={TrendingDown}
        />
        <MetricCard
          title="Monthly Revenue"
          value={formatCurrency(displayData.metrics.revenue)}
          change={displayData.metrics.revenueChange}
          trend={displayData.metrics.revenueChange > 0 ? "up" : "down"}
          icon={TrendingUp}
        />
        <MetricCard
          title="Runway"
          value={`${displayData.metrics.runway.toFixed(1)} months`}
          icon={Clock}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Action Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayData.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          <Section title="Spend" icon={TrendingDown} defaultOpen>
            <div className="space-y-3">
              {displayData.spendByCategory.map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between py-2"
                >
                  <span className="font-medium">{cat.category}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      {formatCurrency(cat.amount)}
                    </span>
                    <Badge
                      variant={cat.change > 0 ? "destructive" : cat.change < 0 ? "default" : "secondary"}
                      className="w-16 justify-center"
                    >
                      {formatPercent(cat.change)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Revenue" icon={TrendingUp}>
            <div className="py-4 text-center text-muted-foreground">
              <p>Connect Stripe to see revenue breakdown</p>
              <Button variant="outline" className="mt-3" data-testid="button-connect-stripe">
                Connect Stripe
              </Button>
            </div>
          </Section>

          <Section title="Burn Rate" icon={TrendingDown}>
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span>Gross Burn</span>
                <span className="font-medium">
                  {formatCurrency(displayData.metrics.grossBurn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Net Burn</span>
                <span className="font-medium">
                  {formatCurrency(displayData.metrics.netBurn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Payroll %</span>
                <span className="font-medium">53%</span>
              </div>
            </div>
          </Section>

          <Section title="Runway" icon={Clock}>
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span>Current Runway</span>
                <span className="font-bold text-lg">
                  {displayData.metrics.runway.toFixed(1)} months
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Zero Cash Date</span>
                <span>August 2026</span>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">
                  If you reduce burn by 20%, runway extends to 10.6 months.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Forecast" icon={Target}>
            <div className="py-4 text-center text-muted-foreground">
              <p>3-month forward projection based on current trends</p>
              <div className="grid grid-cols-3 gap-4 mt-4">
                {[1, 2, 3].map((month) => (
                  <div key={month} className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Month {month}
                    </p>
                    <p className="font-medium">
                      {formatCurrency(displayData.metrics.cashBalance - month * displayData.metrics.netBurn)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Raise Planning" icon={Target}>
            <div className="py-4 space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium">Recommended Raise</h4>
                <p className="text-2xl font-bold mt-1">$2.5M - $3M</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Based on 18-24 month runway target
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Start Fundraising By</span>
                  <span className="font-medium">February 2026</span>
                </div>
                <div className="flex justify-between">
                  <span>Time to Raise</span>
                  <span className="font-medium">~4 months</span>
                </div>
              </div>
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
