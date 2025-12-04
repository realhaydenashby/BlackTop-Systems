import { storage } from "../storage";
import type { Transaction, AnomalyBaseline, AnomalyEvent, InsertAnomalyEvent, InsertAnomalyBaseline } from "@shared/schema";
import { subDays, startOfDay, endOfDay } from "date-fns";

export interface AnomalyResult {
  isAnomaly: boolean;
  severity: "low" | "medium" | "high" | "critical";
  deviationScore: number;
  observedValue: number;
  expectedValue: number;
  title: string;
  description: string;
  detector: string;
  metricName: string;
  contextPayload?: Record<string, any>;
}

export interface StatisticalBaseline {
  mean: number;
  stdDev: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  upperThreshold: number;
  lowerThreshold: number;
  sampleSize: number;
}

export class AnomalyDetector {
  private organizationId: string;
  private sensitivityMultiplier: number = 2.0;

  constructor(organizationId: string, sensitivityMultiplier: number = 2.0) {
    this.organizationId = organizationId;
    this.sensitivityMultiplier = sensitivityMultiplier;
  }

  computeZScore(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  computeIQRScore(value: number, q1: number, q3: number, iqr: number): number {
    if (iqr === 0) return 0;
    if (value > q3) return (value - q3) / iqr;
    if (value < q1) return (q1 - value) / iqr;
    return 0;
  }

  computeStatisticalBaseline(values: number[]): StatisticalBaseline {
    if (values.length === 0) {
      return {
        mean: 0,
        stdDev: 0,
        median: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
        upperThreshold: 0,
        lowerThreshold: 0,
        sampleSize: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index] || sorted[0];
    const q3 = sorted[q3Index] || sorted[n - 1];
    const iqr = q3 - q1;

    const upperThresholdZScore = mean + this.sensitivityMultiplier * stdDev;
    const lowerThresholdZScore = mean - this.sensitivityMultiplier * stdDev;
    const upperThresholdIQR = q3 + 1.5 * iqr;
    const lowerThresholdIQR = q1 - 1.5 * iqr;

    return {
      mean,
      stdDev,
      median,
      q1,
      q3,
      iqr,
      upperThreshold: Math.max(upperThresholdZScore, upperThresholdIQR),
      lowerThreshold: Math.min(lowerThresholdZScore, lowerThresholdIQR),
      sampleSize: n,
    };
  }

  detectZScoreAnomaly(
    value: number,
    baseline: StatisticalBaseline,
    metricName: string
  ): AnomalyResult | null {
    const zScore = this.computeZScore(value, baseline.mean, baseline.stdDev);
    const absZScore = Math.abs(zScore);

    if (absZScore < this.sensitivityMultiplier) {
      return null;
    }

    const severity = this.determineSeverity(absZScore);
    const direction = zScore > 0 ? "above" : "below";

    return {
      isAnomaly: true,
      severity,
      deviationScore: zScore,
      observedValue: value,
      expectedValue: baseline.mean,
      title: `Unusual ${metricName} detected`,
      description: `${metricName} of ${this.formatValue(value)} is ${absZScore.toFixed(1)} standard deviations ${direction} the expected value of ${this.formatValue(baseline.mean)}.`,
      detector: "zscore",
      metricName,
      contextPayload: {
        zScore,
        mean: baseline.mean,
        stdDev: baseline.stdDev,
        sampleSize: baseline.sampleSize,
      },
    };
  }

  detectIQRAnomaly(
    value: number,
    baseline: StatisticalBaseline,
    metricName: string
  ): AnomalyResult | null {
    const iqrScore = this.computeIQRScore(value, baseline.q1, baseline.q3, baseline.iqr);

    if (iqrScore < 1.5) {
      return null;
    }

    const severity = this.determineSeverityIQR(iqrScore);
    const direction = value > baseline.median ? "above" : "below";

    return {
      isAnomaly: true,
      severity,
      deviationScore: iqrScore,
      observedValue: value,
      expectedValue: baseline.median,
      title: `Outlier ${metricName} detected`,
      description: `${metricName} of ${this.formatValue(value)} is ${iqrScore.toFixed(1)}x IQR ${direction} the normal range (${this.formatValue(baseline.q1)} - ${this.formatValue(baseline.q3)}).`,
      detector: "iqr",
      metricName,
      contextPayload: {
        iqrScore,
        q1: baseline.q1,
        q3: baseline.q3,
        iqr: baseline.iqr,
        median: baseline.median,
      },
    };
  }

  detectMovingAverageAnomaly(
    currentValue: number,
    historicalValues: number[],
    metricName: string,
    windowSize: number = 7
  ): AnomalyResult | null {
    if (historicalValues.length < windowSize) {
      return null;
    }

    const recentValues = historicalValues.slice(-windowSize);
    const movingAvg = recentValues.reduce((sum, v) => sum + v, 0) / windowSize;
    const movingStdDev = Math.sqrt(
      recentValues.reduce((sum, v) => sum + Math.pow(v - movingAvg, 2), 0) / windowSize
    );

    const deviation = (currentValue - movingAvg) / (movingStdDev || 1);
    const absDeviation = Math.abs(deviation);

    if (absDeviation < this.sensitivityMultiplier) {
      return null;
    }

    const severity = this.determineSeverity(absDeviation);
    const direction = currentValue > movingAvg ? "above" : "below";

    return {
      isAnomaly: true,
      severity,
      deviationScore: deviation,
      observedValue: currentValue,
      expectedValue: movingAvg,
      title: `${metricName} trend deviation`,
      description: `${metricName} of ${this.formatValue(currentValue)} deviates ${absDeviation.toFixed(1)}σ ${direction} the ${windowSize}-day moving average of ${this.formatValue(movingAvg)}.`,
      detector: "moving_average",
      metricName,
      contextPayload: {
        movingAverage: movingAvg,
        movingStdDev,
        windowSize,
        recentValues,
      },
    };
  }

  detectSeasonalAnomaly(
    currentValue: number,
    historicalByDayOfWeek: Map<number, number[]>,
    dayOfWeek: number,
    metricName: string
  ): AnomalyResult | null {
    const sameDayValues = historicalByDayOfWeek.get(dayOfWeek) || [];

    if (sameDayValues.length < 4) {
      return null;
    }

    const baseline = this.computeStatisticalBaseline(sameDayValues);
    const zScore = this.computeZScore(currentValue, baseline.mean, baseline.stdDev);
    const absZScore = Math.abs(zScore);

    if (absZScore < this.sensitivityMultiplier) {
      return null;
    }

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const severity = this.determineSeverity(absZScore);
    const direction = zScore > 0 ? "higher" : "lower";

    return {
      isAnomaly: true,
      severity,
      deviationScore: zScore,
      observedValue: currentValue,
      expectedValue: baseline.mean,
      title: `Unusual ${metricName} for ${dayNames[dayOfWeek]}`,
      description: `${metricName} of ${this.formatValue(currentValue)} is ${absZScore.toFixed(1)}σ ${direction} than typical for ${dayNames[dayOfWeek]}s (avg: ${this.formatValue(baseline.mean)}).`,
      detector: "seasonal_decomposition",
      metricName,
      contextPayload: {
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
        seasonalMean: baseline.mean,
        seasonalStdDev: baseline.stdDev,
        sampleSize: sameDayValues.length,
      },
    };
  }

  async analyzeTransactionAnomalies(daysBack: number = 30): Promise<AnomalyResult[]> {
    const allTxns = await storage.getOrganizationTransactions(this.organizationId);
    const anomalies: AnomalyResult[] = [];

    const dailySpend = this.aggregateDailySpend(allTxns, daysBack + 90);
    const spendValues = Array.from(dailySpend.values());

    if (spendValues.length < 14) {
      return anomalies;
    }

    const baseline = this.computeStatisticalBaseline(spendValues.slice(0, -daysBack));

    const recentDates = Array.from(dailySpend.keys()).slice(-daysBack);
    for (const dateStr of recentDates) {
      const daySpend = dailySpend.get(dateStr) || 0;

      const zScoreAnomaly = this.detectZScoreAnomaly(daySpend, baseline, "Daily spend");
      if (zScoreAnomaly) {
        anomalies.push({ ...zScoreAnomaly, contextPayload: { ...zScoreAnomaly.contextPayload, date: dateStr } });
      }

      const iqrAnomaly = this.detectIQRAnomaly(daySpend, baseline, "Daily spend");
      if (iqrAnomaly && !zScoreAnomaly) {
        anomalies.push({ ...iqrAnomaly, contextPayload: { ...iqrAnomaly.contextPayload, date: dateStr } });
      }
    }

    const vendorSpend = await this.analyzeVendorSpendAnomalies(allTxns);
    anomalies.push(...vendorSpend);

    const categorySpend = await this.analyzeCategorySpendAnomalies(allTxns);
    anomalies.push(...categorySpend);

    return anomalies;
  }

  private async analyzeVendorSpendAnomalies(txns: Transaction[]): Promise<AnomalyResult[]> {
    const anomalies: AnomalyResult[] = [];

    const vendorMonthly = new Map<string, Map<string, number>>();
    for (const txn of txns) {
      const vendorId = txn.vendorId || "unknown";
      const month = txn.date.toISOString().slice(0, 7);
      const amount = Math.abs(parseFloat(txn.amount));

      if (!vendorMonthly.has(vendorId)) {
        vendorMonthly.set(vendorId, new Map());
      }
      const vendorData = vendorMonthly.get(vendorId)!;
      vendorData.set(month, (vendorData.get(month) || 0) + amount);
    }

    for (const [vendorId, monthlyData] of vendorMonthly) {
      const months = Array.from(monthlyData.keys()).sort();
      if (months.length < 3) continue;

      const values = months.map((m) => monthlyData.get(m) || 0);
      const baseline = this.computeStatisticalBaseline(values.slice(0, -1));
      const latestValue = values[values.length - 1];

      const anomaly = this.detectZScoreAnomaly(latestValue, baseline, `Vendor ${vendorId} monthly spend`);
      if (anomaly && anomaly.severity !== "low") {
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  private async analyzeCategorySpendAnomalies(txns: Transaction[]): Promise<AnomalyResult[]> {
    const anomalies: AnomalyResult[] = [];

    const categoryMonthly = new Map<string, Map<string, number>>();
    for (const txn of txns) {
      const categoryId = txn.categoryId || "uncategorized";
      const month = txn.date.toISOString().slice(0, 7);
      const amount = Math.abs(parseFloat(txn.amount));

      if (!categoryMonthly.has(categoryId)) {
        categoryMonthly.set(categoryId, new Map());
      }
      const categoryData = categoryMonthly.get(categoryId)!;
      categoryData.set(month, (categoryData.get(month) || 0) + amount);
    }

    for (const [categoryId, monthlyData] of categoryMonthly) {
      const months = Array.from(monthlyData.keys()).sort();
      if (months.length < 3) continue;

      const values = months.map((m) => monthlyData.get(m) || 0);
      const baseline = this.computeStatisticalBaseline(values.slice(0, -1));
      const latestValue = values[values.length - 1];

      const anomaly = this.detectZScoreAnomaly(latestValue, baseline, `Category ${categoryId} monthly spend`);
      if (anomaly && anomaly.severity !== "low") {
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  private aggregateDailySpend(txns: Transaction[], daysBack: number): Map<string, number> {
    const cutoffDate = subDays(new Date(), daysBack);
    const dailySpend = new Map<string, number>();

    for (const txn of txns) {
      const txnDate = new Date(txn.date);
      if (txnDate < cutoffDate) continue;

      const dateStr = txnDate.toISOString().slice(0, 10);
      const amount = Math.abs(parseFloat(txn.amount));

      if (parseFloat(txn.amount) < 0) {
        dailySpend.set(dateStr, (dailySpend.get(dateStr) || 0) + amount);
      }
    }

    return dailySpend;
  }

  private determineSeverity(absZScore: number): "low" | "medium" | "high" | "critical" {
    if (absZScore >= 4) return "critical";
    if (absZScore >= 3) return "high";
    if (absZScore >= 2.5) return "medium";
    return "low";
  }

  private determineSeverityIQR(iqrScore: number): "low" | "medium" | "high" | "critical" {
    if (iqrScore >= 3) return "critical";
    if (iqrScore >= 2.5) return "high";
    if (iqrScore >= 2) return "medium";
    return "low";
  }

  private formatValue(value: number): string {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  }

  async saveAnomalyBaseline(
    metricName: string,
    baseline: StatisticalBaseline,
    detector: string
  ): Promise<void> {
    const data: InsertAnomalyBaseline = {
      organizationId: this.organizationId,
      metricName,
      detector: detector as any,
      windowDays: 90,
      mean: baseline.mean.toString(),
      stdDev: baseline.stdDev.toString(),
      median: baseline.median.toString(),
      q1: baseline.q1.toString(),
      q3: baseline.q3.toString(),
      iqr: baseline.iqr.toString(),
      upperThreshold: baseline.upperThreshold.toString(),
      lowerThreshold: baseline.lowerThreshold.toString(),
      sensitivityMultiplier: this.sensitivityMultiplier.toString(),
    };

    await storage.upsertAnomalyBaseline(data);
  }

  async saveAnomalyEvent(anomaly: AnomalyResult): Promise<void> {
    const event: InsertAnomalyEvent = {
      organizationId: this.organizationId,
      detector: anomaly.detector as any,
      metricName: anomaly.metricName,
      observedValue: anomaly.observedValue.toString(),
      expectedValue: anomaly.expectedValue.toString(),
      deviationScore: anomaly.deviationScore.toString(),
      severity: anomaly.severity,
      status: "new",
      title: anomaly.title,
      description: anomaly.description,
      contextPayload: anomaly.contextPayload,
    };

    await storage.createAnomalyEvent(event);
  }
}

export function createAnomalyDetector(
  organizationId: string,
  sensitivityMultiplier?: number
): AnomalyDetector {
  return new AnomalyDetector(organizationId, sensitivityMultiplier);
}
