import { orchestrator, AIRequest, AIResponse, EnsembleResult, TaskType } from "./orchestrator";
import { FinancialMetricsEngine, createMetricsEngine, FinancialMetrics } from "../analytics/metricsEngine";
import { AnomalyDetector, createAnomalyDetector, AnomalyResult } from "../analytics/anomalyDetector";
import { ForecastEngine, createForecastEngine, ForecastResult, ScenarioAssumptions } from "../analytics/forecastEngine";
import { OrganizationFeatureStore, createFeatureStore, FeatureSet } from "../analytics/featureStore";
import { saasMetricsService, UnitEconomics } from "../services/saasMetricsService";
import { storage } from "../storage";
import type { InsertAIContextNote } from "@shared/schema";
import { ProprietaryAIEngine, ProprietaryInsight, buildLLMSummaryPrompt } from "../ml/proprietaryAIEngine";

export interface HybridAnalysisResult {
  metrics: FinancialMetrics;
  anomalies: AnomalyResult[];
  forecast?: ForecastResult;
  aiInsights: string;
  combinedConfidence: number;
  algorithmConfidence: number;
  aiConfidence: number;
  validationPassed: boolean;
  validationDetails: ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  overallScore: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface InsightGenerationResult {
  insights: GeneratedInsight[];
  confidence: number;
  source: "algorithm" | "ai" | "hybrid";
}

export interface GeneratedInsight {
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  category: string;
  metricValue?: number;
  recommendation: string;
  confidence: number;
  source: "algorithm" | "ai";
}

export class HybridAIPipeline {
  private organizationId: string;
  private metricsEngine: FinancialMetricsEngine;
  private anomalyDetector: AnomalyDetector;
  private forecastEngine: ForecastEngine;
  private featureStore: OrganizationFeatureStore;
  private proprietaryEngine: ProprietaryAIEngine;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.metricsEngine = createMetricsEngine(organizationId);
    this.anomalyDetector = createAnomalyDetector(organizationId);
    this.forecastEngine = createForecastEngine(organizationId);
    this.featureStore = createFeatureStore(organizationId);
    this.proprietaryEngine = new ProprietaryAIEngine();
  }

  async runFullAnalysis(currentCash?: number): Promise<HybridAnalysisResult> {
    console.log("[HybridPipeline] Running full analysis with proprietary ML models");
    
    // Run proprietary analysis and traditional metrics in parallel
    const [proprietaryAnalysis, metrics, anomalies, featureSet] = await Promise.all([
      this.proprietaryEngine.runFullAnalysis(this.organizationId, currentCash),
      this.metricsEngine.computeAllMetrics(currentCash),
      this.anomalyDetector.analyzeTransactionAnomalies(),
      this.featureStore.computeAndStoreFeatures(),
    ]);

    const algorithmConfidence = Math.max(
      this.computeAlgorithmConfidence(metrics, anomalies),
      proprietaryAnalysis.overallConfidence
    );

    // LLM only summarizes proprietary analysis results (no analytical work)
    const summaryPrompt = buildLLMSummaryPrompt(proprietaryAnalysis, "founder");
    const aiSummary = await this.generateLLMSummary(summaryPrompt);

    const validationResult = this.validateAIOutput(aiSummary, metrics, anomalies);

    // Confidence is primarily from proprietary models
    const combinedConfidence = validationResult.passed
      ? (algorithmConfidence * 0.8 + aiSummary.confidence * 0.2)
      : algorithmConfidence;

    return {
      metrics,
      anomalies,
      aiInsights: aiSummary.content,
      combinedConfidence,
      algorithmConfidence,
      aiConfidence: aiSummary.confidence,
      validationPassed: validationResult.passed,
      validationDetails: validationResult,
    };
  }

  private async getSaaSMetrics(): Promise<UnitEconomics | null> {
    try {
      const orgIdNum = parseInt(this.organizationId, 10);
      if (isNaN(orgIdNum)) return null;
      return await saasMetricsService.computeUnitEconomics(orgIdNum);
    } catch (error) {
      console.warn("[HybridPipeline] Failed to fetch SaaS metrics:", error);
      return null;
    }
  }

  async generateInsights(): Promise<InsightGenerationResult> {
    console.log("[HybridPipeline] Generating insights using proprietary ML models");
    
    // Use proprietary engine for analysis (no LLM)
    const proprietaryResult = await this.proprietaryEngine.getProprietaryInsights(this.organizationId);
    
    // Also get traditional algorithm insights for compatibility
    const [metrics, anomalies, saasMetrics] = await Promise.all([
      this.metricsEngine.computeAllMetrics(),
      this.anomalyDetector.analyzeTransactionAnomalies(),
      this.getSaaSMetrics(),
    ]);
    const algorithmInsights = this.generateAlgorithmInsights(metrics, anomalies, saasMetrics);

    // Convert proprietary insights to GeneratedInsight format
    const proprietaryAsGenerated: GeneratedInsight[] = proprietaryResult.insights.map(pi => ({
      title: pi.title,
      description: pi.description,
      severity: pi.severity === "high" ? "critical" : pi.severity === "medium" ? "warning" : "info",
      category: pi.type,
      metricValue: pi.dataPoints.value,
      recommendation: this.generateRecommendation(pi),
      confidence: pi.confidence,
      source: "algorithm" as const, // Proprietary models count as algorithm
    }));

    // Merge all insights (proprietary + algorithm)
    const allInsights = this.mergeInsights(algorithmInsights, proprietaryAsGenerated);
    const avgConfidence = allInsights.length > 0
      ? allInsights.reduce((sum, i) => sum + i.confidence, 0) / allInsights.length
      : proprietaryResult.confidence;

    return {
      insights: allInsights,
      confidence: avgConfidence,
      source: "algorithm", // All insights now come from proprietary/algorithm sources
    };
  }

  private generateRecommendation(insight: ProprietaryInsight): string {
    switch (insight.type) {
      case "anomaly":
        return `Investigate this spending anomaly. Expected range: $${insight.dataPoints.expectedMin?.toLocaleString() || 'N/A'} - $${insight.dataPoints.expectedMax?.toLocaleString() || 'N/A'}`;
      case "warning":
        return "Review runway projections and consider expense optimization or fundraising";
      case "risk":
        return "Monitor this risk factor closely and develop contingency plans";
      case "opportunity":
        return "Evaluate this opportunity to improve financial performance";
      default:
        return "Review this insight and take appropriate action";
    }
  }

  private generateAlgorithmInsights(
    metrics: FinancialMetrics, 
    anomalies: AnomalyResult[],
    saasMetrics?: UnitEconomics | null
  ): GeneratedInsight[] {
    const insights: GeneratedInsight[] = [];

    // SaaS-specific insights (if available)
    if (saasMetrics) {
      // LTV:CAC ratio warning
      if (saasMetrics.ltvToCacRatio > 0 && saasMetrics.ltvToCacRatio < 3) {
        const severity = saasMetrics.ltvToCacRatio < 1 ? "critical" : saasMetrics.ltvToCacRatio < 2 ? "warning" : "info";
        insights.push({
          title: "LTV:CAC Ratio Below Target",
          description: `Your LTV:CAC ratio is ${saasMetrics.ltvToCacRatio.toFixed(1)}x, ${severity === "critical" ? "significantly " : ""}below the healthy 3x benchmark. This means ${severity === "critical" ? "you're losing money on customer acquisition" : "acquisition efficiency needs improvement"}.`,
          severity,
          category: "unit_economics",
          metricValue: saasMetrics.ltvToCacRatio,
          recommendation: saasMetrics.ltvToCacRatio < 1 
            ? "Immediately review CAC spend efficiency or increase pricing/upsells to improve LTV."
            : "Focus on reducing CAC through organic channels or improving customer retention to boost LTV.",
          confidence: saasMetrics.dataQuality.cacConfidence,
          source: "algorithm",
        });
      }

      // High churn warning
      const monthlyChurn = saasMetrics.ltvMetrics.monthlyChurnRate;
      if (monthlyChurn > 5) {
        insights.push({
          title: "High Customer Churn Rate",
          description: `Monthly customer churn is ${monthlyChurn.toFixed(1)}%, which is ${monthlyChurn > 10 ? "critically high" : "above the 5% warning threshold"}. This translates to ${(monthlyChurn * 12).toFixed(0)}% annual churn.`,
          severity: monthlyChurn > 10 ? "critical" : "warning",
          category: "retention",
          metricValue: monthlyChurn,
          recommendation: "Investigate churn causes through exit surveys and implement retention strategies like onboarding improvements or feature adoption campaigns.",
          confidence: saasMetrics.dataQuality.hasStripeData ? 0.9 : 0.6,
          source: "algorithm",
        });
      }

      // Long payback period
      if (saasMetrics.paybackPeriodMonths > 18) {
        insights.push({
          title: "Extended CAC Payback Period",
          description: `It takes ${saasMetrics.paybackPeriodMonths.toFixed(1)} months to recover customer acquisition costs, which exceeds the recommended 12-month payback period for SaaS.`,
          severity: saasMetrics.paybackPeriodMonths > 24 ? "critical" : "warning",
          category: "unit_economics",
          metricValue: saasMetrics.paybackPeriodMonths,
          recommendation: "Consider improving ARPU through pricing optimization or reducing CAC through more efficient marketing channels.",
          confidence: saasMetrics.dataQuality.cacConfidence * 0.9,
          source: "algorithm",
        });
      }

      // MRR growth concern (if declining)
      if (saasMetrics.saasMetrics.mrr > 0 && saasMetrics.healthScore === "critical") {
        insights.push({
          title: "SaaS Health Score: Critical",
          description: `Your SaaS unit economics are in critical condition. ${saasMetrics.healthReason}`,
          severity: "critical",
          category: "unit_economics",
          metricValue: saasMetrics.ltvToCacRatio,
          recommendation: "Prioritize unit economics improvement before scaling acquisition spend.",
          confidence: 0.85,
          source: "algorithm",
        });
      }
    }

    if (metrics.runway.value < 6 && metrics.burnRate.value > 0) {
      insights.push({
        title: "Critical Runway Warning",
        description: `Current runway is ${metrics.runway.value} months. At the current burn rate of $${metrics.burnRate.value.toLocaleString()}/month, cash reserves will be depleted soon.`,
        severity: metrics.runway.value < 3 ? "critical" : "warning",
        category: "runway",
        metricValue: metrics.runway.value,
        recommendation: "Consider reducing expenses or accelerating fundraising efforts immediately.",
        confidence: metrics.runway.confidence,
        source: "algorithm",
      });
    }

    if (metrics.burnRate.changePercent !== null && metrics.burnRate.changePercent > 20) {
      insights.push({
        title: "Burn Rate Spike Detected",
        description: `Monthly burn rate increased ${metrics.burnRate.changePercent.toFixed(1)}% compared to last month. Current burn: $${metrics.burnRate.value.toLocaleString()}/month.`,
        severity: metrics.burnRate.changePercent > 50 ? "critical" : "warning",
        category: "burn_rate",
        metricValue: metrics.burnRate.changePercent,
        recommendation: "Review recent expenses to identify the cause of the increase.",
        confidence: metrics.burnRate.confidence,
        source: "algorithm",
      });
    }

    if (metrics.expenseGrowth.value > 10 && metrics.revenueGrowth.value < metrics.expenseGrowth.value) {
      insights.push({
        title: "Expense Growth Outpacing Revenue",
        description: `Expenses growing ${metrics.expenseGrowth.value.toFixed(1)}% while revenue growing only ${metrics.revenueGrowth.value.toFixed(1)}%. This trend will reduce runway if continued.`,
        severity: "warning",
        category: "growth",
        metricValue: metrics.expenseGrowth.value - metrics.revenueGrowth.value,
        recommendation: "Focus on revenue acceleration or expense optimization.",
        confidence: Math.min(metrics.expenseGrowth.confidence, metrics.revenueGrowth.confidence),
        source: "algorithm",
      });
    }

    if (metrics.grossMargin.value < 40 && metrics.grossMargin.previousValue !== null) {
      insights.push({
        title: "Low Gross Margin",
        description: `Gross margin at ${metrics.grossMargin.value.toFixed(1)}% is below the typical 40%+ target for software businesses.`,
        severity: metrics.grossMargin.value < 20 ? "critical" : "warning",
        category: "margins",
        metricValue: metrics.grossMargin.value,
        recommendation: "Review pricing strategy and cost of goods sold to improve margins.",
        confidence: metrics.grossMargin.confidence,
        source: "algorithm",
      });
    }

    for (const anomaly of anomalies) {
      if (anomaly.severity === "critical" || anomaly.severity === "high") {
        insights.push({
          title: anomaly.title,
          description: anomaly.description,
          severity: anomaly.severity === "critical" ? "critical" : "warning",
          category: "anomaly",
          metricValue: anomaly.observedValue,
          recommendation: `Investigate this ${anomaly.metricName} anomaly. Expected value: $${anomaly.expectedValue.toLocaleString()}, Observed: $${anomaly.observedValue.toLocaleString()}.`,
          confidence: 1 - Math.abs(anomaly.deviationScore) / 10,
          source: "algorithm",
        });
      }
    }

    return insights;
  }

  private mergeInsights(algorithmInsights: GeneratedInsight[], aiInsights: GeneratedInsight[]): GeneratedInsight[] {
    const merged = [...algorithmInsights];

    for (const aiInsight of aiInsights) {
      const isDuplicate = algorithmInsights.some(
        (alg) =>
          alg.title.toLowerCase().includes(aiInsight.title.toLowerCase()) ||
          aiInsight.title.toLowerCase().includes(alg.title.toLowerCase()) ||
          alg.category === aiInsight.category && 
          Math.abs((alg.metricValue || 0) - (aiInsight.metricValue || 0)) < 0.1
      );

      if (!isDuplicate) {
        merged.push(aiInsight);
      }
    }

    return merged
      .sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 7);
  }

  private async generateLLMSummary(
    summaryPrompt: string
  ): Promise<{ content: string; confidence: number }> {
    const request: AIRequest = {
      prompt: summaryPrompt,
      systemPrompt: "You are a translator. Convert the structured financial analysis into clear, founder-friendly language. Do NOT add new analysis - only explain the provided results.",
      taskType: "summarization" as any,
      organizationId: this.organizationId,
      temperature: 0.3,
      maxTokens: 600,
    };

    try {
      const response = await orchestrator.callWithFallback(request);
      return { content: response.content, confidence: response.confidence };
    } catch (error) {
      console.warn("[HybridPipeline] LLM summary failed, using fallback:", error);
      return {
        content: "Analysis complete. Please review the structured insights for detailed findings.",
        confidence: 0.5,
      };
    }
  }


  private computeAlgorithmConfidence(metrics: FinancialMetrics, anomalies: AnomalyResult[]): number {
    const metricConfidences = [
      metrics.burnRate.confidence,
      metrics.runway.confidence,
      metrics.grossMargin.confidence,
      metrics.revenueGrowth.confidence,
    ];

    const avgMetricConfidence = metricConfidences.reduce((a, b) => a + b, 0) / metricConfidences.length;

    const anomalyConfidence = anomalies.length > 0
      ? anomalies.reduce((sum, a) => sum + (1 - Math.abs(a.deviationScore) / 10), 0) / anomalies.length
      : 1;

    return (avgMetricConfidence + anomalyConfidence) / 2;
  }

  private validateAIOutput(
    aiResult: { content: string; confidence: number },
    metrics: FinancialMetrics,
    anomalies: AnomalyResult[]
  ): ValidationResult {
    const checks: ValidationCheck[] = [];

    if (aiResult.content.length > 50) {
      checks.push({
        name: "content_length",
        passed: true,
        message: "AI response has sufficient content",
        severity: "info",
      });
    } else {
      checks.push({
        name: "content_length",
        passed: false,
        message: "AI response too short",
        severity: "warning",
      });
    }

    const mentionsRunway = aiResult.content.toLowerCase().includes("runway");
    const mentionsBurn = aiResult.content.toLowerCase().includes("burn");

    if (metrics.runway.value < 12 && !mentionsRunway && !mentionsBurn) {
      checks.push({
        name: "key_metric_coverage",
        passed: false,
        message: "AI did not address low runway situation",
        severity: "warning",
      });
    } else {
      checks.push({
        name: "key_metric_coverage",
        passed: true,
        message: "AI addressed key metrics appropriately",
        severity: "info",
      });
    }

    const numberPattern = /\$[\d,]+|\d+%|\d+ months?/g;
    const numbersInOutput = aiResult.content.match(numberPattern) || [];

    if (numbersInOutput.length >= 2) {
      checks.push({
        name: "quantitative_content",
        passed: true,
        message: "AI response includes specific numbers",
        severity: "info",
      });
    } else {
      checks.push({
        name: "quantitative_content",
        passed: false,
        message: "AI response lacks specific quantitative details",
        severity: "warning",
      });
    }

    const passedChecks = checks.filter((c) => c.passed).length;
    const overallScore = passedChecks / checks.length;

    return {
      passed: overallScore >= 0.5,
      checks,
      overallScore,
    };
  }

  async runForecast(assumptions: ScenarioAssumptions): Promise<ForecastResult> {
    return this.forecastEngine.generateForecast(assumptions);
  }

  async recordFeedback(
    userId: string,
    feedbackType: "correction" | "approval" | "rejection" | "enhancement" | "note",
    originalOutput: string,
    correctedOutput?: string,
    note?: string
  ): Promise<void> {
    const data: InsertAIContextNote = {
      organizationId: this.organizationId,
      userId,
      feedbackType,
      originalOutput,
      correctedOutput: correctedOutput || null,
      note: note || null,
    };

    await storage.createAIContextNote(data);
  }
}

export function createHybridPipeline(organizationId: string): HybridAIPipeline {
  return new HybridAIPipeline(organizationId);
}
