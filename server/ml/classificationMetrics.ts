import { db } from "../db";
import { transactions, canonicalAccounts, mappingFeedback } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, isNotNull } from "drizzle-orm";
import { startOfDay, subDays, format } from "date-fns";

export interface CategoryMetrics {
  categoryId: string;
  categoryName: string;
  totalPredictions: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  avgConfidence: number;
}

export interface MetricsSnapshot {
  date: string;
  overallAccuracy: number;
  overallPrecision: number;
  overallRecall: number;
  overallF1: number;
  totalReviewed: number;
  approvedCount: number;
  correctedCount: number;
}

export interface ClassificationDashboard {
  current: {
    overallAccuracy: number;
    overallPrecision: number;
    overallRecall: number;
    overallF1: number;
    totalClassified: number;
    highConfidenceRate: number;
    humanCorrectionRate: number;
  };
  byCategory: CategoryMetrics[];
  history: MetricsSnapshot[];
  improvements: {
    accuracyChange7d: number;
    precisionChange7d: number;
    correctionRateChange7d: number;
  };
  insights: string[];
}

export class ClassificationMetricsEngine {
  
  async getDashboard(organizationId: string): Promise<ClassificationDashboard> {
    const byCategory = await this.getCategoryMetrics(organizationId);
    const history = await this.getMetricsHistory(organizationId, 30);
    const current = await this.getCurrentMetrics(organizationId);
    const improvements = this.calculateImprovements(history);
    const insights = this.generateInsights(current, byCategory, improvements);

    return {
      current,
      byCategory,
      history,
      improvements,
      insights,
    };
  }

  async getCurrentMetrics(organizationId: string): Promise<ClassificationDashboard["current"]> {
    // Get transaction stats - use canonicalAccountId for classification tracking
    const txStats = await db.select({
      total: sql<number>`COUNT(*)`,
      classified: sql<number>`SUM(CASE WHEN ${transactions.canonicalAccountId} IS NOT NULL THEN 1 ELSE 0 END)`,
      highConfidence: sql<number>`SUM(CASE WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.85 THEN 1 ELSE 0 END)`,
    })
    .from(transactions)
    .where(eq(transactions.organizationId, organizationId));

    // Get feedback stats from mappingFeedback
    const feedbackStats = await db.select({
      approved: sql<number>`SUM(CASE WHEN ${mappingFeedback.status} = 'approved' THEN 1 ELSE 0 END)`,
      corrected: sql<number>`SUM(CASE WHEN ${mappingFeedback.status} = 'corrected' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN ${mappingFeedback.status} = 'rejected' THEN 1 ELSE 0 END)`,
    })
    .from(mappingFeedback)
    .where(eq(mappingFeedback.organizationId, organizationId));

    const stats = txStats[0];
    const feedback = feedbackStats[0];

    const classified = Number(stats?.classified || 0);
    const highConfidence = Number(stats?.highConfidence || 0);
    const approved = Number(feedback?.approved || 0);
    const corrected = Number(feedback?.corrected || 0);
    const rejected = Number(feedback?.rejected || 0);
    
    // Only count reviewed feedback (not pending)
    const totalReviewed = approved + corrected + rejected;
    
    // TP = approved (AI was correct), FP = corrected + rejected (AI was wrong)
    const truePositives = approved;
    const falsePositives = corrected + rejected;
    
    // Precision = TP / (TP + FP) - of the predictions AI made, how many were correct
    const precision = totalReviewed > 0 ? truePositives / totalReviewed : 1;
    
    // Get FN count - corrections where user specified a different account
    const fnStats = await db.select({
      count: sql<number>`COUNT(*)`,
    })
    .from(mappingFeedback)
    .where(and(
      eq(mappingFeedback.organizationId, organizationId),
      eq(mappingFeedback.status, "corrected"),
      isNotNull(mappingFeedback.correctedCanonicalAccountId)
    ));
    
    const falseNegatives = Number(fnStats[0]?.count || 0);
    
    // Recall = TP / (TP + FN) - of items that should be classified correctly, how many did AI get right
    const recall = (truePositives + falseNegatives) > 0 
      ? truePositives / (truePositives + falseNegatives) 
      : 1;
    
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    const accuracy = totalReviewed > 0 ? truePositives / totalReviewed : 1;

    return {
      overallAccuracy: Math.round(accuracy * 100),
      overallPrecision: Math.round(precision * 100),
      overallRecall: Math.round(recall * 100),
      overallF1: Math.round(f1 * 100),
      totalClassified: classified,
      highConfidenceRate: classified > 0 ? Math.round((highConfidence / classified) * 100) : 0,
      humanCorrectionRate: totalReviewed > 0 ? Math.round(((corrected + rejected) / totalReviewed) * 100) : 0,
    };
  }

  async getCategoryMetrics(organizationId: string): Promise<CategoryMetrics[]> {
    // Get transaction counts per canonical account with confidence info
    const accountStats = await db.select({
      accountId: canonicalAccounts.id,
      accountName: canonicalAccounts.name,
      totalCount: sql<number>`COUNT(*)`,
      avgConfidence: sql<string>`AVG(CAST(${transactions.classificationConfidence} AS numeric))`,
    })
    .from(transactions)
    .innerJoin(canonicalAccounts, eq(transactions.canonicalAccountId, canonicalAccounts.id))
    .where(and(
      eq(transactions.organizationId, organizationId),
      isNotNull(transactions.canonicalAccountId)
    ))
    .groupBy(canonicalAccounts.id, canonicalAccounts.name)
    .orderBy(desc(sql`COUNT(*)`));

    // TP: approved feedback where AI suggested this account (AI was correct)
    const approvedBySuggested = await db.select({
      accountId: mappingFeedback.suggestedCanonicalAccountId,
      count: sql<number>`COUNT(*)`,
    })
    .from(mappingFeedback)
    .where(and(
      eq(mappingFeedback.organizationId, organizationId),
      eq(mappingFeedback.status, "approved"),
      isNotNull(mappingFeedback.suggestedCanonicalAccountId)
    ))
    .groupBy(mappingFeedback.suggestedCanonicalAccountId);

    // FP: corrected/rejected feedback where AI suggested this account (AI was wrong)
    const wrongBySuggested = await db.select({
      accountId: mappingFeedback.suggestedCanonicalAccountId,
      count: sql<number>`COUNT(*)`,
    })
    .from(mappingFeedback)
    .where(and(
      eq(mappingFeedback.organizationId, organizationId),
      sql`${mappingFeedback.status} IN ('corrected', 'rejected')`,
      isNotNull(mappingFeedback.suggestedCanonicalAccountId)
    ))
    .groupBy(mappingFeedback.suggestedCanonicalAccountId);

    // FN: corrections that pointed TO this account (should have been here but AI predicted wrong)
    const correctionsByTarget = await db.select({
      accountId: mappingFeedback.correctedCanonicalAccountId,
      count: sql<number>`COUNT(*)`,
    })
    .from(mappingFeedback)
    .where(and(
      eq(mappingFeedback.organizationId, organizationId),
      eq(mappingFeedback.status, "corrected"),
      isNotNull(mappingFeedback.correctedCanonicalAccountId)
    ))
    .groupBy(mappingFeedback.correctedCanonicalAccountId);

    // Build lookup maps
    const tpMap = new Map<string, number>();
    for (const a of approvedBySuggested) {
      tpMap.set(a.accountId || "", Number(a.count));
    }
    
    const fpMap = new Map<string, number>();
    for (const w of wrongBySuggested) {
      fpMap.set(w.accountId || "", Number(w.count));
    }
    
    const fnMap = new Map<string, number>();
    for (const c of correctionsByTarget) {
      fnMap.set(c.accountId || "", Number(c.count));
    }

    return accountStats.map(acc => {
      const total = Number(acc.totalCount);
      
      // TP = AI suggested this account AND user approved
      const tp = tpMap.get(acc.accountId) || 0;
      // FP = AI suggested this account AND user corrected/rejected
      const fp = fpMap.get(acc.accountId) || 0;
      // FN = user corrected TO this account (should have been here)
      const fn = fnMap.get(acc.accountId) || 0;
      
      const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
      const recall = (tp + fn) > 0 ? tp / (tp + fn) : 1;
      const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

      return {
        categoryId: acc.accountId,
        categoryName: acc.accountName || "Unknown",
        totalPredictions: total,
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        precision: Math.round(precision * 100),
        recall: Math.round(recall * 100),
        f1Score: Math.round(f1 * 100),
        avgConfidence: Math.round(parseFloat(acc.avgConfidence || "0") * 100),
      };
    });
  }

  async getMetricsHistory(organizationId: string, days: number = 30): Promise<MetricsSnapshot[]> {
    const history: MetricsSnapshot[] = [];
    const today = startOfDay(new Date());

    for (let i = 0; i < days; i += 7) {
      const targetDate = subDays(today, i);
      const dateStr = format(targetDate, "yyyy-MM-dd");

      const fbStats = await db.select({
        approved: sql<number>`SUM(CASE WHEN ${mappingFeedback.status} = 'approved' THEN 1 ELSE 0 END)`,
        corrected: sql<number>`SUM(CASE WHEN ${mappingFeedback.status} = 'corrected' THEN 1 ELSE 0 END)`,
        rejected: sql<number>`SUM(CASE WHEN ${mappingFeedback.status} = 'rejected' THEN 1 ELSE 0 END)`,
      })
      .from(mappingFeedback)
      .where(and(
        eq(mappingFeedback.organizationId, organizationId),
        lte(mappingFeedback.createdAt, targetDate)
      ));

      // Get FN count at this point in time
      const fnStats = await db.select({
        count: sql<number>`COUNT(*)`,
      })
      .from(mappingFeedback)
      .where(and(
        eq(mappingFeedback.organizationId, organizationId),
        eq(mappingFeedback.status, "corrected"),
        isNotNull(mappingFeedback.correctedCanonicalAccountId),
        lte(mappingFeedback.createdAt, targetDate)
      ));

      const fb = fbStats[0];
      
      const approved = Number(fb?.approved || 0);
      const corrected = Number(fb?.corrected || 0);
      const rejected = Number(fb?.rejected || 0);
      const totalReviewed = approved + corrected + rejected;

      // TP = approved (AI was correct)
      // FP = corrected + rejected (AI was wrong)
      const tp = approved;
      const fp = corrected + rejected;
      // FN = corrections with a new target account
      const fn = Number(fnStats[0]?.count || 0);
      
      // Precision = TP / (TP + FP)
      const precision = totalReviewed > 0 ? tp / totalReviewed : 1;
      // Recall = TP / (TP + FN)
      const recall = (tp + fn) > 0 ? tp / (tp + fn) : 1;
      const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
      const accuracy = precision;

      history.push({
        date: dateStr,
        overallAccuracy: Math.round(accuracy * 100),
        overallPrecision: Math.round(precision * 100),
        overallRecall: Math.round(recall * 100),
        overallF1: Math.round(f1 * 100),
        totalReviewed,
        approvedCount: approved,
        correctedCount: corrected,
      });
    }

    return history.reverse();
  }

  calculateImprovements(history: MetricsSnapshot[]): ClassificationDashboard["improvements"] {
    if (history.length < 2) {
      return {
        accuracyChange7d: 0,
        precisionChange7d: 0,
        correctionRateChange7d: 0,
      };
    }

    const recent = history[history.length - 1];
    const weekAgo = history.length > 1 ? history[Math.max(0, history.length - 2)] : recent;

    const recentCorrRate = recent.totalReviewed > 0 
      ? (recent.correctedCount / recent.totalReviewed) * 100 
      : 0;
    const weekAgoCorrRate = weekAgo.totalReviewed > 0 
      ? (weekAgo.correctedCount / weekAgo.totalReviewed) * 100 
      : 0;

    return {
      accuracyChange7d: recent.overallAccuracy - weekAgo.overallAccuracy,
      precisionChange7d: recent.overallPrecision - weekAgo.overallPrecision,
      correctionRateChange7d: -(recentCorrRate - weekAgoCorrRate),
    };
  }

  generateInsights(
    current: ClassificationDashboard["current"],
    byCategory: CategoryMetrics[],
    improvements: ClassificationDashboard["improvements"]
  ): string[] {
    const insights: string[] = [];

    if (current.overallAccuracy >= 95) {
      insights.push("Classification accuracy is excellent at " + current.overallAccuracy + "%");
    } else if (current.overallAccuracy >= 85) {
      insights.push("Classification accuracy is good at " + current.overallAccuracy + "%, with room for improvement");
    } else if (current.overallAccuracy >= 70) {
      insights.push("Classification accuracy of " + current.overallAccuracy + "% - more training data would help");
    } else {
      insights.push("Classification needs attention - accuracy at " + current.overallAccuracy + "%");
    }

    if (current.highConfidenceRate >= 80) {
      insights.push(current.highConfidenceRate + "% of classifications are high-confidence, reducing manual review burden");
    } else if (current.highConfidenceRate < 50) {
      insights.push("Only " + current.highConfidenceRate + "% high-confidence - consider training the classifier with more examples");
    }

    if (improvements.accuracyChange7d > 5) {
      insights.push("Accuracy improved by " + improvements.accuracyChange7d + "% over the past week - learning is working!");
    } else if (improvements.accuracyChange7d < -5) {
      insights.push("Accuracy dropped by " + Math.abs(improvements.accuracyChange7d) + "% - review recent corrections for issues");
    }

    const lowPerformers = byCategory.filter(c => c.precision < 70 && c.totalPredictions > 10);
    if (lowPerformers.length > 0) {
      const names = lowPerformers.slice(0, 3).map(c => c.categoryName).join(", ");
      insights.push("Categories needing attention: " + names);
    }

    if (current.humanCorrectionRate < 10) {
      insights.push("Low correction rate (" + current.humanCorrectionRate + "%) indicates strong model performance");
    }

    return insights.slice(0, 5);
  }

  async getConfidenceDistribution(organizationId: string): Promise<{ range: string; count: number }[]> {
    const result = await db.select({
      range: sql<string>`
        CASE 
          WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.95 THEN '95-100%'
          WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.85 THEN '85-95%'
          WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.70 THEN '70-85%'
          WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.50 THEN '50-70%'
          ELSE 'Below 50%'
        END
      `,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      isNotNull(transactions.classificationConfidence)
    ))
    .groupBy(sql`
      CASE 
        WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.95 THEN '95-100%'
        WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.85 THEN '85-95%'
        WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.70 THEN '70-85%'
        WHEN CAST(${transactions.classificationConfidence} AS numeric) >= 0.50 THEN '50-70%'
        ELSE 'Below 50%'
      END
    `);

    return result.map(r => ({
      range: r.range,
      count: Number(r.count),
    }));
  }
}

export const classificationMetricsEngine = new ClassificationMetricsEngine();
