import type { Insight, InsightGeneratorInput, InsightConfidence, ConfidenceFactor } from "./types";
import {
  detectVendorSpikes,
  detectSubscriptionCreep,
  detectPayrollDrift,
  detectAmountAnomalies,
} from "./anomalies";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * Calculate confidence score based on data quality factors
 */
function calculateConfidence(
  factors: ConfidenceFactor[],
  baseScore: number = 0.7
): InsightConfidence {
  let score = baseScore;
  
  for (const factor of factors) {
    if (factor.impact === "positive") {
      score = Math.min(1, score + 0.1);
    } else if (factor.impact === "negative") {
      score = Math.max(0.1, score - 0.15);
    }
  }
  
  const level: InsightConfidence["level"] = 
    score >= 0.8 ? "high" : 
    score >= 0.5 ? "medium" : 
    "low";
  
  return { score, level, factors };
}

/**
 * Calculate data quality factors for insights
 */
function getDataQualityFactors(input: InsightGeneratorInput): ConfidenceFactor[] {
  const factors: ConfidenceFactor[] = [];
  
  // Check transaction count
  const txnCount = input.transactions.length;
  if (txnCount >= 100) {
    factors.push({
      factor: "transaction_volume",
      impact: "positive",
      detail: `${txnCount} transactions analyzed`,
    });
  } else if (txnCount < 30) {
    factors.push({
      factor: "transaction_volume",
      impact: "negative",
      detail: `Only ${txnCount} transactions - more data improves accuracy`,
    });
  } else {
    factors.push({
      factor: "transaction_volume",
      impact: "neutral",
      detail: `${txnCount} transactions analyzed`,
    });
  }
  
  // Check time span of data
  const dates = input.transactions.map(t => new Date(t.date).getTime());
  if (dates.length > 0) {
    const earliest = Math.min(...dates);
    const latest = Math.max(...dates);
    const daySpan = (latest - earliest) / (1000 * 60 * 60 * 24);
    
    if (daySpan >= 90) {
      factors.push({
        factor: "data_timespan",
        impact: "positive",
        detail: `${Math.round(daySpan)} days of transaction history`,
      });
    } else if (daySpan < 30) {
      factors.push({
        factor: "data_timespan",
        impact: "negative",
        detail: `Only ${Math.round(daySpan)} days of data - 3+ months recommended`,
      });
    }
  }
  
  // Check vendor normalization quality
  const normalizedCount = input.transactions.filter(t => t.vendorNormalized).length;
  const normalizationRate = txnCount > 0 ? normalizedCount / txnCount : 0;
  
  if (normalizationRate >= 0.9) {
    factors.push({
      factor: "vendor_classification",
      impact: "positive",
      detail: `${Math.round(normalizationRate * 100)}% of transactions categorized`,
    });
  } else if (normalizationRate < 0.5) {
    factors.push({
      factor: "vendor_classification",
      impact: "negative",
      detail: `Only ${Math.round(normalizationRate * 100)}% of transactions categorized`,
    });
  }
  
  return factors;
}

export function generateInsights(
  input: InsightGeneratorInput,
  limit: number = 5
): Insight[] {
  const insights: Insight[] = [];
  
  // Calculate base data quality factors
  const dataQualityFactors = getDataQualityFactors(input);

  if (input.runwayMonths !== undefined && input.runwayMonths < 12) {
    const severity = input.runwayMonths < 6 ? "critical" : "warning";
    
    // Runway confidence depends on having cash balance and burn data
    const runwayFactors: ConfidenceFactor[] = [
      ...dataQualityFactors,
      {
        factor: "cash_balance",
        impact: input.currentCash > 0 ? "positive" : "negative",
        detail: input.currentCash > 0 
          ? "Cash balance verified from bank connections" 
          : "Cash balance may be incomplete",
      },
      {
        factor: "burn_calculation",
        impact: input.currentMonthBurn && input.previousMonthBurn ? "positive" : "neutral",
        detail: "Burn rate calculated from recent transactions",
      },
    ];
    
    insights.push({
      type: "runway_warning",
      severity,
      title: `${input.runwayMonths.toFixed(1)} months of runway remaining`,
      description: `At your current burn rate, you will run out of cash in approximately ${input.runwayMonths.toFixed(1)} months.`,
      metric: "runway",
      value: input.runwayMonths,
      confidence: calculateConfidence(runwayFactors, 0.75),
      recommendation:
        input.runwayMonths < 6
          ? "Consider starting fundraising conversations immediately or identify areas to reduce burn."
          : "Start planning your next fundraise or explore ways to extend runway.",
    });
  }

  if (input.previousMonthBurn && input.currentMonthBurn) {
    const burnChange = ((input.currentMonthBurn - input.previousMonthBurn) / input.previousMonthBurn) * 100;
    
    if (burnChange > 15) {
      const burnFactors: ConfidenceFactor[] = [
        ...dataQualityFactors,
        {
          factor: "comparison_data",
          impact: "positive",
          detail: "Comparing against previous month's actual spend",
        },
      ];
      
      insights.push({
        type: "burn_acceleration",
        severity: burnChange > 30 ? "critical" : "warning",
        title: `Burn rate up ${formatPercent(burnChange)} this month`,
        description: `Your monthly burn increased from ${formatCurrency(input.previousMonthBurn)} to ${formatCurrency(input.currentMonthBurn)}.`,
        metric: "burn",
        value: input.currentMonthBurn,
        previousValue: input.previousMonthBurn,
        changePercent: burnChange,
        confidence: calculateConfidence(burnFactors, 0.8),
        recommendation: "Review recent expenses to identify unexpected increases. Consider whether this is a one-time spike or a trend.",
      });
    }
  }

  const vendorSpikes = detectVendorSpikes(input, 30);
  for (const spike of vendorSpikes.slice(0, 2)) {
    const vendorFactors: ConfidenceFactor[] = [
      ...dataQualityFactors,
      {
        factor: "vendor_match",
        impact: spike.vendor ? "positive" : "negative",
        detail: spike.vendor 
          ? `Vendor "${spike.vendor}" identified across multiple transactions` 
          : "Vendor name unclear",
      },
    ];
    
    insights.push({
      type: "vendor_spike",
      severity: spike.changePercent > 50 ? "warning" : "info",
      title: `${spike.vendor} spend up ${formatPercent(spike.changePercent)}`,
      description: `Spending on ${spike.vendor} increased from ${formatCurrency(spike.previousPeriod)} to ${formatCurrency(spike.currentPeriod)} this month.`,
      metric: "vendor_spend",
      value: spike.currentPeriod,
      previousValue: spike.previousPeriod,
      changePercent: spike.changePercent,
      confidence: calculateConfidence(vendorFactors, 0.7),
      recommendation: `Review ${spike.vendor} charges for unexpected increases or consider renegotiating if costs are growing.`,
    });
  }

  const subscriptionData = detectSubscriptionCreep(input);
  if (subscriptionData.change > 10) {
    const recurringCount = input.transactions.filter(t => t.isRecurring).length;
    const subscriptionFactors: ConfidenceFactor[] = [
      ...dataQualityFactors,
      {
        factor: "recurring_detection",
        impact: recurringCount > 10 ? "positive" : "neutral",
        detail: `${recurringCount} recurring transactions identified`,
      },
    ];
    
    insights.push({
      type: "subscription_creep",
      severity: subscriptionData.change > 25 ? "warning" : "info",
      title: `Recurring SaaS spend is ${formatCurrency(subscriptionData.totalRecurring)}/month`,
      description: `Your subscription costs have increased ${formatPercent(subscriptionData.change)} over the past 3 months. Top subscriptions: ${subscriptionData.subscriptions.slice(0, 3).map(s => s.vendor).join(", ")}.`,
      metric: "recurring_spend",
      value: subscriptionData.totalRecurring,
      changePercent: subscriptionData.change,
      confidence: calculateConfidence(subscriptionFactors, 0.65),
      recommendation: "Audit your subscriptions for unused services. Suggested potential savings: $900-$1,400/month.",
    });
  }

  const payrollData = detectPayrollDrift(input);
  if (Math.abs(payrollData.drift) > 5) {
    const direction = payrollData.drift > 0 ? "exceeded" : "fell below";
    const payrollCount = input.transactions.filter(t => t.isPayroll).length;
    
    const payrollFactors: ConfidenceFactor[] = [
      ...dataQualityFactors,
      {
        factor: "payroll_detection",
        impact: payrollCount > 3 ? "positive" : "negative",
        detail: payrollCount > 3 
          ? `${payrollCount} payroll transactions detected`
          : "Limited payroll transaction data",
      },
    ];
    
    insights.push({
      type: "payroll_drift",
      severity: Math.abs(payrollData.drift) > 15 ? "warning" : "info",
      title: `Payroll ${direction} plan by ${formatPercent(Math.abs(payrollData.drift))}`,
      description: `Current payroll: ${formatCurrency(payrollData.currentPayroll)} vs expected: ${formatCurrency(payrollData.expectedPayroll)}.`,
      metric: "payroll",
      value: payrollData.currentPayroll,
      previousValue: payrollData.expectedPayroll,
      changePercent: payrollData.drift,
      confidence: calculateConfidence(payrollFactors, 0.6),
      recommendation: payrollData.drift > 0
        ? "Review recent hires, bonuses, or contractor costs that may have caused the increase."
        : "Confirm this reflects planned changes or investigate missing payroll entries.",
    });
  }

  const anomalies = detectAmountAnomalies(input);
  for (const anomaly of anomalies.slice(0, 1)) {
    // Anomalies are inherently lower confidence as they're outliers
    const anomalyFactors: ConfidenceFactor[] = [
      ...dataQualityFactors,
      {
        factor: "statistical_deviation",
        impact: anomaly.deviation > 3 ? "positive" : "neutral",
        detail: `${anomaly.deviation.toFixed(1)}x deviation from typical amount`,
      },
    ];
    
    insights.push({
      type: "anomaly",
      severity: "info",
      title: `Unusual ${anomaly.vendor} charge detected`,
      description: `A ${formatCurrency(anomaly.amount)} charge from ${anomaly.vendor} is ${anomaly.deviation.toFixed(1)}x higher than typical (${formatCurrency(anomaly.expectedAmount)}).`,
      metric: "anomaly",
      value: anomaly.amount,
      previousValue: anomaly.expectedAmount,
      confidence: calculateConfidence(anomalyFactors, 0.5),
      recommendation: "Verify this charge is expected. It may be an annual billing, pricing change, or error.",
    });
  }

  return insights
    .sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .slice(0, limit);
}

export function generateActionItems(insights: Insight[]): string[] {
  const actions: string[] = [];

  for (const insight of insights) {
    if (insight.recommendation) {
      actions.push(insight.recommendation);
    }
  }

  return actions.slice(0, 5);
}
