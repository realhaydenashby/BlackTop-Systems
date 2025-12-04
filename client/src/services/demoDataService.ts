import { format, subDays } from "date-fns";

export interface DashboardStats {
  totalRevenue: number;
  totalProfit: number;
  currentCash: number;
  totalHeadcount: number;
  totalSpend: number;
  spendChange: number;
  transactionCount: number;
  subscriptionCount: number;
  subscriptionMrr: number;
  budgetVariance: number;
  spendOverTime: { date: string; amount: number }[];
  spendByCategory: { name: string; value: number }[];
  spendByDepartment: { name: string; value: number }[];
  revenueOverTime: { month: string; revenue: number; expenses: number; profit: number }[];
  dashboardActionPlan: ActionItem[];
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  vendorOriginal: string;
  vendorNormalized: string;
  category: string;
  amount: number;
  type: "debit" | "credit";
  isRecurring: boolean;
  source: string;
  classificationConfidence: number;
}

export interface Insight {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface ActionItem {
  id: string;
  summary: string;
  metricRef: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendedAction: string;
  impact: string;
}

export interface BurnMetrics {
  currentMonthlyBurn: number;
  payrollBurn: number;
  nonPayrollBurn: number;
  burnTrend: { month: string; payroll: number; nonPayroll: number }[];
}

export interface RunwayMetrics {
  currentCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  runwayDate: string;
  scenarios: { scenario: string; months: number; date: string }[];
}

export interface CashFlowData {
  month: string;
  actual: number | null;
  forecast: number;
  lower: number;
  upper: number;
}

export interface TopVendor {
  name: string;
  amount: number;
  count: number;
  category: string;
  isRecurring: boolean;
}

export interface AnalyticsData {
  spendTrend: { date: string; amount: number }[];
  categoryDistribution: { name: string; value: number; percentage: number }[];
  topVendors: TopVendor[];
  burn: BurnMetrics;
  runway: RunwayMetrics;
  cashFlow: CashFlowData[];
  insights: Insight[];
  actionPlan: ActionItem[];
}

const generateDateRange = (days: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
};

const generateMonthRange = (months: number): string[] => {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result: string[] = [];
  const today = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    result.push(monthNames[date.getMonth()]);
  }
  return result;
};

export const demoDataService = {
  getDashboardStats: async (): Promise<DashboardStats> => {
    const dates = generateDateRange(30);
    const months = generateMonthRange(6);

    return {
      totalRevenue: 127500,
      totalProfit: 23400,
      currentCash: 485000,
      totalHeadcount: 12,
      totalSpend: 104100,
      spendChange: 8.5,
      transactionCount: 156,
      subscriptionCount: 18,
      subscriptionMrr: 12450,
      budgetVariance: -4.2,
      spendOverTime: dates.map((date) => ({
        date,
        amount: Math.floor(2500 + Math.random() * 4000),
      })),
      spendByCategory: [
        { name: "Payroll", value: 65000 },
        { name: "Software", value: 15600 },
        { name: "Infrastructure", value: 12400 },
        { name: "Marketing", value: 6500 },
        { name: "Office", value: 4600 },
      ],
      spendByDepartment: [
        { name: "Engineering", value: 52000 },
        { name: "Sales", value: 28000 },
        { name: "Marketing", value: 14000 },
        { name: "Operations", value: 10100 },
      ],
      revenueOverTime: months.map((month, i) => ({
        month,
        revenue: 95000 + i * 5500 + Math.floor(Math.random() * 8000),
        expenses: 75000 + i * 2000 + Math.floor(Math.random() * 5000),
        profit: 15000 + i * 2000 + Math.floor(Math.random() * 3000),
      })),
      dashboardActionPlan: [
        {
          id: "ap1",
          summary: "Runway is 4.7 months - below 6-month safety threshold",
          metricRef: "Cash: $485K | Monthly burn: $104K",
          severity: "high",
          recommendedAction: "Cut non-essential spend by 15% or accelerate fundraising timeline.",
          impact: "Extends runway to 5.5 months",
        },
        {
          id: "ap2",
          summary: "AWS costs up 23% month-over-month",
          metricRef: "$8,340 → $10,260",
          severity: "medium",
          recommendedAction: "Review reserved instances and right-size underutilized resources.",
          impact: "Potential $1,500/mo savings",
        },
        {
          id: "ap3",
          summary: "3 software subscriptions with low utilization",
          metricRef: "Mixpanel, Amplitude, Heap",
          severity: "low",
          recommendedAction: "Consolidate to single analytics platform.",
          impact: "Save $890/mo",
        },
      ],
    };
  },

  getTransactions: async (): Promise<Transaction[]> => {
    return [
      {
        id: "1",
        date: "2024-01-15",
        description: "AMZN WEB SERVICES",
        vendorOriginal: "AMZN WEB SERVICES",
        vendorNormalized: "AWS",
        category: "Infrastructure",
        amount: 8340,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.95,
      },
      {
        id: "2",
        date: "2024-01-14",
        description: "GUSTO PAYROLL",
        vendorOriginal: "GUSTO PAYROLL 65000",
        vendorNormalized: "Gusto",
        category: "Payroll",
        amount: 65000,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.99,
      },
      {
        id: "3",
        date: "2024-01-12",
        description: "Stripe Transfer",
        vendorOriginal: "STRIPE TRANSFER",
        vendorNormalized: "Stripe",
        category: "Revenue",
        amount: 42500,
        type: "credit",
        isRecurring: false,
        source: "stripe",
        classificationConfidence: 1.0,
      },
      {
        id: "4",
        date: "2024-01-10",
        description: "SLACK TECHNOLOGIES",
        vendorOriginal: "SLACK TECHNOLOGIES",
        vendorNormalized: "Slack",
        category: "Software",
        amount: 1250,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.92,
      },
      {
        id: "5",
        date: "2024-01-08",
        description: "FIGMA INC",
        vendorOriginal: "FIGMA INC",
        vendorNormalized: "Figma",
        category: "Software",
        amount: 750,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.88,
      },
      {
        id: "6",
        date: "2024-01-05",
        description: "GOOGLE CLOUD",
        vendorOriginal: "GOOGLE *CLOUD",
        vendorNormalized: "Google Cloud",
        category: "Infrastructure",
        amount: 4120,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.94,
      },
      {
        id: "7",
        date: "2024-01-03",
        description: "Customer Payment - Acme Corp",
        vendorOriginal: "ACH DEPOSIT - ACME CORP",
        vendorNormalized: "Acme Corp",
        category: "Revenue",
        amount: 28500,
        type: "credit",
        isRecurring: false,
        source: "bank",
        classificationConfidence: 0.75,
      },
      {
        id: "8",
        date: "2024-01-02",
        description: "NOTION LABS",
        vendorOriginal: "NOTION LABS INC",
        vendorNormalized: "Notion",
        category: "Software",
        amount: 480,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.91,
      },
      {
        id: "9",
        date: "2024-01-01",
        description: "HUBSPOT",
        vendorOriginal: "HUBSPOT INC",
        vendorNormalized: "HubSpot",
        category: "Marketing",
        amount: 3200,
        type: "debit",
        isRecurring: true,
        source: "bank",
        classificationConfidence: 0.96,
      },
      {
        id: "10",
        date: "2023-12-28",
        description: "Customer Payment - TechFlow",
        vendorOriginal: "WIRE TRANSFER - TECHFLOW INC",
        vendorNormalized: "TechFlow Inc",
        category: "Revenue",
        amount: 56500,
        type: "credit",
        isRecurring: false,
        source: "bank",
        classificationConfidence: 0.82,
      },
    ];
  },

  getInsights: async (): Promise<Insight[]> => {
    return [
      {
        id: "i1",
        type: "runway",
        title: "Runway Below Safety Threshold",
        description: "At current burn rate of $104K/mo, you have 4.7 months of runway. Consider reducing spend or accelerating revenue.",
        severity: "high",
      },
      {
        id: "i2",
        type: "vendor_spike",
        title: "AWS Costs Increased 23%",
        description: "Your AWS spend jumped from $8,340 to $10,260 this month. Review instance utilization and consider reserved capacity.",
        severity: "medium",
      },
      {
        id: "i3",
        type: "subscription_creep",
        title: "Duplicate Analytics Tools Detected",
        description: "You're paying for Mixpanel ($320/mo), Amplitude ($370/mo), and Heap ($200/mo). Consider consolidating.",
        severity: "low",
      },
      {
        id: "i4",
        type: "payroll_drift",
        title: "Payroll Up 8% From Budget",
        description: "Actual payroll of $65K exceeds budgeted $60K. This is primarily due to contractor costs.",
        severity: "medium",
      },
    ];
  },

  getAnalytics: async (days: number = 30): Promise<any> => {
    const today = new Date();
    
    const mockSpendTrend = Array.from({ length: days }, (_, i) => ({
      date: format(subDays(new Date(), days - 1 - i), "MMM dd"),
      amount: Math.floor(Math.random() * 12000) + 3000,
    }));

    const mockCategoryDistribution = [
      { name: "Software & SaaS", value: 42000 },
      { name: "Marketing & Ads", value: 28500 },
      { name: "Payroll", value: 62000 },
      { name: "Cloud Infrastructure", value: 18200 },
      { name: "Office & Supplies", value: 12080 },
      { name: "Travel & Expenses", value: 8500 },
      { name: "Professional Services", value: 15600 },
    ];

    const mockDepartmentSpending = [
      { name: "Engineering", value: 78000 },
      { name: "Sales", value: 52500 },
      { name: "Marketing", value: 38500 },
      { name: "Operations", value: 28200 },
      { name: "HR & Admin", value: 18580 },
    ];

    const mockTopVendors = [
      { name: "AWS", value: 12400 },
      { name: "Google Workspace", value: 8200 },
      { name: "Salesforce", value: 7800 },
      { name: "LinkedIn Ads", value: 6500 },
      { name: "Slack", value: 4200 },
      { name: "GitHub", value: 3800 },
      { name: "Zoom", value: 2400 },
    ];

    const mockMonthlyComparison = [
      { month: "Jan", current: 125000, previous: 118000 },
      { month: "Feb", current: 132000, previous: 121000 },
      { month: "Mar", current: 128000, previous: 125000 },
      { month: "Apr", current: 145000, previous: 130000 },
      { month: "May", current: 152000, previous: 138000 },
      { month: "Jun", current: 148000, previous: 142000 },
    ];

    const mockRevenueData = {
      totalRevenue: 485000,
      revenueGrowth: 18.5,
      mrr: 42500,
      arr: 510000,
      revenueTrend: Array.from({ length: days }, (_, i) => ({
        date: format(subDays(new Date(), days - 1 - i), "MMM dd"),
        revenue: Math.floor(Math.random() * 20000) + 12000,
      })),
      revenueGrowthByMonth: Array.from({ length: 6 }, (_, i) => ({
        month: format(new Date(2025, i, 1), "MMM"),
        revenue: Math.floor(Math.random() * 25000) + 75000 + (i * 5000),
      })),
      mrrArr: Array.from({ length: 6 }, (_, i) => ({
        month: format(new Date(2025, i, 1), "MMM"),
        mrr: Math.floor(Math.random() * 5000) + 38000 + (i * 800),
        arr: Math.floor(Math.random() * 60000) + 456000 + (i * 9600),
      })),
      revenueBySource: [
        { name: "Subscriptions", value: 325000 },
        { name: "Professional Services", value: 95000 },
        { name: "One-time Sales", value: 45000 },
        { name: "Partnerships", value: 20000 },
      ],
      customerSegments: [
        { name: "Enterprise", value: 280000 },
        { name: "SMB", value: 145000 },
        { name: "Startup", value: 60000 },
      ],
    };

    const mockProfitabilityData = {
      grossMargin: 68.5,
      netMargin: 24.2,
      operatingMargin: 32.8,
      ebitda: 156000,
      profitTrend: Array.from({ length: days }, (_, i) => ({
        date: format(subDays(new Date(), days - 1 - i), "MMM dd"),
        profit: Math.floor(Math.random() * 8000) + 2000,
        revenue: Math.floor(Math.random() * 18000) + 10000,
        costs: Math.floor(Math.random() * 10000) + 8000,
      })),
      margins: Array.from({ length: 6 }, (_, i) => ({
        month: format(new Date(2025, i, 1), "MMM"),
        gross: Math.floor(Math.random() * 5) + 66 + (i * 0.5),
        operating: Math.floor(Math.random() * 3) + 30 + (i * 0.3),
        net: Math.floor(Math.random() * 2) + 22 + (i * 0.2),
      })),
      netIncome: Array.from({ length: 6 }, (_, i) => ({
        month: format(new Date(2025, i, 1), "MMM"),
        income: Math.floor(Math.random() * 15000) + 18000 + (i * 2000),
      })),
      costStructure: [
        { name: "Cost of Goods Sold", value: 152000 },
        { name: "Operating Expenses", value: 185000 },
        { name: "Sales & Marketing", value: 78000 },
        { name: "R&D", value: 95000 },
        { name: "G&A", value: 42000 },
      ],
      marginsByProduct: [
        { name: "Product A", margin: 72 },
        { name: "Product B", margin: 68 },
        { name: "Product C", margin: 58 },
        { name: "Services", margin: 45 },
      ],
    };

    const historicalMonths = 6;
    const forecastHorizons = {
      days30: 1,
      days90: 3,
      months6: 6,
    };
    
    const baseRevenue = 45000;
    const baseExpenses = 30000;
    const growthRate = 1.08;
    
    const historicalData = Array.from({ length: historicalMonths }, (_, i) => {
      const monthsAgo = historicalMonths - 1 - i;
      const month = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
      const revenue = Math.floor(baseRevenue * Math.pow(growthRate, i) * (0.92 + Math.random() * 0.16));
      const expenses = Math.floor(baseExpenses * Math.pow(1.05, i) * (0.94 + Math.random() * 0.12));
      return {
        month: format(month, "MMM yyyy"),
        revenue,
        expenses,
        profit: revenue - expenses,
        isHistorical: true,
      };
    });
    
    const currentMonth = {
      month: format(today, "MMM yyyy"),
      revenue: Math.floor(historicalData[historicalData.length - 1].revenue * 1.08),
      expenses: Math.floor(historicalData[historicalData.length - 1].expenses * 1.05),
      profit: 0,
      isHistorical: true,
      isPartial: true,
    };
    currentMonth.profit = currentMonth.revenue - currentMonth.expenses;
    
    const generateForecast = (months: number) => {
      const lastHistorical = currentMonth;
      return Array.from({ length: months }, (_, i) => {
        const futureMonth = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
        const revenue = Math.floor(lastHistorical.revenue * Math.pow(growthRate, i + 1) * (0.95 + Math.random() * 0.1));
        const expenses = Math.floor(lastHistorical.expenses * Math.pow(1.05, i + 1) * (0.96 + Math.random() * 0.08));
        return {
          month: format(futureMonth, "MMM yyyy"),
          revenue,
          expenses,
          profit: revenue - expenses,
          isHistorical: false,
        };
      });
    };
    
    const mockForecastingData = {
      forecastedRevenue: 625000,
      forecastedExpenses: 425000,
      forecastedProfit: 200000,
      confidence: 85,
      historicalData,
      currentMonth,
      forecast30Days: generateForecast(forecastHorizons.days30),
      forecast90Days: generateForecast(forecastHorizons.days90),
      forecast6Months: generateForecast(forecastHorizons.months6),
      forecast12Months: [
        ...historicalData,
        currentMonth,
        ...generateForecast(6)
      ],
      scenarioAnalysis: [
        { scenario: "Best Case", revenue: 750000, expenses: 400000, profit: 350000 },
        { scenario: "Base Case", revenue: 625000, expenses: 425000, profit: 200000 },
        { scenario: "Worst Case", revenue: 480000, expenses: 450000, profit: 30000 },
      ],
      cashRunway: {
        months: 18,
        burnRate: 12000,
        currentCash: 216000,
      },
    };

    const spendActionPlan = [
      {
        id: "spend-1",
        summary: "Duplicate subscriptions detected across 3 teams",
        metricRef: "Software & SaaS",
        severity: "high",
        recommendedAction: "Consolidate project management tools to save $450/month. Slack and Teams are being used simultaneously.",
        impact: "$5,400 annual savings",
      },
      {
        id: "spend-2",
        summary: "AWS costs exceeded benchmark by 28%",
        metricRef: "Cloud Infrastructure",
        severity: "critical",
        recommendedAction: "Review instance sizes and implement auto-scaling. Consider reserved instances for predictable workloads.",
        impact: "$3,200 monthly reduction",
      },
      {
        id: "spend-3",
        summary: "Marketing spend drift detected",
        metricRef: "Marketing & Ads",
        severity: "medium",
        recommendedAction: "Marketing costs up 22% vs. last month. Reallocate budget from low-performing channels to LinkedIn Ads (3x better ROI).",
        impact: "18% efficiency gain",
      },
      {
        id: "spend-4",
        summary: "Underutilized software licenses",
        metricRef: "Software & SaaS",
        severity: "medium",
        recommendedAction: "35% of Salesforce licenses unused for 60+ days. Downgrade or reassign licenses.",
        impact: "$1,800 monthly savings",
      },
    ];

    const revenueActionPlan = [
      {
        id: "rev-1",
        summary: "Enterprise customer concentration risk",
        metricRef: "Customer Segments",
        severity: "high",
        recommendedAction: "58% of revenue from enterprise segment. Diversify by targeting mid-market with dedicated sales team.",
        impact: "Risk mitigation",
      },
      {
        id: "rev-2",
        summary: "MRR growth slowing",
        metricRef: "MRR vs ARR",
        severity: "medium",
        recommendedAction: "MRR growth rate dropped from 12% to 8% QoQ. Implement expansion revenue strategy for existing customers.",
        impact: "$15K monthly increase",
      },
      {
        id: "rev-3",
        summary: "Professional services margin opportunity",
        metricRef: "Revenue by Source",
        severity: "low",
        recommendedAction: "Services revenue at 20% but delivers lower margins. Package common requests into self-serve products.",
        impact: "15% margin improvement",
      },
      {
        id: "rev-4",
        summary: "Churn prevention needed",
        metricRef: "Subscriptions",
        severity: "medium",
        recommendedAction: "12 accounts flagged for churn risk. Deploy customer success playbook immediately.",
        impact: "$42K ARR retention",
      },
    ];

    const profitabilityActionPlan = [
      {
        id: "profit-1",
        summary: "Operating expenses trending upward",
        metricRef: "Operating Margin %",
        severity: "high",
        recommendedAction: "OpEx increased 14% while revenue grew 8%. Implement zero-based budgeting for Q2.",
        impact: "5% margin recovery",
      },
      {
        id: "profit-2",
        summary: "COGS optimization opportunity",
        metricRef: "Cost Structure",
        severity: "medium",
        recommendedAction: "Vendor consolidation could reduce COGS by 8%. Renegotiate contracts with top 3 suppliers.",
        impact: "$12K monthly savings",
      },
      {
        id: "profit-3",
        summary: "R&D efficiency below target",
        metricRef: "Cost Structure",
        severity: "medium",
        recommendedAction: "R&D spending at 20% of revenue vs. 15% target. Review project portfolio and prioritize high-ROI initiatives.",
        impact: "Better resource allocation",
      },
      {
        id: "profit-4",
        summary: "Product B margin declining",
        metricRef: "Margins by Product",
        severity: "low",
        recommendedAction: "Product B gross margin dropped 4% in 2 months. Analyze cost drivers and adjust pricing if needed.",
        impact: "Margin stabilization",
      },
    ];

    const forecastingActionPlan = [
      {
        id: "forecast-1",
        summary: "Cash runway requires attention",
        metricRef: "Cash Runway",
        severity: "critical",
        recommendedAction: "18 months runway at current burn. Reduce burn rate by 15% or secure bridge funding by Q3.",
        impact: "6+ months extension",
      },
      {
        id: "forecast-2",
        summary: "Seasonal revenue dip expected",
        metricRef: "12-Month Forecast",
        severity: "medium",
        recommendedAction: "Model shows 18% revenue decline in Q3. Plan marketing campaign and sales promotions now.",
        impact: "Revenue stabilization",
      },
      {
        id: "forecast-3",
        summary: "Best-case scenario requires action",
        metricRef: "Scenario Analysis",
        severity: "low",
        recommendedAction: "Best case ($750K revenue) achievable with 2 additional enterprise deals. Accelerate pipeline development.",
        impact: "40% upside capture",
      },
      {
        id: "forecast-4",
        summary: "Expense forecast variance detected",
        metricRef: "Forecasted Expenses",
        severity: "medium",
        recommendedAction: "Actual expenses trending 8% above forecast. Tighten approval processes for discretionary spend.",
        impact: "$34K quarterly savings",
      },
    ];

    const mockFundraisingData = {
      burn: {
        currentMonthlyBurn: 85000,
        lastMonthBurn: 82000,
        twoMonthsAgoBurn: 78000,
        payrollBurn: 58000,
        nonPayrollBurn: 27000,
        burnDrift: {
          last3Months: 8.9,
          percentageChange: "+8.9%",
        },
        saasCreep: {
          newTools: 4,
          monthlyCost: 2400,
          tools: [
            { name: "Linear", cost: 800, addedDate: "Oct 2024" },
            { name: "Notion AI", cost: 600, addedDate: "Oct 2024" },
            { name: "Figma Pro", cost: 500, addedDate: "Nov 2024" },
            { name: "Loom", cost: 500, addedDate: "Nov 2024" },
          ],
        },
        burnTrend: Array.from({ length: 6 }, (_, i) => ({
          month: format(new Date(2024, 5 + i, 1), "MMM yyyy"),
          totalBurn: 75000 + (i * 2000) + Math.random() * 3000,
          payroll: 50000 + (i * 1500),
          nonPayroll: 25000 + (i * 500) + Math.random() * 2000,
        })),
      },
      runway: {
        currentCash: 1530000,
        currentRunway: 18,
        bestCaseRunway: 24,
        worstCaseRunway: 14,
        runwayAfterCuts: 22,
        runwayAfterRevenue: 26,
        runwayProjections: Array.from({ length: 24 }, (_, i) => ({
          month: format(new Date(2024, 11 + i, 1), "MMM yyyy"),
          current: Math.max(0, 1530000 - (i * 85000)),
          bestCase: Math.max(0, 1530000 - (i * 64000)),
          worstCase: Math.max(0, 1530000 - (i * 109000)),
          withCuts: Math.max(0, 1530000 - (i * 70000)),
          withRevenue: Math.max(0, 1530000 - (i * 59000)),
        })),
        scenarioDetails: {
          current: { monthlyBurn: 85000, assumptions: "Current spending patterns continue" },
          bestCase: { monthlyBurn: 64000, assumptions: "10% cost reduction + 20% revenue growth" },
          worstCase: { monthlyBurn: 109000, assumptions: "15% burn increase, no revenue growth" },
          withCuts: { monthlyBurn: 70000, assumptions: "Cut discretionary spend by $15K/mo" },
          withRevenue: { monthlyBurn: 59000, assumptions: "Add $26K/mo recurring revenue" },
        },
      },
      raise: {
        recommendedRange: {
          min: 1800000,
          max: 2500000,
          sweet: 2200000,
        },
        calculations: {
          currentBurn: 85000,
          projectedBurn: 105000,
          targetRunway: 24,
          buffer: 20,
        },
        scenarios: [
          {
            strategy: "Lean",
            raise: 1800000,
            runway: 18,
            assumptions: "Minimal hiring, focus on efficiency",
            outcomes: "Reach profitability faster, less dilution",
          },
          {
            strategy: "Baseline",
            raise: 2200000,
            runway: 24,
            assumptions: "Balanced growth, 3-4 key hires",
            outcomes: "Sustainable growth, hit next milestone",
          },
          {
            strategy: "Aggressive",
            raise: 2500000,
            runway: 26,
            assumptions: "Rapid hiring, expand to new markets",
            outcomes: "Fast growth, higher risk & dilution",
          },
        ],
        milestones: [
          { milestone: "Product-Market Fit", months: 6, cost: 500000 },
          { milestone: "$50K MRR", months: 12, cost: 1000000 },
          { milestone: "$100K MRR", months: 18, cost: 1500000 },
          { milestone: "Profitability", months: 24, cost: 2100000 },
        ],
      },
      hiring: {
        currentHeadcount: 12,
        plannedHires: [
          {
            role: "Senior Engineer",
            month: 2,
            salary: 150000,
            fullyLoadedCost: 195000,
            onboardingCost: 15000,
          },
          {
            role: "Product Designer",
            month: 3,
            salary: 120000,
            fullyLoadedCost: 156000,
            onboardingCost: 12000,
          },
          {
            role: "Sales Lead",
            month: 5,
            salary: 140000,
            fullyLoadedCost: 182000,
            onboardingCost: 14000,
          },
          {
            role: "Customer Success",
            month: 7,
            salary: 90000,
            fullyLoadedCost: 117000,
            onboardingCost: 10000,
          },
          {
            role: "Engineer",
            month: 9,
            salary: 130000,
            fullyLoadedCost: 169000,
            onboardingCost: 13000,
          },
        ],
        fullyLoadedMultiplier: 1.3,
        payrollProjection: Array.from({ length: 12 }, (_, i) => {
          const basePayroll = 58000;
          let additionalCost = 0;
          const hires = [
            { month: 2, cost: 16250 },
            { month: 3, cost: 13000 },
            { month: 5, cost: 15167 },
            { month: 7, cost: 9750 },
            { month: 9, cost: 14083 },
          ];
          hires.forEach(hire => {
            if (i >= hire.month) {
              additionalCost += hire.cost;
            }
          });
          return {
            month: format(new Date(2025, i, 1), "MMM yyyy"),
            payroll: basePayroll + additionalCost,
            headcount: 12 + hires.filter(h => i >= h.month).length,
          };
        }),
        runwayImpact: {
          withoutHiring: 18,
          withPlannedHiring: 14,
          costPerHire: 13000,
          totalHiringCost: 64000,
        },
      },
    };

    return {
      spendTrend: mockSpendTrend,
      categoryDistribution: mockCategoryDistribution,
      departmentSpending: mockDepartmentSpending,
      topVendors: mockTopVendors,
      monthlyComparison: mockMonthlyComparison,
      spendActionPlan,
      revenue: mockRevenueData,
      revenueActionPlan,
      profitability: mockProfitabilityData,
      profitabilityActionPlan,
      forecasting: mockForecastingData,
      forecastingActionPlan,
      fundraising: mockFundraisingData,
    };
  },

  getFundraisingData: async () => {
    return (await demoDataService.getAnalytics()).fundraising;
  },
};
