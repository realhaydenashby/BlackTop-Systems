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

  getAnalytics: async (): Promise<AnalyticsData> => {
    const dates = generateDateRange(30);
    const months = generateMonthRange(6);

    return {
      spendTrend: dates.map((date) => ({
        date,
        amount: Math.floor(2500 + Math.random() * 4000),
      })),
      categoryDistribution: [
        { name: "Payroll", value: 65000, percentage: 62.4 },
        { name: "Software", value: 15600, percentage: 15.0 },
        { name: "Infrastructure", value: 12400, percentage: 11.9 },
        { name: "Marketing", value: 6500, percentage: 6.2 },
        { name: "Office", value: 4600, percentage: 4.4 },
      ],
      topVendors: [
        { name: "Gusto (Payroll)", amount: 65000, count: 1, category: "Payroll", isRecurring: true },
        { name: "AWS", amount: 8340, count: 4, category: "Infrastructure", isRecurring: true },
        { name: "Google Cloud", amount: 4120, count: 2, category: "Infrastructure", isRecurring: true },
        { name: "HubSpot", amount: 3200, count: 1, category: "Marketing", isRecurring: true },
        { name: "Slack", amount: 1250, count: 1, category: "Software", isRecurring: true },
      ],
      burn: {
        currentMonthlyBurn: 104100,
        payrollBurn: 65000,
        nonPayrollBurn: 39100,
        burnTrend: months.map((month, i) => ({
          month,
          payroll: 58000 + i * 1200,
          nonPayroll: 32000 + i * 800 + Math.floor(Math.random() * 2000),
        })),
      },
      runway: {
        currentCash: 485000,
        monthlyBurn: 104100,
        runwayMonths: 4.7,
        runwayDate: "2024-06-15",
        scenarios: [
          { scenario: "Current", months: 4.7, date: "2024-06-15" },
          { scenario: "Cut 15%", months: 5.5, date: "2024-07-20" },
          { scenario: "Cut 25%", months: 6.2, date: "2024-08-10" },
          { scenario: "+2 Hires", months: 3.8, date: "2024-05-01" },
        ],
      },
      cashFlow: [
        { month: "Jan", actual: 485000, forecast: 480000, lower: 470000, upper: 490000 },
        { month: "Feb", actual: 420000, forecast: 425000, lower: 410000, upper: 440000 },
        { month: "Mar", actual: 365000, forecast: 370000, lower: 355000, upper: 390000 },
        { month: "Apr", actual: null, forecast: 315000, lower: 295000, upper: 335000 },
        { month: "May", actual: null, forecast: 260000, lower: 235000, upper: 285000 },
        { month: "Jun", actual: null, forecast: 205000, lower: 175000, upper: 235000 },
      ],
      insights: [
        {
          id: "i1",
          type: "runway",
          title: "Runway Below Safety Threshold",
          description: "At current burn rate, you have 4.7 months of runway.",
          severity: "high",
        },
        {
          id: "i2",
          type: "vendor_spike",
          title: "AWS Costs Increased 23%",
          description: "Review instance utilization and consider reserved capacity.",
          severity: "medium",
        },
      ],
      actionPlan: [
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
      ],
    };
  },

  getFundraisingData: async () => {
    return {
      burn: {
        currentMonthlyBurn: 104100,
        payrollBurn: 65000,
        nonPayrollBurn: 39100,
        burnTrend: [
          { month: "Aug", payroll: 58000, nonPayroll: 32000 },
          { month: "Sep", payroll: 59200, nonPayroll: 33800 },
          { month: "Oct", payroll: 61000, nonPayroll: 35200 },
          { month: "Nov", payroll: 62500, nonPayroll: 36800 },
          { month: "Dec", payroll: 64000, nonPayroll: 38000 },
          { month: "Jan", payroll: 65000, nonPayroll: 39100 },
        ],
      },
      runway: {
        currentCash: 485000,
        monthlyBurn: 104100,
        runwayMonths: 4.7,
        runwayDate: "2024-06-15",
        scenarios: [
          { scenario: "Current", months: 4.7, date: "2024-06-15" },
          { scenario: "Cut 15%", months: 5.5, date: "2024-07-20" },
          { scenario: "Cut 25%", months: 6.2, date: "2024-08-10" },
        ],
      },
      raise: {
        recommendedAmount: 2500000,
        suggestedValuation: 12000000,
        timeline: "Q2 2024",
        rationale: "Based on 18-month runway target and current metrics",
      },
      hiring: {
        currentHeadcount: 12,
        plannedHires: [
          { role: "Senior Engineer", salary: 180000, startDate: "2024-03" },
          { role: "Product Designer", salary: 140000, startDate: "2024-04" },
        ],
        impactOnRunway: -1.2,
      },
    };
  },
};
