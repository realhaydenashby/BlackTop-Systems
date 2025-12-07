import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Check, X, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePlanAccess } from "@/hooks/usePlanAccess";

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
  insightType?: string;
  interactive?: boolean;
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
  items,
  insightType = "action_plan",
  interactive = true
}: ActionPlanModuleProps) {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "dismissed">>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canAccess } = usePlanAccess();
  
  const canUseInteractive = canAccess("aiInsights") && interactive;

  const decisionMutation = useMutation({
    mutationFn: async ({ itemId, status, summary, recommendedAction }: { 
      itemId: string; 
      status: "approved" | "dismissed";
      summary: string;
      recommendedAction: string;
    }) => {
      return apiRequest("/api/live/action-decisions", {
        method: "POST",
        body: JSON.stringify({
          insightType,
          insightId: itemId,
          summary,
          recommendedAction,
          status,
        }),
      });
    },
    onSuccess: (_, variables) => {
      setDecisions(prev => ({ ...prev, [variables.itemId]: variables.status }));
      queryClient.invalidateQueries({ queryKey: ["/api/live/action-decisions"] });
      toast({
        title: variables.status === "approved" ? "Action approved" : "Action dismissed",
        description: variables.status === "approved" 
          ? "This action has been added to your workflow queue."
          : "This insight has been dismissed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save decision. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDecision = (item: ActionPlanItem, status: "approved" | "dismissed") => {
    decisionMutation.mutate({
      itemId: item.id,
      status,
      summary: item.summary,
      recommendedAction: item.recommendedAction,
    });
  };

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
          const decision = decisions[item.id];
          const isDecided = !!decision;

          return (
            <Card 
              key={item.id} 
              data-testid={`action-item-${item.id}`}
              className={isDecided ? "opacity-60" : ""}
            >
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
                        {isDecided && (
                          <Badge 
                            variant={decision === "approved" ? "default" : "secondary"}
                            className="ml-auto"
                          >
                            {decision === "approved" ? (
                              <><Check className="h-3 w-3 mr-1" /> Approved</>
                            ) : (
                              <><X className="h-3 w-3 mr-1" /> Dismissed</>
                            )}
                          </Badge>
                        )}
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
                  
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Impact:</span>
                      <span className="text-sm font-medium text-accent" data-testid={`text-impact-${item.id}`}>
                        {item.impact}
                      </span>
                    </div>
                    
                    {canUseInteractive && !isDecided && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecision(item, "dismissed")}
                          disabled={decisionMutation.isPending}
                          data-testid={`button-dismiss-${item.id}`}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDecision(item, "approved")}
                          disabled={decisionMutation.isPending}
                          data-testid={`button-approve-${item.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                      </div>
                    )}
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
