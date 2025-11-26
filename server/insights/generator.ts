import type { Insight, InsightGeneratorInput } from "./types";
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

export function generateInsights(
  input: InsightGeneratorInput,
  limit: number = 5
): Insight[] {
  const insights: Insight[] = [];

  if (input.runwayMonths !== undefined && input.runwayMonths < 12) {
    const severity = input.runwayMonths < 6 ? "critical" : "warning";
    insights.push({
      type: "runway_warning",
      severity,
      title: `${input.runwayMonths.toFixed(1)} months of runway remaining`,
      description: `At your current burn rate, you will run out of cash in approximately ${input.runwayMonths.toFixed(1)} months.`,
      metric: "runway",
      value: input.runwayMonths,
      recommendation:
        input.runwayMonths < 6
          ? "Consider starting fundraising conversations immediately or identify areas to reduce burn."
          : "Start planning your next fundraise or explore ways to extend runway.",
    });
  }

  if (input.previousMonthBurn && input.currentMonthBurn) {
    const burnChange = ((input.currentMonthBurn - input.previousMonthBurn) / input.previousMonthBurn) * 100;
    
    if (burnChange > 15) {
      insights.push({
        type: "burn_acceleration",
        severity: burnChange > 30 ? "critical" : "warning",
        title: `Burn rate up ${formatPercent(burnChange)} this month`,
        description: `Your monthly burn increased from ${formatCurrency(input.previousMonthBurn)} to ${formatCurrency(input.currentMonthBurn)}.`,
        metric: "burn",
        value: input.currentMonthBurn,
        previousValue: input.previousMonthBurn,
        changePercent: burnChange,
        recommendation: "Review recent expenses to identify unexpected increases. Consider whether this is a one-time spike or a trend.",
      });
    }
  }

  const vendorSpikes = detectVendorSpikes(input, 30);
  for (const spike of vendorSpikes.slice(0, 2)) {
    insights.push({
      type: "vendor_spike",
      severity: spike.changePercent > 50 ? "warning" : "info",
      title: `${spike.vendor} spend up ${formatPercent(spike.changePercent)}`,
      description: `Spending on ${spike.vendor} increased from ${formatCurrency(spike.previousPeriod)} to ${formatCurrency(spike.currentPeriod)} this month.`,
      metric: "vendor_spend",
      value: spike.currentPeriod,
      previousValue: spike.previousPeriod,
      changePercent: spike.changePercent,
      recommendation: `Review ${spike.vendor} charges for unexpected increases or consider renegotiating if costs are growing.`,
    });
  }

  const subscriptionData = detectSubscriptionCreep(input);
  if (subscriptionData.change > 10) {
    insights.push({
      type: "subscription_creep",
      severity: subscriptionData.change > 25 ? "warning" : "info",
      title: `Recurring SaaS spend is ${formatCurrency(subscriptionData.totalRecurring)}/month`,
      description: `Your subscription costs have increased ${formatPercent(subscriptionData.change)} over the past 3 months. Top subscriptions: ${subscriptionData.subscriptions.slice(0, 3).map(s => s.vendor).join(", ")}.`,
      metric: "recurring_spend",
      value: subscriptionData.totalRecurring,
      changePercent: subscriptionData.change,
      recommendation: "Audit your subscriptions for unused services. Suggested potential savings: $900-$1,400/month.",
    });
  }

  const payrollData = detectPayrollDrift(input);
  if (Math.abs(payrollData.drift) > 5) {
    const direction = payrollData.drift > 0 ? "exceeded" : "fell below";
    insights.push({
      type: "payroll_drift",
      severity: Math.abs(payrollData.drift) > 15 ? "warning" : "info",
      title: `Payroll ${direction} plan by ${formatPercent(Math.abs(payrollData.drift))}`,
      description: `Current payroll: ${formatCurrency(payrollData.currentPayroll)} vs expected: ${formatCurrency(payrollData.expectedPayroll)}.`,
      metric: "payroll",
      value: payrollData.currentPayroll,
      previousValue: payrollData.expectedPayroll,
      changePercent: payrollData.drift,
      recommendation: payrollData.drift > 0
        ? "Review recent hires, bonuses, or contractor costs that may have caused the increase."
        : "Confirm this reflects planned changes or investigate missing payroll entries.",
    });
  }

  const anomalies = detectAmountAnomalies(input);
  for (const anomaly of anomalies.slice(0, 1)) {
    insights.push({
      type: "anomaly",
      severity: "info",
      title: `Unusual ${anomaly.vendor} charge detected`,
      description: `A ${formatCurrency(anomaly.amount)} charge from ${anomaly.vendor} is ${anomaly.deviation.toFixed(1)}x higher than typical (${formatCurrency(anomaly.expectedAmount)}).`,
      metric: "anomaly",
      value: anomaly.amount,
      previousValue: anomaly.expectedAmount,
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
