import { storage } from "../storage";
import type { Transaction, Organization, MetricSnapshot, InsertMetricSnapshot } from "@shared/schema";
import { subMonths, startOfMonth, endOfMonth, differenceInDays, format, subDays } from "date-fns";

export interface FinancialMetrics {
  burnRate: MetricResult;
  netBurn: MetricResult;
  grossBurn: MetricResult;
  runway: MetricResult;
  grossMargin: MetricResult;
  operatingMargin: MetricResult;
  cashFlow: MetricResult;
  revenueGrowth: MetricResult;
  expenseGrowth: MetricResult;
  mrrGrowth?: MetricResult;
}

export interface MetricResult {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  trend: "increasing" | "decreasing" | "stable";
  confidence: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface TimeSeriesData {
  date: Date;
  value: number;
}

export class FinancialMetricsEngine {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  async computeAllMetrics(currentCash?: number): Promise<FinancialMetrics> {
    const now = new Date();
    const currentPeriodStart = startOfMonth(subMonths(now, 1));
    const currentPeriodEnd = endOfMonth(subMonths(now, 1));
    const previousPeriodStart = startOfMonth(subMonths(now, 2));
    const previousPeriodEnd = endOfMonth(subMonths(now, 2));

    const [currentTxns, previousTxns, allRecentTxns] = await Promise.all([
      this.getTransactionsInPeriod(currentPeriodStart, currentPeriodEnd),
      this.getTransactionsInPeriod(previousPeriodStart, previousPeriodEnd),
      this.getTransactionsInPeriod(subMonths(now, 6), now),
    ]);

    const burnRate = this.computeBurnRate(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const netBurn = this.computeNetBurn(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const grossBurn = this.computeGrossBurn(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const runway = this.computeRunway(burnRate.value, currentCash || 0, currentPeriodStart, currentPeriodEnd);
    const grossMargin = this.computeGrossMargin(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const operatingMargin = this.computeOperatingMargin(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const cashFlow = this.computeCashFlow(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const revenueGrowth = this.computeRevenueGrowth(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);
    const expenseGrowth = this.computeExpenseGrowth(currentTxns, previousTxns, currentPeriodStart, currentPeriodEnd);

    return {
      burnRate,
      netBurn,
      grossBurn,
      runway,
      grossMargin,
      operatingMargin,
      cashFlow,
      revenueGrowth,
      expenseGrowth,
    };
  }

  private async getTransactionsInPeriod(start: Date, end: Date): Promise<Transaction[]> {
    const allTxns = await storage.getOrganizationTransactions(this.organizationId);
    return allTxns.filter((t) => {
      const txnDate = new Date(t.date);
      return txnDate >= start && txnDate <= end;
    });
  }

  computeBurnRate(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentExpenses = this.sumExpenses(currentTxns);
    const currentRevenue = this.sumRevenue(currentTxns);
    const currentBurn = currentExpenses - currentRevenue;

    const previousExpenses = this.sumExpenses(previousTxns);
    const previousRevenue = this.sumRevenue(previousTxns);
    const previousBurn = previousExpenses - previousRevenue;

    const changePercent = previousBurn !== 0 ? ((currentBurn - previousBurn) / Math.abs(previousBurn)) * 100 : null;

    return {
      value: currentBurn,
      previousValue: previousBurn,
      changePercent,
      trend: this.determineTrend(currentBurn, previousBurn),
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeNetBurn(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentNet = this.sumRevenue(currentTxns) - this.sumExpenses(currentTxns);
    const previousNet = this.sumRevenue(previousTxns) - this.sumExpenses(previousTxns);
    const changePercent = previousNet !== 0 ? ((currentNet - previousNet) / Math.abs(previousNet)) * 100 : null;

    return {
      value: currentNet,
      previousValue: previousNet,
      changePercent,
      trend: this.determineTrend(currentNet, previousNet, true),
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeGrossBurn(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentGross = this.sumExpenses(currentTxns);
    const previousGross = this.sumExpenses(previousTxns);
    const changePercent = previousGross !== 0 ? ((currentGross - previousGross) / previousGross) * 100 : null;

    return {
      value: currentGross,
      previousValue: previousGross,
      changePercent,
      trend: this.determineTrend(currentGross, previousGross),
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeRunway(
    monthlyBurn: number,
    currentCash: number,
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const runwayMonths = monthlyBurn > 0 ? currentCash / monthlyBurn : currentCash > 0 ? 999 : 0;

    return {
      value: Math.max(0, Math.round(runwayMonths)),
      previousValue: null,
      changePercent: null,
      trend: runwayMonths > 12 ? "stable" : runwayMonths > 6 ? "decreasing" : "decreasing",
      confidence: currentCash > 0 ? 0.9 : 0.5,
      periodStart,
      periodEnd,
    };
  }

  computeGrossMargin(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentRevenue = this.sumRevenue(currentTxns);
    const currentCOGS = this.sumCOGS(currentTxns);
    const currentMargin = currentRevenue > 0 ? ((currentRevenue - currentCOGS) / currentRevenue) * 100 : 0;

    const previousRevenue = this.sumRevenue(previousTxns);
    const previousCOGS = this.sumCOGS(previousTxns);
    const previousMargin = previousRevenue > 0 ? ((previousRevenue - previousCOGS) / previousRevenue) * 100 : 0;

    return {
      value: currentMargin,
      previousValue: previousMargin,
      changePercent: previousMargin !== 0 ? currentMargin - previousMargin : null,
      trend: this.determineTrend(currentMargin, previousMargin, true),
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeOperatingMargin(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentRevenue = this.sumRevenue(currentTxns);
    const currentOpex = this.sumExpenses(currentTxns);
    const currentMargin = currentRevenue > 0 ? ((currentRevenue - currentOpex) / currentRevenue) * 100 : 0;

    const previousRevenue = this.sumRevenue(previousTxns);
    const previousOpex = this.sumExpenses(previousTxns);
    const previousMargin = previousRevenue > 0 ? ((previousRevenue - previousOpex) / previousRevenue) * 100 : 0;

    return {
      value: currentMargin,
      previousValue: previousMargin,
      changePercent: previousMargin !== 0 ? currentMargin - previousMargin : null,
      trend: this.determineTrend(currentMargin, previousMargin, true),
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeCashFlow(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentCashFlow = this.sumRevenue(currentTxns) - this.sumExpenses(currentTxns);
    const previousCashFlow = this.sumRevenue(previousTxns) - this.sumExpenses(previousTxns);
    const changePercent =
      previousCashFlow !== 0 ? ((currentCashFlow - previousCashFlow) / Math.abs(previousCashFlow)) * 100 : null;

    return {
      value: currentCashFlow,
      previousValue: previousCashFlow,
      changePercent,
      trend: this.determineTrend(currentCashFlow, previousCashFlow, true),
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeRevenueGrowth(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentRevenue = this.sumRevenue(currentTxns);
    const previousRevenue = this.sumRevenue(previousTxns);
    const growthPercent = previousRevenue !== 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    return {
      value: growthPercent,
      previousValue: null,
      changePercent: null,
      trend: growthPercent > 5 ? "increasing" : growthPercent < -5 ? "decreasing" : "stable",
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeExpenseGrowth(
    currentTxns: Transaction[],
    previousTxns: Transaction[],
    periodStart: Date,
    periodEnd: Date
  ): MetricResult {
    const currentExpenses = this.sumExpenses(currentTxns);
    const previousExpenses = this.sumExpenses(previousTxns);
    const growthPercent = previousExpenses !== 0 ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 : 0;

    return {
      value: growthPercent,
      previousValue: null,
      changePercent: null,
      trend: growthPercent > 5 ? "increasing" : growthPercent < -5 ? "decreasing" : "stable",
      confidence: this.calculateConfidence(currentTxns.length),
      periodStart,
      periodEnd,
    };
  }

  computeMonthlyTrend(data: TimeSeriesData[]): {
    slope: number;
    trend: "increasing" | "decreasing" | "stable";
    r2: number;
  } {
    if (data.length < 2) {
      return { slope: 0, trend: "stable", r2: 0 };
    }

    const n = data.length;
    const xValues = data.map((_, i) => i);
    const yValues = data.map((d) => d.value);

    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
    const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const yMean = sumY / n;
    const ssTotal = yValues.reduce((acc, y) => acc + Math.pow(y - yMean, 2), 0);
    const ssResidual = yValues.reduce((acc, y, i) => acc + Math.pow(y - (slope * xValues[i] + intercept), 2), 0);
    const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    const normalizedSlope = yMean !== 0 ? slope / Math.abs(yMean) : slope;
    let trend: "increasing" | "decreasing" | "stable" = "stable";
    if (normalizedSlope > 0.05) trend = "increasing";
    else if (normalizedSlope < -0.05) trend = "decreasing";

    return { slope, trend, r2 };
  }

  computeMovingAverage(data: TimeSeriesData[], windowSize: number = 3): TimeSeriesData[] {
    if (data.length < windowSize) return data;

    const result: TimeSeriesData[] = [];
    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      const avg = window.reduce((sum, d) => sum + d.value, 0) / windowSize;
      result.push({ date: data[i].date, value: avg });
    }
    return result;
  }

  computeExponentialSmoothing(
    data: TimeSeriesData[],
    alpha: number = 0.3
  ): { smoothed: TimeSeriesData[]; forecast: number } {
    if (data.length === 0) return { smoothed: [], forecast: 0 };

    const smoothed: TimeSeriesData[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      const smoothedValue = alpha * data[i].value + (1 - alpha) * smoothed[i - 1].value;
      smoothed.push({ date: data[i].date, value: smoothedValue });
    }

    const forecast = smoothed.length > 0 ? smoothed[smoothed.length - 1].value : 0;
    return { smoothed, forecast };
  }

  private sumRevenue(txns: Transaction[]): number {
    return txns
      .filter((t) => parseFloat(t.amount) > 0)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  }

  private sumExpenses(txns: Transaction[]): number {
    return txns
      .filter((t) => parseFloat(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
  }

  private sumCOGS(txns: Transaction[]): number {
    return txns
      .filter((t) => parseFloat(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0) * 0.3;
  }

  private calculateConfidence(transactionCount: number): number {
    if (transactionCount >= 50) return 0.95;
    if (transactionCount >= 20) return 0.85;
    if (transactionCount >= 10) return 0.7;
    if (transactionCount >= 5) return 0.5;
    return 0.3;
  }

  private determineTrend(
    current: number,
    previous: number | null,
    higherIsBetter: boolean = false
  ): "increasing" | "decreasing" | "stable" {
    if (previous === null) return "stable";
    const change = ((current - previous) / Math.abs(previous || 1)) * 100;
    if (Math.abs(change) < 5) return "stable";
    return change > 0 ? "increasing" : "decreasing";
  }

  async saveMetricSnapshot(metricType: string, result: MetricResult): Promise<void> {
    const snapshot: InsertMetricSnapshot = {
      organizationId: this.organizationId,
      metricType: metricType as any,
      value: result.value.toString(),
      previousValue: result.previousValue?.toString() || null,
      changePercent: result.changePercent?.toString() || null,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      periodType: "monthly",
      confidence: result.confidence.toString(),
      metadata: { trend: result.trend },
    };

    await storage.createMetricSnapshot(snapshot);
  }

  async getHistoricalMetrics(
    metricType: string,
    months: number = 12
  ): Promise<MetricSnapshot[]> {
    return storage.getMetricSnapshots(this.organizationId, metricType, months);
  }
}

export function createMetricsEngine(organizationId: string): FinancialMetricsEngine {
  return new FinancialMetricsEngine(organizationId);
}
