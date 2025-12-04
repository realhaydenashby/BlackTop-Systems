import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  X,
  CheckCircle,
  Eye,
  Zap,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

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
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40";
    case "high": return "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40";
    case "medium": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40";
    case "low": return "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40";
    default: return "bg-muted text-muted-foreground";
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
    case "high":
      return <AlertTriangle className="h-4 w-4" />;
    case "medium":
      return <TrendingUp className="h-4 w-4" />;
    default:
      return <Eye className="h-4 w-4" />;
  }
}

function getAnomalyIcon(type: string) {
  switch (type) {
    case "spending_spike":
    case "category_spike":
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    case "vendor_anomaly":
      return <DollarSign className="h-4 w-4 text-orange-500" />;
    case "revenue_drop":
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    case "burn_acceleration":
      return <Zap className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatAnomalyMessage(anomaly: AnomalyEvent): string {
  const deviation = anomaly.deviationPercent ? `(${parseFloat(anomaly.deviationPercent).toFixed(1)}% deviation)` : "";
  const actual = anomaly.actualValue ? `$${parseFloat(anomaly.actualValue).toLocaleString()}` : "N/A";
  const expected = anomaly.expectedValue ? `$${parseFloat(anomaly.expectedValue).toLocaleString()}` : "";
  
  switch (anomaly.anomalyType) {
    case "spending_spike":
      return `Unusual spending detected: ${actual} ${expected ? `vs expected ${expected}` : ""} ${deviation}`;
    case "category_spike":
      return `Category spending spike in ${anomaly.metricName}: ${actual} ${deviation}`;
    case "vendor_anomaly":
      return `Vendor behavior change for ${anomaly.metricName}: ${actual} ${deviation}`;
    case "revenue_drop":
      return `Revenue dropped unexpectedly to ${actual} ${expected ? `from expected ${expected}` : ""} ${deviation}`;
    case "burn_acceleration":
      return `Burn rate accelerating: ${actual}/month ${expected ? `vs expected ${expected}` : ""} ${deviation}`;
    default:
      return `${anomaly.metricName}: ${actual} ${deviation}`;
  }
}

export function AnomalyAlerts({ maxItems = 5, showDetectButton = true, compact = false }: AnomalyAlertsProps) {
  const { data: anomalies, isLoading } = useQuery<AnomalyEvent[]>({
    queryKey: ["/api/ai/anomalies", { status: "new,acknowledged", limit: maxItems }],
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

  if (isLoading) {
    return (
      <Card data-testid="card-anomaly-alerts">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Anomaly Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const activeAnomalies = anomalies?.filter(a => a.status === "new" || a.status === "acknowledged") || [];

  return (
    <Card data-testid="card-anomaly-alerts">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Anomaly Alerts
          {activeAnomalies.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeAnomalies.length}
            </Badge>
          )}
        </CardTitle>
        {showDetectButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            data-testid="button-detect-anomalies"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${detectMutation.isPending ? "animate-spin" : ""}`} />
            {detectMutation.isPending ? "Scanning..." : "Scan"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {activeAnomalies.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="font-medium">No anomalies detected</p>
            <p className="text-sm">Your financial patterns look healthy</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAnomalies.slice(0, maxItems).map((anomaly) => (
              <div
                key={anomaly.id}
                className={`p-3 rounded-lg border ${getSeverityColor(anomaly.severity)}`}
                data-testid={`anomaly-item-${anomaly.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {getAnomalyIcon(anomaly.anomalyType)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getSeverityColor(anomaly.severity)}`}
                        >
                          {anomaly.severity.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(anomaly.detectedAt), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <p className={`text-sm ${compact ? "line-clamp-1" : ""}`}>
                        {formatAnomalyMessage(anomaly)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {anomaly.status === "new" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => acknowledgeMutation.mutate(anomaly.id)}
                        title="Acknowledge"
                        data-testid={`button-ack-anomaly-${anomaly.id}`}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => dismissMutation.mutate(anomaly.id)}
                      title="Dismiss"
                      data-testid={`button-dismiss-anomaly-${anomaly.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {activeAnomalies.length > maxItems && (
              <p className="text-xs text-muted-foreground text-center">
                +{activeAnomalies.length - maxItems} more anomalies
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
