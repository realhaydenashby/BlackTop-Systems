import { storage } from "../storage";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

export const copilotTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_planned_hire",
      description: "Add a planned hire to the runway calculator to see how it impacts runway. Use this when the user asks 'what if I hire...' scenarios.",
      parameters: {
        type: "object",
        properties: {
          role: {
            type: "string",
            description: "The job title/role (e.g., 'Senior Engineer', 'Product Manager')",
          },
          annualSalary: {
            type: "number",
            description: "Annual salary in dollars (e.g., 90000 for $90k)",
          },
          startMonth: {
            type: "string",
            description: "When the hire would start, in YYYY-MM format (e.g., '2025-03'). Defaults to next month.",
          },
        },
        required: ["role", "annualSalary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_recurring_expense",
      description: "Add a new recurring expense to the forecast to see burn impact. Use for 'what if we add X tool/service' scenarios.",
      parameters: {
        type: "object",
        properties: {
          vendor: {
            type: "string",
            description: "The vendor or expense name (e.g., 'Datadog', 'Additional AWS capacity')",
          },
          monthlyAmount: {
            type: "number",
            description: "Monthly cost in dollars (e.g., 500 for $500/mo)",
          },
          category: {
            type: "string",
            description: "Category for the expense (e.g., 'Software', 'Infrastructure', 'Marketing')",
          },
          startMonth: {
            type: "string",
            description: "When to start the expense, in YYYY-MM format. Defaults to next month.",
          },
        },
        required: ["vendor", "monthlyAmount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_scenario",
      description: "Calculate runway and burn rate for a hypothetical scenario. Use when comparing 'base case vs aggressive' or asking 'how long until we run out of cash?'",
      parameters: {
        type: "object",
        properties: {
          additionalMonthlyBurn: {
            type: "number",
            description: "Additional monthly burn to add on top of current burn (can be negative for savings)",
          },
          additionalCash: {
            type: "number",
            description: "Additional cash to add (e.g., from fundraising)",
          },
          revenueGrowthRate: {
            type: "number",
            description: "Monthly revenue growth rate as percentage (e.g., 10 for 10% MoM growth). Defaults to 0.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendor_analysis",
      description: "Get detailed spending analysis for a specific vendor. Use when the user asks about a specific vendor's spend.",
      parameters: {
        type: "object",
        properties: {
          vendorName: {
            type: "string",
            description: "The vendor name to analyze (e.g., 'AWS', 'Slack')",
          },
        },
        required: ["vendorName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_breakdown",
      description: "Get detailed spending breakdown by category. Use when user asks about category-level spending.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "The category to analyze (e.g., 'Payroll', 'Software', 'Marketing')",
          },
          months: {
            type: "number",
            description: "Number of months of data to analyze. Defaults to 3.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fundraising_calculator",
      description: "Calculate fundraising scenarios. Use when user asks about how much to raise or when to start fundraising.",
      parameters: {
        type: "object",
        properties: {
          targetRunwayMonths: {
            type: "number",
            description: "Target runway in months after raise (e.g., 18, 24)",
          },
          plannedBurnIncrease: {
            type: "number",
            description: "Expected monthly burn increase post-raise (e.g., 50000 for $50k/mo more)",
          },
        },
        required: ["targetRunwayMonths"],
      },
    },
  },
];

export async function executeToolCall(
  userId: string,
  organizationId: string,
  toolName: string,
  args: any
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "add_planned_hire":
        return await addPlannedHire(userId, organizationId, args);
      case "add_recurring_expense":
        return await addRecurringExpense(userId, organizationId, args);
      case "calculate_scenario":
        return await calculateScenario(userId, organizationId, args);
      case "get_vendor_analysis":
        return await getVendorAnalysis(organizationId, args);
      case "get_category_breakdown":
        return await getCategoryBreakdown(organizationId, args);
      case "fundraising_calculator":
        return await fundraisingCalculator(userId, organizationId, args);
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[CopilotTools] Error executing ${toolName}:`, error);
    return { success: false, message: error.message || "Tool execution failed" };
  }
}

async function addPlannedHire(
  userId: string,
  organizationId: string,
  args: { role: string; annualSalary: number; startMonth?: string }
): Promise<ToolResult> {
  const { role, annualSalary, startMonth } = args;
  
  const fullyLoadedAnnual = annualSalary * 1.3;
  const monthlyBurn = fullyLoadedAnnual / 12;
  
  const start = startMonth 
    ? new Date(`${startMonth}-01`) 
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  
  await storage.createPlannedHire({
    userId,
    role,
    salary: annualSalary.toString(),
    startDate: start,
    isActive: true,
  });

  const bankAccounts = await storage.getUserBankAccounts(userId);
  const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.currentBalance) || 0);
  }, 0);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: new Date(),
  });

  const totalExpenses = transactions
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
  
  const monthsOfData = 6;
  const currentMonthlyBurn = totalExpenses / monthsOfData;
  const newMonthlyBurn = currentMonthlyBurn + monthlyBurn;
  
  const currentRunway = currentMonthlyBurn > 0 ? currentCash / currentMonthlyBurn : Infinity;
  const newRunway = newMonthlyBurn > 0 ? currentCash / newMonthlyBurn : Infinity;
  const runwayImpact = currentRunway - newRunway;

  return {
    success: true,
    message: `Added planned hire: ${role}`,
    data: {
      role,
      annualSalary,
      fullyLoadedAnnual,
      monthlyBurnIncrease: monthlyBurn,
      startDate: start.toISOString().substring(0, 7),
      currentMonthlyBurn,
      newMonthlyBurn,
      currentRunway: currentRunway === Infinity ? null : currentRunway,
      newRunway: newRunway === Infinity ? null : newRunway,
      runwayReduction: runwayImpact === Infinity ? null : runwayImpact,
    },
  };
}

async function addRecurringExpense(
  userId: string,
  organizationId: string,
  args: { vendor: string; monthlyAmount: number; category?: string; startMonth?: string }
): Promise<ToolResult> {
  const { vendor, monthlyAmount, category = "Software", startMonth } = args;
  
  const bankAccounts = await storage.getUserBankAccounts(userId);
  const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.currentBalance) || 0);
  }, 0);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: new Date(),
  });

  const totalExpenses = transactions
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
  
  const monthsOfData = 6;
  const currentMonthlyBurn = totalExpenses / monthsOfData;
  const newMonthlyBurn = currentMonthlyBurn + monthlyAmount;
  
  const currentRunway = currentMonthlyBurn > 0 ? currentCash / currentMonthlyBurn : Infinity;
  const newRunway = newMonthlyBurn > 0 ? currentCash / newMonthlyBurn : Infinity;
  const runwayImpact = currentRunway - newRunway;
  const annualCost = monthlyAmount * 12;

  return {
    success: true,
    message: `Calculated impact of adding ${vendor}`,
    data: {
      vendor,
      category,
      monthlyAmount,
      annualCost,
      startMonth: startMonth || "next month",
      currentMonthlyBurn,
      newMonthlyBurn,
      currentRunway: currentRunway === Infinity ? null : currentRunway,
      newRunway: newRunway === Infinity ? null : newRunway,
      runwayReduction: runwayImpact === Infinity ? null : runwayImpact,
      percentBurnIncrease: (monthlyAmount / currentMonthlyBurn) * 100,
    },
  };
}

async function calculateScenario(
  userId: string,
  organizationId: string,
  args: { additionalMonthlyBurn?: number; additionalCash?: number; revenueGrowthRate?: number }
): Promise<ToolResult> {
  const { additionalMonthlyBurn = 0, additionalCash = 0, revenueGrowthRate = 0 } = args;
  
  const bankAccounts = await storage.getUserBankAccounts(userId);
  const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.currentBalance) || 0);
  }, 0);
  
  const projectedCash = currentCash + additionalCash;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: new Date(),
  });

  const totalExpenses = transactions
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
  
  const totalRevenue = transactions
    .filter((t: any) => parseFloat(t.amount) > 0)
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
  
  const monthsOfData = 6;
  const currentMonthlyBurn = totalExpenses / monthsOfData;
  const currentMonthlyRevenue = totalRevenue / monthsOfData;
  const currentNetBurn = currentMonthlyBurn - currentMonthlyRevenue;
  
  const newMonthlyBurn = currentMonthlyBurn + additionalMonthlyBurn;
  const newNetBurn = newMonthlyBurn - currentMonthlyRevenue;
  
  const currentRunway = currentNetBurn > 0 ? currentCash / currentNetBurn : Infinity;
  const scenarioRunway = newNetBurn > 0 ? projectedCash / newNetBurn : Infinity;

  let projectedMonths: Array<{ month: number; cash: number; burn: number; revenue: number }> = [];
  let cash = projectedCash;
  let revenue = currentMonthlyRevenue;
  
  for (let i = 1; i <= 24 && cash > 0; i++) {
    if (revenueGrowthRate > 0) {
      revenue = revenue * (1 + revenueGrowthRate / 100);
    }
    const netBurn = newMonthlyBurn - revenue;
    cash = cash - netBurn;
    projectedMonths.push({
      month: i,
      cash: Math.max(0, cash),
      burn: newMonthlyBurn,
      revenue,
    });
  }

  const zeroMonth = projectedMonths.find(m => m.cash <= 0);

  return {
    success: true,
    message: "Scenario calculated",
    data: {
      currentState: {
        cash: currentCash,
        monthlyBurn: currentMonthlyBurn,
        monthlyRevenue: currentMonthlyRevenue,
        netBurn: currentNetBurn,
        runway: currentRunway === Infinity ? "Profitable" : currentRunway.toFixed(1),
      },
      scenario: {
        cash: projectedCash,
        monthlyBurn: newMonthlyBurn,
        netBurn: newNetBurn,
        runway: scenarioRunway === Infinity ? "Profitable" : scenarioRunway.toFixed(1),
        zeroDate: zeroMonth 
          ? new Date(new Date().setMonth(new Date().getMonth() + zeroMonth.month)).toISOString().substring(0, 7)
          : null,
      },
      changes: {
        additionalCash,
        additionalMonthlyBurn,
        revenueGrowthRate,
        runwayChange: (scenarioRunway === Infinity || currentRunway === Infinity) 
          ? null 
          : scenarioRunway - currentRunway,
      },
    },
  };
}

async function getVendorAnalysis(
  organizationId: string,
  args: { vendorName: string }
): Promise<ToolResult> {
  const { vendorName } = args;
  
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: new Date(),
  });

  const vendorTxns = transactions.filter((t: any) => {
    const vendor = t.vendorNormalized || t.vendorOriginal || t.description || "";
    return vendor.toLowerCase().includes(vendorName.toLowerCase());
  });

  if (vendorTxns.length === 0) {
    return {
      success: false,
      message: `No transactions found for vendor "${vendorName}"`,
    };
  }

  const totalSpend = vendorTxns
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
  
  const monthlyBreakdown: Record<string, number> = {};
  vendorTxns.forEach((t: any) => {
    const month = new Date(t.date).toISOString().substring(0, 7);
    monthlyBreakdown[month] = (monthlyBreakdown[month] || 0) + Math.abs(parseFloat(t.amount));
  });

  const months = Object.keys(monthlyBreakdown).sort();
  const avgMonthly = totalSpend / months.length;
  
  let trend = "stable";
  if (months.length >= 3) {
    const recent = monthlyBreakdown[months[months.length - 1]] || 0;
    const older = monthlyBreakdown[months[0]] || 0;
    const change = older > 0 ? ((recent - older) / older) * 100 : 0;
    trend = change > 20 ? `increasing (+${change.toFixed(0)}%)` : 
            change < -20 ? `decreasing (${change.toFixed(0)}%)` : "stable";
  }

  return {
    success: true,
    message: `Analysis for ${vendorName}`,
    data: {
      vendor: vendorName,
      totalSpend,
      transactionCount: vendorTxns.length,
      averageMonthly: avgMonthly,
      trend,
      monthlyBreakdown,
      firstTransaction: months[0],
      lastTransaction: months[months.length - 1],
    },
  };
}

async function getCategoryBreakdown(
  organizationId: string,
  args: { category?: string; months?: number }
): Promise<ToolResult> {
  const { category, months = 3 } = args;
  
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate,
    endDate: new Date(),
  });

  const categories = await storage.getOrganizationCategories(organizationId);
  const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

  const breakdown: Record<string, { total: number; count: number; vendors: Record<string, number> }> = {};
  
  transactions.forEach((t: any) => {
    if (parseFloat(t.amount) >= 0) return;
    
    const catName = t.categoryId ? categoryMap.get(t.categoryId) || "Uncategorized" : "Uncategorized";
    const amount = Math.abs(parseFloat(t.amount));
    const vendor = t.vendorNormalized || t.vendorOriginal || "Unknown";
    
    if (!breakdown[catName]) {
      breakdown[catName] = { total: 0, count: 0, vendors: {} };
    }
    breakdown[catName].total += amount;
    breakdown[catName].count++;
    breakdown[catName].vendors[vendor] = (breakdown[catName].vendors[vendor] || 0) + amount;
  });

  if (category) {
    const catData = Object.entries(breakdown).find(([name]) => 
      name.toLowerCase().includes(category.toLowerCase())
    );
    
    if (!catData) {
      return {
        success: false,
        message: `No spending found for category "${category}"`,
      };
    }

    const [name, data] = catData;
    const topVendors = Object.entries(data.vendors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return {
      success: true,
      message: `${name} spending breakdown`,
      data: {
        category: name,
        totalSpend: data.total,
        transactionCount: data.count,
        monthlyAverage: data.total / months,
        topVendors: topVendors.map(([vendor, amount]) => ({ vendor, amount })),
      },
    };
  }

  const summary = Object.entries(breakdown)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, data]) => ({
      category: name,
      totalSpend: data.total,
      monthlyAverage: data.total / months,
      transactionCount: data.count,
    }));

  return {
    success: true,
    message: `Category breakdown for last ${months} months`,
    data: {
      months,
      categories: summary,
      totalSpend: summary.reduce((sum, c) => sum + c.totalSpend, 0),
    },
  };
}

async function fundraisingCalculator(
  userId: string,
  organizationId: string,
  args: { targetRunwayMonths: number; plannedBurnIncrease?: number }
): Promise<ToolResult> {
  const { targetRunwayMonths, plannedBurnIncrease = 0 } = args;
  
  const bankAccounts = await storage.getUserBankAccounts(userId);
  const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.currentBalance) || 0);
  }, 0);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: new Date(),
  });

  const totalExpenses = transactions
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
  
  const totalRevenue = transactions
    .filter((t: any) => parseFloat(t.amount) > 0)
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
  
  const monthsOfData = 6;
  const currentMonthlyBurn = totalExpenses / monthsOfData;
  const currentMonthlyRevenue = totalRevenue / monthsOfData;
  const currentNetBurn = currentMonthlyBurn - currentMonthlyRevenue;
  
  const postRaiseBurn = currentMonthlyBurn + plannedBurnIncrease;
  const postRaiseNetBurn = postRaiseBurn - currentMonthlyRevenue;
  
  const cashNeeded = (postRaiseNetBurn * targetRunwayMonths) - currentCash;
  const raiseAmount = Math.max(0, cashNeeded);
  
  const assumingDilution = 0.20;
  const impliedValuation = raiseAmount / assumingDilution;
  
  const currentRunway = currentNetBurn > 0 ? currentCash / currentNetBurn : Infinity;
  const monthsUntilRaise = Math.max(0, (currentRunway === Infinity ? 12 : currentRunway) - 6);
  
  const raiseDate = new Date();
  raiseDate.setMonth(raiseDate.getMonth() + Math.floor(monthsUntilRaise));

  return {
    success: true,
    message: "Fundraising calculation complete",
    data: {
      targetRunwayMonths,
      currentState: {
        cash: currentCash,
        monthlyBurn: currentMonthlyBurn,
        monthlyRevenue: currentMonthlyRevenue,
        netBurn: currentNetBurn,
        runway: currentRunway === Infinity ? "Profitable" : currentRunway.toFixed(1),
      },
      postRaise: {
        plannedBurnIncrease,
        newMonthlyBurn: postRaiseBurn,
        newNetBurn: postRaiseNetBurn,
      },
      recommendation: {
        raiseAmount: Math.ceil(raiseAmount / 100000) * 100000,
        impliedPreMoney: impliedValuation,
        typicalDilution: "15-25%",
        startRaisingBy: raiseDate.toISOString().substring(0, 7),
        processLength: "3-6 months",
      },
      guidance: raiseAmount <= 0 
        ? "You're profitable or have sufficient runway. Consider raising opportunistically for growth."
        : raiseAmount < 1000000
          ? "Pre-seed or angel round territory."
          : raiseAmount < 5000000
            ? "Seed round range."
            : "Series A+ territory.",
    },
  };
}

export async function chatWithTools(
  userId: string,
  organizationId: string | null,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  newMessage: string
): Promise<{ response: string; toolResults: ToolResult[] }> {
  const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: newMessage },
  ];

  const toolResults: ToolResult[] = [];

  try {
    let completion = await openaiClient.chat.completions.create({
      model: "gpt-5",
      messages: allMessages,
      tools: organizationId ? copilotTools : undefined,
      max_completion_tokens: 2000,
    });

    let assistantMessage = completion.choices[0]?.message;

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      allMessages.push({
        role: "assistant",
        content: assistantMessage.content || "",
        tool_calls: assistantMessage.tool_calls,
      } as any);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        
        console.log(`[CopilotTools] Executing: ${toolCall.function.name}`, args);
        
        const result = organizationId 
          ? await executeToolCall(userId, organizationId, toolCall.function.name, args)
          : { success: false, message: "No organization connected" };
        
        toolResults.push(result);

        allMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        } as any);
      }

      completion = await openaiClient.chat.completions.create({
        model: "gpt-5",
        messages: allMessages,
        tools: copilotTools,
        max_completion_tokens: 2000,
      });

      assistantMessage = completion.choices[0]?.message;
    }

    return {
      response: assistantMessage?.content || "I encountered an issue processing your request.",
      toolResults,
    };
  } catch (error: any) {
    console.error("[CopilotTools] Error:", error);
    throw error;
  }
}
