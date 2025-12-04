import { orchestrator, AIRequest, AIResponse, EnsembleResult, TaskType } from "./orchestrator";
import { FinancialMetricsEngine, createMetricsEngine, FinancialMetrics } from "../analytics/metricsEngine";
import { AnomalyDetector, createAnomalyDetector, AnomalyResult } from "../analytics/anomalyDetector";
import { ForecastEngine, createForecastEngine, ForecastResult, ScenarioAssumptions } from "../analytics/forecastEngine";
import { OrganizationFeatureStore, createFeatureStore, FeatureSet } from "../analytics/featureStore";
import { storage } from "../storage";
import type { InsertAIContextNote } from "@shared/schema";

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

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.metricsEngine = createMetricsEngine(organizationId);
    this.anomalyDetector = createAnomalyDetector(organizationId);
    this.forecastEngine = createForecastEngine(organizationId);
    this.featureStore = createFeatureStore(organizationId);
  }

  async runFullAnalysis(currentCash?: number): Promise<HybridAnalysisResult> {
    const [metrics, anomalies, featureSet] = await Promise.all([
      this.metricsEngine.computeAllMetrics(currentCash),
      this.anomalyDetector.analyzeTransactionAnomalies(),
      this.featureStore.computeAndStoreFeatures(),
    ]);

    const algorithmConfidence = this.computeAlgorithmConfidence(metrics, anomalies);

    const orgContext = await this.featureStore.getContextForAI();
    const aiInsights = await this.generateAIInsights(metrics, anomalies, orgContext);

    const validationResult = this.validateAIOutput(aiInsights, metrics, anomalies);

    const combinedConfidence = validationResult.passed
      ? (algorithmConfidence + aiInsights.confidence) / 2
      : algorithmConfidence * 0.8;

    return {
      metrics,
      anomalies,
      aiInsights: aiInsights.content,
      combinedConfidence,
      algorithmConfidence,
      aiConfidence: aiInsights.confidence,
      validationPassed: validationResult.passed,
      validationDetails: validationResult,
    };
  }

  async generateInsights(): Promise<InsightGenerationResult> {
    const [metrics, anomalies] = await Promise.all([
      this.metricsEngine.computeAllMetrics(),
      this.anomalyDetector.analyzeTransactionAnomalies(),
    ]);

    const algorithmInsights = this.generateAlgorithmInsights(metrics, anomalies);

    if (algorithmInsights.length >= 3 && algorithmInsights.every((i) => i.confidence > 0.8)) {
      return {
        insights: algorithmInsights,
        confidence: algorithmInsights.reduce((sum, i) => sum + i.confidence, 0) / algorithmInsights.length,
        source: "algorithm",
      };
    }

    try {
      const orgContext = await this.featureStore.getContextForAI();
      const aiResult = await this.callAIForInsights(metrics, anomalies, algorithmInsights, orgContext);

      const hybridInsights = this.mergeInsights(algorithmInsights, aiResult.insights);

      return {
        insights: hybridInsights,
        confidence: (aiResult.confidence + 
          algorithmInsights.reduce((sum, i) => sum + i.confidence, 0) / Math.max(1, algorithmInsights.length)) / 2,
        source: "hybrid",
      };
    } catch (error) {
      console.warn("[HybridPipeline] AI failed, using algorithm-only insights:", error);
      return {
        insights: algorithmInsights,
        confidence: algorithmInsights.reduce((sum, i) => sum + i.confidence, 0) / Math.max(1, algorithmInsights.length),
        source: "algorithm",
      };
    }
  }

  private generateAlgorithmInsights(metrics: FinancialMetrics, anomalies: AnomalyResult[]): GeneratedInsight[] {
    const insights: GeneratedInsight[] = [];

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

  private async callAIForInsights(
    metrics: FinancialMetrics,
    anomalies: AnomalyResult[],
    algorithmInsights: GeneratedInsight[],
    orgContext: string
  ): Promise<{ insights: GeneratedInsight[]; confidence: number }> {
    const prompt = `You are a financial analyst AI. Based on the following data, generate 2-4 additional actionable insights that complement the algorithm-generated insights.

${orgContext}

## Algorithm-Generated Insights (already identified):
${algorithmInsights.map((i) => `- ${i.title}: ${i.description}`).join("\n")}

## Key Metrics:
- Burn Rate: $${metrics.burnRate.value.toLocaleString()}/month (${metrics.burnRate.trend})
- Runway: ${metrics.runway.value} months
- Revenue Growth: ${metrics.revenueGrowth.value.toFixed(1)}%
- Expense Growth: ${metrics.expenseGrowth.value.toFixed(1)}%
- Gross Margin: ${metrics.grossMargin.value.toFixed(1)}%

## Detected Anomalies:
${anomalies.slice(0, 5).map((a) => `- ${a.title}: ${a.description}`).join("\n") || "None detected"}

Generate insights that are NOT duplicates of the algorithm-generated ones. Focus on:
1. Hidden patterns or correlations
2. Strategic recommendations
3. Future risks not captured by current metrics

Return a JSON array:
[
  {
    "title": "string",
    "description": "string",
    "severity": "critical" | "warning" | "info",
    "category": "string",
    "recommendation": "string"
  }
]`;

    const request: AIRequest = {
      prompt,
      systemPrompt: "You are a financial intelligence AI. Provide actionable, specific insights based on data.",
      taskType: "insight_generation",
      jsonMode: true,
      organizationId: this.organizationId,
      temperature: 0.6,
    };

    const response = await orchestrator.callWithFallback(request);

    try {
      const parsed = JSON.parse(response.content);
      const aiInsights: GeneratedInsight[] = (parsed.insights || parsed || []).map((i: any) => ({
        title: i.title,
        description: i.description,
        severity: i.severity || "info",
        category: i.category || "general",
        recommendation: i.recommendation || "",
        confidence: response.confidence,
        source: "ai" as const,
      }));

      return { insights: aiInsights, confidence: response.confidence };
    } catch (error) {
      console.error("[HybridPipeline] Failed to parse AI insights:", error);
      return { insights: [], confidence: 0 };
    }
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

  private async generateAIInsights(
    metrics: FinancialMetrics,
    anomalies: AnomalyResult[],
    orgContext: string
  ): Promise<{ content: string; confidence: number }> {
    const prompt = `Analyze the following financial data and provide a concise executive summary with key insights:

${orgContext}

## Key Metrics:
- Monthly Burn Rate: $${metrics.burnRate.value.toLocaleString()} (${metrics.burnRate.trend})
- Runway: ${metrics.runway.value} months
- Net Burn: $${metrics.netBurn.value.toLocaleString()}
- Revenue Growth: ${metrics.revenueGrowth.value.toFixed(1)}%
- Expense Growth: ${metrics.expenseGrowth.value.toFixed(1)}%
- Gross Margin: ${metrics.grossMargin.value.toFixed(1)}%
- Operating Margin: ${metrics.operatingMargin.value.toFixed(1)}%

## Detected Anomalies (${anomalies.length} total):
${anomalies.slice(0, 5).map((a) => `- [${a.severity.toUpperCase()}] ${a.title}`).join("\n") || "None"}

Provide a 3-4 sentence executive summary highlighting the most important findings and recommendations.`;

    const request: AIRequest = {
      prompt,
      systemPrompt: "You are a concise financial analyst. Provide clear, actionable summaries.",
      taskType: "insight_generation",
      organizationId: this.organizationId,
      temperature: 0.5,
      maxTokens: 500,
    };

    try {
      const response = await orchestrator.callWithFallback(request);
      return { content: response.content, confidence: response.confidence };
    } catch (error) {
      return {
        content: this.generateFallbackSummary(metrics, anomalies),
        confidence: 0.5,
      };
    }
  }

  private generateFallbackSummary(metrics: FinancialMetrics, anomalies: AnomalyResult[]): string {
    const parts: string[] = [];

    if (metrics.runway.value < 12) {
      parts.push(`Runway of ${metrics.runway.value} months requires attention.`);
    } else {
      parts.push(`Runway of ${metrics.runway.value} months provides good cushion.`);
    }

    if (metrics.burnRate.trend === "increasing") {
      parts.push(`Burn rate is trending upward at $${metrics.burnRate.value.toLocaleString()}/month.`);
    }

    if (anomalies.length > 0) {
      parts.push(`${anomalies.length} spending anomalies detected requiring review.`);
    }

    return parts.join(" ");
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
