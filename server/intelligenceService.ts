// AI-powered financial intelligence generation
import { callAI } from "./aiService";
import { subDays, format } from "date-fns";

interface Transaction {
  id: string;
  date: Date;
  amount: string;
  description: string | null;
  vendorId: string | null;
  categoryId: string | null;
  isRecurring: boolean;
}

interface Vendor {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  industry: string | null;
  companySize: string | null;
}

/**
 * Generate financial insights from transaction data using AI
 */
export async function generateInsights(
  transactions: Transaction[],
  vendors: Vendor[],
  categories: Category[],
  organization: Organization
): Promise<Array<{
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  category: string;
  recommendation: string;
}>> {
  // Prepare data summary for AI
  const totalSpend = transactions.reduce(
    (sum, txn) => sum + Math.abs(parseFloat(txn.amount)),
    0
  );

  const spendByCategory: Record<string, number> = {};
  const spendByVendor: Record<string, number> = {};

  transactions.forEach((txn) => {
    if (txn.categoryId) {
      const category = categories.find((c) => c.id === txn.categoryId);
      const categoryName = category?.name || "Uncategorized";
      spendByCategory[categoryName] = (spendByCategory[categoryName] || 0) + Math.abs(parseFloat(txn.amount));
    }

    if (txn.vendorId) {
      const vendor = vendors.find((v) => v.id === txn.vendorId);
      const vendorName = vendor?.name || "Unknown";
      spendByVendor[vendorName] = (spendByVendor[vendorName] || 0) + Math.abs(parseFloat(txn.amount));
    }
  });

  const topCategories = Object.entries(spendByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topVendors = Object.entries(spendByVendor)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const recurringCharges = transactions.filter((txn) => txn.isRecurring);
  const recurringTotal = recurringCharges.reduce(
    (sum, txn) => sum + Math.abs(parseFloat(txn.amount)),
    0
  );

  const prompt = `You are a financial advisor AI analyzing a ${organization.industry || "small business"}'s spending data.

Company: ${organization.name}
Industry: ${organization.industry || "Not specified"}
Company Size: ${organization.companySize || "Not specified"}
Period: Last ${transactions.length > 0 ? Math.round((Date.now() - new Date(transactions[0].date).getTime()) / (1000 * 60 * 60 * 24)) : 90} days

Financial Summary:
- Total Spend: $${totalSpend.toFixed(2)}
- Transaction Count: ${transactions.length}
- Recurring Charges: $${recurringTotal.toFixed(2)}/month (${recurringCharges.length} subscriptions)

Top Spending Categories:
${topCategories.map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`).join("\n")}

Top Vendors:
${topVendors.map(([vendor, amt]) => `- ${vendor}: $${amt.toFixed(2)}`).join("\n")}

Generate 3-5 specific, actionable financial insights for this business. Each insight should:
1. Identify a specific pattern, risk, or opportunity
2. Explain why it matters
3. Provide a clear recommendation

Return a JSON array with this structure:
[
  {
    "title": "Brief, specific insight title (max 60 chars)",
    "description": "1-2 sentence explanation of what you found",
    "severity": "critical" | "warning" | "info",
    "category": "cash_flow" | "spending" | "subscriptions" | "vendors" | "efficiency",
    "recommendation": "Specific action to take (1 sentence)"
  }
]

Focus on:
- Unusual spending patterns
- Subscription optimization opportunities
- Vendor consolidation
- Cash flow risks
- Cost-saving opportunities`;

  try {
    const response = await callAI("openai", {
      prompt,
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.7,
    });

    const insights = JSON.parse(response.content);
    return Array.isArray(insights) ? insights : [];
  } catch (error) {
    console.error("Insight generation error:", error);
    return [];
  }
}

/**
 * Generate a recommended monthly budget based on historical spending
 */
export async function generateBudget(
  transactions: Transaction[],
  categories: Category[],
  organization: Organization,
  targetReduction: number = 0 // Percentage reduction (0-100)
): Promise<{
  totalBudget: number;
  breakdown: Record<string, { allocated: number; historical: number; recommendation: string }>;
}> {
  // Calculate historical spending by category
  const spendByCategory: Record<string, number> = {};

  transactions.forEach((txn) => {
    if (txn.categoryId) {
      const category = categories.find((c) => c.id === txn.categoryId);
      const categoryName = category?.name || "Uncategorized";
      spendByCategory[categoryName] = (spendByCategory[categoryName] || 0) + Math.abs(parseFloat(txn.amount));
    }
  });

  // Calculate monthly average
  const daysSpanned = transactions.length > 0
    ? Math.max(1, (Date.now() - new Date(transactions[0].date).getTime()) / (1000 * 60 * 60 * 24))
    : 30;
  const monthsSpanned = Math.max(1, daysSpanned / 30);

  Object.keys(spendByCategory).forEach((cat) => {
    spendByCategory[cat] = spendByCategory[cat] / monthsSpanned;
  });

  const totalHistoricalMonthly = Object.values(spendByCategory).reduce((sum, val) => sum + val, 0);

  const prompt = `You are a financial advisor creating a monthly budget for a ${organization.industry || "small business"}.

Company: ${organization.name}
Target: ${targetReduction > 0 ? `Reduce spending by ${targetReduction}%` : "Optimize spending"}

Historical Monthly Spend:
${Object.entries(spendByCategory)
  .sort(([, a], [, b]) => b - a)
  .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`)
  .join("\n")}

Total Historical: $${totalHistoricalMonthly.toFixed(2)}/month

Create a realistic monthly budget that:
1. ${targetReduction > 0 ? `Reduces total spending by ${targetReduction}%` : "Optimizes current spending"}
2. Maintains critical operations
3. Identifies specific cost-saving opportunities

Return a JSON object:
{
  "totalBudget": <number>,
  "breakdown": {
    "<category name>": {
      "allocated": <number>,
      "recommendation": "<1 sentence on how to meet this budget>"
    }
  }
}`;

  try {
    const response = await callAI("openai", {
      prompt,
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.6,
    });

    const result = JSON.parse(response.content);

    // Merge historical data
    const breakdown: Record<string, { allocated: number; historical: number; recommendation: string }> = {};
    
    for (const [category, data] of Object.entries(result.breakdown || {})) {
      breakdown[category] = {
        allocated: (data as any).allocated,
        historical: spendByCategory[category] || 0,
        recommendation: (data as any).recommendation,
      };
    }

    return {
      totalBudget: result.totalBudget || totalHistoricalMonthly,
      breakdown,
    };
  } catch (error) {
    console.error("Budget generation error:", error);
    
    // Fallback: Simple budget based on historical averages
    const fallbackBreakdown: Record<string, { allocated: number; historical: number; recommendation: string }> = {};
    const multiplier = 1 - (targetReduction / 100);

    for (const [category, historical] of Object.entries(spendByCategory)) {
      fallbackBreakdown[category] = {
        allocated: historical * multiplier,
        historical,
        recommendation: "Monitor spending and look for optimization opportunities",
      };
    }

    return {
      totalBudget: totalHistoricalMonthly * multiplier,
      breakdown: fallbackBreakdown,
    };
  }
}

/**
 * Generate actionable monthly action plan
 */
export async function generateActionPlan(
  insights: Array<{ title: string; description: string; severity: string; category: string }>,
  budgetGap: number, // Difference between budget and current spending
  organization: Organization
): Promise<{
  summary: string;
  actions: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    estimatedImpact: number;
    dueDate: string;
  }>;
}> {
  const prompt = `You are a financial advisor creating this month's action plan for ${organization.name}.

Key Insights:
${insights.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n")}

Budget Gap: ${budgetGap > 0 ? `Overspending by $${budgetGap.toFixed(0)}` : budgetGap < 0 ? `Under budget by $${Math.abs(budgetGap).toFixed(0)}` : "On track"}

Create a monthly action plan with 3-7 specific, measurable actions. Each action should:
1. Address specific insights or budget gaps
2. Be achievable within 30 days
3. Have clear impact estimates

Return a JSON object:
{
  "summary": "<2-3 sentence executive summary of this month's priorities>",
  "actions": [
    {
      "title": "<Specific action (max 60 chars)>",
      "description": "<What to do and why (1-2 sentences)>",
      "priority": "high" | "medium" | "low",
      "estimatedImpact": <dollar amount this could save/generate>,
      "dueDate": "<YYYY-MM-DD within next 30 days>"
    }
  ]
}`;

  try {
    const response = await callAI("openai", {
      prompt,
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.7,
    });

    return JSON.parse(response.content);
  } catch (error) {
    console.error("Action plan generation error:", error);
    
    // Fallback action plan
    return {
      summary: "Focus on monitoring expenses and identifying cost-saving opportunities.",
      actions: [
        {
          title: "Review all subscriptions",
          description: "Audit recurring charges and cancel unused services",
          priority: "high" as const,
          estimatedImpact: Math.abs(budgetGap) * 0.2,
          dueDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
        },
      ],
    };
  }
}

export const intelligenceService = {
  generateInsights,
  generateBudget,
  generateActionPlan,
};
