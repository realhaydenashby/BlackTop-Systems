/**
 * Confidence-Based Routing Service
 * 
 * Routes transactions based on AI classification confidence:
 * - Above 85% confidence: Auto-classify
 * - Below 85% confidence: Route to human review queue with AI suggestions
 */

import { db } from "../db";
import { 
  transactions, 
  transactionReviewQueue, 
  canonicalAccounts,
  categories,
  accountMappings,
  mappingFeedback 
} from "@shared/schema";
import { eq, and, desc, sql, asc, isNull, or } from "drizzle-orm";
import { getClassifier, trainClassifier } from "./accountClassifier";

const AUTO_CLASSIFY_THRESHOLD = 0.85;
const HIGH_PRIORITY_THRESHOLD = 0.50;
const MEDIUM_PRIORITY_THRESHOLD = 0.70;

interface ClassificationResult {
  canonicalAccountId: string | null;
  canonicalCode: string | null;
  canonicalName: string | null;
  categoryId: string | null;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    canonicalAccountId: string;
    canonicalName: string;
    confidence: number;
  }>;
  source: "pattern" | "ml" | "fallback";
}

interface RoutingResult {
  transactionId: string;
  action: "auto_classified" | "queued_for_review" | "already_classified" | "error";
  classification?: ClassificationResult;
  queueId?: string;
  error?: string;
}

export class ConfidenceRouter {

  /**
   * Route a single transaction based on confidence
   */
  async routeTransaction(
    organizationId: string,
    transactionId: string
  ): Promise<RoutingResult> {
    try {
      const transaction = await db.query.transactions.findFirst({
        where: eq(transactions.id, transactionId),
      });

      if (!transaction) {
        return { transactionId, action: "error", error: "Transaction not found" };
      }

      if (transaction.canonicalAccountId) {
        return { transactionId, action: "already_classified" };
      }

      const vendorName = transaction.vendorNormalized || transaction.vendorOriginal || "";
      const classification = await this.classifyTransaction(organizationId, vendorName, transaction.description || "");
      const transactionAmount = Math.abs(Number(transaction.amount) || 0);

      if (classification.confidence >= AUTO_CLASSIFY_THRESHOLD && classification.canonicalAccountId) {
        await db.update(transactions)
          .set({
            canonicalAccountId: classification.canonicalAccountId,
            categoryId: classification.categoryId,
            classificationConfidence: classification.confidence.toFixed(3),
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, transactionId));

        await this.recordAutoClassification(organizationId, vendorName, classification);

        return {
          transactionId,
          action: "auto_classified",
          classification,
        };
      } else {
        const queueEntry = await this.addToReviewQueue(
          organizationId,
          transactionId,
          classification,
          transactionAmount
        );

        return {
          transactionId,
          action: "queued_for_review",
          classification,
          queueId: queueEntry.id,
        };
      }
    } catch (error) {
      console.error(`[Router] Error routing transaction ${transactionId}:`, error);
      return { transactionId, action: "error", error: String(error) };
    }
  }

  /**
   * Route multiple transactions in batch
   */
  async routeTransactions(
    organizationId: string,
    transactionIds: string[]
  ): Promise<{
    autoClassified: number;
    queuedForReview: number;
    alreadyClassified: number;
    errors: number;
    results: RoutingResult[];
  }> {
    const results: RoutingResult[] = [];
    let autoClassified = 0;
    let queuedForReview = 0;
    let alreadyClassified = 0;
    let errors = 0;

    for (const transactionId of transactionIds) {
      const result = await this.routeTransaction(organizationId, transactionId);
      results.push(result);

      switch (result.action) {
        case "auto_classified": autoClassified++; break;
        case "queued_for_review": queuedForReview++; break;
        case "already_classified": alreadyClassified++; break;
        case "error": errors++; break;
      }
    }

    console.log(`[Router] Routed ${transactionIds.length} transactions: ${autoClassified} auto-classified, ${queuedForReview} queued, ${alreadyClassified} already done, ${errors} errors`);

    return { autoClassified, queuedForReview, alreadyClassified, errors, results };
  }

  /**
   * Route all unclassified transactions for an organization
   */
  async routeUnclassifiedTransactions(organizationId: string): Promise<{
    autoClassified: number;
    queuedForReview: number;
    total: number;
  }> {
    const unclassified = await db.select({ id: transactions.id })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, organizationId),
        isNull(transactions.canonicalAccountId)
      ));

    if (unclassified.length === 0) {
      return { autoClassified: 0, queuedForReview: 0, total: 0 };
    }

    const transactionIds = unclassified.map(t => t.id);
    const result = await this.routeTransactions(organizationId, transactionIds);

    return {
      autoClassified: result.autoClassified,
      queuedForReview: result.queuedForReview,
      total: transactionIds.length,
    };
  }

  /**
   * Classify a transaction using patterns + ML
   */
  private async classifyTransaction(
    organizationId: string,
    vendorName: string,
    description: string
  ): Promise<ClassificationResult> {
    const alternatives: ClassificationResult["alternatives"] = [];
    
    const textToClassify = `${vendorName} ${description}`.trim();
    
    if (!textToClassify) {
      return {
        canonicalAccountId: null,
        canonicalCode: null,
        canonicalName: null,
        categoryId: null,
        confidence: 0,
        reasoning: "No vendor or description available",
        alternatives: [],
        source: "fallback",
      };
    }

    const patternMatch = await this.matchPattern(organizationId, vendorName);
    if (patternMatch && patternMatch.confidence > 0.5) {
      const account = await db.query.canonicalAccounts.findFirst({
        where: eq(canonicalAccounts.id, patternMatch.canonicalAccountId),
      });
      
      if (account) {
        return {
          canonicalAccountId: account.id,
          canonicalCode: account.code,
          canonicalName: account.name,
          categoryId: null,
          confidence: patternMatch.confidence,
          reasoning: `Pattern match: "${vendorName}" → ${account.name}`,
          alternatives,
          source: "pattern",
        };
      }
    }

    const classifier = await getClassifier(organizationId);
    const mlResult = classifier.classify(textToClassify);
    
    if (mlResult) {
      return {
        canonicalAccountId: mlResult.canonicalAccountId,
        canonicalCode: mlResult.canonicalCode,
        canonicalName: mlResult.canonicalName,
        categoryId: null,
        confidence: mlResult.confidence,
        reasoning: `ML classification based on similar transactions: ${mlResult.matchedExamples.slice(0, 2).join(", ")}`,
        alternatives,
        source: "ml",
      };
    }

    const allAccounts = await db.select({
      id: canonicalAccounts.id,
      name: canonicalAccounts.name,
    }).from(canonicalAccounts).limit(5);
    
    for (const account of allAccounts) {
      alternatives.push({
        canonicalAccountId: account.id,
        canonicalName: account.name,
        confidence: 0.3,
      });
    }

    return {
      canonicalAccountId: alternatives[0]?.canonicalAccountId || null,
      canonicalCode: null,
      canonicalName: alternatives[0]?.canonicalName || null,
      categoryId: null,
      confidence: 0.3,
      reasoning: "No pattern or ML match found, showing possible categories",
      alternatives,
      source: "fallback",
    };
  }

  /**
   * Safely parse a confidence score, handling null/undefined/NaN
   */
  private safeParseConfidence(value: string | null | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * Get confidence from mapping enum as numeric value
   */
  private confidenceEnumToScore(confidence: string | null): number {
    switch (confidence) {
      case "high": return 0.9;
      case "medium": return 0.75;
      case "low": return 0.6;
      case "manual": return 1.0;
      default: return 0.7;
    }
  }

  /**
   * Match vendor against known patterns
   */
  private async matchPattern(
    organizationId: string,
    vendorName: string
  ): Promise<{ canonicalAccountId: string; confidence: number } | null> {
    if (!vendorName) return null;

    const normalizedVendor = vendorName.toLowerCase().trim();

    const mapping = await db.query.accountMappings.findFirst({
      where: and(
        eq(accountMappings.organizationId, organizationId),
        eq(accountMappings.isActive, true),
        sql`LOWER(${accountMappings.sourceAccountName}) = ${normalizedVendor}`
      ),
      orderBy: desc(accountMappings.confidenceScore),
    });

    if (mapping) {
      const confidence = mapping.confidenceScore 
        ? this.safeParseConfidence(mapping.confidenceScore, 0.8)
        : this.confidenceEnumToScore(mapping.confidence);
      return {
        canonicalAccountId: mapping.canonicalAccountId,
        confidence,
      };
    }

    const fuzzyMapping = await db.query.accountMappings.findFirst({
      where: and(
        eq(accountMappings.organizationId, organizationId),
        eq(accountMappings.isActive, true),
        sql`${normalizedVendor} LIKE '%' || LOWER(${accountMappings.sourceAccountName}) || '%'`
      ),
      orderBy: desc(accountMappings.confidenceScore),
    });

    if (fuzzyMapping) {
      const baseConfidence = fuzzyMapping.confidenceScore 
        ? this.safeParseConfidence(fuzzyMapping.confidenceScore, 0.6)
        : this.confidenceEnumToScore(fuzzyMapping.confidence) * 0.8;
      return {
        canonicalAccountId: fuzzyMapping.canonicalAccountId,
        confidence: baseConfidence * 0.8,
      };
    }

    return null;
  }

  /**
   * Add transaction to review queue
   */
  private async addToReviewQueue(
    organizationId: string,
    transactionId: string,
    classification: ClassificationResult,
    amount: number
  ): Promise<{ id: string }> {
    let priority: "high" | "medium" | "low" = "medium";
    
    if (classification.confidence < HIGH_PRIORITY_THRESHOLD || amount > 10000) {
      priority = "high";
    } else if (classification.confidence < MEDIUM_PRIORITY_THRESHOLD) {
      priority = "medium";
    } else {
      priority = "low";
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [entry] = await db.insert(transactionReviewQueue)
      .values({
        organizationId,
        transactionId,
        suggestedCanonicalAccountId: classification.canonicalAccountId,
        suggestedCategoryId: classification.categoryId,
        aiConfidence: classification.confidence.toFixed(3),
        aiReasoning: classification.reasoning,
        alternativeSuggestions: classification.alternatives,
        priority,
        status: "pending",
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [transactionReviewQueue.transactionId],
        set: {
          suggestedCanonicalAccountId: classification.canonicalAccountId,
          suggestedCategoryId: classification.categoryId,
          aiConfidence: classification.confidence.toFixed(3),
          aiReasoning: classification.reasoning,
          alternativeSuggestions: classification.alternatives,
          priority,
          status: "pending",
        }
      })
      .returning({ id: transactionReviewQueue.id });

    return entry;
  }

  /**
   * Record auto-classification for learning
   */
  private async recordAutoClassification(
    organizationId: string,
    vendorName: string,
    classification: ClassificationResult
  ): Promise<void> {
    if (!classification.canonicalAccountId || !vendorName) return;

    try {
      await db.insert(accountMappings)
        .values({
          organizationId,
          canonicalAccountId: classification.canonicalAccountId,
          sourceAccountName: vendorName,
          sourceSystem: "auto",
          confidence: "high",
          confidenceScore: classification.confidence.toFixed(3),
          source: classification.source === "ml" ? "ai" : "rule",
          usageCount: 1,
          lastUsedAt: new Date(),
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [accountMappings.organizationId, accountMappings.sourceAccountName, accountMappings.sourceSystem],
          set: {
            usageCount: sql`${accountMappings.usageCount} + 1`,
            lastUsedAt: new Date(),
          }
        });
    } catch (e) {
      console.error("[Router] Error recording auto-classification:", e);
    }
  }

  /**
   * Get review queue for an organization
   */
  async getReviewQueue(
    organizationId: string,
    options?: {
      status?: "pending" | "approved" | "rejected" | "skipped" | "auto_resolved";
      priority?: "high" | "medium" | "low";
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    items: Array<{
      id: string;
      transactionId: string;
      transactionDate: Date;
      transactionAmount: string;
      vendorName: string | null;
      suggestedAccount: string | null;
      aiConfidence: number;
      aiReasoning: string | null;
      priority: string;
      status: string;
      createdAt: Date | null;
    }>;
    total: number;
    pendingCount: number;
  }> {
    const conditions = [eq(transactionReviewQueue.organizationId, organizationId)];
    
    if (options?.status) {
      conditions.push(eq(transactionReviewQueue.status, options.status));
    }
    if (options?.priority) {
      conditions.push(eq(transactionReviewQueue.priority, options.priority));
    }

    const items = await db
      .select({
        id: transactionReviewQueue.id,
        transactionId: transactionReviewQueue.transactionId,
        transactionDate: transactions.date,
        transactionAmount: transactions.amount,
        vendorName: transactions.vendorNormalized,
        suggestedAccountId: transactionReviewQueue.suggestedCanonicalAccountId,
        suggestedAccountName: canonicalAccounts.name,
        aiConfidence: transactionReviewQueue.aiConfidence,
        aiReasoning: transactionReviewQueue.aiReasoning,
        priority: transactionReviewQueue.priority,
        status: transactionReviewQueue.status,
        createdAt: transactionReviewQueue.createdAt,
      })
      .from(transactionReviewQueue)
      .leftJoin(transactions, eq(transactionReviewQueue.transactionId, transactions.id))
      .leftJoin(canonicalAccounts, eq(transactionReviewQueue.suggestedCanonicalAccountId, canonicalAccounts.id))
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${transactionReviewQueue.priority} WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
        desc(transactionReviewQueue.createdAt)
      )
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactionReviewQueue)
      .where(and(...conditions));

    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactionReviewQueue)
      .where(and(
        eq(transactionReviewQueue.organizationId, organizationId),
        eq(transactionReviewQueue.status, "pending")
      ));

    return {
      items: items.map(item => ({
        id: item.id,
        transactionId: item.transactionId,
        transactionDate: item.transactionDate!,
        transactionAmount: item.transactionAmount!,
        vendorName: item.vendorName,
        suggestedAccount: item.suggestedAccountName,
        aiConfidence: parseFloat(item.aiConfidence || "0"),
        aiReasoning: item.aiReasoning,
        priority: item.priority,
        status: item.status,
        createdAt: item.createdAt,
      })),
      total: Number(totalResult?.count || 0),
      pendingCount: Number(pendingResult?.count || 0),
    };
  }

  /**
   * Process a review queue item (approve, reject, skip)
   */
  async processReviewItem(
    queueItemId: string,
    userId: string,
    action: "approve" | "reject" | "skip",
    correction?: {
      canonicalAccountId?: string;
      categoryId?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const queueItem = await db.query.transactionReviewQueue.findFirst({
        where: eq(transactionReviewQueue.id, queueItemId),
      });

      if (!queueItem) {
        return { success: false, error: "Queue item not found" };
      }

      const transaction = await db.query.transactions.findFirst({
        where: eq(transactions.id, queueItem.transactionId),
      });

      if (!transaction) {
        return { success: false, error: "Transaction not found" };
      }

      const vendorName = transaction.vendorNormalized || transaction.vendorOriginal || "";

      if (action === "approve") {
        await db.update(transactions)
          .set({
            canonicalAccountId: queueItem.suggestedCanonicalAccountId,
            categoryId: queueItem.suggestedCategoryId,
            classificationConfidence: queueItem.aiConfidence,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, queueItem.transactionId));

        await db.update(transactionReviewQueue)
          .set({
            status: "approved",
            reviewedBy: userId,
            finalCanonicalAccountId: queueItem.suggestedCanonicalAccountId,
            finalCategoryId: queueItem.suggestedCategoryId,
            reviewedAt: new Date(),
          })
          .where(eq(transactionReviewQueue.id, queueItemId));

        if (queueItem.suggestedCanonicalAccountId && vendorName) {
          await db.insert(mappingFeedback)
            .values({
              organizationId: queueItem.organizationId,
              sourceAccountName: vendorName,
              sourceSystem: transaction.source || "unknown",
              suggestedCanonicalAccountId: queueItem.suggestedCanonicalAccountId,
              originalConfidence: queueItem.aiConfidence,
              status: "approved",
              userId,
            })
            .onConflictDoNothing();
        }

      } else if (action === "reject" && correction?.canonicalAccountId) {
        await db.update(transactions)
          .set({
            canonicalAccountId: correction.canonicalAccountId,
            categoryId: correction.categoryId || null,
            classificationConfidence: "1.000",
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, queueItem.transactionId));

        await db.update(transactionReviewQueue)
          .set({
            status: "rejected",
            reviewedBy: userId,
            finalCanonicalAccountId: correction.canonicalAccountId,
            finalCategoryId: correction.categoryId || null,
            reviewNotes: correction.notes,
            reviewedAt: new Date(),
          })
          .where(eq(transactionReviewQueue.id, queueItemId));

        if (vendorName) {
          await db.insert(mappingFeedback)
            .values({
              organizationId: queueItem.organizationId,
              sourceAccountName: vendorName,
              sourceSystem: transaction.source || "unknown",
              suggestedCanonicalAccountId: queueItem.suggestedCanonicalAccountId,
              correctedCanonicalAccountId: correction.canonicalAccountId,
              originalConfidence: queueItem.aiConfidence,
              status: "corrected",
              userId,
              notes: correction.notes,
            })
            .onConflictDoNothing();

          await db.insert(accountMappings)
            .values({
              organizationId: queueItem.organizationId,
              canonicalAccountId: correction.canonicalAccountId,
              sourceAccountName: vendorName,
              sourceSystem: transaction.source || "manual",
              confidence: "high",
              confidenceScore: "1.000",
              source: "user",
              usageCount: 1,
              lastUsedAt: new Date(),
              isActive: true,
            })
            .onConflictDoUpdate({
              target: [accountMappings.organizationId, accountMappings.sourceAccountName, accountMappings.sourceSystem],
              set: {
                canonicalAccountId: correction.canonicalAccountId,
                confidence: "high",
                confidenceScore: "1.000",
                source: "user",
                updatedAt: new Date(),
              }
            });

          await trainClassifier(queueItem.organizationId);
        }

      } else if (action === "skip") {
        await db.update(transactionReviewQueue)
          .set({
            status: "skipped",
            reviewedBy: userId,
            reviewNotes: correction?.notes,
            reviewedAt: new Date(),
          })
          .where(eq(transactionReviewQueue.id, queueItemId));
      }

      return { success: true };
    } catch (error) {
      console.error("[Router] Error processing review item:", error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get review queue statistics
   */
  async getQueueStats(organizationId: string): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    skipped: number;
    byPriority: { high: number; medium: number; low: number };
    avgConfidence: number;
  }> {
    const stats = await db
      .select({
        status: transactionReviewQueue.status,
        priority: transactionReviewQueue.priority,
        count: sql<number>`count(*)`,
        avgConfidence: sql<number>`avg(${transactionReviewQueue.aiConfidence}::numeric)`,
      })
      .from(transactionReviewQueue)
      .where(eq(transactionReviewQueue.organizationId, organizationId))
      .groupBy(transactionReviewQueue.status, transactionReviewQueue.priority);

    const result = {
      pending: 0,
      approved: 0,
      rejected: 0,
      skipped: 0,
      byPriority: { high: 0, medium: 0, low: 0 },
      avgConfidence: 0,
    };

    let totalConfidence = 0;
    let totalCount = 0;

    for (const row of stats) {
      const count = Number(row.count);
      totalCount += count;
      totalConfidence += Number(row.avgConfidence || 0) * count;

      if (row.status === "pending") result.pending += count;
      else if (row.status === "approved") result.approved += count;
      else if (row.status === "rejected") result.rejected += count;
      else if (row.status === "skipped") result.skipped += count;

      if (row.priority === "high") result.byPriority.high += count;
      else if (row.priority === "medium") result.byPriority.medium += count;
      else if (row.priority === "low") result.byPriority.low += count;
    }

    result.avgConfidence = totalCount > 0 ? totalConfidence / totalCount : 0;

    return result;
  }
}

export const confidenceRouter = new ConfidenceRouter();
