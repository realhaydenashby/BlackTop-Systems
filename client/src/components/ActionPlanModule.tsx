import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export interface ActionPlanItem {
  id: string;
  summary: string;
  metricRef: string;
  severity: "critical" | "high" | "medium" | "low";
  recommendedAction: string;
  impact: string;
}

interface ActionPlanModuleProps {
  title?: string;
  description?: string;
  items: ActionPlanItem[];
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    variant: "destructive" as const,
    label: "Critical",
  },
  high: {
    icon: AlertTriangle,
    variant: "default" as const,
    label: "High",
  },
  medium: {
    icon: Info,
    variant: "secondary" as const,
    label: "Medium",
  },
  low: {
    icon: CheckCircle2,
    variant: "outline" as const,
    label: "Low",
  },
};

export function ActionPlanModule({ 
  title = "AI-Generated Action Plan", 
  description = "Actionable insights based on your data",
  items 
}: ActionPlanModuleProps) {
  return (
    <Card data-testid="action-plan-module">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => {
          const config = severityConfig[item.severity];
          const Icon = config.icon;

          return (
            <Card key={item.id} data-testid={`action-item-${item.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={config.variant} data-testid={`badge-severity-${item.severity}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.metricRef}
                        </span>
                      </div>
                      <p className="font-medium text-foreground" data-testid={`text-summary-${item.id}`}>
                        {item.summary}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="pl-8 space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 font-medium">
                      Recommended Action
                    </p>
                    <p className="text-sm text-foreground" data-testid={`text-action-${item.id}`}>
                      {item.recommendedAction}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Impact:</span>
                    <span className="text-sm font-medium text-accent" data-testid={`text-impact-${item.id}`}>
                      {item.impact}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}
