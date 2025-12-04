import { storage } from "../storage";
import { callAIWithFallback } from "../aiService";
import { format, subMonths } from "date-fns";

export interface InvestorUpdateData {
  companyName: string;
  generatedAt: Date;
  period: string;
  metrics: {
    currentCash: number;
    previousCash: number;
    cashChange: number;
    monthlyBurn: number;
    previousBurn: number;
    burnChange: number;
    monthlyRevenue: number;
    previousRevenue: number;
    revenueChange: number;
    runwayMonths: number | null;
    headcount: number;
  };
  highlights: string[];
  challenges: string[];
  keyMetricsNarrative: string;
  outlook: string;
  asks: string[];
  fullUpdateText: string;
}

export async function generateInvestorUpdateData(
  userId: string,
  organizationId: string
): Promise<InvestorUpdateData> {
  const org = await storage.getOrganization(organizationId);
  const bankAccounts = await storage.getUserBankAccounts(userId);
  
  const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.currentBalance) || 0);
  }, 0);

  const now = new Date();
  const oneMonthAgo = subMonths(now, 1);
  const twoMonthsAgo = subMonths(now, 2);
  const threeMonthsAgo = subMonths(now, 3);
  
  const currentMonthTxns = await storage.getOrganizationTransactions(organizationId, {
    startDate: oneMonthAgo,
    endDate: now,
  });
  
  const previousMonthTxns = await storage.getOrganizationTransactions(organizationId, {
    startDate: twoMonthsAgo,
    endDate: oneMonthAgo,
  });

  const threeMonthTxns = await storage.getOrganizationTransactions(organizationId, {
    startDate: threeMonthsAgo,
    endDate: now,
  });

  const calcMetrics = (txns: any[]) => {
    let revenue = 0;
    let expenses = 0;
    txns.forEach((txn: any) => {
      const amount = parseFloat(txn.amount);
      if (amount > 0) revenue += amount;
      else expenses += Math.abs(amount);
    });
    return { revenue, expenses };
  };

  const current = calcMetrics(currentMonthTxns);
  const previous = calcMetrics(previousMonthTxns);
  
  const monthlyBurn = current.expenses;
  const previousBurn = previous.expenses;
  const burnChange = previousBurn > 0 ? ((monthlyBurn - previousBurn) / previousBurn) * 100 : 0;
  
  const monthlyRevenue = current.revenue;
  const previousRevenue = previous.revenue;
  const revenueChange = previousRevenue > 0 ? ((monthlyRevenue - previousRevenue) / previousRevenue) * 100 : 0;
  
  const netBurn = monthlyBurn - monthlyRevenue;
  const runwayMonths = netBurn > 0 ? currentCash / netBurn : null;

  const plannedHires = await storage.getUserPlannedHires(userId);
  const activeHires = plannedHires.filter((h: any) => new Date(h.startDate) <= now && h.isActive);
  const headcount = activeHires.length;

  const previousCash = currentCash + netBurn;
  const cashChange = previousCash > 0 ? ((currentCash - previousCash) / previousCash) * 100 : 0;

  const period = format(now, "MMMM yyyy");
  const companyName = org?.name || "Your Company";

  const metricsContext = {
    companyName,
    period,
    currentCash,
    monthlyBurn,
    monthlyRevenue,
    netBurn,
    runwayMonths,
    headcount,
    burnChange,
    revenueChange,
    cashChange,
  };

  let aiGenerated = {
    highlights: [
      "Revenue remained stable month-over-month",
      "Successfully maintained burn rate within targets",
      "Team execution continues to be strong",
    ],
    challenges: [
      "Market conditions remain competitive",
      "Continued focus on efficient growth",
    ],
    keyMetricsNarrative: `This month we ${revenueChange >= 0 ? 'grew' : 'saw a decrease in'} revenue by ${Math.abs(revenueChange).toFixed(1)}% while ${burnChange <= 0 ? 'reducing' : 'increasing'} burn by ${Math.abs(burnChange).toFixed(1)}%. Our current runway is ${runwayMonths ? `${runwayMonths.toFixed(1)} months` : 'healthy with positive cash flow'}.`,
    outlook: "We remain focused on sustainable growth and executing on our roadmap for the coming quarter.",
    asks: [
      "Introductions to potential customers in our target market",
      "Feedback on our product roadmap priorities",
    ],
  };

  try {
    const prompt = `You are helping a startup founder write their monthly investor update. Based on the following financial metrics, generate a professional investor update.

Company: ${companyName}
Period: ${period}

METRICS:
- Current Cash: $${currentCash.toLocaleString()}
- Monthly Burn: $${monthlyBurn.toLocaleString()} (${burnChange >= 0 ? '+' : ''}${burnChange.toFixed(1)}% vs last month)
- Monthly Revenue: $${monthlyRevenue.toLocaleString()} (${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% vs last month)
- Runway: ${runwayMonths ? `${runwayMonths.toFixed(1)} months` : 'Profitable/Infinite'}
- Team Size: ${headcount} people

Generate a JSON response with:
{
  "highlights": ["3-4 positive developments or wins to share with investors"],
  "challenges": ["1-2 honest challenges or areas of focus"],
  "keyMetricsNarrative": "A 2-3 sentence narrative explaining the key financial metrics and their significance",
  "outlook": "A 2-3 sentence forward-looking statement about the next month/quarter",
  "asks": ["2-3 specific asks from investors (intros, advice, etc.)"]
}

Keep the tone professional but warm. Be specific and actionable. Don't be overly promotional but highlight genuine progress.`;

    const response = await callAIWithFallback({
      prompt,
      systemPrompt: "You are a startup advisor helping founders communicate effectively with their investors. Respond only with valid JSON.",
      jsonMode: true,
      maxTokens: 1500,
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.content);
    aiGenerated = {
      highlights: parsed.highlights || aiGenerated.highlights,
      challenges: parsed.challenges || aiGenerated.challenges,
      keyMetricsNarrative: parsed.keyMetricsNarrative || aiGenerated.keyMetricsNarrative,
      outlook: parsed.outlook || aiGenerated.outlook,
      asks: parsed.asks || aiGenerated.asks,
    };
  } catch (error) {
    console.error("[investorUpdate] AI generation failed, using defaults:", error);
  }

  const formatCurrency = (n: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const fullUpdateText = `
# ${companyName} - Investor Update
## ${period}

Dear Investors,

I hope this update finds you well. Here's our monthly report on ${companyName}'s progress.

## Highlights

${aiGenerated.highlights.map(h => `- ${h}`).join('\n')}

## Key Metrics

${aiGenerated.keyMetricsNarrative}

| Metric | Current | Change |
|--------|---------|--------|
| Cash Position | ${formatCurrency(currentCash)} | ${cashChange >= 0 ? '+' : ''}${cashChange.toFixed(1)}% |
| Monthly Revenue | ${formatCurrency(monthlyRevenue)} | ${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% |
| Monthly Burn | ${formatCurrency(monthlyBurn)} | ${burnChange >= 0 ? '+' : ''}${burnChange.toFixed(1)}% |
| Runway | ${runwayMonths ? `${runwayMonths.toFixed(1)} months` : 'Profitable'} | - |
| Team Size | ${headcount} | - |

## Challenges & Focus Areas

${aiGenerated.challenges.map(c => `- ${c}`).join('\n')}

## Outlook

${aiGenerated.outlook}

## Asks

${aiGenerated.asks.map(a => `- ${a}`).join('\n')}

---

Thank you for your continued support. Please don't hesitate to reach out if you have any questions.

Best regards,
${companyName} Team
`.trim();

  return {
    companyName,
    generatedAt: now,
    period,
    metrics: {
      currentCash,
      previousCash,
      cashChange,
      monthlyBurn,
      previousBurn,
      burnChange,
      monthlyRevenue,
      previousRevenue,
      revenueChange,
      runwayMonths,
      headcount,
    },
    highlights: aiGenerated.highlights,
    challenges: aiGenerated.challenges,
    keyMetricsNarrative: aiGenerated.keyMetricsNarrative,
    outlook: aiGenerated.outlook,
    asks: aiGenerated.asks,
    fullUpdateText,
  };
}

export function generateInvestorUpdateHTML(data: InvestorUpdateData): string {
  const formatCurrency = (n: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    const color = change >= 0 ? '#22c55e' : '#ef4444';
    return `<span style="color: ${color}">${sign}${change.toFixed(1)}%</span>`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Investor Update - ${data.companyName} - ${data.period}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #f8f9fa; 
      color: #1a1a1a; 
      line-height: 1.7;
      padding: 40px 20px;
    }
    .container { max-width: 700px; margin: 0 auto; }
    .header { 
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 2px solid #e5e7eb;
    }
    .header h1 { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
    .header .period { font-size: 18px; color: #6b7280; }
    
    .greeting { font-size: 16px; margin-bottom: 32px; }
    
    .section { margin-bottom: 32px; }
    .section-title { 
      font-size: 20px; 
      font-weight: 600; 
      margin-bottom: 16px; 
      color: #111;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::before {
      content: '';
      width: 4px;
      height: 24px;
      background: #111;
      border-radius: 2px;
    }
    
    ul { list-style: none; padding: 0; }
    li { 
      padding: 8px 0 8px 24px; 
      position: relative;
    }
    li::before {
      content: '→';
      position: absolute;
      left: 0;
      color: #6b7280;
    }
    
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .metrics-table th,
    .metrics-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .metrics-table th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metrics-table td:last-child {
      text-align: right;
    }
    
    .narrative { 
      background: #f9fafb; 
      padding: 20px; 
      border-radius: 8px;
      border-left: 4px solid #111;
      font-style: italic;
      margin-bottom: 24px;
    }
    
    .footer { 
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    
    @media print {
      body { background: #fff; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.companyName}</h1>
      <div class="period">Investor Update • ${data.period}</div>
    </div>
    
    <p class="greeting">Dear Investors,</p>
    <p style="margin-bottom: 32px;">I hope this update finds you well. Here's our monthly report on ${data.companyName}'s progress.</p>
    
    <div class="section">
      <div class="section-title">Highlights</div>
      <ul>
        ${data.highlights.map(h => `<li>${h}</li>`).join('')}
      </ul>
    </div>
    
    <div class="section">
      <div class="section-title">Key Metrics</div>
      <div class="narrative">${data.keyMetricsNarrative}</div>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Current</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cash Position</td>
            <td>${formatCurrency(data.metrics.currentCash)}</td>
            <td>${formatChange(data.metrics.cashChange)}</td>
          </tr>
          <tr>
            <td>Monthly Revenue</td>
            <td>${formatCurrency(data.metrics.monthlyRevenue)}</td>
            <td>${formatChange(data.metrics.revenueChange)}</td>
          </tr>
          <tr>
            <td>Monthly Burn</td>
            <td>${formatCurrency(data.metrics.monthlyBurn)}</td>
            <td>${formatChange(data.metrics.burnChange)}</td>
          </tr>
          <tr>
            <td>Runway</td>
            <td>${data.metrics.runwayMonths ? `${data.metrics.runwayMonths.toFixed(1)} months` : 'Profitable'}</td>
            <td>-</td>
          </tr>
          <tr>
            <td>Team Size</td>
            <td>${data.metrics.headcount}</td>
            <td>-</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="section">
      <div class="section-title">Challenges & Focus Areas</div>
      <ul>
        ${data.challenges.map(c => `<li>${c}</li>`).join('')}
      </ul>
    </div>
    
    <div class="section">
      <div class="section-title">Outlook</div>
      <p>${data.outlook}</p>
    </div>
    
    <div class="section">
      <div class="section-title">Asks</div>
      <ul>
        ${data.asks.map(a => `<li>${a}</li>`).join('')}
      </ul>
    </div>
    
    <p style="margin-top: 32px;">Thank you for your continued support. Please don't hesitate to reach out if you have any questions.</p>
    <p style="margin-top: 16px;">Best regards,<br><strong>${data.companyName} Team</strong></p>
    
    <div class="footer">
      <p>Generated by BlackTop Systems • ${data.generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
    </div>
  </div>
</body>
</html>
`;
}
