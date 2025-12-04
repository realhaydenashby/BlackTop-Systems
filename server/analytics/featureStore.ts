import { storage } from "../storage";
import type { Transaction, OrgFeatureHistory, VendorBehaviorProfile, InsertOrgFeatureHistory, InsertVendorBehaviorProfile } from "@shared/schema";
import { subMonths, startOfMonth, format, differenceInDays } from "date-fns";

export interface FeatureSet {
  organizationFeatures: OrganizationFeature[];
  vendorProfiles: VendorProfile[];
  contextSummary: ContextSummary;
}

export interface OrganizationFeature {
  name: string;
  value: number;
  trend: "increasing" | "decreasing" | "stable" | "volatile";
  trendStrength: number;
  rollingMean: number;
  rollingStdDev: number;
  seasonalIndex: number | null;
  periodStart: Date;
  periodEnd: Date;
}

export interface VendorProfile {
  vendorId: string | null;
  vendorName: string;
  avgMonthlySpend: number;
  spendVolatility: number;
  typicalBillingDay: number | null;
  billingFrequency: string;
  isRecurring: boolean;
  transactionCount: number;
  priceIncreaseCount: number;
  lastPriceChange: number | null;
  firstSeen: Date;
  lastSeen: Date;
}

export interface ContextSummary {
  totalMonthlySpend: number;
  totalMonthlyRevenue: number;
  avgTransactionSize: number;
  vendorCount: number;
  recurringVendorCount: number;
  topCategories: { category: string; amount: number }[];
  spendTrend: "increasing" | "decreasing" | "stable";
  seasonalPattern: string | null;
}

export class OrganizationFeatureStore {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  async computeAndStoreFeatures(): Promise<FeatureSet> {
    const txns = await storage.getOrganizationTransactions(this.organizationId);
    const now = new Date();

    const orgFeatures = await this.computeOrganizationFeatures(txns, now);
    const vendorProfiles = await this.computeVendorProfiles(txns, now);
    const contextSummary = this.computeContextSummary(txns, orgFeatures, vendorProfiles);

    for (const feature of orgFeatures) {
      await this.saveOrgFeature(feature);
    }

    for (const profile of vendorProfiles) {
      await this.saveVendorProfile(profile);
    }

    return {
      organizationFeatures: orgFeatures,
      vendorProfiles,
      contextSummary,
    };
  }

  private async computeOrganizationFeatures(
    txns: Transaction[],
    now: Date
  ): Promise<OrganizationFeature[]> {
    const features: OrganizationFeature[] = [];
    const periodEnd = now;
    const periodStart = subMonths(now, 1);

    const dailySpend = this.computeDailyAggregates(txns, "expense");
    if (dailySpend.length > 0) {
      features.push(this.createFeature("avg_daily_spend", dailySpend, periodStart, periodEnd));
    }

    const dailyRevenue = this.computeDailyAggregates(txns, "revenue");
    if (dailyRevenue.length > 0) {
      features.push(this.createFeature("avg_daily_revenue", dailyRevenue, periodStart, periodEnd));
    }

    const vendorCounts = this.computeMonthlyVendorCounts(txns);
    if (vendorCounts.length > 0) {
      features.push(this.createFeature("unique_vendors", vendorCounts, periodStart, periodEnd));
    }

    const txnCounts = this.computeMonthlyTransactionCounts(txns);
    if (txnCounts.length > 0) {
      features.push(this.createFeature("transaction_count", txnCounts, periodStart, periodEnd));
    }

    const recurringRatio = this.computeRecurringRatio(txns);
    features.push({
      name: "recurring_spend_ratio",
      value: recurringRatio,
      trend: "stable",
      trendStrength: 0,
      rollingMean: recurringRatio,
      rollingStdDev: 0,
      seasonalIndex: null,
      periodStart,
      periodEnd,
    });

    const avgTxnSize = this.computeAverageTransactionSize(txns);
    if (avgTxnSize.length > 0) {
      features.push(this.createFeature("avg_transaction_size", avgTxnSize, periodStart, periodEnd));
    }

    return features;
  }

  private createFeature(
    name: string,
    values: number[],
    periodStart: Date,
    periodEnd: Date
  ): OrganizationFeature {
    const { mean, stdDev, trend, trendStrength } = this.computeStatistics(values);
    const seasonalIndex = this.computeSeasonalIndex(values);

    return {
      name,
      value: values[values.length - 1] || 0,
      trend,
      trendStrength,
      rollingMean: mean,
      rollingStdDev: stdDev,
      seasonalIndex,
      periodStart,
      periodEnd,
    };
  }

  private computeStatistics(values: number[]): {
    mean: number;
    stdDev: number;
    trend: "increasing" | "decreasing" | "stable" | "volatile";
    trendStrength: number;
  } {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0, trend: "stable", trendStrength: 0 };
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const coeffOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : 0;

    if (coeffOfVariation > 0.5) {
      return { mean, stdDev, trend: "volatile", trendStrength: coeffOfVariation };
    }

    if (values.length < 3) {
      return { mean, stdDev, trend: "stable", trendStrength: 0 };
    }

    const n = values.length;
    const xValues = values.map((_, i) => i);
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((acc, x, i) => acc + x * values[i], 0);
    const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const normalizedSlope = mean !== 0 ? slope / Math.abs(mean) : slope;

    let trend: "increasing" | "decreasing" | "stable" | "volatile" = "stable";
    if (normalizedSlope > 0.05) trend = "increasing";
    else if (normalizedSlope < -0.05) trend = "decreasing";

    return { mean, stdDev, trend, trendStrength: Math.abs(normalizedSlope) };
  }

  private computeSeasonalIndex(values: number[]): number | null {
    if (values.length < 12) return null;

    const monthlyAverages: number[] = [];
    for (let i = 0; i < 12; i++) {
      const monthValues = values.filter((_, idx) => idx % 12 === i);
      if (monthValues.length > 0) {
        monthlyAverages.push(monthValues.reduce((a, b) => a + b, 0) / monthValues.length);
      }
    }

    if (monthlyAverages.length < 12) return null;

    const overallMean = monthlyAverages.reduce((a, b) => a + b, 0) / 12;
    const currentMonthIdx = new Date().getMonth();
    const currentMonthAvg = monthlyAverages[currentMonthIdx];

    return overallMean !== 0 ? currentMonthAvg / overallMean : 1;
  }

  private computeDailyAggregates(txns: Transaction[], type: "expense" | "revenue"): number[] {
    const dailyMap = new Map<string, number>();

    for (const txn of txns) {
      const amount = parseFloat(txn.amount);
      const isExpense = amount < 0;
      const isRevenue = amount > 0;

      if ((type === "expense" && !isExpense) || (type === "revenue" && !isRevenue)) {
        continue;
      }

      const dateKey = format(new Date(txn.date), "yyyy-MM-dd");
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + Math.abs(amount));
    }

    const sortedDates = Array.from(dailyMap.keys()).sort();
    return sortedDates.map((d) => dailyMap.get(d) || 0);
  }

  private computeMonthlyVendorCounts(txns: Transaction[]): number[] {
    const monthlyVendors = new Map<string, Set<string>>();

    for (const txn of txns) {
      if (!txn.vendorId) continue;
      const monthKey = format(new Date(txn.date), "yyyy-MM");

      if (!monthlyVendors.has(monthKey)) {
        monthlyVendors.set(monthKey, new Set());
      }
      monthlyVendors.get(monthKey)!.add(txn.vendorId);
    }

    const sortedMonths = Array.from(monthlyVendors.keys()).sort();
    return sortedMonths.map((m) => monthlyVendors.get(m)!.size);
  }

  private computeMonthlyTransactionCounts(txns: Transaction[]): number[] {
    const monthlyCounts = new Map<string, number>();

    for (const txn of txns) {
      const monthKey = format(new Date(txn.date), "yyyy-MM");
      monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + 1);
    }

    const sortedMonths = Array.from(monthlyCounts.keys()).sort();
    return sortedMonths.map((m) => monthlyCounts.get(m) || 0);
  }

  private computeRecurringRatio(txns: Transaction[]): number {
    const expenses = txns.filter((t) => parseFloat(t.amount) < 0);
    if (expenses.length === 0) return 0;

    const recurring = expenses.filter((t) => t.isRecurring);
    const recurringTotal = recurring.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    return totalExpenses > 0 ? recurringTotal / totalExpenses : 0;
  }

  private computeAverageTransactionSize(txns: Transaction[]): number[] {
    const monthlyTotals = new Map<string, { sum: number; count: number }>();

    for (const txn of txns) {
      const monthKey = format(new Date(txn.date), "yyyy-MM");
      if (!monthlyTotals.has(monthKey)) {
        monthlyTotals.set(monthKey, { sum: 0, count: 0 });
      }
      const data = monthlyTotals.get(monthKey)!;
      data.sum += Math.abs(parseFloat(txn.amount));
      data.count++;
    }

    const sortedMonths = Array.from(monthlyTotals.keys()).sort();
    return sortedMonths.map((m) => {
      const data = monthlyTotals.get(m)!;
      return data.count > 0 ? data.sum / data.count : 0;
    });
  }

  private async computeVendorProfiles(
    txns: Transaction[],
    now: Date
  ): Promise<VendorProfile[]> {
    const vendorData = new Map<
      string,
      {
        vendorId: string | null;
        name: string;
        monthlySpend: Map<string, number>;
        billingDays: number[];
        firstDate: Date;
        lastDate: Date;
        isRecurring: boolean;
        txnCount: number;
      }
    >();

    for (const txn of txns) {
      const vendorKey = txn.vendorId || txn.description || "Unknown";
      const amount = parseFloat(txn.amount);

      if (amount >= 0) continue;

      if (!vendorData.has(vendorKey)) {
        vendorData.set(vendorKey, {
          vendorId: txn.vendorId,
          name: txn.description || "Unknown Vendor",
          monthlySpend: new Map(),
          billingDays: [],
          firstDate: new Date(txn.date),
          lastDate: new Date(txn.date),
          isRecurring: txn.isRecurring || false,
          txnCount: 0,
        });
      }

      const data = vendorData.get(vendorKey)!;
      const monthKey = format(new Date(txn.date), "yyyy-MM");
      data.monthlySpend.set(monthKey, (data.monthlySpend.get(monthKey) || 0) + Math.abs(amount));
      data.billingDays.push(new Date(txn.date).getDate());
      data.txnCount++;

      const txnDate = new Date(txn.date);
      if (txnDate < data.firstDate) data.firstDate = txnDate;
      if (txnDate > data.lastDate) data.lastDate = txnDate;

      if (txn.isRecurring) data.isRecurring = true;
    }

    const profiles: VendorProfile[] = [];

    for (const [, data] of vendorData) {
      const monthlyValues = Array.from(data.monthlySpend.values());
      const avgMonthlySpend =
        monthlyValues.length > 0 ? monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length : 0;

      let spendVolatility = 0;
      if (monthlyValues.length > 1 && avgMonthlySpend > 0) {
        const variance = monthlyValues.reduce((sum, v) => sum + Math.pow(v - avgMonthlySpend, 2), 0) / monthlyValues.length;
        spendVolatility = Math.sqrt(variance) / avgMonthlySpend;
      }

      const typicalBillingDay =
        data.billingDays.length > 0
          ? Math.round(data.billingDays.reduce((a, b) => a + b, 0) / data.billingDays.length)
          : null;

      const monthsActive = data.monthlySpend.size;
      let billingFrequency = "irregular";
      if (data.isRecurring) {
        billingFrequency = "monthly";
      } else if (monthsActive >= 3 && spendVolatility < 0.2) {
        billingFrequency = "monthly";
      } else if (monthsActive >= 4 && data.txnCount <= monthsActive / 3) {
        billingFrequency = "quarterly";
      }

      const sortedMonths = Array.from(data.monthlySpend.keys()).sort();
      let priceIncreaseCount = 0;
      let lastPriceChange: number | null = null;

      for (let i = 1; i < sortedMonths.length; i++) {
        const prev = data.monthlySpend.get(sortedMonths[i - 1]) || 0;
        const curr = data.monthlySpend.get(sortedMonths[i]) || 0;
        if (prev > 0) {
          const change = (curr - prev) / prev;
          if (change > 0.1) {
            priceIncreaseCount++;
            lastPriceChange = change;
          }
        }
      }

      profiles.push({
        vendorId: data.vendorId,
        vendorName: data.name,
        avgMonthlySpend,
        spendVolatility,
        typicalBillingDay,
        billingFrequency,
        isRecurring: data.isRecurring,
        transactionCount: data.txnCount,
        priceIncreaseCount,
        lastPriceChange,
        firstSeen: data.firstDate,
        lastSeen: data.lastDate,
      });
    }

    return profiles.sort((a, b) => b.avgMonthlySpend - a.avgMonthlySpend);
  }

  private computeContextSummary(
    txns: Transaction[],
    orgFeatures: OrganizationFeature[],
    vendorProfiles: VendorProfile[]
  ): ContextSummary {
    const recentTxns = txns.filter(
      (t) => new Date(t.date) >= subMonths(new Date(), 1)
    );

    const expenses = recentTxns.filter((t) => parseFloat(t.amount) < 0);
    const revenue = recentTxns.filter((t) => parseFloat(t.amount) > 0);

    const totalMonthlySpend = expenses.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    const totalMonthlyRevenue = revenue.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const avgTransactionSize =
      recentTxns.length > 0
        ? recentTxns.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0) / recentTxns.length
        : 0;

    const categorySpend = new Map<string, number>();
    for (const txn of expenses) {
      const category = txn.categoryId || "uncategorized";
      categorySpend.set(category, (categorySpend.get(category) || 0) + Math.abs(parseFloat(txn.amount)));
    }

    const topCategories = Array.from(categorySpend.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const spendFeature = orgFeatures.find((f) => f.name === "avg_daily_spend");
    const spendTrend = spendFeature?.trend === "volatile" ? "stable" : spendFeature?.trend || "stable";

    return {
      totalMonthlySpend,
      totalMonthlyRevenue,
      avgTransactionSize,
      vendorCount: vendorProfiles.length,
      recurringVendorCount: vendorProfiles.filter((v) => v.isRecurring).length,
      topCategories,
      spendTrend: spendTrend as "increasing" | "decreasing" | "stable",
      seasonalPattern: null,
    };
  }

  private async saveOrgFeature(feature: OrganizationFeature): Promise<void> {
    const data: InsertOrgFeatureHistory = {
      organizationId: this.organizationId,
      featureName: feature.name,
      value: feature.value.toString(),
      trend: feature.trend,
      trendStrength: feature.trendStrength.toString(),
      rollingMean: feature.rollingMean.toString(),
      rollingStdDev: feature.rollingStdDev.toString(),
      seasonalIndex: feature.seasonalIndex?.toString() || null,
      periodStart: feature.periodStart,
      periodEnd: feature.periodEnd,
    };

    await storage.createOrgFeatureHistory(data);
  }

  private async saveVendorProfile(profile: VendorProfile): Promise<void> {
    const data: InsertVendorBehaviorProfile = {
      organizationId: this.organizationId,
      vendorId: profile.vendorId,
      vendorName: profile.vendorName,
      avgMonthlySpend: profile.avgMonthlySpend.toString(),
      spendVolatility: profile.spendVolatility.toString(),
      typicalBillingDay: profile.typicalBillingDay,
      billingFrequency: profile.billingFrequency,
      isRecurring: profile.isRecurring,
      firstSeen: profile.firstSeen,
      lastSeen: profile.lastSeen,
      transactionCount: profile.transactionCount,
      priceIncreaseCount: profile.priceIncreaseCount,
      lastPriceChange: profile.lastPriceChange?.toString() || null,
    };

    await storage.upsertVendorBehaviorProfile(data);
  }

  async getContextForAI(): Promise<string> {
    const featureSet = await this.computeAndStoreFeatures();

    let context = `## Organization Financial Context\n\n`;
    context += `### Summary\n`;
    context += `- Monthly Spend: $${featureSet.contextSummary.totalMonthlySpend.toLocaleString()}\n`;
    context += `- Monthly Revenue: $${featureSet.contextSummary.totalMonthlyRevenue.toLocaleString()}\n`;
    context += `- Net Cash Flow: $${(featureSet.contextSummary.totalMonthlyRevenue - featureSet.contextSummary.totalMonthlySpend).toLocaleString()}\n`;
    context += `- Spend Trend: ${featureSet.contextSummary.spendTrend}\n`;
    context += `- Active Vendors: ${featureSet.contextSummary.vendorCount} (${featureSet.contextSummary.recurringVendorCount} recurring)\n\n`;

    context += `### Key Metrics & Trends\n`;
    for (const feature of featureSet.organizationFeatures) {
      context += `- ${feature.name}: ${feature.value.toFixed(2)} (${feature.trend}, strength: ${(feature.trendStrength * 100).toFixed(1)}%)\n`;
    }

    context += `\n### Top Spending Categories\n`;
    for (const cat of featureSet.contextSummary.topCategories) {
      context += `- ${cat.category}: $${cat.amount.toLocaleString()}\n`;
    }

    context += `\n### Top Vendors by Spend\n`;
    for (const vendor of featureSet.vendorProfiles.slice(0, 10)) {
      const recurring = vendor.isRecurring ? " (recurring)" : "";
      const priceChange = vendor.priceIncreaseCount > 0 ? ` [${vendor.priceIncreaseCount} price increases]` : "";
      context += `- ${vendor.vendorName}: $${vendor.avgMonthlySpend.toLocaleString()}/mo${recurring}${priceChange}\n`;
    }

    return context;
  }
}

export function createFeatureStore(organizationId: string): OrganizationFeatureStore {
  return new OrganizationFeatureStore(organizationId);
}
