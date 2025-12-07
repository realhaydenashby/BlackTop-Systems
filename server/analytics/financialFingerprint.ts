import { db } from "../db";
import { 
  orgFeatureHistory, 
  vendorBehaviorProfiles, 
  anomalyBaselines,
  transactions,
  type OrgFeatureHistory,
  type VendorBehaviorProfile,
  type AnomalyBaseline
} from "@shared/schema";
import { eq, and, gte, desc, sql, lt } from "drizzle-orm";
import { subMonths, subWeeks, format, startOfMonth, differenceInDays } from "date-fns";
import { OrganizationFeatureStore } from "./featureStore";

export interface DriftResult {
  metric: string;
  currentValue: number;
  baselineValue: number;
  driftPercentage: number;
  driftDirection: "up" | "down" | "stable";
  significance: "high" | "medium" | "low";
  periodCompared: string;
}

export interface FinancialFingerprint {
  organizationId: string;
  computedAt: Date;
  spendingProfile: SpendingProfile;
  revenueProfile: RevenueProfile;
  vendorFingerprint: VendorFingerprint;
  behavioralPatterns: BehavioralPattern[];
  seasonalIndices: SeasonalIndex[];
  driftAnalysis: DriftResult[];
  riskIndicators: RiskIndicator[];
}

export interface SpendingProfile {
  avgMonthlySpend: number;
  spendVolatility: number;
  topCategoryConcentration: number;
  recurringSpendRatio: number;
  discretionarySpendRatio: number;
  trendDirection: "increasing" | "decreasing" | "stable";
  monthOverMonthChange: number;
}

export interface RevenueProfile {
  avgMonthlyRevenue: number;
  revenueVolatility: number;
  revenueGrowthRate: number;
  concentrationRisk: number;
  trendDirection: "increasing" | "decreasing" | "stable";
  predictability: number;
}

export interface VendorFingerprint {
  activeVendorCount: number;
  newVendorsLast30Days: number;
  churnedVendorsLast30Days: number;
  topVendorConcentration: number;
  recurringVendorRatio: number;
  avgVendorLifespan: number;
  vendorsWithPriceIncreases: number;
}

export interface BehavioralPattern {
  name: string;
  description: string;
  frequency: string;
  confidence: number;
  lastOccurred: Date | null;
  impact: "positive" | "negative" | "neutral";
}

export interface SeasonalIndex {
  month: number;
  monthName: string;
  spendIndex: number;
  revenueIndex: number;
  isHighSpend: boolean;
  isHighRevenue: boolean;
}

export interface RiskIndicator {
  type: string;
  severity: "critical" | "warning" | "info";
  description: string;
  value: number;
  threshold: number;
  trend: "improving" | "worsening" | "stable";
}

export class FinancialFingerprintEngine {
  private organizationId: string;
  private featureStore: OrganizationFeatureStore;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.featureStore = new OrganizationFeatureStore(organizationId);
  }

  async computeFingerprint(): Promise<FinancialFingerprint> {
    const txns = await this.getTransactions();
    const vendorProfiles = await this.getVendorProfiles();
    const featureHistory = await this.getFeatureHistory();

    const spendingProfile = this.computeSpendingProfile(txns);
    const revenueProfile = this.computeRevenueProfile(txns);
    const vendorFingerprint = this.computeVendorFingerprint(txns, vendorProfiles);
    const behavioralPatterns = this.detectBehavioralPatterns(txns, vendorProfiles);
    const seasonalIndices = this.computeSeasonalIndices(txns);
    const driftAnalysis = await this.computeDriftAnalysis(featureHistory);
    const riskIndicators = this.computeRiskIndicators(spendingProfile, revenueProfile, vendorFingerprint);

    await this.updateAnomalyBaselines(spendingProfile, revenueProfile);

    return {
      organizationId: this.organizationId,
      computedAt: new Date(),
      spendingProfile,
      revenueProfile,
      vendorFingerprint,
      behavioralPatterns,
      seasonalIndices,
      driftAnalysis,
      riskIndicators,
    };
  }

  private async getTransactions() {
    const sixMonthsAgo = subMonths(new Date(), 6);
    return db.query.transactions.findMany({
      where: and(
        eq(transactions.organizationId, this.organizationId),
        gte(transactions.date, format(sixMonthsAgo, "yyyy-MM-dd"))
      ),
    });
  }

  private async getVendorProfiles(): Promise<VendorBehaviorProfile[]> {
    return db.query.vendorBehaviorProfiles.findMany({
      where: eq(vendorBehaviorProfiles.organizationId, this.organizationId),
    });
  }

  private async getFeatureHistory(): Promise<OrgFeatureHistory[]> {
    const threeMonthsAgo = subMonths(new Date(), 3);
    return db.query.orgFeatureHistory.findMany({
      where: and(
        eq(orgFeatureHistory.organizationId, this.organizationId),
        gte(orgFeatureHistory.createdAt, threeMonthsAgo)
      ),
      orderBy: [desc(orgFeatureHistory.createdAt)],
    });
  }

  private computeSpendingProfile(txns: any[]): SpendingProfile {
    const expenses = txns.filter(t => parseFloat(t.amount) < 0);
    
    if (expenses.length === 0) {
      return {
        avgMonthlySpend: 0,
        spendVolatility: 0,
        topCategoryConcentration: 0,
        recurringSpendRatio: 0,
        discretionarySpendRatio: 1,
        trendDirection: "stable",
        monthOverMonthChange: 0,
      };
    }

    const now = new Date();
    const oneMonthAgo = subMonths(now, 1);
    const twoMonthsAgo = subMonths(now, 2);

    const currentMonthExpenses = expenses.filter(t => new Date(t.date) >= oneMonthAgo);
    const previousMonthExpenses = expenses.filter(t => 
      new Date(t.date) >= twoMonthsAgo && new Date(t.date) < oneMonthAgo
    );

    const currentMonthTotal = currentMonthExpenses.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    const previousMonthTotal = previousMonthExpenses.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    const monthlyTotals = new Map<string, number>();
    for (const txn of expenses) {
      const month = format(new Date(txn.date), "yyyy-MM");
      monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + Math.abs(parseFloat(txn.amount)));
    }

    const totalsArray = Array.from(monthlyTotals.values());
    const avgMonthlySpend = totalsArray.length > 0 
      ? totalsArray.reduce((a, b) => a + b, 0) / totalsArray.length 
      : 0;

    let spendVolatility = 0;
    if (totalsArray.length > 1 && avgMonthlySpend > 0) {
      const variance = totalsArray.reduce((sum, v) => sum + Math.pow(v - avgMonthlySpend, 2), 0) / totalsArray.length;
      spendVolatility = Math.sqrt(variance) / avgMonthlySpend;
    }

    const categoryTotals = new Map<string, number>();
    for (const txn of expenses) {
      const cat = txn.categoryId || "uncategorized";
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(parseFloat(txn.amount)));
    }
    const sortedCategories = Array.from(categoryTotals.values()).sort((a, b) => b - a);
    const totalSpend = sortedCategories.reduce((a, b) => a + b, 0);
    const topCategoryConcentration = totalSpend > 0 
      ? (sortedCategories[0] || 0) / totalSpend 
      : 0;

    const recurringSpend = expenses
      .filter(t => t.isRecurring)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    const recurringSpendRatio = totalSpend > 0 ? recurringSpend / totalSpend : 0;

    const monthOverMonthChange = previousMonthTotal > 0 
      ? (currentMonthTotal - previousMonthTotal) / previousMonthTotal 
      : 0;

    let trendDirection: "increasing" | "decreasing" | "stable" = "stable";
    if (monthOverMonthChange > 0.1) trendDirection = "increasing";
    else if (monthOverMonthChange < -0.1) trendDirection = "decreasing";

    return {
      avgMonthlySpend,
      spendVolatility,
      topCategoryConcentration,
      recurringSpendRatio,
      discretionarySpendRatio: 1 - recurringSpendRatio,
      trendDirection,
      monthOverMonthChange,
    };
  }

  private computeRevenueProfile(txns: any[]): RevenueProfile {
    const revenue = txns.filter(t => parseFloat(t.amount) > 0);
    
    if (revenue.length === 0) {
      return {
        avgMonthlyRevenue: 0,
        revenueVolatility: 0,
        revenueGrowthRate: 0,
        topCustomerConcentration: 0,
        recurringRevenueRatio: 0,
        revenuePredictability: 0.5,
      };
    }
    
    const now = new Date();
    const oneMonthAgo = subMonths(now, 1);
    const twoMonthsAgo = subMonths(now, 2);

    const currentMonthRevenue = revenue.filter(t => new Date(t.date) >= oneMonthAgo);
    const previousMonthRevenue = revenue.filter(t => 
      new Date(t.date) >= twoMonthsAgo && new Date(t.date) < oneMonthAgo
    );

    const currentMonthTotal = currentMonthRevenue.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const previousMonthTotal = previousMonthRevenue.reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const monthlyTotals = new Map<string, number>();
    for (const txn of revenue) {
      const month = format(new Date(txn.date), "yyyy-MM");
      monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + parseFloat(txn.amount));
    }

    const totalsArray = Array.from(monthlyTotals.values());
    const avgMonthlyRevenue = totalsArray.length > 0 
      ? totalsArray.reduce((a, b) => a + b, 0) / totalsArray.length 
      : 0;

    let revenueVolatility = 0;
    if (totalsArray.length > 1 && avgMonthlyRevenue > 0) {
      const variance = totalsArray.reduce((sum, v) => sum + Math.pow(v - avgMonthlyRevenue, 2), 0) / totalsArray.length;
      revenueVolatility = Math.sqrt(variance) / avgMonthlyRevenue;
    }

    const revenueGrowthRate = previousMonthTotal > 0 
      ? (currentMonthTotal - previousMonthTotal) / previousMonthTotal 
      : 0;

    const vendorRevenue = new Map<string, number>();
    for (const txn of revenue) {
      const vendor = txn.vendorId || txn.normalizedName || "unknown";
      vendorRevenue.set(vendor, (vendorRevenue.get(vendor) || 0) + parseFloat(txn.amount));
    }
    const sortedVendors = Array.from(vendorRevenue.values()).sort((a, b) => b - a);
    const totalRevenue = sortedVendors.reduce((a, b) => a + b, 0);
    const concentrationRisk = totalRevenue > 0 && sortedVendors.length > 0
      ? sortedVendors.slice(0, 3).reduce((a, b) => a + b, 0) / totalRevenue
      : 0;

    let trendDirection: "increasing" | "decreasing" | "stable" = "stable";
    if (revenueGrowthRate > 0.05) trendDirection = "increasing";
    else if (revenueGrowthRate < -0.05) trendDirection = "decreasing";

    const predictability = 1 - revenueVolatility;

    return {
      avgMonthlyRevenue,
      revenueVolatility,
      revenueGrowthRate,
      concentrationRisk,
      trendDirection,
      predictability: Math.max(0, Math.min(1, predictability)),
    };
  }

  private computeVendorFingerprint(txns: any[], vendorProfiles: VendorBehaviorProfile[]): VendorFingerprint {
    const now = new Date();
    const thirtyDaysAgo = subMonths(now, 1);
    const sixtyDaysAgo = subMonths(now, 2);

    const activeVendors = new Set<string>();
    const last30DaysVendors = new Set<string>();
    const prev30DaysVendors = new Set<string>();

    for (const txn of txns) {
      const vendor = txn.vendorId || txn.normalizedName;
      if (!vendor) continue;
      
      activeVendors.add(vendor);
      const txnDate = new Date(txn.date);
      
      if (txnDate >= thirtyDaysAgo) {
        last30DaysVendors.add(vendor);
      } else if (txnDate >= sixtyDaysAgo) {
        prev30DaysVendors.add(vendor);
      }
    }

    const newVendors = [...last30DaysVendors].filter(v => !prev30DaysVendors.has(v));
    const churnedVendors = [...prev30DaysVendors].filter(v => !last30DaysVendors.has(v));

    const vendorSpend = new Map<string, number>();
    for (const txn of txns.filter(t => parseFloat(t.amount) < 0)) {
      const vendor = txn.vendorId || txn.normalizedName;
      if (!vendor) continue;
      vendorSpend.set(vendor, (vendorSpend.get(vendor) || 0) + Math.abs(parseFloat(txn.amount)));
    }
    const sortedSpend = Array.from(vendorSpend.values()).sort((a, b) => b - a);
    const totalSpend = sortedSpend.reduce((a, b) => a + b, 0);
    const topVendorConcentration = totalSpend > 0 && sortedSpend.length > 0
      ? sortedSpend.slice(0, 5).reduce((a, b) => a + b, 0) / totalSpend
      : 0;

    const recurringVendors = vendorProfiles.filter(v => v.isRecurring).length;
    const recurringVendorRatio = vendorProfiles.length > 0 
      ? recurringVendors / vendorProfiles.length 
      : 0;

    const lifespans = vendorProfiles
      .filter(v => v.firstSeen && v.lastSeen)
      .map(v => differenceInDays(v.lastSeen!, v.firstSeen!));
    const avgVendorLifespan = lifespans.length > 0 
      ? lifespans.reduce((a, b) => a + b, 0) / lifespans.length 
      : 0;

    const vendorsWithPriceIncreases = vendorProfiles.filter(v => v.priceIncreaseCount && v.priceIncreaseCount > 0).length;

    return {
      activeVendorCount: activeVendors.size,
      newVendorsLast30Days: newVendors.length,
      churnedVendorsLast30Days: churnedVendors.length,
      topVendorConcentration,
      recurringVendorRatio,
      avgVendorLifespan,
      vendorsWithPriceIncreases,
    };
  }

  private detectBehavioralPatterns(txns: any[], vendorProfiles: VendorBehaviorProfile[]): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = [];

    const recurringCount = vendorProfiles.filter(v => v.isRecurring).length;
    if (recurringCount > 10) {
      patterns.push({
        name: "subscription_heavy",
        description: `High reliance on subscriptions (${recurringCount} recurring vendors)`,
        frequency: "ongoing",
        confidence: 0.9,
        lastOccurred: new Date(),
        impact: "neutral",
      });
    }

    const expenses = txns.filter(t => parseFloat(t.amount) < 0);
    const endOfMonthExpenses = expenses.filter(t => {
      const day = new Date(t.date).getDate();
      return day >= 25;
    });
    if (endOfMonthExpenses.length / expenses.length > 0.3) {
      patterns.push({
        name: "end_of_month_spending",
        description: "Significant spending concentration at month end",
        frequency: "monthly",
        confidence: 0.75,
        lastOccurred: expenses.length > 0 ? new Date(expenses[expenses.length - 1].date) : null,
        impact: "neutral",
      });
    }

    const categoryGrowth = new Map<string, number[]>();
    for (const txn of expenses) {
      const cat = txn.categoryId || "other";
      const month = format(new Date(txn.date), "yyyy-MM");
      if (!categoryGrowth.has(cat)) categoryGrowth.set(cat, []);
      categoryGrowth.get(cat)!.push(Math.abs(parseFloat(txn.amount)));
    }

    for (const [cat, amounts] of categoryGrowth) {
      if (amounts.length >= 3) {
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const recent = amounts.slice(-3).reduce((a, b) => a + b, 0) / 3;
        if (recent > avg * 1.5) {
          patterns.push({
            name: "category_growth_spike",
            description: `Category "${cat}" showing rapid growth (${((recent / avg - 1) * 100).toFixed(0)}% above average)`,
            frequency: "recent",
            confidence: 0.7,
            lastOccurred: new Date(),
            impact: "negative",
          });
        }
      }
    }

    const priceIncreaseVendors = vendorProfiles.filter(v => v.priceIncreaseCount && v.priceIncreaseCount > 1);
    if (priceIncreaseVendors.length >= 3) {
      patterns.push({
        name: "vendor_price_inflation",
        description: `Multiple vendors (${priceIncreaseVendors.length}) have raised prices`,
        frequency: "ongoing",
        confidence: 0.85,
        lastOccurred: new Date(),
        impact: "negative",
      });
    }

    return patterns;
  }

  private computeSeasonalIndices(txns: any[]): SeasonalIndex[] {
    const monthlySpend = new Map<number, number[]>();
    const monthlyRevenue = new Map<number, number[]>();

    for (const txn of txns) {
      const month = new Date(txn.date).getMonth();
      const amount = parseFloat(txn.amount);
      
      if (amount < 0) {
        if (!monthlySpend.has(month)) monthlySpend.set(month, []);
        monthlySpend.get(month)!.push(Math.abs(amount));
      } else {
        if (!monthlyRevenue.has(month)) monthlyRevenue.set(month, []);
        monthlyRevenue.get(month)!.push(amount);
      }
    }

    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];

    const avgSpendPerMonth = new Map<number, number>();
    const avgRevenuePerMonth = new Map<number, number>();

    for (let m = 0; m < 12; m++) {
      const spendValues = monthlySpend.get(m) || [0];
      const revenueValues = monthlyRevenue.get(m) || [0];
      avgSpendPerMonth.set(m, spendValues.reduce((a, b) => a + b, 0) / Math.max(1, spendValues.length));
      avgRevenuePerMonth.set(m, revenueValues.reduce((a, b) => a + b, 0) / Math.max(1, revenueValues.length));
    }

    const avgSpendOverall = Array.from(avgSpendPerMonth.values()).reduce((a, b) => a + b, 0) / 12;
    const avgRevenueOverall = Array.from(avgRevenuePerMonth.values()).reduce((a, b) => a + b, 0) / 12;

    const indices: SeasonalIndex[] = [];
    for (let m = 0; m < 12; m++) {
      const spendIndex = avgSpendOverall > 0 ? (avgSpendPerMonth.get(m) || 0) / avgSpendOverall : 1;
      const revenueIndex = avgRevenueOverall > 0 ? (avgRevenuePerMonth.get(m) || 0) / avgRevenueOverall : 1;

      indices.push({
        month: m,
        monthName: monthNames[m],
        spendIndex,
        revenueIndex,
        isHighSpend: spendIndex > 1.2,
        isHighRevenue: revenueIndex > 1.2,
      });
    }

    return indices;
  }

  private async computeDriftAnalysis(featureHistory: OrgFeatureHistory[]): Promise<DriftResult[]> {
    const driftResults: DriftResult[] = [];
    const featuresByName = new Map<string, OrgFeatureHistory[]>();

    for (const feature of featureHistory) {
      if (!featuresByName.has(feature.featureName)) {
        featuresByName.set(feature.featureName, []);
      }
      featuresByName.get(feature.featureName)!.push(feature);
    }

    for (const [name, features] of featuresByName) {
      if (features.length < 2) continue;

      const sorted = features.sort((a, b) => 
        new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      );

      const current = parseFloat(sorted[0].value);
      const baseline = parseFloat(sorted[sorted.length - 1].value);

      if (baseline === 0) continue;

      const driftPercentage = ((current - baseline) / Math.abs(baseline)) * 100;
      
      let driftDirection: "up" | "down" | "stable" = "stable";
      if (driftPercentage > 5) driftDirection = "up";
      else if (driftPercentage < -5) driftDirection = "down";

      let significance: "high" | "medium" | "low" = "low";
      if (Math.abs(driftPercentage) > 30) significance = "high";
      else if (Math.abs(driftPercentage) > 15) significance = "medium";

      driftResults.push({
        metric: name,
        currentValue: current,
        baselineValue: baseline,
        driftPercentage,
        driftDirection,
        significance,
        periodCompared: `Last ${sorted.length} snapshots`,
      });
    }

    return driftResults.sort((a, b) => Math.abs(b.driftPercentage) - Math.abs(a.driftPercentage));
  }

  private computeRiskIndicators(
    spending: SpendingProfile, 
    revenue: RevenueProfile, 
    vendors: VendorFingerprint
  ): RiskIndicator[] {
    const risks: RiskIndicator[] = [];

    if (spending.spendVolatility > 0.4) {
      risks.push({
        type: "spend_volatility",
        severity: spending.spendVolatility > 0.6 ? "critical" : "warning",
        description: "High spending volatility makes forecasting unreliable",
        value: spending.spendVolatility,
        threshold: 0.4,
        trend: spending.trendDirection === "increasing" ? "worsening" : "stable",
      });
    }

    if (spending.topCategoryConcentration > 0.5) {
      risks.push({
        type: "category_concentration",
        severity: spending.topCategoryConcentration > 0.7 ? "warning" : "info",
        description: "Spending concentrated in one category",
        value: spending.topCategoryConcentration,
        threshold: 0.5,
        trend: "stable",
      });
    }

    if (revenue.concentrationRisk > 0.8) {
      risks.push({
        type: "revenue_concentration",
        severity: "critical",
        description: "Revenue heavily dependent on top customers",
        value: revenue.concentrationRisk,
        threshold: 0.8,
        trend: "stable",
      });
    }

    if (revenue.revenueVolatility > 0.3) {
      risks.push({
        type: "revenue_volatility",
        severity: revenue.revenueVolatility > 0.5 ? "critical" : "warning",
        description: "Unpredictable revenue stream",
        value: revenue.revenueVolatility,
        threshold: 0.3,
        trend: revenue.trendDirection === "decreasing" ? "worsening" : "stable",
      });
    }

    if (vendors.vendorsWithPriceIncreases > 5) {
      risks.push({
        type: "vendor_inflation",
        severity: vendors.vendorsWithPriceIncreases > 10 ? "warning" : "info",
        description: `${vendors.vendorsWithPriceIncreases} vendors have raised prices`,
        value: vendors.vendorsWithPriceIncreases,
        threshold: 5,
        trend: "worsening",
      });
    }

    if (vendors.topVendorConcentration > 0.6) {
      risks.push({
        type: "vendor_dependency",
        severity: vendors.topVendorConcentration > 0.8 ? "critical" : "warning",
        description: "High dependency on top vendors",
        value: vendors.topVendorConcentration,
        threshold: 0.6,
        trend: "stable",
      });
    }

    return risks.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private async updateAnomalyBaselines(spending: SpendingProfile, revenue: RevenueProfile): Promise<void> {
    const metrics = [
      { name: "monthly_spend", mean: spending.avgMonthlySpend, stdDev: spending.avgMonthlySpend * spending.spendVolatility },
      { name: "monthly_revenue", mean: revenue.avgMonthlyRevenue, stdDev: revenue.avgMonthlyRevenue * revenue.revenueVolatility },
    ];

    for (const metric of metrics) {
      const existing = await db.query.anomalyBaselines.findFirst({
        where: and(
          eq(anomalyBaselines.organizationId, this.organizationId),
          eq(anomalyBaselines.metricName, metric.name)
        ),
      });

      if (existing) {
        await db.update(anomalyBaselines)
          .set({
            mean: metric.mean.toString(),
            stdDev: metric.stdDev.toString(),
            upperThreshold: (metric.mean + 2 * metric.stdDev).toString(),
            lowerThreshold: Math.max(0, metric.mean - 2 * metric.stdDev).toString(),
            sampleCount: sql`COALESCE(${anomalyBaselines.sampleCount}, 0) + 1`,
            lastUpdated: new Date(),
          })
          .where(eq(anomalyBaselines.id, existing.id));
      } else {
        await db.insert(anomalyBaselines).values({
          organizationId: this.organizationId,
          metricName: metric.name,
          mean: metric.mean.toString(),
          stdDev: metric.stdDev.toString(),
          upperThreshold: (metric.mean + 2 * metric.stdDev).toString(),
          lowerThreshold: Math.max(0, metric.mean - 2 * metric.stdDev).toString(),
          sampleCount: 1,
          windowDays: 30,
        });
      }
    }
  }
}

export const createFinancialFingerprintEngine = (organizationId: string) => new FinancialFingerprintEngine(organizationId);
