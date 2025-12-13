/**
 * Proprietary Spending Anomaly Detection Model
 * 
 * A local ML model that trains on historical spending patterns per organization.
 * Uses z-score, IQR, and moving average deviation methods with persistent baselines.
 * Detects unusual spending without LLM calls.
 */

import { db } from "../db";
import { transactions } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { subDays, format, parseISO, getDay, startOfMonth, endOfMonth, subMonths, addMonths, eachMonthOfInterval, eachWeekOfInterval, addWeeks } from "date-fns";

// ============================================
// Types
// ============================================

interface StatisticalBaseline {
  mean: number;
  stdDev: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  sampleSize: number;
}

interface DayOfWeekPattern {
  dayIndex: number;
  dayName: string;
  baseline: StatisticalBaseline;
}

interface CategoryPattern {
  categoryId: string;
  categoryName: string;
  monthlyBaseline: StatisticalBaseline;
  weeklyBaseline: StatisticalBaseline;
  trend: number; // positive = increasing, negative = decreasing
}

interface VendorPattern {
  vendorId: string;
  vendorName: string;
  averageTransaction: number;
  transactionStdDev: number;
  frequency: number; // transactions per month
  lastSeen: string;
}

interface TrainedAnomalyModel {
  version: string;
  trainedAt: string;
  organizationId: string;
  dataRangeDays: number;
  transactionCount: number;
  
  // Daily spending patterns
  dailySpendBaseline: StatisticalBaseline;
  dayOfWeekPatterns: DayOfWeekPattern[];
  
  // Weekly/Monthly patterns
  weeklySpendBaseline: StatisticalBaseline;
  monthlySpendBaseline: StatisticalBaseline;
  
  // Category patterns
  categoryPatterns: CategoryPattern[];
  
  // Vendor patterns
  vendorPatterns: VendorPattern[];
  
  // Seasonal indices (1-12 for months)
  seasonalIndices: { month: number; index: number }[];
  
  // Thresholds (trained from data)
  thresholds: {
    dailySpendZScore: number;
    categorySpendZScore: number;
    vendorAmountZScore: number;
    frequencyDeviation: number;
  };
}

export interface SpendingAnomaly {
  type: "daily_spike" | "category_spike" | "vendor_anomaly" | "frequency_anomaly" | "seasonal_deviation";
  severity: "low" | "medium" | "high" | "critical";
  score: number;
  title: string;
  description: string;
  observedValue: number;
  expectedValue: number;
  context: Record<string, any>;
}

// Default thresholds
const DEFAULT_THRESHOLDS = {
  dailySpendZScore: 2.5,
  categorySpendZScore: 2.0,
  vendorAmountZScore: 3.0,
  frequencyDeviation: 2.0,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ============================================
// Statistical Utilities
// ============================================

function computeStatistics(values: number[]): StatisticalBaseline {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, median: 0, q1: 0, q3: 0, iqr: 0, sampleSize: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  const median = n % 2 === 0 
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 
    : sorted[Math.floor(n / 2)];
  
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index] || sorted[0];
  const q3 = sorted[q3Index] || sorted[n - 1];
  const iqr = q3 - q1;
  
  return { mean, stdDev, median, q1, q3, iqr, sampleSize: n };
}

function computeZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

function computeIQRScore(value: number, q1: number, q3: number, iqr: number): number {
  if (iqr === 0) return 0;
  if (value > q3) return (value - q3) / iqr;
  if (value < q1) return (q1 - value) / iqr;
  return 0;
}

function computeTrend(values: number[]): number {
  if (values.length < 3) return 0;
  
  // Simple linear regression slope
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  // Normalize by mean to get relative trend
  const mean = sumY / n;
  return mean !== 0 ? slope / mean : 0;
}

function determineSeverity(zScore: number): "low" | "medium" | "high" | "critical" {
  const absScore = Math.abs(zScore);
  if (absScore >= 4) return "critical";
  if (absScore >= 3) return "high";
  if (absScore >= 2.5) return "medium";
  return "low";
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// ============================================
// Spending Anomaly Model
// ============================================

export class SpendingAnomalyModel {
  private model: TrainedAnomalyModel | null = null;
  private modelPath: string;
  private organizationId: string;
  
  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.modelPath = path.join(process.cwd(), ".local", "models", `spending_anomaly_${organizationId}.json`);
  }
  
  /**
   * Load trained model from disk
   */
  async loadModel(): Promise<boolean> {
    try {
      if (fs.existsSync(this.modelPath)) {
        const data = fs.readFileSync(this.modelPath, "utf-8");
        this.model = JSON.parse(data);
        console.log(`[SpendingML] Loaded model with ${this.model?.transactionCount || 0} transactions trained`);
        return true;
      }
    } catch (error) {
      console.error("[SpendingML] Failed to load model:", error);
    }
    return false;
  }
  
  /**
   * Save trained model to disk
   */
  private saveModel(): void {
    if (!this.model) return;
    
    try {
      const dir = path.dirname(this.modelPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.modelPath, JSON.stringify(this.model, null, 2));
      console.log(`[SpendingML] Saved model to ${this.modelPath}`);
    } catch (error) {
      console.error("[SpendingML] Failed to save model:", error);
    }
  }
  
  /**
   * Train the anomaly detection model on historical data
   */
  async train(daysBack: number = 180): Promise<{
    success: boolean;
    transactionCount: number;
    categoryCount: number;
    vendorCount: number;
  }> {
    console.log(`[SpendingML] Training anomaly model for org ${this.organizationId}...`);
    
    const cutoffDate = subDays(new Date(), daysBack);
    
    // Fetch all transactions in the training window
    const txns = await db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        date: transactions.date,
        categoryId: transactions.categoryId,
        vendorId: transactions.vendorId,
        vendorNormalized: transactions.vendorNormalized,
        description: transactions.description,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, cutoffDate)
        )
      );
    
    if (txns.length < 30) {
      console.log(`[SpendingML] Not enough transactions (${txns.length}, need 30+)`);
      return { success: false, transactionCount: txns.length, categoryCount: 0, vendorCount: 0 };
    }
    
    console.log(`[SpendingML] Processing ${txns.length} transactions...`);
    
    // Aggregate daily spending (expenses only, negative amounts)
    const dailySpend = new Map<string, number>();
    const dayOfWeekSpend = new Map<number, number[]>();
    const weeklySpend = new Map<string, number>();
    const monthlySpend = new Map<string, number>();
    const categoryMonthly = new Map<string, Map<string, number>>();
    const categoryWeekly = new Map<string, Map<string, number>>();
    const vendorTxns = new Map<string, { amounts: number[]; lastSeen: Date; name: string }>();
    const monthlyIndices = new Map<number, number[]>();
    
    for (const txn of txns) {
      const amount = Math.abs(parseFloat(txn.amount));
      const isExpense = parseFloat(txn.amount) < 0;
      
      if (!isExpense) continue; // Only analyze expenses
      
      const txnDate = new Date(txn.date);
      const dateStr = format(txnDate, "yyyy-MM-dd");
      const weekStr = format(txnDate, "yyyy-'W'ww");
      const monthStr = format(txnDate, "yyyy-MM");
      const dayOfWeek = getDay(txnDate);
      const monthNum = txnDate.getMonth() + 1;
      
      // Daily
      dailySpend.set(dateStr, (dailySpend.get(dateStr) || 0) + amount);
      
      // Day of week
      if (!dayOfWeekSpend.has(dayOfWeek)) dayOfWeekSpend.set(dayOfWeek, []);
      dayOfWeekSpend.get(dayOfWeek)!.push(amount);
      
      // Weekly
      weeklySpend.set(weekStr, (weeklySpend.get(weekStr) || 0) + amount);
      
      // Monthly
      monthlySpend.set(monthStr, (monthlySpend.get(monthStr) || 0) + amount);
      
      // Monthly seasonal index
      if (!monthlyIndices.has(monthNum)) monthlyIndices.set(monthNum, []);
      monthlyIndices.get(monthNum)!.push(amount);
      
      // Category patterns
      const catId = txn.categoryId || "uncategorized";
      if (!categoryMonthly.has(catId)) categoryMonthly.set(catId, new Map());
      if (!categoryWeekly.has(catId)) categoryWeekly.set(catId, new Map());
      categoryMonthly.get(catId)!.set(monthStr, (categoryMonthly.get(catId)!.get(monthStr) || 0) + amount);
      categoryWeekly.get(catId)!.set(weekStr, (categoryWeekly.get(catId)!.get(weekStr) || 0) + amount);
      
      // Vendor patterns
      const vendorId = txn.vendorId || txn.vendorNormalized || txn.description?.substring(0, 30) || "unknown";
      const vendorName = txn.vendorNormalized || txn.description?.substring(0, 30) || "Unknown Vendor";
      if (!vendorTxns.has(vendorId)) {
        vendorTxns.set(vendorId, { amounts: [], lastSeen: txnDate, name: vendorName });
      }
      const vData = vendorTxns.get(vendorId)!;
      vData.amounts.push(amount);
      if (txnDate > vData.lastSeen) vData.lastSeen = txnDate;
    }
    
    // Compute daily baseline
    const dailyValues = Array.from(dailySpend.values());
    const dailySpendBaseline = computeStatistics(dailyValues);
    
    // Day of week patterns
    const dayOfWeekPatterns: DayOfWeekPattern[] = [];
    for (let i = 0; i < 7; i++) {
      const values = dayOfWeekSpend.get(i) || [];
      dayOfWeekPatterns.push({
        dayIndex: i,
        dayName: DAY_NAMES[i],
        baseline: computeStatistics(values),
      });
    }
    
    // Weekly baseline
    const weeklyValues = Array.from(weeklySpend.values());
    const weeklySpendBaseline = computeStatistics(weeklyValues);
    
    // Monthly baseline
    const monthlyValues = Array.from(monthlySpend.values());
    const monthlySpendBaseline = computeStatistics(monthlyValues);
    
    // Category patterns - backfill zero-spend months for accurate trend calculation
    const categoryPatterns: CategoryPattern[] = [];
    const allMonthsInRange = eachMonthOfInterval({ start: cutoffDate, end: new Date() })
      .map(d => format(d, "yyyy-MM"));
    const allWeeksInRange = eachWeekOfInterval({ start: cutoffDate, end: new Date() })
      .map(d => format(d, "yyyy-'W'ww"));
    
    for (const [catId, monthlyData] of categoryMonthly) {
      // Backfill zero-spend months to capture drops correctly
      const monthlyValsWithZeros = allMonthsInRange.map(m => monthlyData.get(m) || 0);
      const weeklyData = categoryWeekly.get(catId)!;
      const weeklyValsWithZeros = allWeeksInRange.map(w => weeklyData.get(w) || 0);
      
      // Require at least 3 months of data for meaningful patterns
      const nonZeroMonths = monthlyValsWithZeros.filter(v => v > 0).length;
      if (nonZeroMonths >= 3) {
        categoryPatterns.push({
          categoryId: catId,
          categoryName: catId,
          monthlyBaseline: computeStatistics(monthlyValsWithZeros),
          weeklyBaseline: computeStatistics(weeklyValsWithZeros),
          trend: computeTrend(monthlyValsWithZeros),
        });
      }
    }
    
    // Vendor patterns
    const vendorPatterns: VendorPattern[] = [];
    const monthsInData = daysBack / 30;
    for (const [vendorId, data] of vendorTxns) {
      if (data.amounts.length >= 3) {
        const stats = computeStatistics(data.amounts);
        vendorPatterns.push({
          vendorId,
          vendorName: data.name,
          averageTransaction: stats.mean,
          transactionStdDev: stats.stdDev,
          frequency: data.amounts.length / monthsInData,
          lastSeen: format(data.lastSeen, "yyyy-MM-dd"),
        });
      }
    }
    
    // Seasonal indices
    const overallMonthlyMean = monthlySpendBaseline.mean || 1;
    const seasonalIndices: { month: number; index: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const monthVals = monthlyIndices.get(m) || [];
      const monthTotal = monthVals.reduce((sum, v) => sum + v, 0);
      // Index > 1 means higher than average spending
      seasonalIndices.push({
        month: m,
        index: monthVals.length > 0 ? (monthTotal / monthVals.length) / overallMonthlyMean : 1,
      });
    }
    
    // Compute adaptive thresholds learned from data dispersion
    // Use percentile-based approach: threshold = mean + k*stdDev where k is learned
    const thresholds = { ...DEFAULT_THRESHOLDS };
    
    if (dailySpendBaseline.sampleSize >= 14 && dailySpendBaseline.stdDev > 0) {
      // Coefficient of variation - higher variance = higher threshold needed
      const dailyCV = dailySpendBaseline.stdDev / (dailySpendBaseline.mean || 1);
      // IQR-based multiplier: more robust to outliers
      const iqrMultiplier = dailySpendBaseline.iqr > 0 
        ? dailySpendBaseline.stdDev / dailySpendBaseline.iqr 
        : 1;
      // Adapt threshold: high variance = be more lenient (2.5-3.5 range)
      thresholds.dailySpendZScore = Math.max(2.0, Math.min(3.5, 2.5 + dailyCV * 0.5 + (iqrMultiplier - 1) * 0.3));
    }
    
    // Learn category threshold from category dispersion
    if (categoryPatterns.length >= 3) {
      const categoryVariances = categoryPatterns.map(c => 
        c.monthlyBaseline.stdDev / (c.monthlyBaseline.mean || 1)
      );
      const avgCategoryCV = categoryVariances.reduce((a, b) => a + b, 0) / categoryVariances.length;
      thresholds.categorySpendZScore = Math.max(1.5, Math.min(3.0, 2.0 + avgCategoryCV * 0.4));
    }
    
    // Learn vendor threshold from transaction variability
    if (vendorPatterns.length >= 5) {
      const vendorVariances = vendorPatterns
        .filter(v => v.averageTransaction > 0)
        .map(v => v.transactionStdDev / v.averageTransaction);
      if (vendorVariances.length > 0) {
        const avgVendorCV = vendorVariances.reduce((a, b) => a + b, 0) / vendorVariances.length;
        thresholds.vendorAmountZScore = Math.max(2.0, Math.min(4.0, 3.0 + avgVendorCV * 0.5));
      }
    }
    
    // Create model
    this.model = {
      version: "1.0.0",
      trainedAt: new Date().toISOString(),
      organizationId: this.organizationId,
      dataRangeDays: daysBack,
      transactionCount: txns.length,
      dailySpendBaseline,
      dayOfWeekPatterns,
      weeklySpendBaseline,
      monthlySpendBaseline,
      categoryPatterns,
      vendorPatterns,
      seasonalIndices,
      thresholds,
    };
    
    this.saveModel();
    
    console.log(`[SpendingML] Trained model: ${txns.length} txns, ${categoryPatterns.length} categories, ${vendorPatterns.length} vendors`);
    
    return {
      success: true,
      transactionCount: txns.length,
      categoryCount: categoryPatterns.length,
      vendorCount: vendorPatterns.length,
    };
  }
  
  /**
   * Detect anomalies in a single day's spending
   */
  detectDailyAnomaly(dailySpend: number, date: Date): SpendingAnomaly | null {
    if (!this.model) return null;
    
    const { dailySpendBaseline, thresholds } = this.model;
    if (dailySpendBaseline.sampleSize < 7) return null;
    
    const zScore = computeZScore(dailySpend, dailySpendBaseline.mean, dailySpendBaseline.stdDev);
    const absZScore = Math.abs(zScore);
    
    if (absZScore < thresholds.dailySpendZScore) return null;
    
    const direction = zScore > 0 ? "above" : "below";
    
    return {
      type: "daily_spike",
      severity: determineSeverity(zScore),
      score: zScore,
      title: `Unusual daily spending detected`,
      description: `Spending of ${formatCurrency(dailySpend)} on ${format(date, "MMM d")} is ${absZScore.toFixed(1)}σ ${direction} the typical ${formatCurrency(dailySpendBaseline.mean)}.`,
      observedValue: dailySpend,
      expectedValue: dailySpendBaseline.mean,
      context: {
        date: format(date, "yyyy-MM-dd"),
        zScore,
        baseline: dailySpendBaseline,
      },
    };
  }
  
  /**
   * Detect anomaly for a specific day of week
   */
  detectDayOfWeekAnomaly(dailySpend: number, date: Date): SpendingAnomaly | null {
    if (!this.model) return null;
    
    const dayOfWeek = getDay(date);
    const pattern = this.model.dayOfWeekPatterns[dayOfWeek];
    
    if (!pattern || pattern.baseline.sampleSize < 4) return null;
    
    const zScore = computeZScore(dailySpend, pattern.baseline.mean, pattern.baseline.stdDev);
    const absZScore = Math.abs(zScore);
    
    if (absZScore < 2.0) return null;
    
    const direction = zScore > 0 ? "higher" : "lower";
    
    return {
      type: "seasonal_deviation",
      severity: determineSeverity(zScore),
      score: zScore,
      title: `Unusual spending for ${pattern.dayName}`,
      description: `${formatCurrency(dailySpend)} is ${absZScore.toFixed(1)}σ ${direction} than typical ${pattern.dayName} spending (${formatCurrency(pattern.baseline.mean)}).`,
      observedValue: dailySpend,
      expectedValue: pattern.baseline.mean,
      context: {
        dayOfWeek,
        dayName: pattern.dayName,
        baseline: pattern.baseline,
      },
    };
  }
  
  /**
   * Detect anomaly in category spending
   */
  detectCategoryAnomaly(categoryId: string, monthlySpend: number): SpendingAnomaly | null {
    if (!this.model) return null;
    
    const pattern = this.model.categoryPatterns.find(p => p.categoryId === categoryId);
    // Require at least 3 baseline points and non-zero stdDev to avoid false positives
    if (!pattern || pattern.monthlyBaseline.sampleSize < 3 || pattern.monthlyBaseline.stdDev === 0) return null;
    
    const zScore = computeZScore(monthlySpend, pattern.monthlyBaseline.mean, pattern.monthlyBaseline.stdDev);
    const absZScore = Math.abs(zScore);
    
    if (absZScore < this.model.thresholds.categorySpendZScore) return null;
    
    const direction = zScore > 0 ? "above" : "below";
    const trendNote = pattern.trend > 0.05 ? " (trending up)" : pattern.trend < -0.05 ? " (trending down)" : "";
    
    return {
      type: "category_spike",
      severity: determineSeverity(zScore),
      score: zScore,
      title: `Category spending anomaly: ${categoryId}`,
      description: `${formatCurrency(monthlySpend)} this month is ${absZScore.toFixed(1)}σ ${direction} the typical ${formatCurrency(pattern.monthlyBaseline.mean)}${trendNote}.`,
      observedValue: monthlySpend,
      expectedValue: pattern.monthlyBaseline.mean,
      context: {
        categoryId,
        trend: pattern.trend,
        baseline: pattern.monthlyBaseline,
      },
    };
  }
  
  /**
   * Detect anomaly in vendor transaction amount
   */
  detectVendorAnomaly(vendorId: string, transactionAmount: number): SpendingAnomaly | null {
    if (!this.model) return null;
    
    const pattern = this.model.vendorPatterns.find(p => p.vendorId === vendorId);
    if (!pattern) return null;
    
    const zScore = computeZScore(transactionAmount, pattern.averageTransaction, pattern.transactionStdDev);
    const absZScore = Math.abs(zScore);
    
    if (absZScore < this.model.thresholds.vendorAmountZScore) return null;
    
    const direction = zScore > 0 ? "higher" : "lower";
    
    return {
      type: "vendor_anomaly",
      severity: determineSeverity(zScore),
      score: zScore,
      title: `Unusual ${pattern.vendorName} charge`,
      description: `${formatCurrency(transactionAmount)} is ${absZScore.toFixed(1)}σ ${direction} than typical charges from ${pattern.vendorName} (avg: ${formatCurrency(pattern.averageTransaction)}).`,
      observedValue: transactionAmount,
      expectedValue: pattern.averageTransaction,
      context: {
        vendorId,
        vendorName: pattern.vendorName,
        frequency: pattern.frequency,
        lastSeen: pattern.lastSeen,
      },
    };
  }
  
  /**
   * Run full anomaly detection on recent transactions
   */
  async detectAllAnomalies(daysBack: number = 30): Promise<SpendingAnomaly[]> {
    if (!this.model) {
      await this.loadModel();
    }
    if (!this.model) return [];
    
    const anomalies: SpendingAnomaly[] = [];
    const cutoffDate = subDays(new Date(), daysBack);
    
    // Fetch recent transactions
    const recentTxns = await db
      .select({
        amount: transactions.amount,
        date: transactions.date,
        categoryId: transactions.categoryId,
        vendorId: transactions.vendorId,
        vendorNormalized: transactions.vendorNormalized,
        description: transactions.description,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, cutoffDate)
        )
      );
    
    // Aggregate daily spending
    const dailySpend = new Map<string, number>();
    const categoryMonthly = new Map<string, number>();
    
    for (const txn of recentTxns) {
      const amount = Math.abs(parseFloat(txn.amount));
      const isExpense = parseFloat(txn.amount) < 0;
      
      if (!isExpense) continue;
      
      const dateStr = format(new Date(txn.date), "yyyy-MM-dd");
      dailySpend.set(dateStr, (dailySpend.get(dateStr) || 0) + amount);
      
      // Category aggregation
      const catId = txn.categoryId || "uncategorized";
      categoryMonthly.set(catId, (categoryMonthly.get(catId) || 0) + amount);
      
      // Check individual vendor transactions
      const vendorId = txn.vendorId || txn.vendorNormalized || txn.description?.substring(0, 30) || "unknown";
      const vendorAnomaly = this.detectVendorAnomaly(vendorId, amount);
      if (vendorAnomaly) anomalies.push(vendorAnomaly);
    }
    
    // Check daily anomalies
    for (const [dateStr, spend] of dailySpend) {
      const date = parseISO(dateStr);
      
      const dailyAnomaly = this.detectDailyAnomaly(spend, date);
      if (dailyAnomaly) anomalies.push(dailyAnomaly);
      
      const dowAnomaly = this.detectDayOfWeekAnomaly(spend, date);
      if (dowAnomaly && !dailyAnomaly) anomalies.push(dowAnomaly);
    }
    
    // Check category anomalies
    for (const [categoryId, spend] of categoryMonthly) {
      const catAnomaly = this.detectCategoryAnomaly(categoryId, spend);
      if (catAnomaly) anomalies.push(catAnomaly);
    }
    
    // Sort by severity and score
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    anomalies.sort((a, b) => {
      const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return Math.abs(b.score) - Math.abs(a.score);
    });
    
    return anomalies;
  }
  
  /**
   * Get model statistics
   */
  getStats(): {
    isLoaded: boolean;
    version: string | null;
    trainedAt: string | null;
    transactionCount: number;
    categoryCount: number;
    vendorCount: number;
    dailySpendMean: number | null;
    dailySpendStdDev: number | null;
  } {
    return {
      isLoaded: this.model !== null,
      version: this.model?.version || null,
      trainedAt: this.model?.trainedAt || null,
      transactionCount: this.model?.transactionCount || 0,
      categoryCount: this.model?.categoryPatterns.length || 0,
      vendorCount: this.model?.vendorPatterns.length || 0,
      dailySpendMean: this.model?.dailySpendBaseline.mean || null,
      dailySpendStdDev: this.model?.dailySpendBaseline.stdDev || null,
    };
  }
  
  /**
   * Get learned patterns for display
   */
  getPatterns(): {
    dayOfWeek: Array<{ day: string; avgSpend: number; sampleSize: number }>;
    topCategories: Array<{ category: string; avgMonthly: number; trend: string }>;
    topVendors: Array<{ vendor: string; avgAmount: number; frequency: string }>;
    seasonalIndices: Array<{ month: number; index: number }>;
  } {
    if (!this.model) {
      return { dayOfWeek: [], topCategories: [], topVendors: [], seasonalIndices: [] };
    }
    
    return {
      dayOfWeek: this.model.dayOfWeekPatterns.map(p => ({
        day: p.dayName,
        avgSpend: Math.round(p.baseline.mean),
        sampleSize: p.baseline.sampleSize,
      })),
      topCategories: this.model.categoryPatterns
        .sort((a, b) => b.monthlyBaseline.mean - a.monthlyBaseline.mean)
        .slice(0, 10)
        .map(c => ({
          category: c.categoryId,
          avgMonthly: Math.round(c.monthlyBaseline.mean),
          trend: c.trend > 0.05 ? "increasing" : c.trend < -0.05 ? "decreasing" : "stable",
        })),
      topVendors: this.model.vendorPatterns
        .sort((a, b) => (b.averageTransaction * b.frequency) - (a.averageTransaction * a.frequency))
        .slice(0, 10)
        .map(v => ({
          vendor: v.vendorName,
          avgAmount: Math.round(v.averageTransaction),
          frequency: v.frequency >= 4 ? "weekly" : v.frequency >= 1 ? "monthly" : "occasional",
        })),
      seasonalIndices: this.model.seasonalIndices,
    };
  }
}

// ============================================
// Global Model Cache
// ============================================

const anomalyModelCache = new Map<string, SpendingAnomalyModel>();

/**
 * Get or create an anomaly model for an organization
 */
export async function getSpendingAnomalyModel(organizationId: string): Promise<SpendingAnomalyModel> {
  let model = anomalyModelCache.get(organizationId);
  
  if (!model) {
    model = new SpendingAnomalyModel(organizationId);
    await model.loadModel();
    anomalyModelCache.set(organizationId, model);
  }
  
  return model;
}

/**
 * Train the anomaly model for an organization
 */
export async function trainSpendingAnomalyModel(organizationId: string, daysBack?: number): Promise<{
  success: boolean;
  transactionCount: number;
  categoryCount: number;
  vendorCount: number;
}> {
  const model = await getSpendingAnomalyModel(organizationId);
  return model.train(daysBack);
}

/**
 * Detect spending anomalies for an organization
 */
export async function detectSpendingAnomalies(
  organizationId: string,
  daysBack?: number
): Promise<SpendingAnomaly[]> {
  const model = await getSpendingAnomalyModel(organizationId);
  return model.detectAllAnomalies(daysBack);
}

/**
 * Get anomaly model statistics
 */
export async function getSpendingAnomalyStats(organizationId: string): Promise<ReturnType<SpendingAnomalyModel["getStats"]>> {
  const model = await getSpendingAnomalyModel(organizationId);
  return model.getStats();
}

/**
 * Get learned spending patterns
 */
export async function getSpendingPatterns(organizationId: string): Promise<ReturnType<SpendingAnomalyModel["getPatterns"]>> {
  const model = await getSpendingAnomalyModel(organizationId);
  return model.getPatterns();
}
