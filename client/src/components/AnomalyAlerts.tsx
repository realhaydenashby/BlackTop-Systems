import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  RefreshCw,
  X,
  CheckCircle,
  Eye,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface AnomalyEvent {
  id: string;
  organizationId: string;
  anomalyType: "spending_spike" | "category_spike" | "vendor_anomaly" | "recurring_change" | "revenue_drop" | "burn_acceleration";
  severity: "low" | "medium" | "high" | "critical";
  metricName: string;
  expectedValue?: string;
  actualValue: string;
  deviationPercent?: string;
  context?: Record<string, any>;
  status: "new" | "acknowledged" | "resolved" | "dismissed";
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

interface AnomalyAlertsProps {
  maxItems?: number;
  showDetectButton?: boolean;
  compact?: boolean;
  demoData?: AnomalyEvent[];
}

function getSeverityDotColor(severity: string) {
  switch (severity) {
    case "critical": return "bg-[hsl(var(--severity-critical))]";
    case "high": return "bg-[hsl(var(--severity-high))]";
    case "medium": return "bg-[hsl(var(--severity-medium))]";
    case "low": return "bg-[hsl(var(--severity-low))]";
    default: return "bg-muted-foreground";
  }
}

function formatAnomalyTitle(anomaly: AnomalyEvent): string {
  switch (anomaly.anomalyType) {
    case "spending_spike":
      return "Unusual spending detected";
    case "category_spike":
      return `${anomaly.metricName} spike`;
    case "vendor_anomaly":
      return `${anomaly.metricName} change`;
    case "revenue_drop":
      return "Revenue drop";
    case "burn_acceleration":
      return "Burn rate increasing";
    default:
      return anomaly.metricName;
  }
}

function formatAnomalyDetail(anomaly: AnomalyEvent): string {
  const actual = anomaly.actualValue ? `$${parseFloat(anomaly.actualValue).toLocaleString()}` : "";
  const expected = anomaly.expectedValue ? `$${parseFloat(anomaly.expectedValue).toLocaleString()}` : "";
  const deviation = anomaly.deviationPercent ? `${parseFloat(anomaly.deviationPercent).toFixed(0)}%` : "";
  
  if (deviation && expected) {
    return `${actual} vs ${expected} (${deviation} off)`;
  } else if (deviation) {
    return `${actual} · ${deviation} deviation`;
  } else if (expected) {
    return `${actual} vs ${expected}`;
  }
  return actual;
}

export function AnomalyAlerts({ maxItems = 5, showDetectButton = true, compact = false, demoData }: AnomalyAlertsProps) {
  const isDemo = !!demoData;
  
  const { data: anomalies, isLoading } = useQuery<AnomalyEvent[]>({
    queryKey: ["/api/ai/anomalies", { status: "new,acknowledged", limit: maxItems }],
    enabled: !isDemo,
  });

  const detectMutation = useMutation({
    mutationFn: () => apiRequest("/api/ai/detect-anomalies", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/anomalies"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ai/anomalies/${id}`, "PATCH", { status: "dismissed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/anomalies"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ai/anomalies/${id}`, "PATCH", { status: "acknowledged" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/anomalies"] });
    },
  });

  if (!isDemo && isLoading) {
    return (
      <Card data-testid="card-anomaly-alerts">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Anomalies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const dataToUse = isDemo ? demoData : anomalies;
  const activeAnomalies = dataToUse?.filter(a => a.status === "new" || a.status === "acknowledged") || [];

  return (
    <Card data-testid="card-anomaly-alerts">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Anomalies
          {activeAnomalies.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({activeAnomalies.length})
            </span>
          )}
        </CardTitle>
        {showDetectButton && !isDemo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            data-testid="button-detect-anomalies"
          >
            <RefreshCw className={`h-4 w-4 ${detectMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {activeAnomalies.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500/70" />
            <p className="text-sm">No anomalies detected</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activeAnomalies.slice(0, maxItems).map((anomaly) => (
              <div
                key={anomaly.id}
                className="group flex items-start gap-3 py-2.5 px-1 rounded-md hover-elevate"
                data-testid={`anomaly-item-${anomaly.id}`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getSeverityDotColor(anomaly.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-medium ${compact ? "line-clamp-1" : ""}`}>
                      {formatAnomalyTitle(anomaly)}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(new Date(anomaly.detectedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatAnomalyDetail(anomaly)}
                  </p>
                </div>
                {!isDemo && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {anomaly.status === "new" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => acknowledgeMutation.mutate(anomaly.id)}
                        title="Acknowledge"
                        data-testid={`button-ack-anomaly-${anomaly.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => dismissMutation.mutate(anomaly.id)}
                      title="Dismiss"
                      data-testid={`button-dismiss-anomaly-${anomaly.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {activeAnomalies.length > maxItems && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                +{activeAnomalies.length - maxItems} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
