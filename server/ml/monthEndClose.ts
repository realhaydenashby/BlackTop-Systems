import { db } from "../db";
import { transactions, categories, bankAccounts, reconciliationMatches, vendors, burnMetrics } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, isNull, or, ne, count } from "drizzle-orm";
import { startOfMonth, endOfMonth, subMonths, format, differenceInDays } from "date-fns";

export type ChecklistItemStatus = "pending" | "in_progress" | "completed" | "warning" | "error";
export type ChecklistItemPriority = "high" | "medium" | "low";

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: "reconciliation" | "classification" | "review" | "journal" | "reporting";
  status: ChecklistItemStatus;
  priority: ChecklistItemPriority;
  details?: string;
  actionRequired?: boolean;
  count?: number;
  amount?: number;
}

export interface VarianceItem {
  category: string;
  currentAmount: number;
  previousAmount: number;
  variance: number;
  variancePercent: number;
  severity: "info" | "warning" | "critical";
  explanation?: string;
}

export interface JournalEntrySuggestion {
  id: string;
  type: "accrual" | "prepaid" | "depreciation" | "revenue_recognition" | "adjustment";
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  reasoning: string;
  period: string;
  priority: "high" | "medium" | "low";
}

export interface MonthEndCloseReport {
  month: string;
  status: "not_started" | "in_progress" | "ready_for_review" | "closed";
  completionPercent: number;
  checklist: ChecklistItem[];
  variances: VarianceItem[];
  journalSuggestions: JournalEntrySuggestion[];
  summary: {
    totalTransactions: number;
    uncategorizedCount: number;
    unreconciled: number;
    pendingReview: number;
    totalVariance: number;
    criticalItems: number;
  };
}

export class MonthEndCloseEngine {
  
  async generateCloseReport(organizationId: string, targetMonth?: Date): Promise<MonthEndCloseReport> {
    const month = targetMonth || subMonths(new Date(), 1);
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const previousMonthStart = startOfMonth(subMonths(month, 1));
    const previousMonthEnd = endOfMonth(subMonths(month, 1));
    const monthLabel = format(month, "MMMM yyyy");

    const checklist = await this.buildChecklist(organizationId, monthStart, monthEnd);
    const variances = await this.detectVariances(organizationId, monthStart, monthEnd, previousMonthStart, previousMonthEnd);
    const journalSuggestions = await this.suggestJournalEntries(organizationId, monthStart, monthEnd);

    const completedItems = checklist.filter(item => item.status === "completed").length;
    const completionPercent = Math.round((completedItems / checklist.length) * 100);

    const criticalItems = checklist.filter(item => 
      item.status === "error" || 
      (item.status === "warning" && item.priority === "high")
    ).length;

    let status: MonthEndCloseReport["status"] = "not_started";
    if (completionPercent >= 100 && criticalItems === 0) {
      status = "closed";
    } else if (completionPercent >= 80) {
      status = "ready_for_review";
    } else if (completionPercent > 0) {
      status = "in_progress";
    }

    const summary = {
      totalTransactions: checklist.find(c => c.id === "tx_count")?.count || 0,
      uncategorizedCount: checklist.find(c => c.id === "uncategorized")?.count || 0,
      unreconciled: checklist.find(c => c.id === "unreconciled")?.count || 0,
      pendingReview: checklist.find(c => c.id === "pending_review")?.count || 0,
      totalVariance: variances.reduce((sum, v) => sum + Math.abs(v.variance), 0),
      criticalItems,
    };

    return {
      month: monthLabel,
      status,
      completionPercent,
      checklist,
      variances,
      journalSuggestions,
      summary,
    };
  }

  private async buildChecklist(organizationId: string, monthStart: Date, monthEnd: Date): Promise<ChecklistItem[]> {
    const checklist: ChecklistItem[] = [];

    const txResult = await db.select({
      totalCount: sql<number>`COUNT(*)`,
      uncategorizedCount: sql<number>`SUM(CASE WHEN ${transactions.categoryId} IS NULL THEN 1 ELSE 0 END)`,
      unreviewedCount: sql<number>`SUM(CASE WHEN ${transactions.classificationConfidence} < 0.85 THEN 1 ELSE 0 END)`,
      totalAmount: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd)
    ));

    const stats = txResult[0];
    const totalCount = Number(stats?.totalCount || 0);
    const uncategorizedCount = Number(stats?.uncategorizedCount || 0);
    const unreviewedCount = Number(stats?.unreviewedCount || 0);

    checklist.push({
      id: "tx_count",
      title: "Transaction Import",
      description: "All transactions for the month have been imported",
      category: "reconciliation",
      status: totalCount > 0 ? "completed" : "error",
      priority: "high",
      details: `${totalCount} transactions imported for the month`,
      count: totalCount,
    });

    checklist.push({
      id: "uncategorized",
      title: "Transaction Categorization",
      description: "All transactions are properly categorized",
      category: "classification",
      status: uncategorizedCount === 0 ? "completed" : uncategorizedCount < 5 ? "warning" : "error",
      priority: "high",
      details: uncategorizedCount > 0 
        ? `${uncategorizedCount} transactions need categorization`
        : "All transactions categorized",
      actionRequired: uncategorizedCount > 0,
      count: uncategorizedCount,
    });

    checklist.push({
      id: "pending_review",
      title: "Low Confidence Classifications",
      description: "Review transactions with low confidence classifications",
      category: "review",
      status: unreviewedCount === 0 ? "completed" : unreviewedCount < 10 ? "warning" : "error",
      priority: "medium",
      details: unreviewedCount > 0
        ? `${unreviewedCount} transactions need manual review`
        : "All classifications verified",
      actionRequired: unreviewedCount > 0,
      count: unreviewedCount,
    });

    const bankResult = await db.select({
      count: sql<number>`COUNT(*)`,
      lastSync: sql<Date>`MAX(${bankAccounts.lastSyncedAt})`,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.organizationId, organizationId));

    const lastSync = bankResult[0]?.lastSync;
    const daysSinceSync = lastSync ? differenceInDays(new Date(), new Date(lastSync)) : 999;

    checklist.push({
      id: "bank_sync",
      title: "Bank Account Sync",
      description: "Bank accounts synced with latest transactions",
      category: "reconciliation",
      status: daysSinceSync <= 1 ? "completed" : daysSinceSync <= 3 ? "warning" : "error",
      priority: "high",
      details: lastSync 
        ? `Last synced ${daysSinceSync} day(s) ago`
        : "No bank accounts connected",
      actionRequired: daysSinceSync > 1,
    });

    const unmatchedResult = await db.select({
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
      isNull(transactions.vendorId)
    ));

    const unmatchedVendors = Number(unmatchedResult[0]?.count || 0);

    checklist.push({
      id: "vendor_matching",
      title: "Vendor Matching",
      description: "All transactions linked to vendors",
      category: "classification",
      status: unmatchedVendors === 0 ? "completed" : unmatchedVendors < 10 ? "warning" : "in_progress",
      priority: "medium",
      details: unmatchedVendors > 0
        ? `${unmatchedVendors} transactions without vendor assignment`
        : "All transactions matched to vendors",
      count: unmatchedVendors,
    });

    const reconcileResult = await db.select({
      matchedCount: sql<number>`COUNT(*)`,
    })
    .from(reconciliationMatches)
    .where(and(
      eq(reconciliationMatches.organizationId, organizationId),
      eq(reconciliationMatches.status, "confirmed")
    ));

    const matchedCount = Number(reconcileResult[0]?.matchedCount || 0);

    checklist.push({
      id: "reconciliation",
      title: "Invoice Reconciliation",
      description: "Bank transactions reconciled with invoices/bills",
      category: "reconciliation",
      status: matchedCount > 0 ? "completed" : "warning",
      priority: "medium",
      details: matchedCount > 0
        ? `${matchedCount} transactions reconciled with documents`
        : "No reconciliation matches found",
      count: matchedCount,
    });

    // Add unreconciled transactions check (transactions without any reconciliation match)
    const unreconciledResult = await db.select({
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .leftJoin(
      reconciliationMatches, 
      eq(transactions.id, reconciliationMatches.transactionId)
    )
    .where(and(
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
      isNull(reconciliationMatches.id)
    ));

    const unreconciledCount = Number(unreconciledResult[0]?.count || 0);

    checklist.push({
      id: "unreconciled",
      title: "Unreconciled Transactions",
      description: "All transactions matched to supporting documents",
      category: "reconciliation",
      status: unreconciledCount === 0 ? "completed" : unreconciledCount < 20 ? "warning" : "error",
      priority: "high",
      details: unreconciledCount > 0
        ? `${unreconciledCount} transactions pending reconciliation`
        : "All transactions reconciled",
      actionRequired: unreconciledCount > 0,
      count: unreconciledCount,
    });

    // Recurring transaction verification - check for amount anomalies
    const recurringResult = await db.select({
      vendorName: sql<string>`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal}, 'Unknown')`,
      amount: sql<string>`CAST(${transactions.amount} AS numeric)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      eq(transactions.isRecurring, true),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd)
    ))
    .groupBy(
      sql`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal}, 'Unknown')`,
      transactions.amount
    );

    const recurringCount = recurringResult.length;
    
    // Check for recurring anomalies (multiple different amounts from same vendor could indicate price changes)
    const vendorAmounts = new Map<string, number[]>();
    for (const r of recurringResult) {
      const vendor = r.vendorName;
      const amount = parseFloat(r.amount || "0");
      if (!vendorAmounts.has(vendor)) {
        vendorAmounts.set(vendor, []);
      }
      vendorAmounts.get(vendor)!.push(amount);
    }
    
    let recurringAnomalies = 0;
    for (const [, amounts] of vendorAmounts) {
      if (amounts.length > 1) {
        // Multiple different amounts for same vendor - potential price change
        const maxDiff = Math.max(...amounts) - Math.min(...amounts);
        if (maxDiff > 10) { // More than $10 difference
          recurringAnomalies++;
        }
      }
    }

    checklist.push({
      id: "recurring_check",
      title: "Recurring Transaction Verification",
      description: "Recurring subscriptions checked for expected amounts",
      category: "review",
      status: recurringAnomalies === 0 ? "completed" : "warning",
      priority: "low",
      details: recurringAnomalies > 0
        ? `${recurringAnomalies} recurring vendors with amount changes detected`
        : `${recurringCount} recurring transactions verified`,
      actionRequired: recurringAnomalies > 0,
      count: recurringCount,
    });

    const metricsResult = await db.select()
      .from(burnMetrics)
      .where(and(
        eq(burnMetrics.organizationId, organizationId),
        gte(burnMetrics.month, monthStart),
        lte(burnMetrics.month, monthEnd)
      ))
      .limit(1);

    checklist.push({
      id: "metrics_calculated",
      title: "Financial Metrics",
      description: "Burn rate and runway calculated for the month",
      category: "reporting",
      status: metricsResult.length > 0 ? "completed" : "pending",
      priority: "medium",
      details: metricsResult.length > 0
        ? "Financial metrics calculated"
        : "Run analytics to calculate metrics",
      actionRequired: metricsResult.length === 0,
    });

    // Real duplicate detection - find transactions with same amount, date, and vendor
    const duplicateResult = await db.select({
      duplicateCount: sql<number>`COUNT(*)`,
    })
    .from(
      db.select({
        groupCount: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, organizationId),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd)
      ))
      .groupBy(
        transactions.date,
        transactions.amount,
        sql`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal})`
      )
      .having(sql`COUNT(*) > 1`)
      .as("duplicates")
    );

    const duplicateGroups = Number(duplicateResult[0]?.duplicateCount || 0);

    checklist.push({
      id: "duplicate_check",
      title: "Duplicate Detection",
      description: "Check for duplicate transactions",
      category: "review",
      status: duplicateGroups === 0 ? "completed" : duplicateGroups < 3 ? "warning" : "error",
      priority: "medium",
      details: duplicateGroups > 0
        ? `${duplicateGroups} potential duplicate transaction groups found`
        : "No duplicate transactions detected",
      actionRequired: duplicateGroups > 0,
      count: duplicateGroups,
    });

    return checklist;
  }

  private async detectVariances(
    organizationId: string, 
    currentStart: Date, 
    currentEnd: Date,
    previousStart: Date,
    previousEnd: Date
  ): Promise<VarianceItem[]> {
    const variances: VarianceItem[] = [];

    const getCategorySpend = async (start: Date, end: Date) => {
      return db.select({
        categoryName: categories.name,
        totalSpend: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(
        eq(transactions.organizationId, organizationId),
        gte(transactions.date, start),
        lte(transactions.date, end)
      ))
      .groupBy(categories.name);
    };

    const currentSpend = await getCategorySpend(currentStart, currentEnd);
    const previousSpend = await getCategorySpend(previousStart, previousEnd);

    const previousMap = new Map(previousSpend.map(s => [s.categoryName || "Uncategorized", parseFloat(s.totalSpend || "0")]));

    for (const current of currentSpend) {
      const categoryName = current.categoryName || "Uncategorized";
      const currentAmount = parseFloat(current.totalSpend || "0");
      const previousAmount = previousMap.get(categoryName) || 0;
      
      if (currentAmount === 0 && previousAmount === 0) continue;

      const variance = currentAmount - previousAmount;
      const variancePercent = previousAmount > 0 
        ? ((currentAmount - previousAmount) / previousAmount) * 100 
        : currentAmount > 0 ? 100 : 0;

      let severity: VarianceItem["severity"] = "info";
      let explanation = "";

      if (Math.abs(variancePercent) > 50) {
        severity = "critical";
        explanation = variancePercent > 0 
          ? `Significant increase in ${categoryName} spending - review for unexpected costs`
          : `Major decrease in ${categoryName} - verify if expected or missing transactions`;
      } else if (Math.abs(variancePercent) > 25) {
        severity = "warning";
        explanation = variancePercent > 0
          ? `Notable increase in ${categoryName} spending`
          : `Notable decrease in ${categoryName} spending`;
      }

      if (Math.abs(variancePercent) > 10 || Math.abs(variance) > 1000) {
        variances.push({
          category: categoryName,
          currentAmount,
          previousAmount,
          variance,
          variancePercent,
          severity,
          explanation,
        });
      }
    }

    for (const [categoryName, previousAmount] of previousMap) {
      if (!currentSpend.find(c => (c.categoryName || "Uncategorized") === categoryName)) {
        if (previousAmount > 500) {
          variances.push({
            category: categoryName,
            currentAmount: 0,
            previousAmount,
            variance: -previousAmount,
            variancePercent: -100,
            severity: "warning",
            explanation: `No ${categoryName} spending this month - verify if expected`,
          });
        }
      }
    }

    return variances.sort((a, b) => Math.abs(b.variancePercent) - Math.abs(a.variancePercent));
  }

  private async suggestJournalEntries(organizationId: string, monthStart: Date, monthEnd: Date): Promise<JournalEntrySuggestion[]> {
    const suggestions: JournalEntrySuggestion[] = [];
    const monthLabel = format(monthStart, "MMMM yyyy");

    const recurringResult = await db.select({
      vendorName: sql<string>`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal}, 'Unknown')`,
      totalAmount: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
      txCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      eq(transactions.isRecurring, true),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd)
    ))
    .groupBy(sql`COALESCE(${transactions.vendorNormalized}, ${transactions.vendorOriginal}, 'Unknown')`)
    .orderBy(desc(sql`SUM(ABS(CAST(${transactions.amount} AS numeric)))`))
    .limit(5);

    for (const recurring of recurringResult) {
      const amount = parseFloat(recurring.totalAmount || "0");
      if (amount > 500 && Number(recurring.txCount) === 1) {
        suggestions.push({
          id: `prepaid_${recurring.vendorName.toLowerCase().replace(/\s+/g, '_')}`,
          type: "prepaid",
          description: `Prepaid expense for ${recurring.vendorName}`,
          debitAccount: "Prepaid Expenses",
          creditAccount: "Cash",
          amount: amount,
          reasoning: `Annual or multi-month payment to ${recurring.vendorName} should be amortized over the service period`,
          period: monthLabel,
          priority: "medium",
        });
      }
    }

    const softwareResult = await db.select({
      totalSpend: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
      or(
        sql`LOWER(${categories.name}) LIKE '%software%'`,
        sql`LOWER(${categories.name}) LIKE '%saas%'`,
        sql`LOWER(${categories.name}) LIKE '%subscription%'`
      )
    ));

    const softwareSpend = parseFloat(softwareResult[0]?.totalSpend || "0");
    
    if (softwareSpend > 0) {
      suggestions.push({
        id: "accrual_software",
        type: "accrual",
        description: "Accrue software subscription expenses",
        debitAccount: "Software Expense",
        creditAccount: "Accrued Expenses",
        amount: softwareSpend,
        reasoning: "Monthly software costs should be accrued in the period incurred",
        period: monthLabel,
        priority: "low",
      });
    }

    const payrollResult = await db.select({
      totalSpend: sql<string>`SUM(ABS(CAST(${transactions.amount} AS numeric)))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
      or(
        sql`LOWER(${categories.name}) LIKE '%payroll%'`,
        sql`LOWER(${categories.name}) LIKE '%salary%'`,
        sql`LOWER(${categories.name}) LIKE '%wages%'`
      )
    ));

    const payrollSpend = parseFloat(payrollResult[0]?.totalSpend || "0");
    const payrollAccrual = payrollSpend * 0.1;

    if (payrollAccrual > 1000) {
      suggestions.push({
        id: "accrual_payroll",
        type: "accrual",
        description: "Accrue payroll taxes and benefits",
        debitAccount: "Payroll Tax Expense",
        creditAccount: "Accrued Payroll Liabilities",
        amount: Math.round(payrollAccrual),
        reasoning: "Estimated payroll tax and benefit accrual based on 10% of payroll",
        period: monthLabel,
        priority: "high",
      });
    }

    const revenueResult = await db.select({
      totalRevenue: sql<string>`SUM(CASE WHEN CAST(${transactions.amount} AS numeric) > 0 THEN CAST(${transactions.amount} AS numeric) ELSE 0 END)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, organizationId),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd)
    ));

    const totalRevenue = parseFloat(revenueResult[0]?.totalRevenue || "0");
    
    if (totalRevenue > 0) {
      suggestions.push({
        id: "revenue_recognition",
        type: "revenue_recognition",
        description: "Review revenue recognition timing",
        debitAccount: "Accounts Receivable / Cash",
        creditAccount: "Revenue",
        amount: totalRevenue,
        reasoning: "Verify revenue is recognized in the correct period per ASC 606 guidelines",
        period: monthLabel,
        priority: "medium",
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
  }
}

export const monthEndCloseEngine = new MonthEndCloseEngine();
