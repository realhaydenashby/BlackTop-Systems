// Unified AI service supporting OpenAI, Gro and Gemini
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
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
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

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-5",
    messages,
    max_completion_tokens: request.maxTokens || 8192,
    temperature: request.temperature || 0.7,
    ...(request.jsonMode && { response_format: { type: "json_object" } }),
  });

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
 * Generic AI call that routes to the appropriate provider
 */
export async function callAI(
  provider: AIProvider,
  request: AIRequest
): Promise<AIResponse> {
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
  callOpenAI,
  callGroq,
  callGemini,
  explainChart,
  generateActionItems,
};
