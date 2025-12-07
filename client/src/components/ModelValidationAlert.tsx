import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  AlertCircle, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ValidationIssue {
  id: string;
  field: string;
  fieldLabel: string;
  currentValue: number;
  suggestedValue: number;
  severity: "warning" | "critical";
  reason: string;
  historical: {
    min: number;
    max: number;
    average: number;
    trend: "increasing" | "decreasing" | "stable";
  };
}

interface ValidationResult {
  isValid: boolean;
  confidenceScore: number;
  issues: ValidationIssue[];
  historicalBaseline: {
    avgMonthlyRevenue: number;
    avgMonthlyExpenses: number;
    avgBurnRate: number;
    revenueGrowthRate: number;
    expenseGrowthRate: number;
  };
}

interface ScenarioInputs {
  startingCash?: number;
  monthlyRevenueGrowth?: number;
  revenueVolatility?: number;
  monthlyExpenseGrowth?: number;
  expenseVolatility?: number;
  forecastMonths?: number;
  plannedHires?: { role: string; annualSalary: number; startMonth: number }[];
  plannedExpenses?: { name: string; monthlyAmount: number; startMonth: number }[];
}

interface ModelValidationAlertProps {
  inputs: ScenarioInputs;
  onCorrection?: (field: string, suggestedValue: number) => void;
  onValidationComplete?: (result: ValidationResult) => void;
  autoValidate?: boolean;
}

function formatValue(field: string, value: number): string {
  if (field.includes("Growth") || field.includes("Volatility")) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (field.includes("Cash") || field.includes("alary") || field.includes("mount")) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  }
  return value.toFixed(2);
}

function TrendIcon({ trend }: { trend: "increasing" | "decreasing" | "stable" }) {
  switch (trend) {
    case "increasing":
      return <TrendingUp className="h-3 w-3 text-green-500" />;
    case "decreasing":
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    default:
      return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
  }
}

function ValidationIssueCard({
  issue,
  onAcceptSuggestion,
  onDismiss,
}: {
  issue: ValidationIssue;
  onAcceptSuggestion: () => void;
  onDismiss: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`border rounded-lg p-4 ${
        issue.severity === "critical" 
          ? "border-red-500/50 bg-red-500/5" 
          : "border-yellow-500/50 bg-yellow-500/5"
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {issue.severity === "critical" ? (
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{issue.fieldLabel}</span>
                <Badge variant={issue.severity === "critical" ? "destructive" : "outline"}>
                  {issue.severity}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{issue.reason}</p>
              
              <div className="flex items-center gap-4 mt-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Current: </span>
                  <span className="font-medium text-foreground">
                    {formatValue(issue.field, issue.currentValue)}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Suggested: </span>
                  <span className="font-medium text-green-600">
                    {formatValue(issue.field, issue.suggestedValue)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={onAcceptSuggestion}
              data-testid={`button-accept-${issue.id}`}
            >
              <Check className="h-4 w-4 mr-1" />
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              data-testid={`button-dismiss-${issue.id}`}
            >
              <X className="h-4 w-4" />
            </Button>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        
        <CollapsibleContent>
          <div className="mt-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-2">Historical Context</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Range: </span>
                <span>
                  {formatValue(issue.field, issue.historical.min)} - {formatValue(issue.field, issue.historical.max)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Average: </span>
                <span>{formatValue(issue.field, issue.historical.average)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Trend: </span>
                <TrendIcon trend={issue.historical.trend} />
                <span className="capitalize">{issue.historical.trend}</span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ModelValidationAlert({
  inputs,
  onCorrection,
  onValidationComplete,
  autoValidate = true,
}: ModelValidationAlertProps) {
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set());
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [autoValidationTriggered, setAutoValidationTriggered] = useState(false);

  const validateMutation = useMutation({
    mutationFn: async (scenarioInputs: ScenarioInputs) => {
      const response = await apiRequest("POST", "/api/live/validate-model", scenarioInputs);
      return response.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidationResult(data);
      onValidationComplete?.(data);
    },
  });

  const normalizeInputs = useCallback((inp: ScenarioInputs) => ({
    startingCash: inp.startingCash,
    monthlyRevenueGrowth: inp.monthlyRevenueGrowth,
    monthlyExpenseGrowth: inp.monthlyExpenseGrowth,
    revenueVolatility: inp.revenueVolatility,
    expenseVolatility: inp.expenseVolatility,
    plannedHires: inp.plannedHires ? [...inp.plannedHires] : [],
    plannedExpenses: inp.plannedExpenses ? [...inp.plannedExpenses] : [],
    forecastHorizon: inp.forecastHorizon,
    forecastMonths: inp.forecastMonths,
  }), []);

  const inputsHash = useMemo(() => JSON.stringify(normalizeInputs(inputs)), [inputs, normalizeInputs]);
  
  const latestInputsRef = useRef(inputs);
  const queuedHashRef = useRef<string | null>(null);
  const lastValidatedHashRef = useRef<string | null>(null);

  useEffect(() => {
    latestInputsRef.current = inputs;
  }, [inputs]);

  const runValidation = useCallback(() => {
    const currentHash = JSON.stringify(normalizeInputs(latestInputsRef.current));
    lastValidatedHashRef.current = currentHash;
    queuedHashRef.current = null;
    validateMutation.mutate(latestInputsRef.current);
  }, [normalizeInputs, validateMutation]);

  useEffect(() => {
    if (autoValidate && !autoValidationTriggered) {
      setAutoValidationTriggered(true);
      runValidation();
    }
  }, [autoValidate, autoValidationTriggered, runValidation]);

  useEffect(() => {
    if (!autoValidationTriggered) return;
    
    const currentHash = inputsHash;
    if (currentHash === lastValidatedHashRef.current) return;

    if (validateMutation.isPending) {
      queuedHashRef.current = currentHash;
      return;
    }

    const timeoutId = setTimeout(() => {
      runValidation();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [inputsHash, autoValidationTriggered, validateMutation.isPending, runValidation]);

  useEffect(() => {
    if (!validateMutation.isPending && queuedHashRef.current) {
      const timeoutId = setTimeout(() => {
        runValidation();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [validateMutation.isPending, runValidation]);

  const handleValidate = () => {
    validateMutation.mutate(inputs);
  };

  const handleAcceptSuggestion = (issue: ValidationIssue) => {
    onCorrection?.(issue.field, issue.suggestedValue);
    setDismissedIssues((prev) => new Set([...prev, issue.id]));
  };

  const handleDismiss = (issue: ValidationIssue) => {
    setDismissedIssues((prev) => new Set([...prev, issue.id]));
  };

  const visibleIssues = validationResult?.issues.filter(
    (issue) => !dismissedIssues.has(issue.id)
  ) || [];

  const criticalCount = visibleIssues.filter((i) => i.severity === "critical").length;
  const warningCount = visibleIssues.filter((i) => i.severity === "warning").length;

  if (!validationResult) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            {validateMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
            Model Validation
          </CardTitle>
          <CardDescription>
            {validateMutation.isPending 
              ? "Analyzing your scenario against historical data..."
              : "Check your scenario assumptions against historical data and industry benchmarks"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validateMutation.isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Validating assumptions...</span>
            </div>
          ) : (
            <Button 
              onClick={handleValidate} 
              data-testid="button-validate-model"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Validate Assumptions
            </Button>
          )}
          {validateMutation.isError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Failed</AlertTitle>
              <AlertDescription>
                Unable to validate your model. Please try again later.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  if (visibleIssues.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            Model Validated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-green-500/50 bg-green-500/5">
            <Check className="h-4 w-4 text-green-500" />
            <AlertTitle>All assumptions look reasonable</AlertTitle>
            <AlertDescription>
              Your scenario inputs align with historical data. Confidence score: {validationResult.confidenceScore}%
            </AlertDescription>
          </Alert>
          
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Historical Avg Revenue</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                }).format(validationResult.historicalBaseline.avgMonthlyRevenue)}/mo
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Historical Avg Expenses</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                }).format(validationResult.historicalBaseline.avgMonthlyExpenses)}/mo
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Revenue Growth Rate</p>
              <p className="font-medium">
                {(validationResult.historicalBaseline.revenueGrowthRate * 100).toFixed(1)}%/mo
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Expense Growth Rate</p>
              <p className="font-medium">
                {(validationResult.historicalBaseline.expenseGrowthRate * 100).toFixed(1)}%/mo
              </p>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-4"
            onClick={handleValidate}
            disabled={validateMutation.isPending}
            data-testid="button-revalidate-model"
          >
            {validateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Re-validate
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" />
          Model Validation
        </CardTitle>
        <CardDescription>
          <div className="flex items-center gap-3">
            <span>Confidence Score: {validationResult.confidenceScore}%</span>
            {criticalCount > 0 && (
              <Badge variant="destructive">{criticalCount} Critical</Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                {warningCount} Warning{warningCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {visibleIssues.map((issue) => (
            <ValidationIssueCard
              key={issue.id}
              issue={issue}
              onAcceptSuggestion={() => handleAcceptSuggestion(issue)}
              onDismiss={() => handleDismiss(issue)}
            />
          ))}
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-4"
          onClick={handleValidate}
          disabled={validateMutation.isPending}
          data-testid="button-revalidate-model"
        >
          {validateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4 mr-2" />
          )}
          Re-validate
        </Button>
      </CardContent>
    </Card>
  );
}
