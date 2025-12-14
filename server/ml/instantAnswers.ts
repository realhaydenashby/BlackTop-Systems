import { db } from "../db";
import { transactions, vendors, categories, burnMetrics, bankAccounts, departments } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, ilike, or, sum, count, avg } from "drizzle-orm";
import { subMonths, subQuarters, subYears, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from "date-fns";

export interface QueryResult {
  answer: string;
  data?: any;
  queryType: string;
  confidence: number;
  details?: string;
}

interface ParsedQuery {
  type: "spend" | "runway" | "burn" | "recurring" | "vendor" | "category" | "trend" | "comparison" | "top" | "cash" | "unknown";
  vendor?: string;
  category?: string;
  timePeriod?: { start: Date; end: Date; label: string };
  limit?: number;
  comparison?: boolean;
}

const VENDOR_ALIASES: Record<string, string[]> = {
  "aws": ["amazon web services", "aws", "amazon aws"],
  "google": ["google cloud", "gcp", "google", "google workspace", "gsuite"],
  "microsoft": ["microsoft", "azure", "office 365", "microsoft 365", "ms"],
  "slack": ["slack", "slack technologies"],
  "github": ["github", "github inc"],
  "stripe": ["stripe", "stripe inc"],
  "zoom": ["zoom", "zoom video", "zoom communications"],
  "salesforce": ["salesforce", "salesforce.com"],
  "hubspot": ["hubspot"],
  "notion": ["notion", "notion labs"],
  "figma": ["figma"],
  "vercel": ["vercel"],
  "heroku": ["heroku"],
  "datadog": ["datadog"],
  "twilio": ["twilio"],
  "sendgrid": ["sendgrid"],
  "intercom": ["intercom"],
  "linear": ["linear"],
  "airtable": ["airtable"],
  "openai": ["openai", "open ai"],
};

export class InstantAnswersEngine {
  
  async query(organizationId: string, question: string): Promise<QueryResult> {
    const normalizedQuestion = question.toLowerCase().trim();
    
    const parsed = this.parseQuery(normalizedQuestion);
    
    switch (parsed.type) {
      case "spend":
        return this.handleSpendQuery(organizationId, parsed);
      case "runway":
        return this.handleRunwayQuery(organizationId);
      case "burn":
        return this.handleBurnQuery(organizationId, parsed);
      case "recurring":
        return this.handleRecurringQuery(organizationId);
      case "vendor":
        return this.handleVendorQuery(organizationId, parsed);
      case "category":
        return this.handleCategoryQuery(organizationId, parsed);
      case "trend":
        return this.handleTrendQuery(organizationId, parsed);
      case "top":
        return this.handleTopSpendersQuery(organizationId, parsed);
      case "cash":
        return this.handleCashQuery(organizationId);
      case "comparison":
        return this.handleComparisonQuery(organizationId, parsed);
      default:
        return this.handleGeneralQuery(organizationId, question);
    }
  }

  private parseQuery(question: string): ParsedQuery {
    const parsed: ParsedQuery = { type: "unknown" };

    const timePeriod = this.extractTimePeriod(question);
    if (timePeriod) {
      parsed.timePeriod = timePeriod;
    }

    const vendor = this.extractVendor(question);
    if (vendor) {
      parsed.vendor = vendor;
    }

    const category = this.extractCategory(question);
    if (category) {
      parsed.category = category;
    }

    if (question.includes("runway") || question.includes("how long") && question.includes("cash")) {
      parsed.type = "runway";
    } else if (question.includes("burn") || question.includes("burning")) {
      parsed.type = "burn";
    } else if (question.includes("cash") && (question.includes("have") || question.includes("balance"))) {
      parsed.type = "cash";
    } else if (question.includes("recurring") || question.includes("subscription")) {
      parsed.type = "recurring";
    } else if (question.includes("top") || question.includes("biggest") || question.includes("largest")) {
      parsed.type = "top";
      const limitMatch = question.match(/top\s+(\d+)/);
      parsed.limit = limitMatch ? parseInt(limitMatch[1]) : 5;
    } else if (question.includes("trend") || question.includes("over time") || question.includes("month over month")) {
      parsed.type = "trend";
    } else if ((question.includes("compare") || question.includes("vs") || question.includes("versus")) && timePeriod) {
      parsed.type = "comparison";
      parsed.comparison = true;
    } else if (vendor) {
      parsed.type = "vendor";
    } else if (category) {
      parsed.type = "category";
    } else if (question.includes("spend") || question.includes("spent") || question.includes("cost") || 
               question.includes("how much") || question.includes("what did")) {
      parsed.type = "spend";
    }

    return parsed;
  }

  private extractTimePeriod(question: string): { start: Date; end: Date; label: string } | undefined {
    const now = new Date();
    
    if (question.includes("last quarter") || question.includes("previous quarter")) {
      const lastQuarter = subQuarters(now, 1);
      return {
        start: startOfQuarter(lastQuarter),
        end: endOfQuarter(lastQuarter),
        label: `Q${Math.ceil((lastQuarter.getMonth() + 1) / 3)} ${lastQuarter.getFullYear()}`
      };
    }

    if (question.includes("this quarter")) {
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        label: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`
      };
    }

    if (question.includes("last month") || question.includes("previous month")) {
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
        label: format(lastMonth, "MMMM yyyy")
      };
    }

    if (question.includes("this month")) {
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: format(now, "MMMM yyyy")
      };
    }

    if (question.includes("last year") || question.includes("previous year")) {
      const lastYear = subYears(now, 1);
      return {
        start: startOfYear(lastYear),
        end: endOfYear(lastYear),
        label: `${lastYear.getFullYear()}`
      };
    }

    if (question.includes("this year") || question.includes("ytd") || question.includes("year to date")) {
      return {
        start: startOfYear(now),
        end: now,
        label: `${now.getFullYear()} YTD`
      };
    }

    const monthsMatch = question.match(/(?:last|past)\s+(\d+)\s+months?/);
    if (monthsMatch) {
      const months = parseInt(monthsMatch[1]);
      return {
        start: subMonths(now, months),
        end: now,
        label: `Last ${months} month${months > 1 ? 's' : ''}`
      };
    }

    const daysMatch = question.match(/(?:last|past)\s+(\d+)\s+days?/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      return {
        start,
        end: now,
        label: `Last ${days} day${days > 1 ? 's' : ''}`
      };
    }

    return undefined;
  }

  private extractVendor(question: string): string | undefined {
    for (const [normalizedName, aliases] of Object.entries(VENDOR_ALIASES)) {
      for (const alias of aliases) {
        if (question.includes(alias)) {
          return normalizedName;
        }
      }
    }

    const onPattern = /(?:on|to|for|from|with)\s+([a-z0-9]+(?:\s+[a-z0-9]+)?)/i;
    const match = question.match(onPattern);
    if (match) {
      const potential = match[1].toLowerCase();
      const skipWords = ["last", "this", "the", "next", "past", "all", "each", "every", "month", "quarter", "year", "day", "week"];
      if (!skipWords.includes(potential)) {
        return potential;
      }
    }

    return undefined;
  }

  private extractCategory(question: string): string | undefined {
    const categoryPatterns = [
      /(?:for|on|in)\s+(software|saas|marketing|payroll|office|travel|legal|accounting|hosting|infrastructure)/i,
      /(software|saas|marketing|payroll|office|travel|legal|accounting|hosting|infrastructure)\s+(?:spend|spending|costs?|expenses?)/i,
    ];

    for (const pattern of categoryPatterns) {
      const match = question.match(pattern);
      if (match) {
        return match[1].toLowerCase();
      }
    }

    return undefined;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
  }

  private async handleSpendQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { timePeriod, vendor, category } = parsed;
    
    const conditions: any[] = [eq(transactions.organizationId, organizationId)];
    
    if (timePeriod) {
      conditions.push(gte(transactions.date, timePeriod.start));
      conditions.push(lte(transactions.date, timePeriod.end));
    }

    if (vendor) {
      const vendorConditions = VENDOR_ALIASES[vendor] || [vendor];
      conditions.push(
        or(
          ...vendorConditions.map(v => ilike(transactions.vendorNormalized, `%${v}%`)),
          ...vendorConditions.map(v => ilike(transactions.vendorOriginal, `%${v}%`))
        )
      );
    }

    if (category) {
      const categoryMatches = await db.select().from(categories)
        .where(and(
          eq(categories.organizationId, organizationId),
          ilike(categories.name, `%${category}%`)
        ));
      
      if (categoryMatches.length > 0) {
        conditions.push(
          or(...categoryMatches.map(c => eq(transactions.categoryId, c.id)))
        );
      }
    }

    const result = await db
      .select({
        totalSpend: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS numeric))), 0)`,
        txCount: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(...conditions));

    const totalSpend = parseFloat(result[0]?.totalSpend || "0");
    const txCount = Number(result[0]?.txCount || 0);

    let label = "";
    if (vendor) label += `${vendor.toUpperCase()} `;
    if (category) label += `${category} `;
    label += "spending";
    if (timePeriod) label += ` (${timePeriod.label})`;

    const answer = totalSpend > 0
      ? `You spent ${this.formatCurrency(totalSpend)} on ${label} across ${txCount} transaction${txCount !== 1 ? 's' : ''}.`
      : `No transactions found for ${label}.`;

    return {
      answer,
      data: { totalSpend, txCount, period: timePeriod?.label },
      queryType: "spend",
      confidence: 0.9,
    };
  }

  private async handleRunwayQuery(organizationId: string): Promise<QueryResult> {
    const latestMetrics = await db.select()
      .from(burnMetrics)
      .where(eq(burnMetrics.organizationId, organizationId))
      .orderBy(desc(burnMetrics.month))
      .limit(3);

    if (latestMetrics.length === 0) {
      return {
        answer: "I don't have enough financial data to calculate your runway. Please ensure your bank accounts are connected and transactions are synced.",
        queryType: "runway",
        confidence: 0.5,
      };
    }

    const latest = latestMetrics[0];
    const runway = parseFloat(latest.runway?.toString() || "0");
    const cashBalance = parseFloat(latest.cashBalance?.toString() || "0");
    const netBurn = parseFloat(latest.netBurn?.toString() || "0");

    let runwayDescription = "";
    if (runway > 18) {
      runwayDescription = "You're in a strong cash position with over 18 months of runway.";
    } else if (runway > 12) {
      runwayDescription = "Your runway is healthy. Consider planning your next fundraise in 6-9 months.";
    } else if (runway > 6) {
      runwayDescription = "Your runway is getting short. You should actively be fundraising or cutting costs.";
    } else {
      runwayDescription = "Critical: Your runway is very short. Immediate action required.";
    }

    const answer = `You have approximately ${runway.toFixed(1)} months of runway remaining with ${this.formatCurrency(cashBalance)} in cash and a monthly net burn of ${this.formatCurrency(netBurn)}. ${runwayDescription}`;

    return {
      answer,
      data: { runway, cashBalance, netBurn },
      queryType: "runway",
      confidence: 0.95,
    };
  }

  private async handleBurnQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { timePeriod } = parsed;
    
    let conditions: any[] = [eq(burnMetrics.organizationId, organizationId)];
    
    if (timePeriod) {
      conditions.push(gte(burnMetrics.month, timePeriod.start));
      conditions.push(lte(burnMetrics.month, timePeriod.end));
    }

    const metrics = await db.select()
      .from(burnMetrics)
      .where(and(...conditions))
      .orderBy(desc(burnMetrics.month))
      .limit(6);

    if (metrics.length === 0) {
      return {
        answer: "No burn rate data available for the specified period.",
        queryType: "burn",
        confidence: 0.5,
      };
    }

    const avgGrossBurn = metrics.reduce((sum, m) => sum + parseFloat(m.grossBurn?.toString() || "0"), 0) / metrics.length;
    const avgNetBurn = metrics.reduce((sum, m) => sum + parseFloat(m.netBurn?.toString() || "0"), 0) / metrics.length;
    const latestGross = parseFloat(metrics[0].grossBurn?.toString() || "0");
    const latestNet = parseFloat(metrics[0].netBurn?.toString() || "0");

    const periodLabel = timePeriod?.label || `last ${metrics.length} months`;

    const answer = `Your average monthly gross burn is ${this.formatCurrency(avgGrossBurn)} and net burn is ${this.formatCurrency(avgNetBurn)} over the ${periodLabel}. Your most recent month shows ${this.formatCurrency(latestGross)} gross burn and ${this.formatCurrency(latestNet)} net burn.`;

    return {
      answer,
      data: { avgGrossBurn, avgNetBurn, latestGross, latestNet, months: metrics.length },
      queryType: "burn",
      confidence: 0.9,
    };
  }

  private async handleRecurringQuery(organizationId: string): Promise<QueryResult> {
    const recurringTxs = await db.select({
      vendorNormalized: transactions.vendorNormalized,
      vendorOriginal: transactions.vendorOriginal,
      totalAmount: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
      txCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      eq(transactions.isRecurring, true)
    ))
    .groupBy(transactions.vendorNormalized, transactions.vendorOriginal)
    .orderBy(desc(sql`SUM(ABS(CAST(${transactions.amount} AS numeric)))`))
    .limit(10);

    const totalRecurring = recurringTxs.reduce((sum, t) => sum + parseFloat(t.totalAmount || "0"), 0);
    const avgMonthly = totalRecurring / 12;

    const topSubs = recurringTxs.slice(0, 5).map(t => 
      `${t.vendorNormalized || t.vendorOriginal || "Unknown"}: ${this.formatCurrency(parseFloat(t.totalAmount || "0") / 12)}/mo`
    ).join(", ");

    const answer = recurringTxs.length > 0
      ? `You have ${recurringTxs.length} recurring subscriptions totaling approximately ${this.formatCurrency(avgMonthly)}/month. Top subscriptions: ${topSubs}.`
      : "No recurring subscriptions detected yet. Continue syncing transactions to identify recurring payments.";

    return {
      answer,
      data: { subscriptions: recurringTxs, totalMonthly: avgMonthly },
      queryType: "recurring",
      confidence: 0.85,
    };
  }

  private async handleVendorQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { vendor, timePeriod } = parsed;
    
    if (!vendor) {
      return { answer: "Please specify a vendor name.", queryType: "vendor", confidence: 0.3 };
    }

    const vendorConditions = VENDOR_ALIASES[vendor] || [vendor];
    
    const conditions: any[] = [
      eq(transactions.organizationId, organizationId),
      or(
        ...vendorConditions.map(v => ilike(transactions.vendorNormalized, `%${v}%`)),
        ...vendorConditions.map(v => ilike(transactions.vendorOriginal, `%${v}%`))
      )
    ];

    if (timePeriod) {
      conditions.push(gte(transactions.date, timePeriod.start));
      conditions.push(lte(transactions.date, timePeriod.end));
    }

    const result = await db.select({
      totalSpend: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS numeric))), 0)`,
      txCount: sql<number>`COUNT(*)`,
      firstTx: sql<Date>`MIN(${transactions.date})`,
      lastTx: sql<Date>`MAX(${transactions.date})`,
    })
    .from(transactions)
    .where(and(...conditions));

    const totalSpend = parseFloat(result[0]?.totalSpend || "0");
    const txCount = Number(result[0]?.txCount || 0);

    if (txCount === 0) {
      return {
        answer: `No transactions found for ${vendor.toUpperCase()}.`,
        queryType: "vendor",
        confidence: 0.7,
      };
    }

    const periodLabel = timePeriod ? ` during ${timePeriod.label}` : " all time";
    const answer = `You spent ${this.formatCurrency(totalSpend)} on ${vendor.toUpperCase()}${periodLabel} across ${txCount} transaction${txCount !== 1 ? 's' : ''}.`;

    return {
      answer,
      data: { vendor, totalSpend, txCount },
      queryType: "vendor",
      confidence: 0.9,
    };
  }

  private async handleCategoryQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { category, timePeriod } = parsed;

    if (!category) {
      return { answer: "Please specify a category.", queryType: "category", confidence: 0.3 };
    }

    const categoryMatches = await db.select().from(categories)
      .where(and(
        eq(categories.organizationId, organizationId),
        ilike(categories.name, `%${category}%`)
      ));

    if (categoryMatches.length === 0) {
      return {
        answer: `No category matching "${category}" found.`,
        queryType: "category",
        confidence: 0.5,
      };
    }

    const conditions: any[] = [
      eq(transactions.organizationId, organizationId),
      or(...categoryMatches.map(c => eq(transactions.categoryId, c.id)))
    ];

    if (timePeriod) {
      conditions.push(gte(transactions.date, timePeriod.start));
      conditions.push(lte(transactions.date, timePeriod.end));
    }

    const result = await db.select({
      totalSpend: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS numeric))), 0)`,
      txCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(...conditions));

    const totalSpend = parseFloat(result[0]?.totalSpend || "0");
    const txCount = Number(result[0]?.txCount || 0);
    const periodLabel = timePeriod ? ` during ${timePeriod.label}` : " all time";

    const answer = `You spent ${this.formatCurrency(totalSpend)} in the ${category} category${periodLabel} across ${txCount} transaction${txCount !== 1 ? 's' : ''}.`;

    return {
      answer,
      data: { category, totalSpend, txCount },
      queryType: "category",
      confidence: 0.9,
    };
  }

  private async handleTrendQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { vendor, category } = parsed;

    const sixMonthsAgo = subMonths(new Date(), 6);
    const conditions: any[] = [
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, sixMonthsAgo)
    ];

    if (vendor) {
      const vendorConditions = VENDOR_ALIASES[vendor] || [vendor];
      conditions.push(
        or(
          ...vendorConditions.map(v => ilike(transactions.vendorNormalized, `%${v}%`)),
          ...vendorConditions.map(v => ilike(transactions.vendorOriginal, `%${v}%`))
        )
      );
    }

    const monthlySpend = await db.select({
      month: sql<string>`TO_CHAR(${transactions.date}, 'YYYY-MM')`,
      totalSpend: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS numeric))), 0)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`);

    if (monthlySpend.length < 2) {
      return {
        answer: "Not enough data to analyze trends. Need at least 2 months of data.",
        queryType: "trend",
        confidence: 0.5,
      };
    }

    const spendData = monthlySpend.map(m => ({
      month: m.month,
      spend: parseFloat(m.totalSpend || "0")
    }));

    const firstHalf = spendData.slice(0, Math.floor(spendData.length / 2));
    const secondHalf = spendData.slice(Math.floor(spendData.length / 2));
    const firstAvg = firstHalf.reduce((s, m) => s + m.spend, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, m) => s + m.spend, 0) / secondHalf.length;
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    const trendDirection = change > 5 ? "increasing" : change < -5 ? "decreasing" : "stable";
    const subject = vendor ? `${vendor.toUpperCase()} spending` : "Total spending";

    const answer = `${subject} trend over the last 6 months: ${trendDirection} (${change > 0 ? '+' : ''}${change.toFixed(1)}% change). Monthly average went from ${this.formatCurrency(firstAvg)} to ${this.formatCurrency(secondAvg)}.`;

    return {
      answer,
      data: { trend: trendDirection, change, monthlyData: spendData },
      queryType: "trend",
      confidence: 0.85,
    };
  }

  private async handleTopSpendersQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { timePeriod, limit = 5 } = parsed;

    const conditions: any[] = [eq(transactions.organizationId, organizationId)];
    
    if (timePeriod) {
      conditions.push(gte(transactions.date, timePeriod.start));
      conditions.push(lte(transactions.date, timePeriod.end));
    }

    const topVendors = await db.select({
      vendor: sql<string>`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal}, 'Unknown')`,
      totalSpend: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
      txCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal}, 'Unknown')`)
    .orderBy(desc(sql`SUM(ABS(CAST(${transactions.amount} AS numeric)))`))
    .limit(limit);

    if (topVendors.length === 0) {
      return {
        answer: "No vendor spending data found for the specified period.",
        queryType: "top",
        confidence: 0.6,
      };
    }

    const vendorList = topVendors.map((v, i) => 
      `${i + 1}. ${v.vendor}: ${this.formatCurrency(parseFloat(v.totalSpend || "0"))}`
    ).join("; ");

    const periodLabel = timePeriod ? ` for ${timePeriod.label}` : "";
    const answer = `Your top ${topVendors.length} vendors by spend${periodLabel}: ${vendorList}.`;

    return {
      answer,
      data: { topVendors },
      queryType: "top",
      confidence: 0.9,
    };
  }

  private async handleCashQuery(organizationId: string): Promise<QueryResult> {
    const accounts = await db.select()
      .from(bankAccounts)
      .where(eq(bankAccounts.organizationId, organizationId));

    if (accounts.length === 0) {
      return {
        answer: "No bank accounts connected. Connect your bank to see cash balance.",
        queryType: "cash",
        confidence: 0.5,
      };
    }

    const totalCash = accounts.reduce((sum, a) => {
      const balance = parseFloat(a.currentBalance?.toString() || "0");
      return sum + (a.accountType === "credit_card" ? 0 : balance);
    }, 0);

    const accountBreakdown = accounts
      .filter(a => a.accountType !== "credit_card")
      .map(a => `${a.bankName} ${a.accountName}: ${this.formatCurrency(parseFloat(a.currentBalance?.toString() || "0"))}`)
      .join(", ");

    const answer = `Your total cash balance is ${this.formatCurrency(totalCash)} across ${accounts.filter(a => a.accountType !== "credit_card").length} account(s). ${accountBreakdown ? `Breakdown: ${accountBreakdown}` : ""}`;

    return {
      answer,
      data: { totalCash, accounts: accounts.length },
      queryType: "cash",
      confidence: 0.95,
    };
  }

  private async handleComparisonQuery(organizationId: string, parsed: ParsedQuery): Promise<QueryResult> {
    const { timePeriod, vendor, category } = parsed;
    
    if (!timePeriod) {
      return {
        answer: "Please specify a time period for comparison.",
        queryType: "comparison",
        confidence: 0.3,
      };
    }

    const periodDuration = timePeriod.end.getTime() - timePeriod.start.getTime();
    const previousStart = new Date(timePeriod.start.getTime() - periodDuration);
    const previousEnd = new Date(timePeriod.end.getTime() - periodDuration);

    const getSpend = async (start: Date, end: Date) => {
      const conditions: any[] = [
        eq(transactions.organizationId, organizationId),
        gte(transactions.date, start),
        lte(transactions.date, end)
      ];

      if (vendor) {
        const vendorConditions = VENDOR_ALIASES[vendor] || [vendor];
        conditions.push(
          or(
            ...vendorConditions.map(v => ilike(transactions.vendorNormalized, `%${v}%`)),
            ...vendorConditions.map(v => ilike(transactions.vendorOriginal, `%${v}%`))
          )
        );
      }

      const result = await db.select({
        totalSpend: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS numeric))), 0)`,
      })
      .from(transactions)
      .where(and(...conditions));

      return parseFloat(result[0]?.totalSpend || "0");
    };

    const currentSpend = await getSpend(timePeriod.start, timePeriod.end);
    const previousSpend = await getSpend(previousStart, previousEnd);

    const change = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : 0;
    const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "stayed the same";
    const subject = vendor ? `${vendor.toUpperCase()} spending` : "Spending";

    const answer = `${subject} ${direction} by ${Math.abs(change).toFixed(1)}% compared to the previous period. ${timePeriod.label}: ${this.formatCurrency(currentSpend)} vs Previous: ${this.formatCurrency(previousSpend)}.`;

    return {
      answer,
      data: { currentSpend, previousSpend, changePercent: change },
      queryType: "comparison",
      confidence: 0.9,
    };
  }

  private async handleGeneralQuery(organizationId: string, question: string): Promise<QueryResult> {
    return {
      answer: "I'm not sure how to answer that question. Try asking about spending, runway, burn rate, subscriptions, or specific vendors like 'What did we spend on AWS last quarter?'",
      queryType: "unknown",
      confidence: 0.3,
      details: "Supported queries: spend by vendor/category/time, runway, burn rate, recurring subscriptions, top spenders, cash balance, trends, and period comparisons.",
    };
  }
}

export const instantAnswersEngine = new InstantAnswersEngine();
