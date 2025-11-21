import { subDays, format } from "date-fns";

export function generateMockDashboardStats() {
  return {
    totalSpend: 145780,
    spendChange: 12.5,
    transactionCount: 247,
    subscriptionCount: 18,
    subscriptionMrr: 8940,
    budgetVariance: -5.2,
    spendOverTime: Array.from({ length: 30 }, (_, i) => ({
      date: format(subDays(new Date(), 29 - i), "MMM dd"),
      amount: Math.floor(Math.random() * 8000) + 3000,
    })),
    spendByCategory: [
      { name: "Software & Tools", value: 42000 },
      { name: "Marketing", value: 28500 },
      { name: "Payroll", value: 35000 },
      { name: "Infrastructure", value: 18200 },
      { name: "Office", value: 12080 },
      { name: "Other", value: 10000 },
    ],
    spendByDepartment: [
      { name: "Engineering", value: 52000 },
      { name: "Sales", value: 38500 },
      { name: "Marketing", value: 28500 },
      { name: "Operations", value: 18200 },
      { name: "HR", value: 8580 },
    ],
  };
}

export function generateMockAnalytics(days: number = 30) {
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

  // Revenue analytics mock data
  const mockRevenueData = {
    totalRevenue: 485000,
    revenueGrowth: 18.5,
    mrr: 42500,
    arr: 510000,
    revenueTrend: Array.from({ length: days }, (_, i) => ({
      date: format(subDays(new Date(), days - 1 - i), "MMM dd"),
      revenue: Math.floor(Math.random() * 20000) + 12000,
    })),
    revenueGrowth: Array.from({ length: 6 }, (_, i) => ({
      month: format(new Date(2025, i, 1), "MMM"),
      revenue: Math.floor(Math.random() * 25000) + 75000 + (i * 5000),
    })),
    mrrArr: Array.from({ length: 6 }, (_, i) => ({
      month: format(new Date(2025, i, 1), "MMM"),
      mrr: Math.floor(Math.random() * 5000) + 38000 + (i * 800),
      arr: Math.floor(Math.random() * 60000) + 456000 + (i * 9600),
    })),
    revenueSources: [
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

  // Profitability analytics mock data
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

  // Forecasting analytics mock data
  const mockForecastingData = {
    forecastedRevenue: 625000,
    forecastedExpenses: 425000,
    forecastedProfit: 200000,
    confidence: 85,
    forecast12Months: Array.from({ length: 12 }, (_, i) => ({
      month: format(new Date(2025, i, 1), "MMM yyyy"),
      revenue: Math.floor(Math.random() * 50000) + 40000,
      expenses: Math.floor(Math.random() * 35000) + 28000,
      profit: Math.floor(Math.random() * 20000) + 10000,
    })),
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

  // Action Plans for each section
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

  return {
    spendTrend: mockSpendTrend,
    categoryDistribution: mockCategoryDistribution,
    departmentSpending: mockDepartmentSpending,
    topVendors: mockTopVendors,
    monthlyComparison: mockMonthlyComparison,
    spendActionPlan,
    // Additional sections
    revenue: mockRevenueData,
    revenueActionPlan,
    profitability: mockProfitabilityData,
    profitabilityActionPlan,
    forecasting: mockForecastingData,
    forecastingActionPlan,
  };
}

export function generateMockInsights() {
  return [
    {
      id: 1,
      title: "Unusually High AWS Spending",
      description: "AWS costs increased by 42% this month compared to last month. Consider reviewing instance sizes and reserved capacity.",
      severity: "high",
      category: "cost-optimization",
      impact: 5200,
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      title: "Duplicate SaaS Subscriptions Detected",
      description: "Found 3 teams paying for similar project management tools. Consolidating could save $450/month.",
      severity: "medium",
      category: "cost-optimization",
      impact: 5400,
      createdAt: subDays(new Date(), 2).toISOString(),
    },
    {
      id: 3,
      title: "Marketing Spend Efficiency",
      description: "LinkedIn Ads showing 3x better ROI than other channels. Consider reallocating budget.",
      severity: "low",
      category: "optimization",
      impact: 0,
      createdAt: subDays(new Date(), 5).toISOString(),
    },
    {
      id: 4,
      title: "Seasonal Spending Pattern",
      description: "Payroll costs spike in Q4. Plan ahead for year-end bonuses and holiday expenses.",
      severity: "low",
      category: "planning",
      impact: 0,
      createdAt: subDays(new Date(), 7).toISOString(),
    },
    {
      id: 5,
      title: "Underutilized Software Licenses",
      description: "35% of Salesforce licenses haven't been accessed in 60 days. Review and reassign or cancel.",
      severity: "medium",
      category: "cost-optimization",
      impact: 1800,
      createdAt: subDays(new Date(), 10).toISOString(),
    },
  ];
}
