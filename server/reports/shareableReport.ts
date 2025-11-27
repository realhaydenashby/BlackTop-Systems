import { storage } from "../storage";

export interface ShareableReportData {
  companyName: string;
  generatedAt: Date;
  metrics: {
    currentCash: number;
    monthlyBurn: number;
    monthlyRevenue: number;
    netBurn: number;
    runwayMonths: number | null;
    burnTrend: string;
  };
  spendByCategory: Array<{ name: string; amount: number; percentage: number }>;
  topVendors: Array<{ name: string; amount: number }>;
  monthlyTrend: Array<{ month: string; burn: number; revenue: number }>;
  insights: Array<{ type: string; message: string; severity: string }>;
}

export async function generateReportData(
  userId: string,
  organizationId: string
): Promise<ShareableReportData> {
  const org = await storage.getOrganization(organizationId);
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

  let totalRevenue = 0;
  let totalExpenses = 0;
  const spendByCategory: Record<string, number> = {};
  const spendByVendor: Record<string, number> = {};
  const monthlyData: Record<string, { burn: number; revenue: number }> = {};

  const categories = await storage.getOrganizationCategories(organizationId);
  const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

  transactions.forEach((txn: any) => {
    const amount = parseFloat(txn.amount);
    const monthKey = new Date(txn.date).toISOString().substring(0, 7);
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { burn: 0, revenue: 0 };
    }
    
    if (amount > 0) {
      totalRevenue += amount;
      monthlyData[monthKey].revenue += amount;
    } else {
      const absAmount = Math.abs(amount);
      totalExpenses += absAmount;
      monthlyData[monthKey].burn += absAmount;
      
      const catName = txn.categoryId ? categoryMap.get(txn.categoryId) || "Uncategorized" : "Uncategorized";
      const vendor = txn.vendorNormalized || txn.vendorOriginal || "Unknown";
      
      spendByCategory[catName] = (spendByCategory[catName] || 0) + absAmount;
      spendByVendor[vendor] = (spendByVendor[vendor] || 0) + absAmount;
    }
  });

  const monthsOfData = Object.keys(monthlyData).length || 1;
  const monthlyBurn = totalExpenses / monthsOfData;
  const monthlyRevenue = totalRevenue / monthsOfData;
  const netBurn = monthlyBurn - monthlyRevenue;
  const runwayMonths = netBurn > 0 ? currentCash / netBurn : null;

  const sortedMonths = Object.keys(monthlyData).sort();
  let burnTrend = "stable";
  if (sortedMonths.length >= 3) {
    const recent = monthlyData[sortedMonths[sortedMonths.length - 1]]?.burn || 0;
    const prior = monthlyData[sortedMonths[sortedMonths.length - 3]]?.burn || 0;
    if (prior > 0) {
      const change = ((recent - prior) / prior) * 100;
      burnTrend = change > 10 ? `increasing (+${change.toFixed(0)}%)` : 
                 change < -10 ? `decreasing (${change.toFixed(0)}%)` : "stable";
    }
  }

  const spendByCategoryArray = Object.entries(spendByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, amount]) => ({
      name,
      amount: amount / monthsOfData,
      percentage: (amount / totalExpenses) * 100,
    }));

  const topVendors = Object.entries(spendByVendor)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, amount]) => ({ name, amount }));

  const monthlyTrend = sortedMonths.map(month => ({
    month,
    burn: monthlyData[month].burn,
    revenue: monthlyData[month].revenue,
  }));

  const insights: Array<{ type: string; message: string; severity: string }> = [];
  
  if (runwayMonths !== null && runwayMonths < 6) {
    insights.push({
      type: "runway",
      message: `Runway is ${runwayMonths.toFixed(1)} months`,
      severity: runwayMonths < 3 ? "critical" : "warning",
    });
  }

  if (burnTrend.includes("increasing")) {
    insights.push({
      type: "burn_trend",
      message: `Burn rate is ${burnTrend}`,
      severity: "warning",
    });
  }

  return {
    companyName: org?.name || "Your Company",
    generatedAt: new Date(),
    metrics: {
      currentCash,
      monthlyBurn,
      monthlyRevenue,
      netBurn,
      runwayMonths,
      burnTrend,
    },
    spendByCategory: spendByCategoryArray,
    topVendors,
    monthlyTrend,
    insights,
  };
}

export function generateReportHTML(data: ShareableReportData): string {
  const formatCurrency = (n: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  
  const runwayText = data.metrics.runwayMonths === null 
    ? "Profitable" 
    : `${data.metrics.runwayMonths.toFixed(1)} months`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Financial Report - ${data.companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #f5f5f5; 
      color: #1a1a1a; 
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    .header { 
      background: #111; 
      color: #fff; 
      padding: 40px; 
      border-radius: 12px 12px 0 0;
      margin-bottom: 0;
    }
    .header h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
    .header p { opacity: 0.7; font-size: 14px; }
    .content { background: #fff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    
    .metrics-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
      gap: 24px; 
      margin-bottom: 40px;
      padding: 24px;
      background: #f8f8f8;
      border-radius: 8px;
    }
    .metric { text-align: center; }
    .metric-value { font-size: 28px; font-weight: 700; color: #111; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .metric-sublabel { font-size: 11px; color: #888; }
    
    .section { margin-bottom: 40px; }
    .section-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 16px; border-bottom: 2px solid #eee; padding-bottom: 8px; }
    
    .category-bar { 
      display: flex; 
      align-items: center; 
      margin-bottom: 12px;
      gap: 12px;
    }
    .category-name { width: 120px; font-size: 13px; color: #444; }
    .category-bar-bg { flex: 1; height: 24px; background: #eee; border-radius: 4px; overflow: hidden; }
    .category-bar-fill { height: 100%; background: #111; border-radius: 4px; transition: width 0.3s; }
    .category-amount { width: 100px; text-align: right; font-size: 13px; font-weight: 500; }
    
    .vendor-list { list-style: none; }
    .vendor-item { 
      display: flex; 
      justify-content: space-between; 
      padding: 12px 0; 
      border-bottom: 1px solid #eee; 
    }
    .vendor-name { font-size: 14px; }
    .vendor-amount { font-size: 14px; font-weight: 600; }
    
    .insight { 
      padding: 12px 16px; 
      margin-bottom: 8px; 
      border-radius: 6px;
      font-size: 14px;
    }
    .insight-critical { background: #fef2f2; border-left: 4px solid #dc2626; }
    .insight-warning { background: #fffbeb; border-left: 4px solid #f59e0b; }
    .insight-info { background: #eff6ff; border-left: 4px solid #3b82f6; }
    
    .chart { 
      display: flex; 
      align-items: flex-end; 
      gap: 8px; 
      height: 150px; 
      padding: 20px 0;
    }
    .chart-bar { 
      flex: 1; 
      display: flex; 
      flex-direction: column; 
      align-items: center;
      gap: 4px;
    }
    .chart-bar-burn { background: #111; border-radius: 4px 4px 0 0; min-height: 4px; width: 100%; }
    .chart-bar-revenue { background: #22c55e; border-radius: 4px 4px 0 0; min-height: 4px; width: 100%; opacity: 0.3; position: absolute; }
    .chart-label { font-size: 10px; color: #888; writing-mode: vertical-lr; text-orientation: mixed; }
    
    .footer { 
      text-align: center; 
      margin-top: 40px; 
      padding-top: 20px; 
      border-top: 1px solid #eee; 
      color: #888; 
      font-size: 12px; 
    }
    
    @media print {
      body { background: #fff; }
      .container { padding: 20px; }
      .content { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.companyName}</h1>
      <p>Financial Report • Generated ${data.generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
    </div>
    
    <div class="content">
      <div class="metrics-grid">
        <div class="metric">
          <div class="metric-value">${formatCurrency(data.metrics.currentCash)}</div>
          <div class="metric-label">Cash Position</div>
        </div>
        <div class="metric">
          <div class="metric-value">${formatCurrency(data.metrics.monthlyBurn)}</div>
          <div class="metric-label">Monthly Burn</div>
          <div class="metric-sublabel">${data.metrics.burnTrend}</div>
        </div>
        <div class="metric">
          <div class="metric-value">${formatCurrency(data.metrics.monthlyRevenue)}</div>
          <div class="metric-label">Monthly Revenue</div>
        </div>
        <div class="metric">
          <div class="metric-value">${runwayText}</div>
          <div class="metric-label">Runway</div>
        </div>
      </div>

      ${data.insights.length > 0 ? `
      <div class="section">
        <div class="section-title">Key Insights</div>
        ${data.insights.map(i => `
          <div class="insight insight-${i.severity}">${i.message}</div>
        `).join("")}
      </div>
      ` : ""}

      <div class="section">
        <div class="section-title">Spending by Category (Monthly Average)</div>
        ${data.spendByCategory.map(cat => `
          <div class="category-bar">
            <div class="category-name">${cat.name}</div>
            <div class="category-bar-bg">
              <div class="category-bar-fill" style="width: ${Math.min(100, cat.percentage)}%"></div>
            </div>
            <div class="category-amount">${formatCurrency(cat.amount)}</div>
          </div>
        `).join("")}
      </div>

      <div class="section">
        <div class="section-title">Top Vendors (Total Spend)</div>
        <ul class="vendor-list">
          ${data.topVendors.slice(0, 8).map(v => `
            <li class="vendor-item">
              <span class="vendor-name">${v.name}</span>
              <span class="vendor-amount">${formatCurrency(v.amount)}</span>
            </li>
          `).join("")}
        </ul>
      </div>

      <div class="footer">
        <p>Generated by BlackTop Systems • Confidential</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

export function generateReportJSON(data: ShareableReportData): object {
  return {
    company: data.companyName,
    generatedAt: data.generatedAt.toISOString(),
    summary: {
      cashPosition: data.metrics.currentCash,
      monthlyBurn: data.metrics.monthlyBurn,
      monthlyRevenue: data.metrics.monthlyRevenue,
      netBurn: data.metrics.netBurn,
      runwayMonths: data.metrics.runwayMonths,
      burnTrend: data.metrics.burnTrend,
    },
    spendByCategory: data.spendByCategory,
    topVendors: data.topVendors,
    monthlyTrend: data.monthlyTrend,
    insights: data.insights,
  };
}
