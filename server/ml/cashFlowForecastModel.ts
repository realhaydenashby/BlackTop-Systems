/**
 * Proprietary Cash Flow Forecasting Model
 * 
 * A local time series model that trains on historical cash inflows/outflows.
 * Uses exponential smoothing (Holt-Winters), moving averages, and linear regression.
 * Generates forward forecasts without LLM calls.
 */

import { db } from "../db";
import { transactions } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { subMonths, format, startOfMonth, addMonths, eachMonthOfInterval } from "date-fns";

// ============================================
// Types
// ============================================

interface TimeSeriesPoint {
  month: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
}

interface SeasonalIndex {
  month: number; // 1-12
  inflowIndex: number;
  outflowIndex: number;
}

interface TrendComponent {
  slope: number;
  intercept: number;
  r2: number;
}

interface ExponentialSmoothingParams {
  alpha: number; // Level smoothing (0-1)
  beta: number;  // Trend smoothing (0-1)
  gamma: number; // Seasonal smoothing (0-1)
}

interface TrainedForecastModel {
  version: string;
  trainedAt: string;
  organizationId: string;
  dataMonths: number;
  
  // Baseline statistics
  avgInflows: number;
  avgOutflows: number;
  avgNetCashFlow: number;
  
  // Volatility measures
  inflowStdDev: number;
  outflowStdDev: number;
  netCashFlowStdDev: number;
  
  // Trend components (linear regression)
  inflowTrend: TrendComponent;
  outflowTrend: TrendComponent;
  netCashFlowTrend: TrendComponent;
  
  // Seasonal indices (12 months)
  seasonalIndices: SeasonalIndex[];
  
  // Exponential smoothing state (Holt-Winters)
  hwParams: ExponentialSmoothingParams;
  hwLevel: number;
  hwTrend: number;
  hwSeasonals: number[]; // 12 values
  
  // Moving average state
  movingAverages: {
    ma3: number;
    ma6: number;
    ma12: number;
  };
  
  // Recent values for continuation
  lastMonthData: TimeSeriesPoint;
  recentMonths: TimeSeriesPoint[]; // Last 12 months
}

export interface CashFlowForecast {
  month: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  confidenceLow: number;
  confidenceHigh: number;
  method: "holt_winters" | "trend_seasonal" | "moving_average";
}

export interface ForecastResult {
  forecasts: CashFlowForecast[];
  modelConfidence: number;
  historicalAccuracy: number;
  summary: {
    avgProjectedInflows: number;
    avgProjectedOutflows: number;
    avgProjectedNetCashFlow: number;
    trendDirection: "increasing" | "decreasing" | "stable";
    seasonalStrength: number;
  };
}

// ============================================
// Statistical Utilities
// ============================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function linearRegression(values: number[]): TrendComponent {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R-squared
  const yMean = sumY / n;
  let ssTotal = 0, ssResidual = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    ssTotal += Math.pow(values[i] - yMean, 2);
    ssResidual += Math.pow(values[i] - predicted, 2);
  }
  const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
  
  return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
}

function movingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const recent = values.slice(-window);
  return mean(recent);
}

// Optimize exponential smoothing parameters using grid search
function optimizeHoltWintersParams(data: number[], seasonPeriod: number = 12): ExponentialSmoothingParams {
  let bestParams = { alpha: 0.3, beta: 0.1, gamma: 0.1 };
  let bestError = Infinity;
  
  // Grid search over parameter space
  for (let alpha = 0.1; alpha <= 0.9; alpha += 0.2) {
    for (let beta = 0.05; beta <= 0.3; beta += 0.1) {
      for (let gamma = 0.05; gamma <= 0.3; gamma += 0.1) {
        const error = evaluateHoltWinters(data, alpha, beta, gamma, seasonPeriod);
        if (error < bestError) {
          bestError = error;
          bestParams = { alpha, beta, gamma };
        }
      }
    }
  }
  
  return bestParams;
}

function normalizeSeasonals(seasonals: number[]): void {
  const sum = seasonals.reduce((a, b) => a + b, 0);
  const avg = sum / seasonals.length;
  if (avg > 0) {
    for (let i = 0; i < seasonals.length; i++) {
      seasonals[i] /= avg;
    }
  }
}

function evaluateHoltWinters(data: number[], alpha: number, beta: number, gamma: number, period: number): number {
  if (data.length < period + 2) return Infinity;
  
  // Initialize
  let level = mean(data.slice(0, period));
  let trend = (mean(data.slice(period, period * 2)) - level) / period || 0;
  const seasonals = new Array(period).fill(1);
  
  // Initialize seasonals from first period with bounds
  for (let i = 0; i < Math.min(period, data.length); i++) {
    const raw = data[i] / (level || 1);
    seasonals[i] = Math.max(0.1, Math.min(10, raw)); // Bound to prevent runaway
  }
  normalizeSeasonals(seasonals);
  
  let totalError = 0;
  let count = 0;
  
  for (let i = period; i < data.length; i++) {
    const seasonalIndex = i % period;
    const forecast = (level + trend) * seasonals[seasonalIndex];
    const error = Math.abs(data[i] - forecast);
    totalError += error;
    count++;
    
    // Update
    const oldLevel = level;
    level = alpha * (data[i] / (seasonals[seasonalIndex] || 1)) + (1 - alpha) * (level + trend);
    trend = beta * (level - oldLevel) + (1 - beta) * trend;
    const newSeasonal = gamma * (data[i] / (level || 1)) + (1 - gamma) * seasonals[seasonalIndex];
    seasonals[seasonalIndex] = Math.max(0.1, Math.min(10, newSeasonal)); // Bound updates
    
    // Normalize seasonals periodically to prevent drift
    if (i % period === 0) {
      normalizeSeasonals(seasonals);
    }
  }
  
  return count > 0 ? totalError / count : Infinity;
}

// ============================================
// Cash Flow Forecast Model
// ============================================

export class CashFlowForecastModel {
  private model: TrainedForecastModel | null = null;
  private modelPath: string;
  private organizationId: string;
  
  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.modelPath = path.join(process.cwd(), ".local", "models", `cashflow_forecast_${organizationId}.json`);
  }
  
  /**
   * Load trained model from disk
   */
  async loadModel(): Promise<boolean> {
    try {
      if (fs.existsSync(this.modelPath)) {
        const data = fs.readFileSync(this.modelPath, "utf-8");
        this.model = JSON.parse(data);
        console.log(`[CashFlowML] Loaded model trained on ${this.model?.dataMonths || 0} months`);
        return true;
      }
    } catch (error) {
      console.error("[CashFlowML] Failed to load model:", error);
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
      console.log(`[CashFlowML] Saved model to ${this.modelPath}`);
    } catch (error) {
      console.error("[CashFlowML] Failed to save model:", error);
    }
  }
  
  /**
   * Get model statistics
   */
  getModelStats(): {
    trained: boolean;
    trainedAt: string | null;
    dataMonths: number;
    avgNetCashFlow: number;
    trendSlope: number;
    seasonalStrength: number;
    hwParams: ExponentialSmoothingParams | null;
  } | null {
    if (!this.model) return null;
    
    // Calculate seasonal strength (variance of seasonal indices)
    const seasonalValues = this.model.seasonalIndices.map(s => s.inflowIndex);
    const seasonalVariance = stdDev(seasonalValues);
    
    return {
      trained: true,
      trainedAt: this.model.trainedAt,
      dataMonths: this.model.dataMonths,
      avgNetCashFlow: this.model.avgNetCashFlow,
      trendSlope: this.model.netCashFlowTrend.slope,
      seasonalStrength: seasonalVariance,
      hwParams: this.model.hwParams,
    };
  }
  
  /**
   * Train the forecasting model on historical data
   */
  async train(monthsBack: number = 24): Promise<{
    success: boolean;
    dataMonths: number;
    avgNetCashFlow: number;
    trendDirection: string;
  }> {
    console.log(`[CashFlowML] Training forecast model for org ${this.organizationId}...`);
    
    const cutoffDate = subMonths(new Date(), monthsBack);
    const cutoffDateStr = format(cutoffDate, "yyyy-MM-dd");
    
    // Fetch all transactions in the training window (compare as string since date is stored as string)
    const txns = await db
      .select({
        amount: transactions.amount,
        date: transactions.date,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, cutoffDateStr)
        )
      );
    
    if (txns.length < 30) {
      console.log(`[CashFlowML] Not enough transactions (${txns.length}, need 30+)`);
      return { success: false, dataMonths: 0, avgNetCashFlow: 0, trendDirection: "unknown" };
    }
    
    // Aggregate by month
    const monthlyData = new Map<string, { inflows: number; outflows: number }>();
    
    for (const txn of txns) {
      const monthKey = format(startOfMonth(new Date(txn.date)), "yyyy-MM");
      const amount = parseFloat(txn.amount);
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { inflows: 0, outflows: 0 });
      }
      
      const data = monthlyData.get(monthKey)!;
      if (amount > 0) {
        data.inflows += amount;
      } else {
        data.outflows += Math.abs(amount);
      }
    }
    
    // Create complete time series with zero-filled gaps
    const allMonths = eachMonthOfInterval({ start: cutoffDate, end: new Date() })
      .map(d => format(d, "yyyy-MM"));
    
    const timeSeries: TimeSeriesPoint[] = allMonths.map(month => {
      const data = monthlyData.get(month) || { inflows: 0, outflows: 0 };
      return {
        month,
        inflows: data.inflows,
        outflows: data.outflows,
        netCashFlow: data.inflows - data.outflows,
      };
    });
    
    if (timeSeries.length < 6) {
      console.log(`[CashFlowML] Not enough months of data (${timeSeries.length}, need 6+)`);
      return { success: false, dataMonths: timeSeries.length, avgNetCashFlow: 0, trendDirection: "unknown" };
    }
    
    console.log(`[CashFlowML] Processing ${timeSeries.length} months of data...`);
    
    // Extract series
    const inflowSeries = timeSeries.map(p => p.inflows);
    const outflowSeries = timeSeries.map(p => p.outflows);
    const netCashFlowSeries = timeSeries.map(p => p.netCashFlow);
    
    // Calculate baseline statistics
    const avgInflows = mean(inflowSeries);
    const avgOutflows = mean(outflowSeries);
    const avgNetCashFlow = mean(netCashFlowSeries);
    
    // Calculate volatility
    const inflowStdDev = stdDev(inflowSeries);
    const outflowStdDev = stdDev(outflowSeries);
    const netCashFlowStdDev = stdDev(netCashFlowSeries);
    
    // Calculate trends via linear regression
    const inflowTrend = linearRegression(inflowSeries);
    const outflowTrend = linearRegression(outflowSeries);
    const netCashFlowTrend = linearRegression(netCashFlowSeries);
    
    // Calculate seasonal indices (monthly patterns)
    const seasonalIndices: SeasonalIndex[] = [];
    const monthlyInflowTotals = new Array(12).fill(0);
    const monthlyOutflowTotals = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    
    for (const point of timeSeries) {
      const monthNum = parseInt(point.month.split("-")[1]) - 1; // 0-11
      monthlyInflowTotals[monthNum] += point.inflows;
      monthlyOutflowTotals[monthNum] += point.outflows;
      monthlyCounts[monthNum]++;
    }
    
    for (let i = 0; i < 12; i++) {
      const count = monthlyCounts[i] || 1;
      const avgMonthInflow = monthlyInflowTotals[i] / count;
      const avgMonthOutflow = monthlyOutflowTotals[i] / count;
      
      seasonalIndices.push({
        month: i + 1,
        inflowIndex: avgInflows > 0 ? avgMonthInflow / avgInflows : 1,
        outflowIndex: avgOutflows > 0 ? avgMonthOutflow / avgOutflows : 1,
      });
    }
    
    // Optimize and fit Holt-Winters exponential smoothing
    const hwParams = optimizeHoltWintersParams(netCashFlowSeries, Math.min(12, timeSeries.length));
    
    // Initialize Holt-Winters state
    const period = Math.min(12, timeSeries.length);
    let hwLevel = mean(netCashFlowSeries.slice(0, period));
    let hwTrend = period >= 2 
      ? (mean(netCashFlowSeries.slice(period)) - hwLevel) / period 
      : 0;
    
    const hwSeasonals = new Array(12).fill(1);
    for (let i = 0; i < Math.min(12, netCashFlowSeries.length); i++) {
      const raw = hwLevel !== 0 ? netCashFlowSeries[i] / hwLevel : 1;
      hwSeasonals[i] = Math.max(0.1, Math.min(10, raw)); // Bound to prevent runaway
    }
    normalizeSeasonals(hwSeasonals);
    
    // Update Holt-Winters state with all data
    for (let i = period; i < netCashFlowSeries.length; i++) {
      const seasonalIndex = i % 12;
      const observed = netCashFlowSeries[i];
      
      const oldLevel = hwLevel;
      hwLevel = hwParams.alpha * (observed / (hwSeasonals[seasonalIndex] || 1)) 
        + (1 - hwParams.alpha) * (hwLevel + hwTrend);
      hwTrend = hwParams.beta * (hwLevel - oldLevel) 
        + (1 - hwParams.beta) * hwTrend;
      const newSeasonal = hwParams.gamma * (observed / (hwLevel || 1)) 
        + (1 - hwParams.gamma) * hwSeasonals[seasonalIndex];
      hwSeasonals[seasonalIndex] = Math.max(0.1, Math.min(10, newSeasonal)); // Bound updates
      
      // Normalize seasonals periodically to prevent drift
      if (i % 12 === 0) {
        normalizeSeasonals(hwSeasonals);
      }
    }
    
    // Calculate moving averages
    const ma3 = movingAverage(netCashFlowSeries, 3);
    const ma6 = movingAverage(netCashFlowSeries, 6);
    const ma12 = movingAverage(netCashFlowSeries, Math.min(12, netCashFlowSeries.length));
    
    // Store model
    this.model = {
      version: "1.0.0",
      trainedAt: new Date().toISOString(),
      organizationId: this.organizationId,
      dataMonths: timeSeries.length,
      avgInflows,
      avgOutflows,
      avgNetCashFlow,
      inflowStdDev,
      outflowStdDev,
      netCashFlowStdDev,
      inflowTrend,
      outflowTrend,
      netCashFlowTrend,
      seasonalIndices,
      hwParams,
      hwLevel,
      hwTrend,
      hwSeasonals,
      movingAverages: { ma3, ma6, ma12 },
      lastMonthData: timeSeries[timeSeries.length - 1],
      recentMonths: timeSeries.slice(-12),
    };
    
    this.saveModel();
    
    const trendDirection = netCashFlowTrend.slope > 1000 
      ? "increasing" 
      : netCashFlowTrend.slope < -1000 
        ? "decreasing" 
        : "stable";
    
    console.log(`[CashFlowML] Trained model: ${timeSeries.length} months, trend=${trendDirection}, avgNet=${avgNetCashFlow.toFixed(0)}`);
    
    return {
      success: true,
      dataMonths: timeSeries.length,
      avgNetCashFlow,
      trendDirection,
    };
  }
  
  /**
   * Generate forward forecast using trained model
   */
  forecast(months: number = 12): ForecastResult | null {
    if (!this.model) {
      console.log("[CashFlowML] No model loaded");
      return null;
    }
    
    const forecasts: CashFlowForecast[] = [];
    const now = new Date();
    
    // Use ensemble of methods weighted by their reliability
    const trendR2 = this.model.netCashFlowTrend.r2;
    const hasSeasonalData = this.model.dataMonths >= 12;
    const hasStableData = this.model.netCashFlowStdDev < Math.abs(this.model.avgNetCashFlow) * 2;
    
    // Holt-Winters state for rolling forecasts
    let hwLevel = this.model.hwLevel;
    let hwTrend = this.model.hwTrend;
    const hwSeasonals = [...this.model.hwSeasonals];
    
    // Starting point for trend projection
    const trendStartIndex = this.model.dataMonths;
    
    for (let i = 0; i < months; i++) {
      const forecastMonth = addMonths(now, i + 1);
      const monthKey = format(forecastMonth, "yyyy-MM");
      const monthNum = forecastMonth.getMonth(); // 0-11
      const seasonalIndex = this.model.seasonalIndices[monthNum];
      
      // Method 1: Holt-Winters forecast
      const hwForecast = (hwLevel + hwTrend * (i + 1)) * hwSeasonals[monthNum];
      
      // Method 2: Trend + Seasonal
      const trendValue = this.model.netCashFlowTrend.intercept 
        + this.model.netCashFlowTrend.slope * (trendStartIndex + i);
      const trendSeasonalForecast = trendValue * ((seasonalIndex.inflowIndex + seasonalIndex.outflowIndex) / 2);
      
      // Method 3: Moving average (damped)
      const dampFactor = Math.pow(0.95, i); // Decay towards mean
      const maForecast = this.model.movingAverages.ma3 * dampFactor 
        + this.model.avgNetCashFlow * (1 - dampFactor);
      
      // Ensemble: weight by data quality
      let netCashFlow: number;
      let method: "holt_winters" | "trend_seasonal" | "moving_average";
      
      if (hasSeasonalData && this.model.hwParams.alpha > 0) {
        // Prefer Holt-Winters when we have seasonal data
        netCashFlow = hwForecast * 0.5 + trendSeasonalForecast * 0.3 + maForecast * 0.2;
        method = "holt_winters";
      } else if (trendR2 > 0.5) {
        // Use trend if it has good fit
        netCashFlow = trendSeasonalForecast * 0.6 + maForecast * 0.4;
        method = "trend_seasonal";
      } else {
        // Fall back to moving average
        netCashFlow = maForecast * 0.7 + this.model.avgNetCashFlow * 0.3;
        method = "moving_average";
      }
      
      // Project inflows and outflows separately using their own trends
      const inflowTrendValue = this.model.inflowTrend.intercept 
        + this.model.inflowTrend.slope * (trendStartIndex + i);
      const outflowTrendValue = this.model.outflowTrend.intercept 
        + this.model.outflowTrend.slope * (trendStartIndex + i);
      
      // Apply seasonal adjustments
      const inflows = Math.max(0, inflowTrendValue * seasonalIndex.inflowIndex);
      const outflows = Math.max(0, outflowTrendValue * seasonalIndex.outflowIndex);
      
      // Recalculate net if component forecasts seem more reliable
      if (this.model.inflowTrend.r2 > 0.5 && this.model.outflowTrend.r2 > 0.5) {
        netCashFlow = inflows - outflows;
      }
      
      // Calculate confidence interval (widens with forecast horizon)
      const baseUncertainty = this.model.netCashFlowStdDev;
      const horizonMultiplier = 1 + (i * 0.1); // 10% wider per month
      const uncertainty = baseUncertainty * horizonMultiplier * 1.96; // 95% CI
      
      forecasts.push({
        month: monthKey,
        inflows: Math.round(inflows),
        outflows: Math.round(outflows),
        netCashFlow: Math.round(netCashFlow),
        confidenceLow: Math.round(netCashFlow - uncertainty),
        confidenceHigh: Math.round(netCashFlow + uncertainty),
        method,
      });
    }
    
    // Calculate summary statistics
    const avgProjectedInflows = mean(forecasts.map(f => f.inflows));
    const avgProjectedOutflows = mean(forecasts.map(f => f.outflows));
    const avgProjectedNetCashFlow = mean(forecasts.map(f => f.netCashFlow));
    
    const trendDirection = this.model.netCashFlowTrend.slope > 1000 
      ? "increasing" as const
      : this.model.netCashFlowTrend.slope < -1000 
        ? "decreasing" as const
        : "stable" as const;
    
    // Seasonal strength based on variance of seasonal indices
    const seasonalVariance = stdDev(this.model.seasonalIndices.map(s => s.inflowIndex));
    const seasonalStrength = Math.min(1, seasonalVariance);
    
    // Model confidence based on data quality
    const modelConfidence = Math.min(1, 
      0.3 * Math.min(1, this.model.dataMonths / 24) + // Data quantity
      0.3 * this.model.netCashFlowTrend.r2 + // Trend fit
      0.2 * (hasStableData ? 1 : 0.5) + // Stability
      0.2 * (hasSeasonalData ? 1 : 0.5) // Seasonality
    );
    
    // Historical accuracy (backtesting placeholder - in production, track actual vs predicted)
    const historicalAccuracy = 0.7 + 0.2 * this.model.netCashFlowTrend.r2;
    
    return {
      forecasts,
      modelConfidence,
      historicalAccuracy,
      summary: {
        avgProjectedInflows,
        avgProjectedOutflows,
        avgProjectedNetCashFlow,
        trendDirection,
        seasonalStrength,
      },
    };
  }
  
  /**
   * Get forecasted values for specific metrics
   */
  getForecastedMetrics(months: number = 12): {
    projectedBurnRate: number;
    projectedRunway: number;
    cashFlowTrend: "improving" | "declining" | "stable";
    seasonalPeakMonth: number;
    seasonalTroughMonth: number;
  } | null {
    const result = this.forecast(months);
    if (!result || !this.model) return null;
    
    // Calculate burn rate (avg monthly cash outflow - inflow when negative)
    const burnRates = result.forecasts
      .filter(f => f.netCashFlow < 0)
      .map(f => Math.abs(f.netCashFlow));
    const projectedBurnRate = burnRates.length > 0 ? mean(burnRates) : 0;
    
    // Estimate runway from forecasts
    let runway = months; // Default to full forecast period
    let cumulativeCash = 0;
    for (let i = 0; i < result.forecasts.length; i++) {
      cumulativeCash += result.forecasts[i].netCashFlow;
      if (cumulativeCash < -this.model.avgInflows * 3) { // Rough threshold
        runway = i + 1;
        break;
      }
    }
    const projectedRunway = runway;
    
    // Determine cash flow trend from forecast trajectory
    const firstHalf = result.forecasts.slice(0, Math.floor(months / 2));
    const secondHalf = result.forecasts.slice(Math.floor(months / 2));
    const firstHalfAvg = mean(firstHalf.map(f => f.netCashFlow));
    const secondHalfAvg = mean(secondHalf.map(f => f.netCashFlow));
    
    const cashFlowTrend = secondHalfAvg > firstHalfAvg * 1.1 
      ? "improving" as const
      : secondHalfAvg < firstHalfAvg * 0.9 
        ? "declining" as const
        : "stable" as const;
    
    // Find seasonal peak and trough months
    const seasonalIndices = this.model.seasonalIndices;
    let peakMonth = 1, troughMonth = 1;
    let maxIndex = 0, minIndex = Infinity;
    
    for (const s of seasonalIndices) {
      const netIndex = s.inflowIndex - s.outflowIndex;
      if (netIndex > maxIndex) {
        maxIndex = netIndex;
        peakMonth = s.month;
      }
      if (netIndex < minIndex) {
        minIndex = netIndex;
        troughMonth = s.month;
      }
    }
    
    return {
      projectedBurnRate: Math.round(projectedBurnRate),
      projectedRunway,
      cashFlowTrend,
      seasonalPeakMonth: peakMonth,
      seasonalTroughMonth: troughMonth,
    };
  }
  
  /**
   * Compare current period to forecast and detect deviations
   */
  detectForecastDeviation(actualInflows: number, actualOutflows: number, month: string): {
    deviationType: "on_track" | "above_forecast" | "below_forecast" | "significant_deviation";
    inflowDeviation: number;
    outflowDeviation: number;
    netDeviation: number;
    percentageDeviation: number;
  } | null {
    const forecast = this.forecast(1);
    if (!forecast || forecast.forecasts.length === 0) return null;
    
    const expected = forecast.forecasts[0];
    const actualNet = actualInflows - actualOutflows;
    
    const inflowDeviation = actualInflows - expected.inflows;
    const outflowDeviation = actualOutflows - expected.outflows;
    const netDeviation = actualNet - expected.netCashFlow;
    
    const expectedNet = expected.netCashFlow || 1;
    const percentageDeviation = (netDeviation / Math.abs(expectedNet)) * 100;
    
    let deviationType: "on_track" | "above_forecast" | "below_forecast" | "significant_deviation";
    
    if (Math.abs(percentageDeviation) < 10) {
      deviationType = "on_track";
    } else if (Math.abs(percentageDeviation) > 50) {
      deviationType = "significant_deviation";
    } else if (netDeviation > 0) {
      deviationType = "above_forecast";
    } else {
      deviationType = "below_forecast";
    }
    
    return {
      deviationType,
      inflowDeviation: Math.round(inflowDeviation),
      outflowDeviation: Math.round(outflowDeviation),
      netDeviation: Math.round(netDeviation),
      percentageDeviation: Math.round(percentageDeviation),
    };
  }
}

// Factory function
export function createCashFlowForecastModel(organizationId: string): CashFlowForecastModel {
  return new CashFlowForecastModel(organizationId);
}

// ============================================
// Helper Functions for API Routes
// ============================================

export async function trainCashFlowForecastModel(organizationId: string, monthsBack: number = 24) {
  const model = new CashFlowForecastModel(organizationId);
  return model.train(monthsBack);
}

export async function getCashFlowForecastStats(organizationId: string) {
  const model = new CashFlowForecastModel(organizationId);
  const loaded = await model.loadModel();
  if (!loaded) {
    return { trained: false, trainedAt: null, dataMonths: 0, avgNetCashFlow: 0, trendSlope: 0, seasonalStrength: 0, hwParams: null };
  }
  return model.getModelStats();
}

export async function generateCashFlowForecast(organizationId: string, months: number = 12): Promise<ForecastResult & { success: boolean } | { success: false; error: string }> {
  const model = new CashFlowForecastModel(organizationId);
  const loaded = await model.loadModel();
  if (!loaded) {
    return { success: false, error: "No trained model found. Train the model first." };
  }
  const result = model.forecast(months);
  if (!result || result.forecasts.length === 0) {
    return { success: false, error: "Failed to generate forecast" };
  }
  return { ...result, success: true };
}

export async function getCashFlowMetrics(organizationId: string, months: number = 12) {
  const model = new CashFlowForecastModel(organizationId);
  const loaded = await model.loadModel();
  if (!loaded) {
    return null;
  }
  return model.getForecastedMetrics(months);
}
