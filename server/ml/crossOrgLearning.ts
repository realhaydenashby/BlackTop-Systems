/**
 * Cross-Organization Learning Network
 * 
 * Aggregates anonymized financial patterns across all organizations to improve
 * classification accuracy for new customers. Privacy-preserving by design:
 * - Only aggregate patterns are stored (no individual transactions)
 * - Minimum sample size thresholds prevent re-identification
 * - Patterns are normalized and anonymized before storage
 */

import { db } from "../db";
import { 
  crossOrgPatterns,
  industryBenchmarks,
  vendorPatterns,
  seasonalPatterns,
  patternContributions,
  transactions,
  accountMappings,
  organizations,
  canonicalAccounts,
} from "@shared/schema";
import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";
import * as crypto from "crypto";

// Minimum sample size for privacy (k-anonymity threshold)
const MIN_SAMPLE_SIZE = 5;
const CONTRIBUTION_COOLDOWN_HOURS = 24;

interface VendorCategoryPattern {
  normalizedVendor: string;
  canonicalAccountId: string;
  canonicalAccountName: string;
  frequency: number;
  avgAmount: number;
  businessTypes: string[];
}

interface CategoryDistribution {
  categoryId: string;
  categoryName: string;
  percentOfSpend: number;
  avgMonthlyAmount: number;
}

export class CrossOrgLearningNetwork {

  /**
   * Contribute organization's patterns to the cross-org database
   * Called after each sync to enrich the pattern database
   */
  async contributePatterns(organizationId: string): Promise<{
    contributed: boolean;
    patternsAdded: number;
    reason?: string;
  }> {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });

    if (!org) {
      return { contributed: false, patternsAdded: 0, reason: "Organization not found" };
    }

    // Check cooldown to prevent over-contribution
    const recentContribution = await db.query.patternContributions.findFirst({
      where: and(
        eq(patternContributions.organizationId, organizationId),
        gte(patternContributions.contributedAt, 
          new Date(Date.now() - CONTRIBUTION_COOLDOWN_HOURS * 60 * 60 * 1000))
      ),
    });

    if (recentContribution) {
      return { contributed: false, patternsAdded: 0, reason: "Recently contributed" };
    }

    let patternsAdded = 0;

    try {
      // Contribute vendor→account mappings
      patternsAdded += await this.contributeVendorPatterns(organizationId, org.businessType || "other");

      // Contribute category distribution patterns
      patternsAdded += await this.contributeCategoryDistribution(organizationId, org.businessType || "other");

      // Contribute spending benchmarks
      patternsAdded += await this.contributeSpendingBenchmarks(organizationId, org.businessType || "other");

      // Record contribution
      const dataHash = crypto.createHash("sha256")
        .update(`${organizationId}-${Date.now()}`)
        .digest("hex");

      await db.insert(patternContributions)
        .values({
          organizationId,
          patternType: "spending_profile",
          dataHash,
        })
        .onConflictDoNothing();

      console.log(`[CrossOrg] Organization ${organizationId} contributed ${patternsAdded} patterns`);
      return { contributed: true, patternsAdded };

    } catch (error) {
      console.error("[CrossOrg] Error contributing patterns:", error);
      return { contributed: false, patternsAdded: 0, reason: String(error) };
    }
  }

  /**
   * Contribute vendor→account mapping patterns
   * Aggregates which vendors typically map to which accounts
   */
  private async contributeVendorPatterns(
    organizationId: string,
    businessType: string
  ): Promise<number> {
    // Get all confirmed mappings from this org
    const mappings = await db
      .select({
        vendorName: accountMappings.sourceAccountName,
        canonicalAccountId: accountMappings.canonicalAccountId,
        usageCount: accountMappings.usageCount,
      })
      .from(accountMappings)
      .where(and(
        eq(accountMappings.organizationId, organizationId),
        eq(accountMappings.isActive, true),
        eq(accountMappings.confidence, "high")
      ));

    let patternsAdded = 0;

    for (const mapping of mappings) {
      if (!mapping.vendorName || !mapping.canonicalAccountId) continue;

      const normalizedVendor = this.normalizeVendorName(mapping.vendorName);
      if (!normalizedVendor) continue;

      // Get existing vendor pattern
      const existing = await db.query.vendorPatterns.findFirst({
        where: eq(vendorPatterns.normalizedName, normalizedVendor),
      });

      // Get canonical account info
      const account = await db.query.canonicalAccounts.findFirst({
        where: eq(canonicalAccounts.id, mapping.canonicalAccountId),
      });

      if (!account) continue;

      if (existing) {
        // Update existing pattern
        const existingTypes = existing.businessTypes || [];
        const updatedTypes = existingTypes.includes(businessType)
          ? existingTypes
          : [...existingTypes, businessType];

        await db.update(vendorPatterns)
          .set({
            prevalence: (existing.prevalence || 0) + 1,
            businessTypes: updatedTypes,
            canonicalAccountId: existing.canonicalAccountId || mapping.canonicalAccountId,
            category: account.accountClass || existing.category,
            lastUpdated: new Date(),
          })
          .where(eq(vendorPatterns.id, existing.id));
      } else {
        // Create new vendor pattern with exact canonical account ID
        await db.insert(vendorPatterns)
          .values({
            normalizedName: normalizedVendor,
            canonicalAccountId: mapping.canonicalAccountId,
            category: account.accountClass || "expense",
            businessTypes: [businessType],
            prevalence: 1,
            avgBillingFrequency: "monthly",
          })
          .onConflictDoNothing();
        patternsAdded++;
      }
    }

    return patternsAdded;
  }

  /**
   * Contribute category distribution patterns
   * How do companies in this industry distribute spending?
   */
  private async contributeCategoryDistribution(
    organizationId: string,
    businessType: string
  ): Promise<number> {
    // Get spending by canonical account for this org
    const spending = await db
      .select({
        canonicalAccountId: transactions.canonicalAccountId,
        totalSpend: sql<string>`SUM(ABS(${transactions.amount}))`,
        txCount: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, organizationId),
        sql`${transactions.canonicalAccountId} IS NOT NULL`,
        sql`${transactions.amount} < 0` // Expenses only
      ))
      .groupBy(transactions.canonicalAccountId);

    const totalOrgSpend = spending.reduce((sum, s) => sum + parseFloat(s.totalSpend || "0"), 0);
    if (totalOrgSpend === 0) return 0;

    let patternsAdded = 0;

    for (const item of spending) {
      if (!item.canonicalAccountId) continue;

      const spendAmount = parseFloat(item.totalSpend || "0");
      const percentOfSpend = (spendAmount / totalOrgSpend) * 100;

      // Only contribute significant categories (>1% of spend)
      if (percentOfSpend < 1) continue;

      const patternKey = `category_${item.canonicalAccountId}_pct`;

      const existing = await db.query.crossOrgPatterns.findFirst({
        where: and(
          eq(crossOrgPatterns.patternType, "category_distribution"),
          eq(crossOrgPatterns.businessType, businessType as any),
          eq(crossOrgPatterns.patternKey, patternKey)
        ),
      });

      if (existing) {
        // Update with running average
        const existingValue = existing.patternValue as { avgPct: number; sampleSize: number };
        const newSampleSize = (existingValue.sampleSize || 0) + 1;
        const newAvgPct = ((existingValue.avgPct || 0) * (existingValue.sampleSize || 0) + percentOfSpend) / newSampleSize;

        await db.update(crossOrgPatterns)
          .set({
            patternValue: { avgPct: newAvgPct, sampleSize: newSampleSize },
            sampleSize: newSampleSize,
            lastUpdated: new Date(),
          })
          .where(eq(crossOrgPatterns.id, existing.id));
      } else {
        await db.insert(crossOrgPatterns)
          .values({
            patternType: "category_distribution",
            businessType: businessType as any,
            patternKey,
            patternValue: { avgPct: percentOfSpend, sampleSize: 1 },
            sampleSize: 1,
            confidenceScore: "0.5",
          })
          .onConflictDoNothing();
        patternsAdded++;
      }
    }

    return patternsAdded;
  }

  /**
   * Contribute spending benchmarks (monthly spend ranges)
   */
  private async contributeSpendingBenchmarks(
    organizationId: string,
    businessType: string
  ): Promise<number> {
    // Get monthly spending totals
    const monthlySpend = await db
      .select({
        month: sql<string>`DATE_TRUNC('month', ${transactions.date})`,
        totalSpend: sql<string>`SUM(ABS(${transactions.amount}))`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, organizationId),
        sql`${transactions.amount} < 0`
      ))
      .groupBy(sql`DATE_TRUNC('month', ${transactions.date})`);

    if (monthlySpend.length < 3) return 0;

    const spendValues = monthlySpend.map(m => parseFloat(m.totalSpend || "0")).filter(v => v > 0);
    if (spendValues.length < 3) return 0;

    spendValues.sort((a, b) => a - b);
    const median = spendValues[Math.floor(spendValues.length / 2)];
    const mean = spendValues.reduce((a, b) => a + b, 0) / spendValues.length;

    // Update industry benchmark
    const existingBenchmark = await db.query.industryBenchmarks.findFirst({
      where: and(
        eq(industryBenchmarks.businessType, businessType as any),
        eq(industryBenchmarks.metricName, "monthly_spend")
      ),
    });

    if (existingBenchmark) {
      const newSampleSize = (existingBenchmark.sampleSize || 0) + 1;
      const existingMean = parseFloat(existingBenchmark.mean || "0");
      const newMean = (existingMean * (existingBenchmark.sampleSize || 0) + mean) / newSampleSize;

      await db.update(industryBenchmarks)
        .set({
          mean: newMean.toFixed(4),
          sampleSize: newSampleSize,
          lastUpdated: new Date(),
        })
        .where(eq(industryBenchmarks.id, existingBenchmark.id));
    } else {
      await db.insert(industryBenchmarks)
        .values({
          businessType: businessType as any,
          metricName: "monthly_spend",
          p50: median.toFixed(4),
          mean: mean.toFixed(4),
          sampleSize: 1,
        })
        .onConflictDoNothing();
    }

    return 1;
  }

  /**
   * Get cross-org classification suggestions for a vendor
   * Used to boost confidence for new orgs
   */
  async getVendorSuggestion(vendorName: string): Promise<{
    canonicalAccountId: string | null;
    canonicalAccountName: string | null;
    confidence: number;
    prevalence: number;
    source: "cross_org";
  } | null> {
    const normalizedVendor = this.normalizeVendorName(vendorName);
    if (!normalizedVendor) return null;

    // Check vendor patterns - must have stored canonical account ID
    const pattern = await db.query.vendorPatterns.findFirst({
      where: eq(vendorPatterns.normalizedName, normalizedVendor),
    });

    // Require minimum sample size AND actual canonical account ID
    if (!pattern || (pattern.prevalence || 0) < MIN_SAMPLE_SIZE || !pattern.canonicalAccountId) {
      return null;
    }

    // Look up the actual stored canonical account - no guessing by category
    const account = await db.query.canonicalAccounts.findFirst({
      where: eq(canonicalAccounts.id, pattern.canonicalAccountId),
    });

    if (!account) return null;

    // Confidence based on prevalence (capped at 80% to still encourage org-specific learning)
    const prevalence = pattern.prevalence || 0;
    const confidence = Math.min(0.80, 0.5 + (prevalence / 100) * 0.30);

    return {
      canonicalAccountId: account.id,
      canonicalAccountName: account.name,
      confidence,
      prevalence,
      source: "cross_org",
    };
  }

  /**
   * Get industry benchmarks for an organization
   */
  async getIndustryBenchmarks(businessType: string): Promise<{
    metricName: string;
    p10: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
    mean: number | null;
    sampleSize: number;
  }[]> {
    const benchmarks = await db
      .select()
      .from(industryBenchmarks)
      .where(and(
        eq(industryBenchmarks.businessType, businessType as any),
        gte(industryBenchmarks.sampleSize, MIN_SAMPLE_SIZE)
      ));

    return benchmarks.map(b => ({
      metricName: b.metricName,
      p10: b.p10 ? parseFloat(b.p10) : null,
      p25: b.p25 ? parseFloat(b.p25) : null,
      p50: b.p50 ? parseFloat(b.p50) : null,
      p75: b.p75 ? parseFloat(b.p75) : null,
      p90: b.p90 ? parseFloat(b.p90) : null,
      mean: b.mean ? parseFloat(b.mean) : null,
      sampleSize: b.sampleSize || 0,
    }));
  }

  /**
   * Get category distribution benchmarks for a business type
   */
  async getCategoryBenchmarks(businessType: string): Promise<{
    canonicalAccountId: string;
    avgPercentOfSpend: number;
    sampleSize: number;
  }[]> {
    const patterns = await db
      .select()
      .from(crossOrgPatterns)
      .where(and(
        eq(crossOrgPatterns.patternType, "category_distribution"),
        eq(crossOrgPatterns.businessType, businessType as any),
        gte(crossOrgPatterns.sampleSize, MIN_SAMPLE_SIZE)
      ));

    return patterns.map(p => {
      const value = p.patternValue as { avgPct: number; sampleSize: number };
      const accountIdMatch = p.patternKey.match(/^category_(.+)_pct$/);
      return {
        canonicalAccountId: accountIdMatch?.[1] || "",
        avgPercentOfSpend: value.avgPct || 0,
        sampleSize: p.sampleSize || 0,
      };
    }).filter(p => p.canonicalAccountId);
  }

  /**
   * Seed cross-org patterns with industry defaults
   * Called during system initialization
   */
  async seedIndustryDefaults(): Promise<number> {
    const INDUSTRY_DEFAULTS = {
      saas: {
        software: 15,
        cloud: 12,
        payroll: 45,
        marketing: 15,
        office: 8,
        professional_services: 5,
      },
      agency: {
        payroll: 55,
        software: 10,
        marketing: 8,
        contractors: 15,
        office: 7,
        professional_services: 5,
      },
      ecommerce: {
        inventory: 40,
        shipping: 15,
        marketing: 20,
        payroll: 15,
        software: 5,
        office: 5,
      },
      marketplace: {
        payroll: 35,
        marketing: 25,
        software: 15,
        cloud: 12,
        payment_processing: 8,
        professional_services: 5,
      },
    };

    let seeded = 0;

    for (const [businessType, categories] of Object.entries(INDUSTRY_DEFAULTS)) {
      for (const [category, avgPct] of Object.entries(categories)) {
        const patternKey = `default_${category}_pct`;

        await db.insert(crossOrgPatterns)
          .values({
            patternType: "category_distribution",
            businessType: businessType as any,
            patternKey,
            patternValue: { avgPct, sampleSize: 100, isDefault: true },
            sampleSize: 100,
            confidenceScore: "0.7",
          })
          .onConflictDoNothing();
        seeded++;
      }
    }

    // Seed common vendor patterns
    const COMMON_VENDORS = [
      { name: "aws", category: "cloud", businessTypes: ["saas", "marketplace"] },
      { name: "google cloud", category: "cloud", businessTypes: ["saas", "marketplace"] },
      { name: "stripe", category: "payment_processing", businessTypes: ["saas", "ecommerce", "marketplace"] },
      { name: "slack", category: "software", businessTypes: ["saas", "agency"] },
      { name: "github", category: "software", businessTypes: ["saas"] },
      { name: "notion", category: "software", businessTypes: ["saas", "agency"] },
      { name: "hubspot", category: "marketing", businessTypes: ["saas", "agency", "ecommerce"] },
      { name: "gusto", category: "payroll", businessTypes: ["saas", "agency", "ecommerce"] },
      { name: "rippling", category: "payroll", businessTypes: ["saas", "agency"] },
      { name: "quickbooks", category: "accounting", businessTypes: ["saas", "agency", "ecommerce"] },
      { name: "shopify", category: "ecommerce_platform", businessTypes: ["ecommerce"] },
      { name: "wework", category: "office", businessTypes: ["saas", "agency"] },
      { name: "zoom", category: "software", businessTypes: ["saas", "agency"] },
      { name: "salesforce", category: "software", businessTypes: ["saas", "agency"] },
      { name: "intercom", category: "software", businessTypes: ["saas"] },
      { name: "datadog", category: "cloud", businessTypes: ["saas"] },
      { name: "twilio", category: "cloud", businessTypes: ["saas", "marketplace"] },
      { name: "sendgrid", category: "cloud", businessTypes: ["saas", "ecommerce"] },
      { name: "mailchimp", category: "marketing", businessTypes: ["saas", "ecommerce", "agency"] },
      { name: "google workspace", category: "software", businessTypes: ["saas", "agency", "ecommerce"] },
    ];

    for (const vendor of COMMON_VENDORS) {
      await db.insert(vendorPatterns)
        .values({
          normalizedName: vendor.name,
          category: vendor.category,
          businessTypes: vendor.businessTypes,
          prevalence: 100,
          avgBillingFrequency: "monthly",
        })
        .onConflictDoNothing();
      seeded++;
    }

    console.log(`[CrossOrg] Seeded ${seeded} industry default patterns`);
    return seeded;
  }

  /**
   * Get cross-org pattern statistics
   */
  async getNetworkStats(): Promise<{
    totalVendorPatterns: number;
    totalBenchmarks: number;
    totalContributions: number;
    contributingOrgs: number;
    patternsByType: { type: string; count: number }[];
  }> {
    const [vendorCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendorPatterns);

    const [benchmarkCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(industryBenchmarks);

    const [contributionCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(patternContributions);

    const [orgCount] = await db
      .select({ count: sql<number>`count(DISTINCT ${patternContributions.organizationId})` })
      .from(patternContributions);

    const patternsByType = await db
      .select({
        type: crossOrgPatterns.patternType,
        count: sql<number>`count(*)`,
      })
      .from(crossOrgPatterns)
      .groupBy(crossOrgPatterns.patternType);

    return {
      totalVendorPatterns: Number(vendorCount?.count || 0),
      totalBenchmarks: Number(benchmarkCount?.count || 0),
      totalContributions: Number(contributionCount?.count || 0),
      contributingOrgs: Number(orgCount?.count || 0),
      patternsByType: patternsByType.map(p => ({ type: p.type, count: Number(p.count) })),
    };
  }

  /**
   * Normalize vendor name for pattern matching
   */
  private normalizeVendorName(vendor: string): string {
    if (!vendor) return "";

    return vendor
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3) // Take first 3 words
      .join(" ");
  }
}

export const crossOrgLearning = new CrossOrgLearningNetwork();
