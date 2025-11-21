// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry from "p-retry";

// This is using Replit's AI Integrations service
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

export async function batchProcessPrompts(
  prompts: string[]
): Promise<string[]> {
  const limit = pLimit(2);
  
  const processingPromises = prompts.map((prompt) =>
    limit(() =>
      pRetry(
        async () => {
          try {
            const response = await openai.chat.completions.create({
              model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
              messages: [{ role: "user", content: prompt }],
              max_completion_tokens: 8192,
            });
            return response.choices[0]?.message?.content || "";
          } catch (error: any) {
            if (isRateLimitError(error)) {
              throw error;
            }
            const abortError = new Error(error.message);
            (abortError as any).name = 'AbortError';
            throw abortError;
          }
        },
        {
          retries: 7,
          minTimeout: 2000,
          maxTimeout: 128000,
          factor: 2,
        }
      )
    )
  );
  
  return await Promise.all(processingPromises);
}

export async function extractTransactionsFromDocument(
  documentText: string,
  documentType: string
): Promise<any> {
  const prompt = `You are a financial document parser. Extract all transactions from the following ${documentType}. Return a JSON object with the following structure:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": number,
      "vendor": "string",
      "description": "string",
      "category": "string" (one of: Marketing, Payroll, SaaS, Ops, Rent, Utilities, Misc)
    }
  ],
  "confidence": number (0-1)
}

Document text:
${documentText}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  return JSON.parse(response.choices[0]?.message?.content || "{}");
}

export async function generateInsights(
  transactions: any[],
  budgets: any[]
): Promise<any> {
  const prompt = `You are a financial analyst. Analyze the following transaction and budget data for a small business.
Identify key insights such as spend drift, subscription creep, anomalies, and overspending.

Transactions (recent 100):
${JSON.stringify(transactions.slice(0, 100))}

Budgets:
${JSON.stringify(budgets)}

Return a JSON array of insights with this structure:
[
  {
    "type": "spend_drift" | "subscription_creep" | "vendor_overbilling" | "overtime_drift" | "other",
    "title": "string",
    "description": "string",
    "metricValue": number,
    "severity": "info" | "warning" | "critical",
    "period": "string"
  }
]`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const result = JSON.parse(response.choices[0]?.message?.content || "{}");
  return result.insights || [];
}

export async function generateBudgetSuggestions(
  transactions: any[],
  organizationData: any
): Promise<any> {
  const prompt = `You are a financial planning AI. Based on the following transaction history for a small business, suggest a monthly budget allocation.

Organization: ${organizationData.name}
Industry: ${organizationData.industry}
Monthly Spend Range: ${organizationData.monthlySpend}

Recent Transactions (last 3 months):
${JSON.stringify(transactions.slice(0, 200))}

Return a JSON object with this structure:
{
  "totalBudget": number,
  "breakdown": {
    "Marketing": number,
    "Payroll": number,
    "SaaS": number,
    "Ops": number,
    "Rent": number,
    "Utilities": number,
    "Misc": number
  }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  return JSON.parse(response.choices[0]?.message?.content || "{}");
}

export async function generateActionPlan(
  insights: any[],
  budgets: any[],
  transactions: any[]
): Promise<any> {
  const prompt = `You are a financial advisor. Based on the following insights, budgets, and transaction patterns, create an action plan for the next month.

Insights:
${JSON.stringify(insights)}

Budgets:
${JSON.stringify(budgets)}

Recent Transactions (sample):
${JSON.stringify(transactions.slice(0, 50))}

Return a JSON object with this structure:
{
  "summary": "string (2-3 sentences)",
  "actionItems": [
    {
      "type": "cut_subscription" | "renegotiate_vendor" | "adjust_budget" | "review_department_spend" | "other",
      "description": "string",
      "impactEstimate": number,
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  return JSON.parse(response.choices[0]?.message?.content || "{}");
}
