import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Zap,
  ArrowRight,
  Clock,
  DollarSign,
  X
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

interface ProactiveInsight {
  id: string;
  type: "runway_drop" | "burn_spike" | "revenue_change" | "vendor_spike" | "payroll_drift" | "subscription_creep";
  severity: "critical" | "warning" | "info" | "positive";
  headline: string;
  detail: string;
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  actionLabel: string;
  actionLink: string;
  discoveredAt: string;
}

interface ProactiveInsightResponse {
  topInsight: ProactiveInsight | null;
  hasData: boolean;
}

const severityConfig = {
  critical: {
    bgClass: "bg-red-500/10 border-red-500/30",
    textClass: "text-red-500",
    badgeClass: "bg-red-500/20 text-red-600 border-red-500/30",
    icon: AlertTriangle,
  },
  warning: {
    bgClass: "bg-yellow-500/10 border-yellow-500/30",
    textClass: "text-yellow-600",
    badgeClass: "bg-yellow-500/20 text-yellow-700 border-yellow-500/30",
    icon: TrendingDown,
  },
  info: {
    bgClass: "bg-blue-500/10 border-blue-500/30",
    textClass: "text-blue-500",
    badgeClass: "bg-blue-500/20 text-blue-600 border-blue-500/30",
    icon: Zap,
  },
  positive: {
    bgClass: "bg-green-500/10 border-green-500/30",
    textClass: "text-green-500",
    badgeClass: "bg-green-500/20 text-green-600 border-green-500/30",
    icon: TrendingUp,
  },
};

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

export function ProactiveInsightBanner() {
  const [dismissed, setDismissed] = useState(false);
  
  const { data, isLoading } = useQuery<ProactiveInsightResponse>({
    queryKey: ["/api/live/proactive-insight"],
    refetchInterval: 300000,
  });

  if (isLoading || !data?.topInsight || dismissed) {
    return null;
  }

  const insight = data.topInsight;
  const config = severityConfig[insight.severity];
  const Icon = config.icon;

  return (
    <Card 
      className={`relative border-2 ${config.bgClass} overflow-hidden`}
      data-testid="proactive-insight-banner"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <CardContent className="p-4 relative">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${config.bgClass}`}>
            <Icon className={`h-6 w-6 ${config.textClass}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={config.badgeClass}>
                <Zap className="h-3 w-3 mr-1" />
                Financial Alert
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Just detected
              </span>
            </div>
            
            <h3 className="text-lg font-bold tracking-tight" data-testid="insight-headline">
              {insight.headline}
            </h3>
            
            <p className="text-sm text-muted-foreground mt-1" data-testid="insight-detail">
              {insight.detail}
            </p>
            
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Was:</span>
                <span className="font-medium">{formatCurrency(insight.previousValue)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Now:</span>
                <span className={`font-bold ${config.textClass}`}>
                  {formatCurrency(insight.currentValue)}
                </span>
                <Badge variant="outline" className={config.badgeClass}>
                  {formatPercent(insight.changePercent)}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link href={insight.actionLink}>
              <Button size="sm" data-testid="insight-action-button">
                {insight.actionLabel}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setDismissed(true)}
              data-testid="dismiss-insight-button"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
