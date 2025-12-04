import { storage } from "../storage";
import { callAIWithFallback } from "../aiService";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

export interface BoardPacketData {
  companyName: string;
  generatedAt: Date;
  period: string;
  boardMeetingDate?: string;
  
  executiveSummary: string;
  
  financials: {
    currentCash: number;
    monthlyBurn: number;
    monthlyRevenue: number;
    netBurn: number;
    runwayMonths: number | null;
    grossMargin: number | null;
    burnTrend: { month: string; burn: number; revenue: number }[];
  };
  
  keyMetrics: {
    label: string;
    value: string;
    change: number | null;
    status: "green" | "yellow" | "red";
  }[];
  
  headcount: {
    current: number;
    planned: number;
    byDepartment: { department: string; count: number; monthlyCost: number }[];
  };
  
  highlights: string[];
  challenges: string[];
  risksAndMitigations: { risk: string; mitigation: string; severity: "high" | "medium" | "low" }[];
  
  strategicUpdates: string[];
  keyDecisions: string[];
  
  appendix: {
    topVendors: { name: string; amount: number }[];
    spendByCategory: { name: string; amount: number; percentage: number }[];
  };
}

export async function generateBoardPacketData(
  userId: string,
  organizationId: string,
  boardMeetingDate?: string
): Promise<BoardPacketData> {
  const org = await storage.getOrganization(organizationId);
  const bankAccounts = await storage.getUserBankAccounts(userId);
  
  const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.currentBalance) || 0);
  }, 0);

  const now = new Date();
  const sixMonthsAgo = subMonths(now, 6);
  
  const transactions = await storage.getOrganizationTransactions(organizationId, {
    startDate: sixMonthsAgo,
    endDate: now,
  });

  const categories = await storage.getOrganizationCategories(organizationId);
  const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalCOGS = 0;
  const monthlyData: Record<string, { burn: number; revenue: number }> = {};
  const spendByCategory: Record<string, number> = {};
  const spendByVendor: Record<string, number> = {};

  transactions.forEach((txn: any) => {
    const amount = parseFloat(txn.amount);
    const monthKey = format(new Date(txn.date), "yyyy-MM");
    
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
      
      const catName = txn.categoryId ? categoryMap.get(txn.categoryId) || "Other" : "Other";
      const vendor = txn.vendorNormalized || txn.vendorOriginal || "Unknown";
      
      spendByCategory[catName] = (spendByCategory[catName] || 0) + absAmount;
      spendByVendor[vendor] = (spendByVendor[vendor] || 0) + absAmount;
      
      if (catName.toLowerCase().includes("cogs") || catName.toLowerCase().includes("cost of")) {
        totalCOGS += absAmount;
      }
    }
  });

  const monthsOfData = Object.keys(monthlyData).length || 1;
  const monthlyBurn = totalExpenses / monthsOfData;
  const monthlyRevenue = totalRevenue / monthsOfData;
  const netBurn = monthlyBurn - monthlyRevenue;
  const runwayMonths = netBurn > 0 ? currentCash / netBurn : null;
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : null;

  const burnTrend = Object.keys(monthlyData)
    .sort()
    .slice(-6)
    .map(month => ({
      month: format(new Date(month + "-01"), "MMM yyyy"),
      burn: monthlyData[month].burn,
      revenue: monthlyData[month].revenue,
    }));

  const plannedHires = await storage.getUserPlannedHires(userId);
  const activeHires = plannedHires.filter((h: any) => new Date(h.startDate) <= now && h.isActive);
  const futureHires = plannedHires.filter((h: any) => new Date(h.startDate) > now && h.isActive);
  
  const byDepartment: Record<string, { count: number; monthlyCost: number }> = {};
  activeHires.forEach((h: any) => {
    const dept = h.department || "General";
    if (!byDepartment[dept]) {
      byDepartment[dept] = { count: 0, monthlyCost: 0 };
    }
    byDepartment[dept].count++;
    byDepartment[dept].monthlyCost += parseFloat(h.monthlyCost) || 0;
  });

  const spendByCategoryArray = Object.entries(spendByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, amount]) => ({
      name,
      amount: amount / monthsOfData,
      percentage: (amount / totalExpenses) * 100,
    }));

  const topVendors = Object.entries(spendByVendor)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, amount]) => ({ name, amount }));

  const companyName = org?.name || "Your Company";
  const period = format(now, "MMMM yyyy");

  const sortedMonths = Object.keys(monthlyData).sort();
  let burnChangePercent = 0;
  let revenueChangePercent = 0;
  if (sortedMonths.length >= 2) {
    const recent = monthlyData[sortedMonths[sortedMonths.length - 1]];
    const prior = monthlyData[sortedMonths[sortedMonths.length - 2]];
    if (prior.burn > 0) burnChangePercent = ((recent.burn - prior.burn) / prior.burn) * 100;
    if (prior.revenue > 0) revenueChangePercent = ((recent.revenue - prior.revenue) / prior.revenue) * 100;
  }

  let aiGenerated = {
    executiveSummary: `${companyName} continues to execute on its growth strategy. This month, revenue ${revenueChangePercent >= 0 ? 'grew' : 'decreased'} by ${Math.abs(revenueChangePercent).toFixed(1)}% while maintaining operational efficiency. Current runway stands at ${runwayMonths ? `${runwayMonths.toFixed(1)} months` : 'a healthy position with positive cash flow'}.`,
    highlights: [
      "Maintained strong operational execution",
      "Revenue trajectory remains on track",
      "Team continues to deliver on product roadmap",
    ],
    challenges: [
      "Competitive market conditions require continued focus",
      "Scaling operations while maintaining efficiency",
    ],
    risksAndMitigations: [
      { risk: "Market conditions", mitigation: "Diversifying customer acquisition channels", severity: "medium" as const },
      { risk: "Cash runway", mitigation: "Monitoring burn rate closely with contingency plans", severity: runwayMonths && runwayMonths < 6 ? "high" as const : "low" as const },
    ],
    strategicUpdates: [
      "Continued focus on core product development",
      "Exploring strategic partnership opportunities",
    ],
    keyDecisions: [
      "Hiring plan for next quarter",
      "Budget allocation priorities",
    ],
  };

  try {
    const metricsContext = `
Company: ${companyName}
Period: ${period}
Cash: $${currentCash.toLocaleString()}
Monthly Revenue: $${monthlyRevenue.toLocaleString()} (${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent.toFixed(1)}% MoM)
Monthly Burn: $${monthlyBurn.toLocaleString()} (${burnChangePercent >= 0 ? '+' : ''}${burnChangePercent.toFixed(1)}% MoM)
Net Burn: $${netBurn.toLocaleString()}
Runway: ${runwayMonths ? `${runwayMonths.toFixed(1)} months` : 'Profitable'}
Team Size: ${activeHires.length} (${futureHires.length} planned hires)
Gross Margin: ${grossMargin ? `${grossMargin.toFixed(1)}%` : 'N/A'}
`;

    const response = await callAIWithFallback({
      prompt: `You are helping prepare a board packet for a startup. Based on the following metrics, generate professional board meeting content.

${metricsContext}

Generate a JSON response with:
{
  "executiveSummary": "A 3-4 sentence executive summary suitable for board members",
  "highlights": ["3-4 key wins or positive developments"],
  "challenges": ["2-3 current challenges or areas needing board attention"],
  "risksAndMitigations": [{"risk": "description", "mitigation": "how it's being addressed", "severity": "high|medium|low"}],
  "strategicUpdates": ["2-3 strategic initiatives or updates"],
  "keyDecisions": ["2-3 decisions requiring board input or approval"]
}

Be professional, concise, and suitable for sophisticated investors. Focus on actionable information.`,
      systemPrompt: "You are a CFO preparing materials for a board meeting. Be professional and data-driven. Respond only with valid JSON.",
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.content);
    aiGenerated = {
      executiveSummary: parsed.executiveSummary || aiGenerated.executiveSummary,
      highlights: parsed.highlights || aiGenerated.highlights,
      challenges: parsed.challenges || aiGenerated.challenges,
      risksAndMitigations: parsed.risksAndMitigations || aiGenerated.risksAndMitigations,
      strategicUpdates: parsed.strategicUpdates || aiGenerated.strategicUpdates,
      keyDecisions: parsed.keyDecisions || aiGenerated.keyDecisions,
    };
  } catch (error) {
    console.error("[boardPacket] AI generation failed, using defaults:", error);
  }

  const keyMetrics: BoardPacketData["keyMetrics"] = [
    {
      label: "Cash Position",
      value: `$${(currentCash / 1000000).toFixed(2)}M`,
      change: null,
      status: currentCash > monthlyBurn * 6 ? "green" : currentCash > monthlyBurn * 3 ? "yellow" : "red",
    },
    {
      label: "Monthly Revenue",
      value: `$${monthlyRevenue.toLocaleString()}`,
      change: revenueChangePercent,
      status: revenueChangePercent >= 0 ? "green" : revenueChangePercent > -10 ? "yellow" : "red",
    },
    {
      label: "Monthly Burn",
      value: `$${monthlyBurn.toLocaleString()}`,
      change: burnChangePercent,
      status: burnChangePercent <= 0 ? "green" : burnChangePercent < 10 ? "yellow" : "red",
    },
    {
      label: "Runway",
      value: runwayMonths ? `${runwayMonths.toFixed(1)} months` : "Profitable",
      change: null,
      status: !runwayMonths || runwayMonths > 12 ? "green" : runwayMonths > 6 ? "yellow" : "red",
    },
  ];

  if (grossMargin !== null) {
    keyMetrics.push({
      label: "Gross Margin",
      value: `${grossMargin.toFixed(1)}%`,
      change: null,
      status: grossMargin > 60 ? "green" : grossMargin > 40 ? "yellow" : "red",
    });
  }

  return {
    companyName,
    generatedAt: now,
    period,
    boardMeetingDate,
    executiveSummary: aiGenerated.executiveSummary,
    financials: {
      currentCash,
      monthlyBurn,
      monthlyRevenue,
      netBurn,
      runwayMonths,
      grossMargin,
      burnTrend,
    },
    keyMetrics,
    headcount: {
      current: activeHires.length,
      planned: futureHires.length,
      byDepartment: Object.entries(byDepartment).map(([department, data]) => ({
        department,
        count: data.count,
        monthlyCost: data.monthlyCost,
      })),
    },
    highlights: aiGenerated.highlights,
    challenges: aiGenerated.challenges,
    risksAndMitigations: aiGenerated.risksAndMitigations,
    strategicUpdates: aiGenerated.strategicUpdates,
    keyDecisions: aiGenerated.keyDecisions,
    appendix: {
      topVendors,
      spendByCategory: spendByCategoryArray,
    },
  };
}

export function generateBoardPacketHTML(data: BoardPacketData): string {
  const formatCurrency = (n: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const statusColors = {
    green: "#22c55e",
    yellow: "#f59e0b",
    red: "#ef4444",
  };

  const severityColors = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#22c55e",
  };

  const maxBurn = Math.max(...data.financials.burnTrend.map(t => Math.max(t.burn, t.revenue)));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Board Packet - ${data.companyName} - ${data.period}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #fff; 
      color: #1a1a1a; 
      line-height: 1.6;
    }
    
    .page { 
      max-width: 900px; 
      margin: 0 auto; 
      padding: 48px;
      min-height: 100vh;
    }
    
    .cover { 
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 80vh;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 48px;
    }
    .cover h1 { font-size: 48px; font-weight: 700; margin-bottom: 16px; }
    .cover .subtitle { font-size: 24px; color: #6b7280; margin-bottom: 8px; }
    .cover .date { font-size: 18px; color: #9ca3af; }
    .cover .confidential { 
      margin-top: 48px;
      padding: 12px 24px;
      background: #f3f4f6;
      border-radius: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6b7280;
    }
    
    .section { margin-bottom: 48px; page-break-inside: avoid; }
    .section-title { 
      font-size: 24px; 
      font-weight: 700; 
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 3px solid #111;
    }
    
    .exec-summary {
      font-size: 18px;
      line-height: 1.8;
      color: #374151;
      background: #f9fafb;
      padding: 24px;
      border-radius: 12px;
      border-left: 4px solid #111;
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
    }
    .metric-card {
      background: #f9fafb;
      padding: 24px;
      border-radius: 12px;
      text-align: center;
      border: 2px solid transparent;
    }
    .metric-card.green { border-color: #22c55e; }
    .metric-card.yellow { border-color: #f59e0b; }
    .metric-card.red { border-color: #ef4444; }
    .metric-value { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-change { font-size: 14px; margin-top: 8px; }
    .metric-change.positive { color: #22c55e; }
    .metric-change.negative { color: #ef4444; }
    
    .chart-container {
      margin: 24px 0;
      padding: 24px;
      background: #f9fafb;
      border-radius: 12px;
    }
    .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: #374151; }
    .chart {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      height: 200px;
    }
    .chart-bar-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .chart-bars {
      display: flex;
      gap: 4px;
      align-items: flex-end;
      height: 160px;
    }
    .chart-bar {
      width: 24px;
      border-radius: 4px 4px 0 0;
      min-height: 4px;
    }
    .chart-bar.burn { background: #111; }
    .chart-bar.revenue { background: #22c55e; }
    .chart-label { font-size: 10px; color: #6b7280; }
    .chart-legend {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-top: 16px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #6b7280;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }
    
    .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    
    ul { list-style: none; }
    li { 
      padding: 12px 0 12px 28px; 
      position: relative;
      border-bottom: 1px solid #e5e7eb;
    }
    li:last-child { border-bottom: none; }
    li::before {
      content: '→';
      position: absolute;
      left: 0;
      color: #111;
      font-weight: bold;
    }
    
    .risk-item {
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .risk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .risk-title { font-weight: 600; }
    .risk-severity {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      text-transform: uppercase;
      color: #fff;
    }
    .risk-mitigation { font-size: 14px; color: #6b7280; }
    
    .headcount-table {
      width: 100%;
      border-collapse: collapse;
    }
    .headcount-table th,
    .headcount-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .headcount-table th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
    }
    
    .appendix-section {
      background: #f9fafb;
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    .appendix-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
    
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    
    @media print {
      .page { padding: 24px; }
      .cover { min-height: auto; padding: 48px 0; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <h1>${data.companyName}</h1>
      <div class="subtitle">Board Packet</div>
      <div class="date">${data.period}</div>
      ${data.boardMeetingDate ? `<div class="date">Board Meeting: ${data.boardMeetingDate}</div>` : ''}
      <div class="confidential">Confidential</div>
    </div>
    
    <div class="section">
      <div class="section-title">Executive Summary</div>
      <div class="exec-summary">${data.executiveSummary}</div>
    </div>
    
    <div class="section">
      <div class="section-title">Key Metrics</div>
      <div class="metrics-grid">
        ${data.keyMetrics.map(m => `
          <div class="metric-card ${m.status}">
            <div class="metric-value">${m.value}</div>
            <div class="metric-label">${m.label}</div>
            ${m.change !== null ? `
              <div class="metric-change ${m.change >= 0 ? 'positive' : 'negative'}">
                ${m.change >= 0 ? '+' : ''}${m.change.toFixed(1)}% MoM
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      
      <div class="chart-container">
        <div class="chart-title">Burn vs Revenue (6 Month Trend)</div>
        <div class="chart">
          ${data.financials.burnTrend.map(t => `
            <div class="chart-bar-group">
              <div class="chart-bars">
                <div class="chart-bar burn" style="height: ${(t.burn / maxBurn) * 160}px"></div>
                <div class="chart-bar revenue" style="height: ${(t.revenue / maxBurn) * 160}px"></div>
              </div>
              <div class="chart-label">${t.month.split(' ')[0]}</div>
            </div>
          `).join('')}
        </div>
        <div class="chart-legend">
          <div class="legend-item">
            <div class="legend-dot" style="background: #111"></div>
            <span>Burn</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot" style="background: #22c55e"></div>
            <span>Revenue</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-title">Highlights & Challenges</div>
      <div class="two-column">
        <div>
          <h3 style="margin-bottom: 16px; color: #22c55e;">Highlights</h3>
          <ul>
            ${data.highlights.map(h => `<li>${h}</li>`).join('')}
          </ul>
        </div>
        <div>
          <h3 style="margin-bottom: 16px; color: #f59e0b;">Challenges</h3>
          <ul>
            ${data.challenges.map(c => `<li>${c}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-title">Risks & Mitigations</div>
      ${data.risksAndMitigations.map(r => `
        <div class="risk-item">
          <div class="risk-header">
            <span class="risk-title">${r.risk}</span>
            <span class="risk-severity" style="background: ${severityColors[r.severity]}">${r.severity}</span>
          </div>
          <div class="risk-mitigation">Mitigation: ${r.mitigation}</div>
        </div>
      `).join('')}
    </div>
    
    <div class="section">
      <div class="section-title">Team & Headcount</div>
      <div class="metrics-grid" style="margin-bottom: 24px;">
        <div class="metric-card green">
          <div class="metric-value">${data.headcount.current}</div>
          <div class="metric-label">Current Team</div>
        </div>
        <div class="metric-card yellow">
          <div class="metric-value">${data.headcount.planned}</div>
          <div class="metric-label">Planned Hires</div>
        </div>
      </div>
      ${data.headcount.byDepartment.length > 0 ? `
        <table class="headcount-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Headcount</th>
              <th>Monthly Cost</th>
            </tr>
          </thead>
          <tbody>
            ${data.headcount.byDepartment.map(d => `
              <tr>
                <td>${d.department}</td>
                <td>${d.count}</td>
                <td>${formatCurrency(d.monthlyCost)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
    
    <div class="section">
      <div class="section-title">Strategic Updates</div>
      <ul>
        ${data.strategicUpdates.map(s => `<li>${s}</li>`).join('')}
      </ul>
    </div>
    
    <div class="section">
      <div class="section-title">Key Decisions Needed</div>
      <ul>
        ${data.keyDecisions.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>
    
    <div class="section">
      <div class="section-title">Appendix</div>
      
      <div class="appendix-section">
        <div class="appendix-title">Top Vendors (Total Spend)</div>
        <table class="headcount-table">
          <thead>
            <tr><th>Vendor</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${data.appendix.topVendors.slice(0, 5).map(v => `
              <tr><td>${v.name}</td><td>${formatCurrency(v.amount)}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="appendix-section">
        <div class="appendix-title">Spend by Category (Monthly Average)</div>
        <table class="headcount-table">
          <thead>
            <tr><th>Category</th><th>Amount</th><th>% of Total</th></tr>
          </thead>
          <tbody>
            ${data.appendix.spendByCategory.slice(0, 5).map(c => `
              <tr>
                <td>${c.name}</td>
                <td>${formatCurrency(c.amount)}</td>
                <td>${c.percentage.toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="footer">
      <p>Generated by BlackTop Systems • ${data.generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      <p>Confidential - For Board Members Only</p>
    </div>
  </div>
</body>
</html>
`;
}
