import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";
import type { InsertAIAuditLog } from "@shared/schema";

export type AIProvider = "openai" | "groq" | "gemini";
export type TaskType = "insight_generation" | "anomaly_detection" | "categorization" | "normalization" | "copilot_response" | "forecast" | "scenario_modeling" | "report_generation";

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  taskType: TaskType;
  organizationId?: string;
  userId?: string;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  confidence: number;
  latencyMs: number;
  tokensUsed?: { input: number; output: number };
}

export interface EnsembleResult {
  content: string;
  consensusAchieved: boolean;
  confidence: number;
  responses: AIResponse[];
  votingResults: { provider: string; vote: string; confidence: number }[];
  selectedProvider: AIProvider;
}

interface ProviderHealth {
  provider: AIProvider;
  isHealthy: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  successRate: number;
  avgLatency: number;
  requestCount: number;
}

const openaiClient = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const groqClient = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const geminiClient = process.env.GOOGLE_LLM_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_LLM_API_KEY)
  : null;

export class AIOrchestrator {
  private providerHealth: Map<AIProvider, ProviderHealth> = new Map();
  private circuitBreakers: Map<AIProvider, { failures: number; lastFailure: Date | null; isOpen: boolean }> = new Map();
  private readonly CIRCUIT_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_MS = 60000;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const providers: AIProvider[] = ["openai", "groq", "gemini"];
    for (const provider of providers) {
      this.providerHealth.set(provider, {
        provider,
        isHealthy: true,
        successRate: 1.0,
        avgLatency: 0,
        requestCount: 0,
      });
      this.circuitBreakers.set(provider, {
        failures: 0,
        lastFailure: null,
        isOpen: false,
      });
    }
  }

  private isProviderAvailable(provider: AIProvider): boolean {
    if (provider === "openai" && (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !openaiClient)) return false;
    if (provider === "groq" && (!process.env.GROQ_API_KEY || !groqClient)) return false;
    if (provider === "gemini" && (!process.env.GOOGLE_LLM_API_KEY || !geminiClient)) return false;

    const circuit = this.circuitBreakers.get(provider);
    if (circuit?.isOpen) {
      if (circuit.lastFailure && Date.now() - circuit.lastFailure.getTime() > this.CIRCUIT_RESET_MS) {
        circuit.isOpen = false;
        circuit.failures = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  hasAnyProviderAvailable(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  private recordSuccess(provider: AIProvider, latencyMs: number): void {
    const health = this.providerHealth.get(provider)!;
    health.requestCount++;
    health.avgLatency = (health.avgLatency * (health.requestCount - 1) + latencyMs) / health.requestCount;
    health.successRate = (health.successRate * (health.requestCount - 1) + 1) / health.requestCount;
    health.isHealthy = true;

    const circuit = this.circuitBreakers.get(provider)!;
    circuit.failures = Math.max(0, circuit.failures - 1);
  }

  private recordFailure(provider: AIProvider, error: string): void {
    const health = this.providerHealth.get(provider)!;
    health.requestCount++;
    health.successRate = (health.successRate * (health.requestCount - 1)) / health.requestCount;
    health.lastError = error;
    health.lastErrorTime = new Date();

    const circuit = this.circuitBreakers.get(provider)!;
    circuit.failures++;
    circuit.lastFailure = new Date();

    if (circuit.failures >= this.CIRCUIT_THRESHOLD) {
      circuit.isOpen = true;
      health.isHealthy = false;
      console.warn(`[AIOrchestrator] Circuit breaker opened for ${provider}`);
    }
  }

  async callSingleProvider(provider: AIProvider, request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    if (!this.isProviderAvailable(provider)) {
      throw new Error(`Provider ${provider} is not available`);
    }

    try {
      let content: string;
      let model: string;
      let tokensUsed: { input: number; output: number } | undefined;

      switch (provider) {
        case "openai":
          const openaiResult = await this.callOpenAI(request);
          content = openaiResult.content;
          model = openaiResult.model;
          tokensUsed = openaiResult.tokensUsed;
          break;
        case "groq":
          const groqResult = await this.callGroq(request);
          content = groqResult.content;
          model = groqResult.model;
          tokensUsed = groqResult.tokensUsed;
          break;
        case "gemini":
          const geminiResult = await this.callGemini(request);
          content = geminiResult.content;
          model = geminiResult.model;
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(provider, latencyMs);

      const confidence = this.estimateConfidence(content, provider);

      return {
        content,
        provider,
        model,
        confidence,
        latencyMs,
        tokensUsed,
      };
    } catch (error: any) {
      this.recordFailure(provider, error.message);
      throw error;
    }
  }

  private async callOpenAI(request: AIRequest): Promise<{ content: string; model: string; tokensUsed?: { input: number; output: number } }> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_completion_tokens: request.maxTokens || 2000,
      temperature: request.temperature || 0.7,
      ...(request.jsonMode && { response_format: { type: "json_object" } }),
    });

    return {
      content: response.choices[0]?.message?.content || "",
      model: response.model,
      tokensUsed: response.usage
        ? { input: response.usage.prompt_tokens, output: response.usage.completion_tokens }
        : undefined,
    };
  }

  private async callGroq(request: AIRequest): Promise<{ content: string; model: string; tokensUsed?: { input: number; output: number } }> {
    if (!groqClient) throw new Error("Groq client not initialized");

    const messages: Groq.Chat.ChatCompletionMessageParam[] = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    const response = await groqClient.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages,
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature || 0.7,
      ...(request.jsonMode && { response_format: { type: "json_object" } }),
    });

    return {
      content: response.choices[0]?.message?.content || "",
      model: response.model,
      tokensUsed: response.usage
        ? { input: response.usage.prompt_tokens, output: response.usage.completion_tokens }
        : undefined,
    };
  }

  private async callGemini(request: AIRequest): Promise<{ content: string; model: string }> {
    if (!geminiClient) throw new Error("Gemini client not initialized");

    const model = geminiClient.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const result = await model.generateContent(prompt);
    const response = result.response;

    return {
      content: response.text(),
      model: "gemini-1.5-flash",
    };
  }

  async callWithFallback(request: AIRequest, preferredOrder?: AIProvider[]): Promise<AIResponse> {
    const providers = preferredOrder || this.getProvidersByPriority(request.taskType);
    const availableProviders = providers.filter(p => this.isProviderAvailable(p));

    if (availableProviders.length === 0) {
      console.warn("[AIOrchestrator] No AI providers available - returning fallback response");
      return {
        content: "Unable to generate AI response - no providers configured. Please ensure AI API keys are set.",
        provider: "algorithm" as AIProvider,
        model: "fallback",
        confidence: 0.1,
        latencyMs: 0,
      };
    }

    let lastError: Error | null = null;

    for (const provider of availableProviders) {
      try {
        const response = await this.callSingleProvider(provider, request);
        await this.logAICall(request, response, true);
        return response;
      } catch (error: any) {
        lastError = error;
        console.warn(`[AIOrchestrator] ${provider} failed: ${error.message}`);
      }
    }

    console.error("[AIOrchestrator] All available providers failed:", lastError?.message);
    return {
      content: "AI response unavailable - all providers failed. Using algorithm-only insights.",
      provider: "algorithm" as AIProvider,
      model: "fallback",
      confidence: 0.2,
      latencyMs: 0,
    };
  }

  async callEnsemble(request: AIRequest, minConsensus: number = 2): Promise<EnsembleResult> {
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      return {
        content: "No AI providers available for ensemble. Using algorithm-only mode.",
        consensusAchieved: false,
        confidence: 0.1,
        responses: [],
        votingResults: [],
        selectedProvider: "algorithm" as AIProvider,
      };
    }

    if (availableProviders.length < minConsensus) {
      const fallbackResponse = await this.callWithFallback(request);
      return {
        content: fallbackResponse.content,
        consensusAchieved: false,
        confidence: fallbackResponse.confidence,
        responses: [fallbackResponse],
        votingResults: [{ provider: fallbackResponse.provider, vote: fallbackResponse.content, confidence: fallbackResponse.confidence }],
        selectedProvider: fallbackResponse.provider,
      };
    }

    const results = await Promise.allSettled(
      availableProviders.map((provider) => this.callSingleProvider(provider, request))
    );

    const successfulResponses: AIResponse[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        successfulResponses.push(result.value);
      }
    }

    if (successfulResponses.length === 0) {
      throw new Error("All ensemble providers failed");
    }

    const consensusResult = this.computeConsensus(successfulResponses, request.jsonMode);

    await this.logEnsembleCall(request, consensusResult);

    return consensusResult;
  }

  private computeConsensus(responses: AIResponse[], isJson?: boolean): EnsembleResult {
    if (responses.length === 1) {
      return {
        content: responses[0].content,
        consensusAchieved: false,
        confidence: responses[0].confidence,
        responses,
        votingResults: [{ provider: responses[0].provider, vote: responses[0].content, confidence: responses[0].confidence }],
        selectedProvider: responses[0].provider,
      };
    }

    const weightedScores = responses.map((r) => ({
      response: r,
      score: r.confidence * this.getProviderWeight(r.provider),
    }));

    weightedScores.sort((a, b) => b.score - a.score);

    const bestResponse = weightedScores[0].response;

    const votingResults = responses.map((r) => ({
      provider: r.provider,
      vote: r.content.slice(0, 100),
      confidence: r.confidence,
    }));

    const confidenceSpread = Math.max(...responses.map((r) => r.confidence)) - Math.min(...responses.map((r) => r.confidence));
    const consensusAchieved = confidenceSpread < 0.2;

    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

    return {
      content: bestResponse.content,
      consensusAchieved,
      confidence: consensusAchieved ? avgConfidence : bestResponse.confidence,
      responses,
      votingResults,
      selectedProvider: bestResponse.provider,
    };
  }

  private getProviderWeight(provider: AIProvider): number {
    const health = this.providerHealth.get(provider);
    if (!health) return 0.5;

    return health.successRate * (1 / Math.max(1, health.avgLatency / 1000));
  }

  private getProvidersByPriority(taskType: TaskType): AIProvider[] {
    switch (taskType) {
      case "copilot_response":
      case "scenario_modeling":
        return ["openai", "groq", "gemini"];
      case "categorization":
      case "normalization":
        return ["groq", "openai", "gemini"];
      case "insight_generation":
      case "report_generation":
        return ["openai", "gemini", "groq"];
      default:
        return ["openai", "groq", "gemini"];
    }
  }

  private getAvailableProviders(): AIProvider[] {
    return (["openai", "groq", "gemini"] as AIProvider[]).filter((p) => this.isProviderAvailable(p));
  }

  private estimateConfidence(content: string, provider: AIProvider): number {
    let confidence = 0.7;

    if (content.length > 100) confidence += 0.1;
    if (content.includes("however") || content.includes("although") || content.includes("but")) {
      confidence -= 0.05;
    }

    if (content.includes("I'm not sure") || content.includes("uncertain") || content.includes("might")) {
      confidence -= 0.15;
    }

    const health = this.providerHealth.get(provider);
    if (health) {
      confidence *= 0.5 + 0.5 * health.successRate;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private async logAICall(request: AIRequest, response: AIResponse, success: boolean): Promise<void> {
    try {
      const log: InsertAIAuditLog = {
        organizationId: request.organizationId || null,
        userId: request.userId || null,
        taskType: request.taskType,
        provider: response.provider,
        model: response.model,
        inputTokens: response.tokensUsed?.input || null,
        outputTokens: response.tokensUsed?.output || null,
        inputSummary: request.prompt.slice(0, 200),
        outputSummary: response.content.slice(0, 200),
        confidence: response.confidence.toString(),
        latencyMs: response.latencyMs,
        success,
        modelsUsed: [response.model],
        consensusAchieved: false,
      };

      await storage.createAIAuditLog(log);
    } catch (error) {
      console.error("[AIOrchestrator] Failed to log AI call:", error);
    }
  }

  private async logEnsembleCall(request: AIRequest, result: EnsembleResult): Promise<void> {
    try {
      const totalInputTokens = result.responses.reduce((sum, r) => sum + (r.tokensUsed?.input || 0), 0);
      const totalOutputTokens = result.responses.reduce((sum, r) => sum + (r.tokensUsed?.output || 0), 0);
      const avgLatency = result.responses.reduce((sum, r) => sum + r.latencyMs, 0) / result.responses.length;

      const log: InsertAIAuditLog = {
        organizationId: request.organizationId || null,
        userId: request.userId || null,
        taskType: request.taskType,
        provider: "ensemble",
        model: result.selectedProvider,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        inputSummary: request.prompt.slice(0, 200),
        outputSummary: result.content.slice(0, 200),
        confidence: result.confidence.toString(),
        latencyMs: Math.round(avgLatency),
        success: true,
        modelsUsed: result.responses.map((r) => r.model),
        consensusAchieved: result.consensusAchieved,
        votingResults: result.votingResults,
      };

      await storage.createAIAuditLog(log);
    } catch (error) {
      console.error("[AIOrchestrator] Failed to log ensemble call:", error);
    }
  }

  getHealthStatus(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }
}

export const orchestrator = new AIOrchestrator();

export async function callAIWithOrchestration(request: AIRequest): Promise<AIResponse> {
  return orchestrator.callWithFallback(request);
}

export async function callAIEnsemble(request: AIRequest): Promise<EnsembleResult> {
  return orchestrator.callEnsemble(request);
}
