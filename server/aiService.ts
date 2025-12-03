// Unified AI service supporting OpenAI, Groq and Gemini with retry logic
import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// OpenAI via Replit AI Integrations
const openaiClient = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Groq client (if API key provided)
const groqClient = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Gemini client (if API key provided)
const geminiClient = process.env.GOOGLE_LLM_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_LLM_API_KEY)
  : null;

export type AIProvider = "openai" | "groq" | "gemini";

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  retryCount?: number; // Number of retries (default: 3)
  retryDelayMs?: number; // Base delay for exponential backoff (default: 1000ms)
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  retryAttempts?: number;
  latencyMs?: number;
}

// Fallback chain: OpenAI -> Groq -> Gemini
const FALLBACK_CHAIN: AIProvider[] = ["openai", "groq", "gemini"];

/**
 * Sleep for exponential backoff
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with retry and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  operationName: string = "AI call"
): Promise<{ result: T; attempts: number }> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a retryable error
      const isRetryable = isRetryableError(error);
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`[aiService] ${operationName} failed after ${attempt} attempts:`, error);
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.warn(`[aiService] ${operationName} attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError || new Error("Unknown error in retry logic");
}

/**
 * Check if an error is retryable (rate limit, timeout, network issues)
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Rate limit errors
  if (error.status === 429) return true;
  
  // Server errors (500-599)
  if (error.status >= 500 && error.status < 600) return true;
  
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  
  // Timeout errors
  if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
    return true;
  }
  
  // Rate limiting message
  if (error.message?.includes('rate limit') || error.message?.includes('Rate limit')) {
    return true;
  }
  
  return false;
}

/**
 * Send a prompt to OpenAI (via Replit AI Integrations)
 */
export async function callOpenAI(request: AIRequest): Promise<AIResponse> {
  const messages: any[] = [];
  
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  
  messages.push({ role: "user", content: request.prompt });

  console.log("[aiService] Calling OpenAI with", messages.length, "messages");
  console.log("[aiService] User prompt length:", request.prompt?.length || 0);

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-5",
    messages,
    max_completion_tokens: request.maxTokens || 8192,
    ...(request.jsonMode && { response_format: { type: "json_object" } }),
  });

  console.log("[aiService] OpenAI completion:", JSON.stringify({
    choicesCount: completion.choices?.length,
    finishReason: completion.choices?.[0]?.finish_reason,
    contentLength: completion.choices?.[0]?.message?.content?.length,
  }));

  return {
    content: completion.choices[0]?.message?.content || "",
    provider: "openai",
    model: "gpt-5",
  };
}

/**
 * Send a prompt to Groq
 */
export async function callGroq(request: AIRequest): Promise<AIResponse> {
  if (!groqClient) {
    throw new Error("Groq API key not configured");
  }

  const messages: any[] = [];
  
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  
  messages.push({ role: "user", content: request.prompt });

  const completion = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile", // Latest Groq model
    messages,
    max_tokens: request.maxTokens || 8192,
    temperature: request.temperature || 0.7,
    ...(request.jsonMode && { response_format: { type: "json_object" } }),
  });

  return {
    content: completion.choices[0]?.message?.content || "",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  };
}

/**
 * Send a prompt to Gemini
 */
export async function callGemini(request: AIRequest): Promise<AIResponse> {
  if (!geminiClient) {
    throw new Error("Gemini API key not configured");
  }

  const model = geminiClient.getGenerativeModel({
    model: "gemini-2.5-flash",
    ...(request.jsonMode && {
      generationConfig: { responseMimeType: "application/json" }
    }),
  });

  const fullPrompt = request.systemPrompt
    ? `${request.systemPrompt}\n\n${request.prompt}`
    : request.prompt;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: {
      maxOutputTokens: request.maxTokens || 8192,
      temperature: request.temperature || 0.7,
    },
  });

  return {
    content: result.response.text(),
    provider: "gemini",
    model: "gemini-2.5-flash",
  };
}

/**
 * Generic AI call that routes to the appropriate provider with retry logic
 */
export async function callAI(
  provider: AIProvider,
  request: AIRequest
): Promise<AIResponse> {
  const maxRetries = request.retryCount ?? 3;
  const baseDelayMs = request.retryDelayMs ?? 1000;
  const startTime = Date.now();
  
  try {
    const { result, attempts } = await withRetry(
      async () => {
        switch (provider) {
          case "openai":
            return await callOpenAI(request);
          case "groq":
            return await callGroq(request);
          case "gemini":
            return await callGemini(request);
          default:
            throw new Error(`Unknown AI provider: ${provider}`);
        }
      },
      maxRetries,
      baseDelayMs,
      `${provider} API call`
    );
    
    return {
      ...result,
      retryAttempts: attempts,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[aiService] Primary provider ${provider} failed, response not available`);
    throw error;
  }
}

/**
 * AI call with automatic fallback to other providers if the primary fails
 * Tries providers in order: OpenAI -> Groq -> Gemini
 */
export async function callAIWithFallback(
  request: AIRequest,
  preferredProvider: AIProvider = "openai"
): Promise<AIResponse> {
  const startTime = Date.now();
  const errors: Array<{ provider: AIProvider; error: string }> = [];
  
  // Reorder fallback chain to start with preferred provider
  const providerChain = [
    preferredProvider,
    ...FALLBACK_CHAIN.filter((p) => p !== preferredProvider),
  ];
  
  for (const provider of providerChain) {
    // Skip providers that aren't configured
    if (provider === "groq" && !groqClient) continue;
    if (provider === "gemini" && !geminiClient) continue;
    
    try {
      const result = await callAI(provider, { ...request, retryCount: 2 });
      
      // Log if we had to fallback
      if (errors.length > 0) {
        console.log(`[aiService] Successfully fell back to ${provider} after ${errors.length} provider failures`);
      }
      
      return {
        ...result,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ provider, error: errorMessage });
      console.warn(`[aiService] Provider ${provider} failed: ${errorMessage}`);
    }
  }
  
  // All providers failed
  const errorSummary = errors.map((e) => `${e.provider}: ${e.error}`).join("; ");
  throw new Error(`All AI providers failed: ${errorSummary}`);
}

/**
 * Check which AI providers are available
 */
export function getAvailableProviders(): AIProvider[] {
  const available: AIProvider[] = ["openai"]; // Always available via Replit integration
  
  if (groqClient) available.push("groq");
  if (geminiClient) available.push("gemini");
  
  return available;
}

/**
 * Explain financial data using AI
 */
export async function explainChart(
  provider: AIProvider,
  chartData: any,
  chartType: string,
  context?: string
): Promise<string> {
  const systemPrompt = `You are a financial analyst AI helping small business owners understand their financial data. Provide clear, actionable insights.`;

  const prompt = `Analyze the following ${chartType} chart data and provide a brief explanation (2-3 sentences) of what it shows and what actions should be taken.

${context ? `Context: ${context}\n\n` : ""}Chart Data:
${JSON.stringify(chartData, null, 2)}

Provide a concise, actionable explanation.`;

  const response = await callAI(provider, {
    prompt,
    systemPrompt,
    maxTokens: 500,
    temperature: 0.7,
  });

  return response.content;
}

/**
 * Generate action items based on financial insights
 */
export async function generateActionItems(
  provider: AIProvider,
  insights: any[],
  metrics: any
): Promise<any> {
  const systemPrompt = `You are a financial advisor AI. Based on financial insights and metrics, generate specific, actionable recommendations.`;

  const prompt = `Based on the following financial insights and metrics, generate 3-5 specific action items the business should take this month.

Insights:
${JSON.stringify(insights, null, 2)}

Metrics:
${JSON.stringify(metrics, null, 2)}

Return a JSON object with this structure:
{
  "actionItems": [
    {
      "title": "string",
      "description": "string",
      "priority": "high" | "medium" | "low",
      "impactEstimate": number (estimated monthly savings/impact in dollars)
    }
  ]
}`;

  const response = await callAI(provider, {
    prompt,
    systemPrompt,
    jsonMode: true,
    maxTokens: 2000,
    temperature: 0.7,
  });

  return JSON.parse(response.content);
}

// Export a singleton instance for convenience
export const aiService = {
  callAI,
  callAIWithFallback,
  callOpenAI,
  callGroq,
  callGemini,
  explainChart,
  generateActionItems,
  getAvailableProviders,
};
