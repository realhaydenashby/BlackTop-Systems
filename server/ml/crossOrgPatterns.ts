/**
 * Cross-Organization Pattern Database
 * 
 * Anonymized financial patterns that improve all customers.
 * Collects patterns from organizations, anonymizes them, and provides
 * benchmark comparisons and pattern matching without exposing individual data.
 */

import { db } from "../db";
import { 
  crossOrgPatterns, 
  industryBenchmarks, 
  vendorPatterns, 
  seasonalPatterns,
  patternContributions,
  transactions,
  organizations,
  vendors,
} from "@shared/schema";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import { subMonths, format, startOfMonth } from "date-fns";
import * as crypto from "crypto";

// ============================================
// Types
// ============================================

interface SpendingProfile {
  categoryDistribution: Record<string, number>; // category -> percentage
  avgMonthlySpend: number;
  spendVolatility: number;
  topVendors: string[];
}

interface BenchmarkComparison {
  metricName: string;
  value: number;
  percentile: number;
  industryMedian: number;
  status: "below_average" | "average" | "above_average" | "top_performer";
}

interface PatternMatch {
  patternKey: string;
  similarity: number;
  recommendation?: string;
}

// ============================================
// Utility Functions
// ============================================

function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

function calculatePercentile(value: number, p10: number, p25: number, p50: number, p75: number, p90: number): number {
  // Guard against zero/undefined percentiles - use sensible defaults
  const safeDivide = (a: number, b: number, fallback: number = 0): number => {
    if (b === 0 || !isFinite(b)) return fallback;
    const result = a / b;
    return isFinite(result) ? result : fallback;
  };
  
  // Handle edge cases
  if (!isFinite(value)) return 50;
  if (p10 === 0 && p25 === 0 && p50 === 0) return 50; // No data
  
  if (value <= p10) {
    return p10 > 0 ? 10 * safeDivide(value, p10, 0) : 0;
  }
  if (value <= p25) {
    const range = p25 - p10;
    return range > 0 ? 10 + 15 * safeDivide(value - p10, range, 0) : 10;
  }
  if (value <= p50) {
    const range = p50 - p25;
    return range > 0 ? 25 + 25 * safeDivide(value - p25, range, 0) : 25;
  }
  if (value <= p75) {
    const range = p75 - p50;
    return range > 0 ? 50 + 25 * safeDivide(value - p50, range, 0) : 50;
  }
  if (value <= p90) {
    const range = p90 - p75;
    return range > 0 ? 75 + 15 * safeDivide(value - p75, range, 0) : 75;
  }
  // Above p90
  const extraRange = p90 > 0 ? p90 * 0.5 : 1;
  return 90 + 10 * Math.min(1, safeDivide(value - p90, extraRange, 0));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// ============================================
// Cross-Org Pattern Database
// ============================================

export class CrossOrgPatternDatabase {
  
  /**
   * Contribute anonymized patterns from an organization
   * This is called after syncs to aggregate patterns without exposing individual data
   */
  async contributePatterns(organizationId: string): Promise<{
    success: boolean;
    patternsContributed: number;
  }> {
    try {
      console.log(`[CrossOrgPatterns] Contributing patterns from org ${organizationId}`);
      
      // Get organization info for segmentation
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      });
      
      if (!org) {
        return { success: false, patternsContributed: 0 };
      }
      
      const businessType = org.businessType || "other";
      const companyStage = this.inferCompanyStage(org);
      
      let patternsContributed = 0;
      
      // Contribute spending profile patterns
      const spendingPatterns = await this.extractSpendingPatterns(organizationId, businessType, companyStage);
      patternsContributed += spendingPatterns;
      
      // Contribute seasonal patterns
      const seasonalContributed = await this.extractSeasonalPatterns(organizationId, businessType);
      patternsContributed += seasonalContributed;
      
      // Contribute vendor patterns
      const vendorContributed = await this.extractVendorPatterns(organizationId, businessType);
      patternsContributed += vendorContributed;
      
      // Record contribution
      const dataHash = hashData(`${organizationId}-${new Date().toISOString().split("T")[0]}`);
      await db.insert(patternContributions).values({
        organizationId,
        patternType: "spending_profile",
        dataHash,
      }).onConflictDoNothing();
      
      console.log(`[CrossOrgPatterns] Contributed ${patternsContributed} patterns from org ${organizationId}`);
      
      return { success: true, patternsContributed };
    } catch (error) {
      console.error("[CrossOrgPatterns] Error contributing patterns:", error);
      return { success: false, patternsContributed: 0 };
    }
  }
  
  private inferCompanyStage(org: typeof organizations.$inferSelect): string {
    // Infer stage from revenue/employee data
    const revenue = org.annualRevenue;
    if (!revenue) return "seed";
    
    if (revenue.includes("10m+") || revenue.includes("10M+")) return "growth";
    if (revenue.includes("1m") || revenue.includes("1M")) return "series-b";
    if (revenue.includes("100k") || revenue.includes("100K")) return "series-a";
    return "seed";
  }
  
  private async extractSpendingPatterns(
    organizationId: string, 
    businessType: string, 
    companyStage: string
  ): Promise<number> {
    const cutoffDate = subMonths(new Date(), 6);
    const cutoffDateStr = format(cutoffDate, "yyyy-MM-dd");
    
    // Get transaction aggregates by category (anonymized)
    const txns = await db
      .select({
        categoryId: transactions.categoryId,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, cutoffDateStr)
        )
      );
    
    if (txns.length < 10) return 0;
    
    // Calculate category distribution (anonymized percentages only)
    const categorySpend: Record<string, number> = {};
    let totalSpend = 0;
    
    for (const txn of txns) {
      const amount = Math.abs(parseFloat(txn.amount));
      const category = txn.categoryId || "uncategorized";
      categorySpend[category] = (categorySpend[category] || 0) + amount;
      totalSpend += amount;
    }
    
    // Convert to percentages
    const categoryDistribution: Record<string, number> = {};
    for (const [category, amount] of Object.entries(categorySpend)) {
      categoryDistribution[category] = totalSpend > 0 ? amount / totalSpend : 0;
    }
    
    // Check for existing pattern to do weighted merge
    const existing = await db.query.crossOrgPatterns.findFirst({
      where: and(
        eq(crossOrgPatterns.patternType, "category_distribution"),
        eq(crossOrgPatterns.businessType, businessType as any),
        eq(crossOrgPatterns.companyStage, companyStage),
        eq(crossOrgPatterns.patternKey, "category_spend_pct")
      ),
    });
    
    if (existing) {
      // Weighted average merge: combine existing pattern with new contribution
      const existingSampleSize = existing.sampleSize || 1;
      const existingValue = (existing.patternValue as Record<string, number>) || {};
      
      // Union of all categories from both patterns
      const allCategories = new Set([...Object.keys(existingValue), ...Object.keys(categoryDistribution)]);
      const mergedDistribution: Record<string, number> = {};
      
      for (const category of allCategories) {
        const oldVal = existingValue[category] || 0;
        const newVal = categoryDistribution[category] || 0;
        // Weighted average: (old * oldSampleSize + new) / (oldSampleSize + 1)
        mergedDistribution[category] = (oldVal * existingSampleSize + newVal) / (existingSampleSize + 1);
      }
      
      await db.update(crossOrgPatterns)
        .set({
          patternValue: mergedDistribution,
          sampleSize: existingSampleSize + 1,
          lastUpdated: sql`now()`,
        })
        .where(eq(crossOrgPatterns.id, existing.id));
    } else {
      // Insert new pattern
      await db.insert(crossOrgPatterns).values({
        patternType: "category_distribution",
        businessType: businessType as any,
        companyStage,
        patternKey: "category_spend_pct",
        patternValue: categoryDistribution,
        sampleSize: 1,
        confidenceScore: "0.7",
      });
    }
    
    return 1;
  }
  
  private async extractSeasonalPatterns(organizationId: string, businessType: string): Promise<number> {
    const cutoffDate = subMonths(new Date(), 12);
    const cutoffDateStr = format(cutoffDate, "yyyy-MM-dd");
    
    // Get monthly spending aggregates
    const txns = await db
      .select({
        date: transactions.date,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, cutoffDateStr)
        )
      );
    
    if (txns.length < 50) return 0;
    
    // Aggregate by month
    const monthlySpend = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    
    for (const txn of txns) {
      const month = new Date(txn.date).getMonth(); // 0-11
      const amount = Math.abs(parseFloat(txn.amount));
      monthlySpend[month] += amount;
      monthlyCounts[month]++;
    }
    
    // Calculate seasonal indices
    const avgMonthlySpend = monthlySpend.reduce((a, b) => a + b, 0) / 12;
    const seasonalIndices = monthlySpend.map(spend => 
      avgMonthlySpend > 0 ? spend / avgMonthlySpend : 1
    );
    
    // Find peak and trough months
    const maxIndex = seasonalIndices.indexOf(Math.max(...seasonalIndices));
    const minIndex = seasonalIndices.indexOf(Math.min(...seasonalIndices));
    
    // Calculate seasonal strength (variance of indices)
    const seasonalStrength = stdDev(seasonalIndices);
    
    // Check for existing seasonal pattern
    const existing = await db.query.seasonalPatterns.findFirst({
      where: and(
        eq(seasonalPatterns.businessType, businessType as any),
        eq(seasonalPatterns.metricName, "monthly_spend")
      ),
    });
    
    if (existing) {
      // Weighted average merge of seasonal indices
      const existingSampleSize = existing.sampleSize || 1;
      const existingIndices = Array.isArray(existing.seasonalIndices) 
        ? existing.seasonalIndices 
        : new Array(12).fill(1);
      
      const mergedIndices = seasonalIndices.map((newVal, i) => {
        const oldVal = existingIndices[i] || 1;
        return (oldVal * existingSampleSize + newVal) / (existingSampleSize + 1);
      });
      
      // Recalculate peaks/troughs from merged indices
      const mergedMaxIndex = mergedIndices.indexOf(Math.max(...mergedIndices));
      const mergedMinIndex = mergedIndices.indexOf(Math.min(...mergedIndices));
      const mergedStrength = stdDev(mergedIndices);
      
      await db.update(seasonalPatterns)
        .set({
          seasonalIndices: mergedIndices,
          peakMonths: [String(mergedMaxIndex + 1)],
          troughMonths: [String(mergedMinIndex + 1)],
          seasonalStrength: String(mergedStrength),
          sampleSize: existingSampleSize + 1,
          lastUpdated: sql`now()`,
        })
        .where(eq(seasonalPatterns.id, existing.id));
    } else {
      // Insert new seasonal pattern
      await db.insert(seasonalPatterns).values({
        businessType: businessType as any,
        metricName: "monthly_spend",
        seasonalIndices,
        peakMonths: [String(maxIndex + 1)],
        troughMonths: [String(minIndex + 1)],
        seasonalStrength: String(seasonalStrength),
        sampleSize: 1,
      });
    }
    
    return 1;
  }
  
  private async extractVendorPatterns(organizationId: string, businessType: string): Promise<number> {
    // Get vendor usage (anonymized - just vendor names and categories)
    const orgVendors = await db
      .select({
        normalizedName: vendors.normalizedName,
        category: vendors.category,
      })
      .from(vendors)
      .where(eq(vendors.organizationId, organizationId));
    
    if (orgVendors.length === 0) return 0;
    
    let patternsAdded = 0;
    
    for (const vendor of orgVendors) {
      if (!vendor.normalizedName) continue;
      
      // Update or insert vendor pattern
      const existing = await db.query.vendorPatterns.findFirst({
        where: eq(vendorPatterns.normalizedName, vendor.normalizedName),
      });
      
      if (existing) {
        // Update prevalence and add business type if new
        const existingTypes = existing.businessTypes || [];
        const newTypes = existingTypes.includes(businessType) 
          ? existingTypes 
          : [...existingTypes, businessType];
        
        await db.update(vendorPatterns)
          .set({
            prevalence: sql`${vendorPatterns.prevalence} + 1`,
            businessTypes: newTypes,
            lastUpdated: sql`now()`,
          })
          .where(eq(vendorPatterns.id, existing.id));
      } else {
        await db.insert(vendorPatterns).values({
          normalizedName: vendor.normalizedName,
          category: vendor.category,
          prevalence: 1,
          businessTypes: [businessType],
        });
        patternsAdded++;
      }
    }
    
    return patternsAdded;
  }
  
  /**
   * Get industry benchmarks for a business type
   */
  async getBenchmarks(businessType: string, companyStage?: string): Promise<{
    metricName: string;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    sampleSize: number;
  }[]> {
    const benchmarks = await db.query.industryBenchmarks.findMany({
      where: companyStage 
        ? and(
            eq(industryBenchmarks.businessType, businessType as any),
            eq(industryBenchmarks.companyStage, companyStage)
          )
        : eq(industryBenchmarks.businessType, businessType as any),
    });
    
    return benchmarks.map(b => ({
      metricName: b.metricName,
      p10: parseFloat(b.p10 || "0"),
      p25: parseFloat(b.p25 || "0"),
      p50: parseFloat(b.p50 || "0"),
      p75: parseFloat(b.p75 || "0"),
      p90: parseFloat(b.p90 || "0"),
      sampleSize: b.sampleSize || 0,
    }));
  }
  
  /**
   * Compare an organization's metrics against industry benchmarks
   */
  async compareToIndustry(
    organizationId: string, 
    metrics: Record<string, number>
  ): Promise<BenchmarkComparison[]> {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    
    if (!org) return [];
    
    const businessType = org.businessType || "other";
    const benchmarks = await this.getBenchmarks(businessType);
    
    const comparisons: BenchmarkComparison[] = [];
    
    for (const [metricName, value] of Object.entries(metrics)) {
      const benchmark = benchmarks.find(b => b.metricName === metricName);
      if (!benchmark) continue;
      
      const pct = calculatePercentile(
        value, 
        benchmark.p10, 
        benchmark.p25, 
        benchmark.p50, 
        benchmark.p75, 
        benchmark.p90
      );
      
      let status: BenchmarkComparison["status"];
      if (pct < 25) status = "below_average";
      else if (pct < 75) status = "average";
      else if (pct < 90) status = "above_average";
      else status = "top_performer";
      
      comparisons.push({
        metricName,
        value,
        percentile: Math.round(pct),
        industryMedian: benchmark.p50,
        status,
      });
    }
    
    return comparisons;
  }
  
  /**
   * Get seasonal patterns for a business type
   */
  async getSeasonalPatterns(businessType: string): Promise<{
    metricName: string;
    seasonalIndices: number[];
    peakMonths: number[];
    troughMonths: number[];
    seasonalStrength: number;
  }[]> {
    const patterns = await db.query.seasonalPatterns.findMany({
      where: eq(seasonalPatterns.businessType, businessType as any),
    });
    
    return patterns.map(p => ({
      metricName: p.metricName,
      seasonalIndices: Array.isArray(p.seasonalIndices) ? p.seasonalIndices : [],
      peakMonths: (p.peakMonths || []).map(m => parseInt(m)),
      troughMonths: (p.troughMonths || []).map(m => parseInt(m)),
      seasonalStrength: parseFloat(p.seasonalStrength || "0"),
    }));
  }
  
  /**
   * Get common vendors for a business type
   */
  async getCommonVendors(businessType: string, limit: number = 20): Promise<{
    name: string;
    category: string | null;
    prevalence: number;
  }[]> {
    const patterns = await db
      .select({
        normalizedName: vendorPatterns.normalizedName,
        category: vendorPatterns.category,
        prevalence: vendorPatterns.prevalence,
      })
      .from(vendorPatterns)
      .where(sql`${businessType} = ANY(${vendorPatterns.businessTypes})`)
      .orderBy(desc(vendorPatterns.prevalence))
      .limit(limit);
    
    return patterns.map(p => ({
      name: p.normalizedName,
      category: p.category,
      prevalence: p.prevalence || 0,
    }));
  }
  
  /**
   * Find similar spending patterns
   */
  async findSimilarPatterns(
    categoryDistribution: Record<string, number>,
    businessType: string
  ): Promise<PatternMatch[]> {
    const patterns = await db.query.crossOrgPatterns.findMany({
      where: and(
        eq(crossOrgPatterns.patternType, "category_distribution"),
        eq(crossOrgPatterns.businessType, businessType as any)
      ),
    });
    
    const matches: PatternMatch[] = [];
    
    for (const pattern of patterns) {
      const storedDist = pattern.patternValue as Record<string, number>;
      
      // Calculate cosine similarity
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      const allCategories = new Set([...Object.keys(categoryDistribution), ...Object.keys(storedDist)]);
      for (const cat of allCategories) {
        const a = categoryDistribution[cat] || 0;
        const b = storedDist[cat] || 0;
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
      }
      
      const similarity = (normA > 0 && normB > 0) 
        ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
        : 0;
      
      matches.push({
        patternKey: pattern.patternKey,
        similarity: Math.round(similarity * 100) / 100,
      });
    }
    
    return matches.sort((a, b) => b.similarity - a.similarity);
  }
  
  /**
   * Update industry benchmarks from aggregated data
   * This should be run periodically (e.g., weekly) to recalculate benchmarks
   */
  async updateBenchmarks(businessType: string): Promise<{
    success: boolean;
    benchmarksUpdated: number;
  }> {
    try {
      // Get all organizations of this business type
      const orgs = await db.query.organizations.findMany({
        where: eq(organizations.businessType, businessType as any),
      });
      
      if (orgs.length < 5) {
        // Need minimum sample size for meaningful benchmarks
        return { success: false, benchmarksUpdated: 0 };
      }
      
      // Collect metrics from all orgs (would integrate with metrics engine)
      // For now, this is a placeholder showing the structure
      const metricValues: Record<string, number[]> = {
        burn_rate: [],
        runway_months: [],
        gross_margin: [],
      };
      
      // Calculate and store benchmarks
      let benchmarksUpdated = 0;
      
      for (const [metricName, values] of Object.entries(metricValues)) {
        if (values.length < 5) continue;
        
        await db.insert(industryBenchmarks).values({
          businessType: businessType as any,
          metricName,
          p10: String(percentile(values, 10)),
          p25: String(percentile(values, 25)),
          p50: String(percentile(values, 50)),
          p75: String(percentile(values, 75)),
          p90: String(percentile(values, 90)),
          mean: String(mean(values)),
          stdDev: String(stdDev(values)),
          sampleSize: values.length,
        }).onConflictDoUpdate({
          target: [industryBenchmarks.businessType, industryBenchmarks.companyStage, industryBenchmarks.metricName],
          set: {
            p10: String(percentile(values, 10)),
            p25: String(percentile(values, 25)),
            p50: String(percentile(values, 50)),
            p75: String(percentile(values, 75)),
            p90: String(percentile(values, 90)),
            mean: String(mean(values)),
            stdDev: String(stdDev(values)),
            sampleSize: values.length,
            lastUpdated: sql`now()`,
          },
        });
        
        benchmarksUpdated++;
      }
      
      return { success: true, benchmarksUpdated };
    } catch (error) {
      console.error("[CrossOrgPatterns] Error updating benchmarks:", error);
      return { success: false, benchmarksUpdated: 0 };
    }
  }
  
  /**
   * Get pattern database statistics
   */
  async getStats(): Promise<{
    totalPatterns: number;
    totalBenchmarks: number;
    totalVendorPatterns: number;
    totalSeasonalPatterns: number;
    totalContributions: number;
    businessTypesCovered: string[];
  }> {
    const [patterns, benchmarks, vendorPats, seasonalPats, contributions] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(crossOrgPatterns),
      db.select({ count: sql<number>`count(*)` }).from(industryBenchmarks),
      db.select({ count: sql<number>`count(*)` }).from(vendorPatterns),
      db.select({ count: sql<number>`count(*)` }).from(seasonalPatterns),
      db.select({ count: sql<number>`count(*)` }).from(patternContributions),
    ]);
    
    const businessTypes = await db
      .selectDistinct({ businessType: crossOrgPatterns.businessType })
      .from(crossOrgPatterns);
    
    return {
      totalPatterns: patterns[0]?.count || 0,
      totalBenchmarks: benchmarks[0]?.count || 0,
      totalVendorPatterns: vendorPats[0]?.count || 0,
      totalSeasonalPatterns: seasonalPats[0]?.count || 0,
      totalContributions: contributions[0]?.count || 0,
      businessTypesCovered: businessTypes.map(b => b.businessType),
    };
  }
}

// Export singleton and helper functions
const patternDatabase = new CrossOrgPatternDatabase();

export async function contributeOrgPatterns(organizationId: string) {
  return patternDatabase.contributePatterns(organizationId);
}

export async function getIndustryBenchmarks(businessType: string, companyStage?: string) {
  return patternDatabase.getBenchmarks(businessType, companyStage);
}

export async function compareMetricsToIndustry(organizationId: string, metrics: Record<string, number>) {
  return patternDatabase.compareToIndustry(organizationId, metrics);
}

export async function getSeasonalPatternsForType(businessType: string) {
  return patternDatabase.getSeasonalPatterns(businessType);
}

export async function getCommonVendorsForType(businessType: string, limit?: number) {
  return patternDatabase.getCommonVendors(businessType, limit);
}

export async function getCrossOrgPatternStats() {
  return patternDatabase.getStats();
}

export { CrossOrgPatternDatabase };
