import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Brain,
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Lightbulb,
  BarChart3,
} from "lucide-react";

interface AIInsight {
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  confidence: number;
  actionable: boolean;
  suggestedActions?: string[];
}

interface InsightsResult {
  insights: AIInsight[];
  confidence: number;
  source: "algorithm" | "ai" | "hybrid";
}

interface EnhancedInsightsProps {
  maxItems?: number;
  showSource?: boolean;
  demoData?: InsightsResult;
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-500/20 text-red-700 dark:text-red-300";
    case "high": return "bg-orange-500/20 text-orange-700 dark:text-orange-300";
    case "medium": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
    case "low": return "bg-blue-500/20 text-blue-700 dark:text-blue-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function getPriorityIcon(priority: string) {
  switch (priority) {
    case "critical":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "high":
      return <TrendingUp className="h-4 w-4 text-orange-500" />;
    case "medium":
      return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    case "low":
      return <CheckCircle className="h-4 w-4 text-blue-500" />;
    default:
      return <BarChart3 className="h-4 w-4 text-muted-foreground" />;
  }
}

function getSourceIcon(source: string) {
  switch (source) {
    case "algorithm":
      return <Calculator className="h-4 w-4" />;
    case "ai":
      return <Brain className="h-4 w-4" />;
    case "hybrid":
      return <Sparkles className="h-4 w-4" />;
    default:
      return <BarChart3 className="h-4 w-4" />;
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case "algorithm": return "Algorithm-based";
    case "ai": return "AI-generated";
    case "hybrid": return "Algorithm + AI";
    default: return source;
  }
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  let colorClass = "text-red-600";
  let barColor = "[&>div]:bg-red-500";
  if (percentage >= 80) {
    colorClass = "text-green-600";
    barColor = "[&>div]:bg-green-500";
  } else if (percentage >= 60) {
    colorClass = "text-yellow-600";
    barColor = "[&>div]:bg-yellow-500";
  } else if (percentage >= 40) {
    colorClass = "text-orange-600";
    barColor = "[&>div]:bg-orange-500";
  }

  return (
    <div className="flex items-center gap-2">
      <Progress value={percentage} className={`h-1.5 flex-1 ${barColor}`} />
      <span className={`text-xs w-8 ${colorClass}`}>{percentage}%</span>
    </div>
  );
}

export function EnhancedInsights({ maxItems = 5, showSource = true, demoData }: EnhancedInsightsProps) {
  const isDemo = !!demoData;
  
  const { data: insightsData, isLoading, error } = useQuery<InsightsResult>({
    queryKey: ["/api/ai/insights"],
    enabled: !isDemo,
  });

  if (!isDemo && isLoading) {
    return (
      <Card data-testid="card-enhanced-insights">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const dataToUse = isDemo ? demoData : insightsData;

  if (!isDemo && (error || !dataToUse)) {
    return (
      <Card data-testid="card-enhanced-insights">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium">Unable to generate insights</p>
            <p className="text-sm">Connect a data source to enable AI analysis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { insights, confidence, source } = dataToUse!;

  return (
    <Card data-testid="card-enhanced-insights">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Insights
          </CardTitle>
          {showSource && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              {getSourceIcon(source)}
              {getSourceLabel(source)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Confidence:</span>
          <div className="w-20">
            <ConfidenceBar confidence={confidence} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="font-medium">All clear</p>
            <p className="text-sm">No significant insights to report at this time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.slice(0, maxItems).map((insight, index) => (
              <div
                key={index}
                className="p-3 rounded-lg border bg-card"
                data-testid={`insight-item-${index}`}
              >
                <div className="flex items-start gap-3">
                  {getPriorityIcon(insight.priority)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">{insight.title}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getPriorityColor(insight.priority)}`}
                      >
                        {insight.priority}
                      </Badge>
                      {insight.actionable && (
                        <Badge variant="secondary" className="text-xs">
                          Actionable
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {insight.description}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs">
                        {insight.category}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Confidence:</span>
                        <span className={insight.confidence >= 0.8 ? "text-green-600" : insight.confidence >= 0.6 ? "text-yellow-600" : "text-orange-600"}>
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    {insight.suggestedActions && insight.suggestedActions.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs font-medium mb-1">Suggested Actions:</p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                          {insight.suggestedActions.slice(0, 2).map((action, i) => (
                            <li key={i}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {insights.length > maxItems && (
              <p className="text-xs text-muted-foreground text-center">
                +{insights.length - maxItems} more insights
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
