import { storage } from "../storage";
import { saasMetricsService } from "../services/saasMetricsService";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const AI_MODEL = "gpt-4o";

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
  {
    type: "function",
    function: {
      name: "get_financial_summary",
      description: "Get a complete financial summary of the company including cash, burn, runway, revenue, and key metrics. Use when user asks general questions about their finances or company health.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_changes",
      description: "Get recent changes in spending patterns, new vendors, and unusual transactions. Use when user asks what's changed or what's new.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days to look back (default: 30)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recurring_expenses",
      description: "Get a list of all recurring/subscription expenses. Use when user asks about subscriptions, recurring costs, or fixed expenses.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
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
      case "get_financial_summary":
        return await getFinancialSummary(userId, organizationId);
      case "get_recent_changes":
        return await getRecentChanges(organizationId, args);
      case "get_recurring_expenses":
        return await getRecurringExpenses(organizationId);
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

  // Calculate ROI projections for sales/marketing hires
  const roleLower = role.toLowerCase();
  const isSalesMarketingHire = 
    roleLower.includes('sales') || 
    roleLower.includes('marketing') || 
    roleLower.includes('growth') || 
    roleLower.includes('demand gen') ||
    roleLower.includes('sdr') ||
    roleLower.includes('bdr') ||
    roleLower.includes('account executive') ||
    roleLower.includes('ae') ||
    roleLower.includes('customer success');

  let roiProjection: {
    isSalesMarketingHire: boolean;
    currentCAC: number | null;
    currentLTV: number | null;
    ltvToCacRatio: number | null;
    expectedNewCustomersPerMonth: number | null;
    expectedAnnualRevenueGenerated: number | null;
    estimatedPaybackMonths: number | null;
    annualROI: number | null;
    roiAssessment: string | null;
    dataSource: string;
  } | null = null;

  if (isSalesMarketingHire) {
    try {
      const orgIdNum = parseInt(organizationId, 10);
      if (!isNaN(orgIdNum)) {
        const economics = await saasMetricsService.computeUnitEconomics(orgIdNum);
        
        const currentCAC = economics.cac;
        const currentLTV = economics.ltv;
        const ltvToCacRatio = economics.ltvToCacRatio;
        const arpu = economics.saasMetrics.arpu;
        
        // Estimate ROI based on role type
        // Sales roles typically have quota of 4-8x their OTE
        // Marketing roles contribute to pipeline indirectly
        const isSalesRole = roleLower.includes('sales') || 
                           roleLower.includes('ae') || 
                           roleLower.includes('account executive') ||
                           roleLower.includes('sdr') ||
                           roleLower.includes('bdr');
        
        // Sales hire quota assumption: 5x their fully loaded cost as revenue target
        // Marketing hire: contribution to pipeline is more indirect, estimate 2-3x cost in LTV
        const expectedAnnualRevenue = isSalesRole 
          ? fullyLoadedAnnual * 5  // Sales quotas typically 5x OTE
          : fullyLoadedAnnual * 2.5; // Marketing ROI is typically lower but broader
        
        // Estimate new customers this hire could bring
        const expectedNewCustomersPerMonth = arpu > 0 
          ? (expectedAnnualRevenue / 12) / arpu 
          : null;
        
        // Calculate ROI: (Revenue Generated - Cost) / Cost
        const annualROI = expectedAnnualRevenue > 0 
          ? ((expectedAnnualRevenue - fullyLoadedAnnual) / fullyLoadedAnnual) * 100 
          : null;
        
        // Payback: How long until this hire pays for themselves
        const monthlyRevenueContribution = expectedAnnualRevenue / 12;
        const estimatedPaybackMonths = monthlyRevenueContribution > monthlyBurn
          ? fullyLoadedAnnual / (monthlyRevenueContribution - monthlyBurn)
          : null;
        
        // ROI assessment based on metrics
        let roiAssessment: string;
        if (ltvToCacRatio >= 3 && (annualROI ?? 0) > 200) {
          roiAssessment = "Strong ROI potential - healthy unit economics support scaling this role";
        } else if (ltvToCacRatio >= 2 && (annualROI ?? 0) > 100) {
          roiAssessment = "Moderate ROI potential - consider optimizing CAC efficiency first";
        } else if (ltvToCacRatio >= 1) {
          roiAssessment = "Cautious ROI outlook - unit economics need improvement before scaling";
        } else if (ltvToCacRatio > 0) {
          roiAssessment = "High risk - LTV:CAC ratio suggests acquisition is currently unprofitable";
        } else {
          roiAssessment = "Unable to assess - insufficient data for CAC/LTV calculations";
        }
        
        roiProjection = {
          isSalesMarketingHire: true,
          currentCAC: Math.round(currentCAC * 100) / 100,
          currentLTV: Math.round(currentLTV * 100) / 100,
          ltvToCacRatio: Math.round(ltvToCacRatio * 100) / 100,
          expectedNewCustomersPerMonth: expectedNewCustomersPerMonth !== null 
            ? Math.round(expectedNewCustomersPerMonth * 10) / 10 
            : null,
          expectedAnnualRevenueGenerated: Math.round(expectedAnnualRevenue),
          estimatedPaybackMonths: estimatedPaybackMonths !== null 
            ? Math.round(estimatedPaybackMonths * 10) / 10 
            : null,
          annualROI: annualROI !== null ? Math.round(annualROI) : null,
          roiAssessment,
          dataSource: economics.dataQuality.isUsingManualOverrides ? 'manual' : 
                      (economics.dataQuality.hasStripeData ? 'stripe' : 'bank_data'),
        };
      }
    } catch (error) {
      console.warn("[CopilotTools] Failed to compute ROI projection:", error);
      roiProjection = {
        isSalesMarketingHire: true,
        currentCAC: null,
        currentLTV: null,
        ltvToCacRatio: null,
        expectedNewCustomersPerMonth: null,
        expectedAnnualRevenueGenerated: null,
        estimatedPaybackMonths: null,
        annualROI: null,
        roiAssessment: "Unable to calculate - SaaS metrics unavailable",
        dataSource: 'unavailable',
      };
    }
  }

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
      ...(roiProjection && { roiProjection }),
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

async function getFinancialSummary(
  userId: string,
  organizationId: string
): Promise<ToolResult> {
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

  if (transactions.length === 0) {
    return {
      success: false,
      message: "No transaction data available. Please connect your bank accounts or import transactions.",
    };
  }

  let totalExpenses = 0;
  let totalRevenue = 0;
  const categorySpend: Record<string, number> = {};
  const vendorSpend: Record<string, number> = {};
  const monthlyData: Record<string, { expenses: number; revenue: number }> = {};

  transactions.forEach((txn: any) => {
    const amount = parseFloat(txn.amount);
    const month = new Date(txn.date).toISOString().substring(0, 7);
    
    if (!monthlyData[month]) {
      monthlyData[month] = { expenses: 0, revenue: 0 };
    }

    if (amount > 0) {
      totalRevenue += amount;
      monthlyData[month].revenue += amount;
    } else {
      const absAmount = Math.abs(amount);
      totalExpenses += absAmount;
      monthlyData[month].expenses += absAmount;
      
      const vendor = txn.vendorNormalized || txn.vendorOriginal || "Unknown";
      vendorSpend[vendor] = (vendorSpend[vendor] || 0) + absAmount;
    }
  });

  const monthsOfData = Object.keys(monthlyData).length || 1;
  const avgMonthlyBurn = totalExpenses / monthsOfData;
  const avgMonthlyRevenue = totalRevenue / monthsOfData;
  const netBurn = avgMonthlyBurn - avgMonthlyRevenue;
  const runway = netBurn > 0 ? currentCash / netBurn : Infinity;
  
  const topVendors = Object.entries(vendorSpend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([vendor, amount]) => ({
      vendor,
      totalSpend: amount,
      monthlyAvg: amount / monthsOfData,
    }));

  const sortedMonths = Object.keys(monthlyData).sort();
  let burnTrend = "stable";
  if (sortedMonths.length >= 2) {
    const recent = monthlyData[sortedMonths[sortedMonths.length - 1]]?.expenses || 0;
    const previous = monthlyData[sortedMonths[sortedMonths.length - 2]]?.expenses || 1;
    const change = ((recent - previous) / previous) * 100;
    burnTrend = change > 10 ? `increasing (+${change.toFixed(0)}% vs last month)` : 
               change < -10 ? `decreasing (${change.toFixed(0)}% vs last month)` : "stable";
  }

  return {
    success: true,
    message: "Financial summary retrieved",
    data: {
      cashPosition: {
        currentCash,
        connectedAccounts: bankAccounts.length,
      },
      burnAndRunway: {
        monthlyBurn: avgMonthlyBurn,
        monthlyRevenue: avgMonthlyRevenue,
        netBurn,
        runway: runway === Infinity ? "Cash flow positive" : `${runway.toFixed(1)} months`,
        runwayStatus: runway === Infinity ? "Profitable" :
                     runway < 6 ? "Critical - under 6 months" :
                     runway < 12 ? "Caution - under 12 months" :
                     runway < 18 ? "Healthy" : "Strong - 18+ months",
        burnTrend,
      },
      spending: {
        totalExpenses6mo: totalExpenses,
        totalRevenue6mo: totalRevenue,
        topVendors,
      },
      dataQuality: {
        transactionCount: transactions.length,
        monthsOfData,
        dateRange: {
          start: sortedMonths[0],
          end: sortedMonths[sortedMonths.length - 1],
        },
      },
    },
  };
}

async function getRecentChanges(
  organizationId: string,
  args: { days?: number }
): Promise<ToolResult> {
  const { days = 30 } = args;
  
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - days);
  
  const previousDate = new Date();
  previousDate.setDate(previousDate.getDate() - (days * 2));

  const recentTransactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: recentDate,
    endDate: new Date(),
  });

  const previousTransactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: previousDate,
    endDate: recentDate,
  });

  const getVendorSpend = (txns: any[]) => {
    const spend: Record<string, number> = {};
    txns.filter(t => parseFloat(t.amount) < 0).forEach(t => {
      const vendor = t.vendorNormalized || t.vendorOriginal || "Unknown";
      spend[vendor] = (spend[vendor] || 0) + Math.abs(parseFloat(t.amount));
    });
    return spend;
  };

  const recentSpend = getVendorSpend(recentTransactions);
  const previousSpend = getVendorSpend(previousTransactions);

  const newVendors = Object.entries(recentSpend)
    .filter(([vendor]) => !previousSpend[vendor])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([vendor, amount]) => ({ vendor, spend: amount }));

  const vendorChanges = Object.entries(recentSpend)
    .filter(([vendor]) => previousSpend[vendor])
    .map(([vendor, recent]) => {
      const previous = previousSpend[vendor];
      const change = ((recent - previous) / previous) * 100;
      return { vendor, recent, previous, changePercent: change };
    })
    .filter(v => Math.abs(v.changePercent) > 20)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);

  const recentTotal = recentTransactions
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
    
  const previousTotal = previousTransactions
    .filter((t: any) => parseFloat(t.amount) < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);

  const spendChange = previousTotal > 0 ? ((recentTotal - previousTotal) / previousTotal) * 100 : 0;

  return {
    success: true,
    message: `Changes in the last ${days} days`,
    data: {
      period: `Last ${days} days vs previous ${days} days`,
      overallSpending: {
        recent: recentTotal,
        previous: previousTotal,
        changePercent: spendChange,
        trend: spendChange > 10 ? "Spending increased" : 
               spendChange < -10 ? "Spending decreased" : "Spending stable",
      },
      newVendors: newVendors.length > 0 ? newVendors : "No new vendors",
      vendorChanges: vendorChanges.length > 0 ? vendorChanges.map(v => ({
        vendor: v.vendor,
        recent: v.recent,
        previous: v.previous,
        change: `${v.changePercent > 0 ? '+' : ''}${v.changePercent.toFixed(0)}%`,
      })) : "No significant vendor changes",
      transactionCount: {
        recent: recentTransactions.length,
        previous: previousTransactions.length,
      },
    },
  };
}

async function getRecurringExpenses(
  organizationId: string
): Promise<ToolResult> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: new Date(),
  });

  const recurringTxns = transactions.filter((t: any) => t.isRecurring && parseFloat(t.amount) < 0);
  
  const vendorRecurring: Record<string, { count: number; total: number; amounts: number[] }> = {};
  
  transactions.filter((t: any) => parseFloat(t.amount) < 0).forEach((t: any) => {
    const vendor = t.vendorNormalized || t.vendorOriginal || "Unknown";
    const amount = Math.abs(parseFloat(t.amount));
    
    if (!vendorRecurring[vendor]) {
      vendorRecurring[vendor] = { count: 0, total: 0, amounts: [] };
    }
    vendorRecurring[vendor].count++;
    vendorRecurring[vendor].total += amount;
    vendorRecurring[vendor].amounts.push(amount);
  });

  const likelySubscriptions = Object.entries(vendorRecurring)
    .filter(([, data]) => {
      if (data.count < 3) return false;
      const avgAmount = data.total / data.count;
      const variance = data.amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / data.count;
      const stdDev = Math.sqrt(variance);
      return stdDev / avgAmount < 0.15;
    })
    .map(([vendor, data]) => ({
      vendor,
      monthlyAmount: data.total / 6,
      annualCost: (data.total / 6) * 12,
      occurrences: data.count,
    }))
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  const flaggedRecurring = recurringTxns
    .reduce((acc: Record<string, number>, t: any) => {
      const vendor = t.vendorNormalized || t.vendorOriginal || "Unknown";
      acc[vendor] = (acc[vendor] || 0) + Math.abs(parseFloat(t.amount));
      return acc;
    }, {});

  const allRecurring = [...new Set([
    ...likelySubscriptions.map(s => s.vendor),
    ...Object.keys(flaggedRecurring)
  ])];

  const totalMonthlyRecurring = likelySubscriptions.reduce((sum, s) => sum + s.monthlyAmount, 0);

  return {
    success: true,
    message: "Recurring expenses analysis",
    data: {
      totalMonthlyRecurring,
      totalAnnualRecurring: totalMonthlyRecurring * 12,
      subscriptions: likelySubscriptions.slice(0, 15),
      subscriptionCount: likelySubscriptions.length,
      insights: totalMonthlyRecurring > 5000 
        ? `You're spending $${totalMonthlyRecurring.toFixed(0)}/mo on recurring expenses. Consider auditing for unused subscriptions.`
        : `Your recurring expenses of $${totalMonthlyRecurring.toFixed(0)}/mo appear reasonable.`,
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
      model: AI_MODEL,
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
        model: AI_MODEL,
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
