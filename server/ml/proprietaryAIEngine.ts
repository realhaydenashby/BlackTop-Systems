/**
 * Proprietary AI Engine
 * 
 * Coordinates all proprietary ML models to do the real analytical work.
 * LLM is relegated to a "translator" role - converting structured outputs
 * to natural language for user-facing explanations.
 * 
 * Architecture:
 *   Proprietary Models (do the work) → Structured Results → LLM Interface (explains to users)
 * 
 * Models integrated:
 *   - AccountClassifier: Chart of accounts classification
 *   - VendorEmbeddingModel: Vendor name matching/normalization
 *   - SpendingAnomalyModel: Statistical anomaly detection
 *   - CashFlowForecastModel: Holt-Winters time series forecasting
 *   - CrossOrgPatternDatabase: Industry benchmarks and patterns
 */

import { AccountClassifier, classifyTransaction, classifyTransactionBatch } from "./accountClassifier";
import { VendorEmbeddingModel, findSimilarVendors, matchVendorToKnown, normalizeVendorName } from "./vendorEmbeddings";
import { SpendingAnomalyModel, detectTransactionAnomalies, detectAnomaliesForOrg } from "./spendingAnomalyModel";
import { CashFlowForecastModel, forecastCashFlow, computeRunwayProbabilities } from "./cashFlowForecastModel";
import { 
  CrossOrgPatternDatabase, 
  contributeOrgPatterns, 
  getIndustryBenchmarks, 
  compareMetricsToIndustry,
  getSeasonalPatternsForType,
  getCommonVendorsForType,
} from "./crossOrgPatterns";
import { db } from "../db";
import { organizations, transactions, vendors } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { subMonths, format } from "date-fns";

// ============================================
// Types
// ============================================

export interface ProprietaryAnalysisResult {
  organizationId: string;
  analysisType: AnalysisType;
  timestamp: Date;
  
  // Structured results from proprietary models
  results: {
    classification?: ClassificationResult;
    vendorAnalysis?: VendorAnalysisResult;
    anomalies?: AnomalyAnalysisResult;
    forecast?: ForecastResult;
    benchmarks?: BenchmarkResult;
  };
  
  // Confidence from proprietary models (not LLM)
  overallConfidence: number;
  
  // Model attribution for transparency
  modelsUsed: ModelAttribution[];
  
  // Optional: LLM-generated natural language summary
  naturalLanguageSummary?: string;
}

export type AnalysisType = 
  | "full_analysis"
  | "transaction_classification"
  | "vendor_normalization"
  | "anomaly_detection"
  | "cash_forecast"
  | "benchmark_comparison";

interface ClassificationResult {
  transactionsClassified: number;
  accountDistribution: Record<string, number>;
  highConfidenceRate: number;
  lowConfidenceTransactions: Array<{
    transactionId: string;
    vendorName: string;
    suggestedAccount: string;
    confidence: number;
  }>;
}

interface VendorAnalysisResult {
  vendorsNormalized: number;
  matchesToKnown: number;
  newVendors: number;
  topVendorsBySpend: Array<{
    name: string;
    normalizedName: string;
    totalSpend: number;
    category: string | null;
  }>;
}

interface AnomalyAnalysisResult {
  anomaliesDetected: number;
  bySeverity: { high: number; medium: number; low: number };
  topAnomalies: Array<{
    type: string;
    description: string;
    severity: string;
    value: number;
    expectedRange: { min: number; max: number };
    confidence: number;
  }>;
}

interface ForecastResult {
  runwayMonths: number;
  runwayConfidenceInterval: { p10: number; p50: number; p90: number };
  monthlyForecasts: Array<{
    month: string;
    predictedCashFlow: number;
    lower: number;
    upper: number;
    confidence: number;
  }>;
  burnRateTrend: "increasing" | "stable" | "decreasing";
  keyRisks: string[];
}

interface BenchmarkResult {
  businessType: string;
  comparisons: Array<{
    metric: string;
    value: number;
    percentile: number;
    industryMedian: number;
    status: string;
  }>;
  strengths: string[];
  improvements: string[];
}

interface ModelAttribution {
  modelName: string;
  version: string;
  confidence: number;
  executionTimeMs: number;
}

// ============================================
// Proprietary AI Engine
// ============================================

export class ProprietaryAIEngine {
  private accountClassifier: AccountClassifier;
  private vendorEmbeddings: VendorEmbeddingModel;
  private anomalyModel: SpendingAnomalyModel;
  private forecastModel: CashFlowForecastModel;
  private patternDb: CrossOrgPatternDatabase;
  
  constructor() {
    this.accountClassifier = new AccountClassifier();
    this.vendorEmbeddings = new VendorEmbeddingModel();
    this.anomalyModel = new SpendingAnomalyModel();
    this.forecastModel = new CashFlowForecastModel();
    this.patternDb = new CrossOrgPatternDatabase();
  }
  
  /**
   * Run full proprietary analysis on an organization
   * All heavy lifting done by ML models, no LLM calls
   */
  async runFullAnalysis(organizationId: string, currentCash?: number): Promise<ProprietaryAnalysisResult> {
    const startTime = Date.now();
    const modelsUsed: ModelAttribution[] = [];
    
    console.log(`[ProprietaryAI] Running full analysis for org ${organizationId}`);
    
    // Run all proprietary models in parallel
    const [
      classification,
      vendorAnalysis,
      anomalies,
      forecast,
      benchmarks,
    ] = await Promise.allSettled([
      this.runClassification(organizationId),
      this.runVendorAnalysis(organizationId),
      this.runAnomalyDetection(organizationId),
      this.runForecast(organizationId, currentCash),
      this.runBenchmarkComparison(organizationId),
    ]);
    
    // Collect results with error handling
    const results: ProprietaryAnalysisResult["results"] = {};
    
    if (classification.status === "fulfilled" && classification.value) {
      results.classification = classification.value.result;
      modelsUsed.push(classification.value.attribution);
    }
    
    if (vendorAnalysis.status === "fulfilled" && vendorAnalysis.value) {
      results.vendorAnalysis = vendorAnalysis.value.result;
      modelsUsed.push(vendorAnalysis.value.attribution);
    }
    
    if (anomalies.status === "fulfilled" && anomalies.value) {
      results.anomalies = anomalies.value.result;
      modelsUsed.push(anomalies.value.attribution);
    }
    
    if (forecast.status === "fulfilled" && forecast.value) {
      results.forecast = forecast.value.result;
      modelsUsed.push(forecast.value.attribution);
    }
    
    if (benchmarks.status === "fulfilled" && benchmarks.value) {
      results.benchmarks = benchmarks.value.result;
      modelsUsed.push(benchmarks.value.attribution);
    }
    
    // Calculate overall confidence (average of model confidences)
    const confidences = modelsUsed.map(m => m.confidence);
    const overallConfidence = confidences.length > 0 
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
      : 0;
    
    const totalTime = Date.now() - startTime;
    console.log(`[ProprietaryAI] Full analysis completed in ${totalTime}ms with ${modelsUsed.length} models`);
    
    return {
      organizationId,
      analysisType: "full_analysis",
      timestamp: new Date(),
      results,
      overallConfidence,
      modelsUsed,
    };
  }
  
  /**
   * Classification analysis using AccountClassifier
   */
  private async runClassification(organizationId: string): Promise<{
    result: ClassificationResult;
    attribution: ModelAttribution;
  }> {
    const startTime = Date.now();
    
    // Get recent unclassified transactions
    const cutoff = format(subMonths(new Date(), 3), "yyyy-MM-dd");
    const txns = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, cutoff)
        )
      )
      .limit(500);
    
    // Classify transactions
    const classifications = await Promise.all(
      txns.map(async (txn) => {
        const result = await classifyTransaction(
          txn.description || txn.vendorName || "",
          parseFloat(txn.amount),
          txn.categoryId || undefined
        );
        return { txn, classification: result };
      })
    );
    
    // Aggregate results
    const accountDistribution: Record<string, number> = {};
    const lowConfidence: ClassificationResult["lowConfidenceTransactions"] = [];
    let highConfCount = 0;
    
    for (const { txn, classification } of classifications) {
      if (classification.confidence > 0.7) {
        highConfCount++;
      } else {
        lowConfidence.push({
          transactionId: txn.id,
          vendorName: txn.vendorName || txn.description || "",
          suggestedAccount: classification.accountId,
          confidence: classification.confidence,
        });
      }
      
      accountDistribution[classification.accountId] = 
        (accountDistribution[classification.accountId] || 0) + 1;
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      result: {
        transactionsClassified: classifications.length,
        accountDistribution,
        highConfidenceRate: highConfCount / Math.max(1, classifications.length),
        lowConfidenceTransactions: lowConfidence.slice(0, 10),
      },
      attribution: {
        modelName: "AccountClassifier",
        version: "1.0.0",
        confidence: highConfCount / Math.max(1, classifications.length),
        executionTimeMs: executionTime,
      },
    };
  }
  
  /**
   * Vendor analysis using VendorEmbeddingModel
   */
  private async runVendorAnalysis(organizationId: string): Promise<{
    result: VendorAnalysisResult;
    attribution: ModelAttribution;
  }> {
    const startTime = Date.now();
    
    // Get organization's vendors
    const orgVendors = await db
      .select()
      .from(vendors)
      .where(eq(vendors.organizationId, organizationId));
    
    let matchesToKnown = 0;
    let newVendors = 0;
    
    const topVendors = orgVendors
      .sort((a, b) => parseFloat(b.totalSpend || "0") - parseFloat(a.totalSpend || "0"))
      .slice(0, 10)
      .map(v => ({
        name: v.originalName,
        normalizedName: v.normalizedName || v.originalName,
        totalSpend: parseFloat(v.totalSpend || "0"),
        category: v.category,
      }));
    
    // Check each vendor for known matches
    for (const vendor of orgVendors) {
      const match = await matchVendorToKnown(vendor.originalName);
      if (match.confidence > 0.8) {
        matchesToKnown++;
      } else {
        newVendors++;
      }
    }
    
    const executionTime = Date.now() - startTime;
    const confidence = orgVendors.length > 0 ? 0.85 : 0.5;
    
    return {
      result: {
        vendorsNormalized: orgVendors.length,
        matchesToKnown,
        newVendors,
        topVendorsBySpend: topVendors,
      },
      attribution: {
        modelName: "VendorEmbeddingModel",
        version: "1.0.0",
        confidence,
        executionTimeMs: executionTime,
      },
    };
  }
  
  /**
   * Anomaly detection using SpendingAnomalyModel
   */
  private async runAnomalyDetection(organizationId: string): Promise<{
    result: AnomalyAnalysisResult;
    attribution: ModelAttribution;
  }> {
    const startTime = Date.now();
    
    const anomalies = await detectAnomaliesForOrg(organizationId);
    
    // Aggregate by severity
    const bySeverity = { high: 0, medium: 0, low: 0 };
    for (const anomaly of anomalies) {
      if (anomaly.severity === "high") bySeverity.high++;
      else if (anomaly.severity === "medium") bySeverity.medium++;
      else bySeverity.low++;
    }
    
    // Get top anomalies
    const topAnomalies = anomalies
      .sort((a, b) => b.zScore - a.zScore)
      .slice(0, 5)
      .map(a => ({
        type: a.type,
        description: a.description,
        severity: a.severity,
        value: a.value,
        expectedRange: a.expectedRange,
        confidence: a.confidence,
      }));
    
    const executionTime = Date.now() - startTime;
    const avgConfidence = anomalies.length > 0
      ? anomalies.reduce((sum, a) => sum + a.confidence, 0) / anomalies.length
      : 0.8;
    
    return {
      result: {
        anomaliesDetected: anomalies.length,
        bySeverity,
        topAnomalies,
      },
      attribution: {
        modelName: "SpendingAnomalyModel",
        version: "1.0.0",
        confidence: avgConfidence,
        executionTimeMs: executionTime,
      },
    };
  }
  
  /**
   * Cash flow forecast using CashFlowForecastModel
   */
  private async runForecast(organizationId: string, currentCash?: number): Promise<{
    result: ForecastResult;
    attribution: ModelAttribution;
  }> {
    const startTime = Date.now();
    
    const forecast = await forecastCashFlow(organizationId, 12);
    const runway = await computeRunwayProbabilities(
      organizationId,
      currentCash || 100000
    );
    
    // Determine burn rate trend from forecasts
    let burnRateTrend: ForecastResult["burnRateTrend"] = "stable";
    if (forecast.forecasts.length >= 3) {
      const firstHalf = forecast.forecasts.slice(0, Math.floor(forecast.forecasts.length / 2));
      const secondHalf = forecast.forecasts.slice(Math.floor(forecast.forecasts.length / 2));
      const avgFirst = firstHalf.reduce((sum, f) => sum + f.predicted, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, f) => sum + f.predicted, 0) / secondHalf.length;
      
      if (avgSecond > avgFirst * 1.1) burnRateTrend = "increasing";
      else if (avgSecond < avgFirst * 0.9) burnRateTrend = "decreasing";
    }
    
    // Identify key risks
    const keyRisks: string[] = [];
    if (runway.p50RunwayMonths < 6) keyRisks.push("Critical runway: less than 6 months at median forecast");
    if (runway.survivalProbabilities["6_months"] < 0.9) keyRisks.push("Less than 90% probability of 6-month survival");
    if (burnRateTrend === "increasing") keyRisks.push("Burn rate trend is increasing");
    
    const executionTime = Date.now() - startTime;
    
    return {
      result: {
        runwayMonths: Math.round(runway.p50RunwayMonths),
        runwayConfidenceInterval: {
          p10: runway.p10RunwayMonths,
          p50: runway.p50RunwayMonths,
          p90: runway.p90RunwayMonths,
        },
        monthlyForecasts: forecast.forecasts.map(f => ({
          month: f.month,
          predictedCashFlow: f.predicted,
          lower: f.lower,
          upper: f.upper,
          confidence: f.confidence,
        })),
        burnRateTrend,
        keyRisks,
      },
      attribution: {
        modelName: "CashFlowForecastModel",
        version: "1.0.0",
        confidence: forecast.modelConfidence,
        executionTimeMs: executionTime,
      },
    };
  }
  
  /**
   * Benchmark comparison using CrossOrgPatternDatabase
   */
  private async runBenchmarkComparison(organizationId: string): Promise<{
    result: BenchmarkResult;
    attribution: ModelAttribution;
  }> {
    const startTime = Date.now();
    
    // Get organization
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    
    const businessType = org?.businessType || "saas";
    
    // Get industry benchmarks
    const benchmarks = await getIndustryBenchmarks(businessType);
    
    // If we have metrics, compare them
    // For now, we'll use placeholder metrics (would integrate with metricsEngine)
    const orgMetrics: Record<string, number> = {
      burn_rate: 50000,
      runway_months: 12,
      gross_margin: 65,
    };
    
    const comparisons = await compareMetricsToIndustry(organizationId, orgMetrics);
    
    // Identify strengths and areas for improvement
    const strengths: string[] = [];
    const improvements: string[] = [];
    
    for (const comp of comparisons) {
      if (comp.status === "above_average" || comp.status === "top_performer") {
        strengths.push(`${comp.metricName} is in the ${comp.percentile}th percentile`);
      } else if (comp.status === "below_average") {
        improvements.push(`${comp.metricName} is below industry average (${comp.percentile}th percentile)`);
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      result: {
        businessType,
        comparisons: comparisons.map(c => ({
          metric: c.metricName,
          value: c.value,
          percentile: c.percentile,
          industryMedian: c.industryMedian,
          status: c.status,
        })),
        strengths,
        improvements,
      },
      attribution: {
        modelName: "CrossOrgPatternDatabase",
        version: "1.0.0",
        confidence: benchmarks.length > 0 ? 0.75 : 0.5,
        executionTimeMs: executionTime,
      },
    };
  }
  
  /**
   * Get insights purely from proprietary models (no LLM)
   * Returns structured insights that can optionally be summarized by LLM
   */
  async getProprietaryInsights(organizationId: string): Promise<{
    insights: ProprietaryInsight[];
    confidence: number;
  }> {
    const analysis = await this.runFullAnalysis(organizationId);
    const insights: ProprietaryInsight[] = [];
    
    // Generate insights from anomalies
    if (analysis.results.anomalies) {
      for (const anomaly of analysis.results.anomalies.topAnomalies) {
        insights.push({
          type: "anomaly",
          severity: anomaly.severity as "high" | "medium" | "low",
          title: `Spending Anomaly: ${anomaly.type}`,
          description: anomaly.description,
          confidence: anomaly.confidence,
          dataPoints: {
            value: anomaly.value,
            expectedMin: anomaly.expectedRange.min,
            expectedMax: anomaly.expectedRange.max,
          },
          source: "SpendingAnomalyModel",
        });
      }
    }
    
    // Generate insights from forecast
    if (analysis.results.forecast) {
      const forecast = analysis.results.forecast;
      
      if (forecast.runwayMonths < 12) {
        insights.push({
          type: "warning",
          severity: forecast.runwayMonths < 6 ? "high" : "medium",
          title: `Runway: ${forecast.runwayMonths} months`,
          description: `Based on current burn rate trends, runway is ${forecast.runwayMonths} months (p50 estimate)`,
          confidence: analysis.modelsUsed.find(m => m.modelName === "CashFlowForecastModel")?.confidence || 0.7,
          dataPoints: {
            p10: forecast.runwayConfidenceInterval.p10,
            p50: forecast.runwayConfidenceInterval.p50,
            p90: forecast.runwayConfidenceInterval.p90,
          },
          source: "CashFlowForecastModel",
        });
      }
      
      for (const risk of forecast.keyRisks) {
        insights.push({
          type: "risk",
          severity: "medium",
          title: "Forecast Risk",
          description: risk,
          confidence: 0.75,
          dataPoints: {},
          source: "CashFlowForecastModel",
        });
      }
    }
    
    // Generate insights from benchmarks
    if (analysis.results.benchmarks) {
      for (const improvement of analysis.results.benchmarks.improvements) {
        insights.push({
          type: "opportunity",
          severity: "low",
          title: "Benchmark Gap",
          description: improvement,
          confidence: 0.7,
          dataPoints: {},
          source: "CrossOrgPatternDatabase",
        });
      }
    }
    
    // Sort by severity and confidence
    insights.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      const aSev = severityOrder[a.severity] || 0;
      const bSev = severityOrder[b.severity] || 0;
      if (aSev !== bSev) return bSev - aSev;
      return b.confidence - a.confidence;
    });
    
    return {
      insights: insights.slice(0, 10),
      confidence: analysis.overallConfidence,
    };
  }
}

export interface ProprietaryInsight {
  type: "anomaly" | "warning" | "risk" | "opportunity" | "info";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  confidence: number;
  dataPoints: Record<string, number>;
  source: string;
}

// ============================================
// LLM Interface Layer
// ============================================

/**
 * LLM is ONLY used to translate structured results to natural language.
 * All analytical work is done by proprietary models above.
 */
export interface LLMInterfaceRequest {
  task: "summarize" | "explain" | "translate";
  structuredInput: ProprietaryAnalysisResult | ProprietaryInsight[];
  userQuery?: string;
  targetAudience: "founder" | "investor" | "technical";
}

/**
 * Convert proprietary analysis results to a SANITIZED prompt for LLM summarization.
 * 
 * SECURITY: This function ONLY includes high-level conclusions - NO raw financial data.
 * The LLM never sees actual dollar amounts, percentiles, or specific metrics.
 * It only receives categorical assessments (e.g., "healthy", "concerning", "critical").
 */
export function buildLLMSummaryPrompt(
  analysis: ProprietaryAnalysisResult,
  audience: "founder" | "investor" | "technical" = "founder"
): string {
  const parts: string[] = [];
  
  parts.push("Translate the following high-level financial assessment into clear, actionable language.");
  parts.push(`Target audience: ${audience}`);
  parts.push("");
  parts.push("=== HIGH-LEVEL ASSESSMENT (no raw data - only categorical conclusions) ===");
  
  // Runway assessment - categorical only, no numbers
  if (analysis.results.forecast) {
    const runway = analysis.results.forecast.runwayMonths;
    const runwayStatus = runway < 6 ? "critical" : runway < 12 ? "concerning" : "healthy";
    const trendStatus = analysis.results.forecast.burnRateTrend;
    
    parts.push(`\nRUNWAY STATUS: ${runwayStatus.toUpperCase()}`);
    parts.push(`- Burn rate trend: ${trendStatus}`);
    
    // Convert risk descriptions to generic versions (remove any numbers)
    if (analysis.results.forecast.keyRisks.length > 0) {
      const genericRisks = analysis.results.forecast.keyRisks.map(r => 
        r.includes("runway") ? "runway concerns identified" :
        r.includes("survival") ? "survival probability below target" :
        r.includes("increasing") ? "burn rate trending upward" : "risk identified"
      );
      parts.push(`- Risk factors: ${[...new Set(genericRisks)].join("; ")}`);
    }
  }
  
  // Anomaly assessment - categorical only, no dollar amounts
  if (analysis.results.anomalies && analysis.results.anomalies.anomaliesDetected > 0) {
    const severity = analysis.results.anomalies.bySeverity;
    const overallSeverity = severity.high > 0 ? "high-priority" : 
                           severity.medium > 0 ? "moderate" : "minor";
    
    parts.push(`\nSPENDING PATTERNS: ${overallSeverity.toUpperCase()} anomalies detected`);
    parts.push(`- Severity distribution: ${severity.high > 0 ? "some high-priority issues" : ""}${severity.medium > 0 ? ", moderate concerns" : ""}${severity.low > 0 ? ", minor items" : ""}`);
    
    // Only include anomaly types, not values
    const anomalyTypes = [...new Set(analysis.results.anomalies.topAnomalies.map(a => a.type))];
    if (anomalyTypes.length > 0) {
      parts.push(`- Areas: ${anomalyTypes.join(", ")}`);
    }
  }
  
  // Benchmark assessment - relative position only, no percentiles
  if (analysis.results.benchmarks && analysis.results.benchmarks.comparisons.length > 0) {
    const statuses = analysis.results.benchmarks.comparisons.map(c => c.status);
    const overallStatus = statuses.includes("top_performer") ? "strong" :
                         statuses.includes("above_average") ? "above average" :
                         statuses.includes("below_average") ? "needs improvement" : "average";
    
    parts.push(`\nINDUSTRY POSITION: ${overallStatus.toUpperCase()}`);
    
    if (analysis.results.benchmarks.strengths.length > 0) {
      parts.push(`- Strengths: several metrics above industry average`);
    }
    if (analysis.results.benchmarks.improvements.length > 0) {
      parts.push(`- Areas for improvement: some metrics below industry average`);
    }
  }
  
  parts.push("");
  parts.push("=== INSTRUCTIONS ===");
  parts.push("1. Explain the categorical assessments above in plain language");
  parts.push("2. DO NOT invent specific numbers - you don't have that data");
  parts.push("3. Focus on what actions the user should consider");
  parts.push("4. Keep the summary to 3-5 sentences");
  
  return parts.join("\n");
}

// ============================================
// Singleton and Exports
// ============================================

const proprietaryEngine = new ProprietaryAIEngine();

export async function runProprietaryAnalysis(organizationId: string, currentCash?: number) {
  return proprietaryEngine.runFullAnalysis(organizationId, currentCash);
}

export async function getProprietaryInsights(organizationId: string) {
  return proprietaryEngine.getProprietaryInsights(organizationId);
}

export { ProprietaryAIEngine };
