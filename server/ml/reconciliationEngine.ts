import { db } from "../db";
import {
  transactions,
  invoicesAndBills,
  reconciliationMatches,
  reconciliationDiscrepancies,
  vendors,
  type Transaction,
  type InvoiceAndBill,
  type InsertReconciliationMatch,
  type InsertReconciliationDiscrepancy,
} from "@shared/schema";
import { eq, and, gte, lte, sql, or, isNull, desc, asc } from "drizzle-orm";
import { differenceInDays, format } from "date-fns";

interface MatchCandidate {
  invoice: InvoiceAndBill;
  score: number;
  matchedOn: string[];
  amountDiff: number;
}

interface ReconciliationResult {
  matched: number;
  partial: number;
  unmatched: number;
  discrepancies: number;
  details: {
    matchedTransactions: string[];
    unmatchedTransactions: string[];
    newDiscrepancies: string[];
  };
}

export class ReconciliationEngine {
  private readonly AMOUNT_TOLERANCE = 0.01; // 1 cent tolerance for exact match
  private readonly PARTIAL_TOLERANCE = 0.05; // 5% tolerance for partial match
  private readonly DATE_WINDOW_DAYS = 30; // Look for invoices within 30 days
  private readonly MIN_MATCH_SCORE = 0.5; // Minimum score to consider a match

  async syncInvoicesFromQuickBooks(
    organizationId: string,
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ imported: number; updated: number }> {
    const { quickBooksService } = await import("../quickbooksService");
    
    let imported = 0;
    let updated = 0;

    try {
      const invoices = await quickBooksService.getInvoices(
        userId,
        format(startDate, "yyyy-MM-dd"),
        format(endDate, "yyyy-MM-dd")
      );

      for (const inv of invoices) {
        const existing = await db.query.invoicesAndBills.findFirst({
          where: and(
            eq(invoicesAndBills.organizationId, organizationId),
            eq(invoicesAndBills.source, "quickbooks"),
            eq(invoicesAndBills.externalId, inv.Id)
          ),
        });

        const invoiceData = {
          organizationId,
          source: "quickbooks" as const,
          externalId: inv.Id,
          type: "invoice" as const,
          status: this.mapQBInvoiceStatus(inv.Balance, inv.TotalAmt),
          number: inv.DocNumber || null,
          date: new Date(inv.TxnDate),
          totalAmount: inv.TotalAmt.toString(),
          amountPaid: ((inv.TotalAmt || 0) - (inv.Balance || 0)).toString(),
          balance: (inv.Balance || 0).toString(),
          counterpartyName: inv.CustomerRef?.name || null,
          counterpartyId: inv.CustomerRef?.value || null,
          lastSyncedAt: new Date(),
          metadata: { qbId: inv.Id, docNumber: inv.DocNumber },
        };

        if (existing) {
          await db.update(invoicesAndBills)
            .set({ ...invoiceData, updatedAt: new Date() })
            .where(eq(invoicesAndBills.id, existing.id));
          updated++;
        } else {
          await db.insert(invoicesAndBills).values(invoiceData);
          imported++;
        }
      }

      const purchases = await quickBooksService.getPurchases(
        userId,
        format(startDate, "yyyy-MM-dd"),
        format(endDate, "yyyy-MM-dd")
      );

      for (const purchase of purchases) {
        const existing = await db.query.invoicesAndBills.findFirst({
          where: and(
            eq(invoicesAndBills.organizationId, organizationId),
            eq(invoicesAndBills.source, "quickbooks"),
            eq(invoicesAndBills.externalId, `purchase-${purchase.Id}`)
          ),
        });

        const billData = {
          organizationId,
          source: "quickbooks" as const,
          externalId: `purchase-${purchase.Id}`,
          type: "bill" as const,
          status: "paid" as const,
          number: purchase.DocNumber || null,
          date: new Date(purchase.TxnDate),
          totalAmount: purchase.TotalAmt.toString(),
          amountPaid: purchase.TotalAmt.toString(),
          balance: "0",
          counterpartyName: purchase.EntityRef?.name || null,
          counterpartyId: purchase.EntityRef?.value || null,
          lastSyncedAt: new Date(),
          metadata: { qbType: "Purchase", qbId: purchase.Id },
        };

        if (existing) {
          await db.update(invoicesAndBills)
            .set({ ...billData, updatedAt: new Date() })
            .where(eq(invoicesAndBills.id, existing.id));
          updated++;
        } else {
          await db.insert(invoicesAndBills).values(billData);
          imported++;
        }
      }
    } catch (error) {
      console.error("Error syncing invoices from QuickBooks:", error);
      throw error;
    }

    return { imported, updated };
  }

  async syncInvoicesFromXero(
    organizationId: string,
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ imported: number; updated: number }> {
    const { xeroService } = await import("../xeroService");
    
    let imported = 0;
    let updated = 0;

    try {
      const invoices = await xeroService.getInvoices(userId, startDate, endDate);

      for (const inv of invoices) {
        const existing = await db.query.invoicesAndBills.findFirst({
          where: and(
            eq(invoicesAndBills.organizationId, organizationId),
            eq(invoicesAndBills.source, "xero"),
            eq(invoicesAndBills.externalId, inv.invoiceID)
          ),
        });

        const invoiceType = inv.type === "ACCPAY" ? "bill" : "invoice";
        
        const invoiceData = {
          organizationId,
          source: "xero" as const,
          externalId: inv.invoiceID,
          type: invoiceType as "invoice" | "bill",
          status: this.mapXeroInvoiceStatus(inv.status),
          number: inv.invoiceNumber || null,
          date: new Date(inv.date),
          dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
          totalAmount: (inv.total || 0).toString(),
          amountPaid: (inv.amountPaid || 0).toString(),
          balance: (inv.amountDue || 0).toString(),
          currency: inv.currencyCode || "USD",
          counterpartyName: inv.contact?.name || null,
          counterpartyId: inv.contact?.contactID || null,
          lineItems: inv.lineItems,
          lastSyncedAt: new Date(),
          metadata: { xeroId: inv.invoiceID, xeroStatus: inv.status },
        };

        if (existing) {
          await db.update(invoicesAndBills)
            .set({ ...invoiceData, updatedAt: new Date() })
            .where(eq(invoicesAndBills.id, existing.id));
          updated++;
        } else {
          await db.insert(invoicesAndBills).values(invoiceData);
          imported++;
        }
      }

      const bills = await xeroService.getBills(userId, startDate, endDate);

      for (const bill of bills) {
        const existing = await db.query.invoicesAndBills.findFirst({
          where: and(
            eq(invoicesAndBills.organizationId, organizationId),
            eq(invoicesAndBills.source, "xero"),
            eq(invoicesAndBills.externalId, bill.invoiceID)
          ),
        });

        if (!existing) {
          const billData = {
            organizationId,
            source: "xero" as const,
            externalId: bill.invoiceID,
            type: "bill" as const,
            status: this.mapXeroInvoiceStatus(bill.status),
            number: bill.invoiceNumber || null,
            date: new Date(bill.date),
            dueDate: bill.dueDate ? new Date(bill.dueDate) : null,
            totalAmount: (bill.total || 0).toString(),
            amountPaid: (bill.amountPaid || 0).toString(),
            balance: (bill.amountDue || 0).toString(),
            currency: bill.currencyCode || "USD",
            counterpartyName: bill.contact?.name || null,
            counterpartyId: bill.contact?.contactID || null,
            lineItems: bill.lineItems,
            lastSyncedAt: new Date(),
            metadata: { xeroId: bill.invoiceID, xeroStatus: bill.status },
          };

          await db.insert(invoicesAndBills).values(billData);
          imported++;
        }
      }
    } catch (error) {
      console.error("Error syncing invoices from Xero:", error);
      throw error;
    }

    return { imported, updated };
  }

  async runReconciliation(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      matched: 0,
      partial: 0,
      unmatched: 0,
      discrepancies: 0,
      details: {
        matchedTransactions: [],
        unmatchedTransactions: [],
        newDiscrepancies: [],
      },
    };

    // Build conditions array, filtering out undefined values
    const conditions = [
      eq(transactions.organizationId, organizationId),
      ...(startDate && endDate ? [
        gte(transactions.date, startDate),
        lte(transactions.date, endDate)
      ] : [])
    ];

    const txns = await db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: [desc(transactions.date)],
    });

    const invoices = await db.query.invoicesAndBills.findMany({
      where: eq(invoicesAndBills.organizationId, organizationId),
      orderBy: [desc(invoicesAndBills.date)],
    });

    for (const txn of txns) {
      const existingMatch = await db.query.reconciliationMatches.findFirst({
        where: and(
          eq(reconciliationMatches.transactionId, txn.id),
          or(
            eq(reconciliationMatches.status, "matched"),
            eq(reconciliationMatches.status, "confirmed")
          )
        ),
      });

      if (existingMatch) {
        continue;
      }

      const matchCandidates = this.findMatchCandidates(txn, invoices);

      if (matchCandidates.length === 0) {
        result.unmatched++;
        result.details.unmatchedTransactions.push(txn.id);

        const txnAmount = Math.abs(parseFloat(txn.amount));
        if (txnAmount > 100) {
          await this.createDiscrepancy({
            organizationId,
            transactionId: txn.id,
            type: "missing_invoice",
            severity: txnAmount > 1000 ? "critical" : "warning",
            title: `No matching invoice for ${txn.vendorNormalized || txn.vendorOriginal || "unknown vendor"}`,
            description: `Transaction of ${this.formatCurrency(txnAmount)} on ${format(txn.date, "MMM d, yyyy")} has no corresponding invoice`,
            actualAmount: txn.amount,
            suggestedAction: "Review this transaction and either find the matching invoice or mark as reconciled",
          });
          result.discrepancies++;
          result.details.newDiscrepancies.push(txn.id);
        }

        continue;
      }

      const bestMatch = matchCandidates[0];
      
      if (bestMatch.score >= 0.9) {
        await this.createMatch({
          organizationId,
          transactionId: txn.id,
          invoiceId: bestMatch.invoice.id,
          status: "matched",
          confidence: "high",
          confidenceScore: bestMatch.score.toFixed(3),
          matchedOn: bestMatch.matchedOn,
          transactionAmount: txn.amount,
          invoiceAmount: bestMatch.invoice.totalAmount,
          amountDifference: bestMatch.amountDiff.toFixed(2),
        });
        result.matched++;
        result.details.matchedTransactions.push(txn.id);

        if (Math.abs(bestMatch.amountDiff) > this.AMOUNT_TOLERANCE) {
          await this.createDiscrepancy({
            organizationId,
            transactionId: txn.id,
            invoiceId: bestMatch.invoice.id,
            type: "amount_mismatch",
            severity: Math.abs(bestMatch.amountDiff) > 100 ? "warning" : "info",
            title: `Amount difference: ${this.formatCurrency(Math.abs(bestMatch.amountDiff))}`,
            description: `Transaction amount ${this.formatCurrency(parseFloat(txn.amount))} differs from invoice ${this.formatCurrency(parseFloat(bestMatch.invoice.totalAmount))}`,
            expectedAmount: bestMatch.invoice.totalAmount,
            actualAmount: txn.amount,
            difference: bestMatch.amountDiff.toFixed(2),
            suggestedAction: "Verify this is an expected difference (fees, discounts, etc.)",
          });
          result.discrepancies++;
        }
      } else if (bestMatch.score >= 0.7) {
        await this.createMatch({
          organizationId,
          transactionId: txn.id,
          invoiceId: bestMatch.invoice.id,
          status: "suggested",
          confidence: "medium",
          confidenceScore: bestMatch.score.toFixed(3),
          matchedOn: bestMatch.matchedOn,
          transactionAmount: txn.amount,
          invoiceAmount: bestMatch.invoice.totalAmount,
          amountDifference: bestMatch.amountDiff.toFixed(2),
        });
        result.partial++;
      } else if (bestMatch.score >= this.MIN_MATCH_SCORE) {
        await this.createMatch({
          organizationId,
          transactionId: txn.id,
          invoiceId: bestMatch.invoice.id,
          status: "suggested",
          confidence: "low",
          confidenceScore: bestMatch.score.toFixed(3),
          matchedOn: bestMatch.matchedOn,
          transactionAmount: txn.amount,
          invoiceAmount: bestMatch.invoice.totalAmount,
          amountDifference: bestMatch.amountDiff.toFixed(2),
        });
        result.partial++;
      } else {
        result.unmatched++;
        result.details.unmatchedTransactions.push(txn.id);
      }
    }

    await this.checkForMissingPayments(organizationId, invoices);

    return result;
  }

  private findMatchCandidates(
    txn: Transaction,
    invoices: InvoiceAndBill[]
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];
    const txnAmount = Math.abs(parseFloat(txn.amount));
    const txnDate = txn.date;
    const txnVendor = (txn.vendorNormalized || txn.vendorOriginal || "").toLowerCase();

    for (const invoice of invoices) {
      const invoiceAmount = parseFloat(invoice.totalAmount);
      const invoiceDate = invoice.date;
      const invoiceVendor = (invoice.counterpartyName || "").toLowerCase();

      let score = 0;
      const matchedOn: string[] = [];

      const amountDiff = txnAmount - invoiceAmount;
      const amountRatio = Math.abs(amountDiff) / Math.max(txnAmount, invoiceAmount);

      if (amountRatio <= this.AMOUNT_TOLERANCE / 100) {
        score += 0.5;
        matchedOn.push("exact_amount");
      } else if (amountRatio <= this.PARTIAL_TOLERANCE) {
        score += 0.3;
        matchedOn.push("amount");
      } else if (amountRatio <= 0.1) {
        score += 0.1;
        matchedOn.push("approximate_amount");
      } else {
        continue;
      }

      const daysDiff = Math.abs(differenceInDays(txnDate, invoiceDate));
      if (daysDiff <= 7) {
        score += 0.25;
        matchedOn.push("date_close");
      } else if (daysDiff <= this.DATE_WINDOW_DAYS) {
        score += 0.15;
        matchedOn.push("date");
      } else if (daysDiff <= 60) {
        score += 0.05;
      } else {
        continue;
      }

      if (txnVendor && invoiceVendor) {
        const vendorSimilarity = this.calculateStringSimilarity(txnVendor, invoiceVendor);
        if (vendorSimilarity >= 0.8) {
          score += 0.25;
          matchedOn.push("vendor");
        } else if (vendorSimilarity >= 0.5) {
          score += 0.1;
          matchedOn.push("partial_vendor");
        }
      }

      const isExpense = parseFloat(txn.amount) < 0;
      const isBill = invoice.type === "bill";
      if ((isExpense && isBill) || (!isExpense && !isBill)) {
        score += 0.1;
        matchedOn.push("type");
      }

      if (score >= this.MIN_MATCH_SCORE) {
        candidates.push({
          invoice,
          score,
          matchedOn,
          amountDiff,
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;

    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private async createMatch(data: InsertReconciliationMatch): Promise<void> {
    const existing = await db.query.reconciliationMatches.findFirst({
      where: and(
        eq(reconciliationMatches.transactionId, data.transactionId),
        data.invoiceId ? eq(reconciliationMatches.invoiceId, data.invoiceId) : isNull(reconciliationMatches.invoiceId)
      ),
    });

    if (existing) {
      await db.update(reconciliationMatches)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(reconciliationMatches.id, existing.id));
    } else {
      await db.insert(reconciliationMatches).values(data);
    }
  }

  private async createDiscrepancy(data: InsertReconciliationDiscrepancy): Promise<void> {
    const existing = await db.query.reconciliationDiscrepancies.findFirst({
      where: and(
        eq(reconciliationDiscrepancies.organizationId, data.organizationId!),
        eq(reconciliationDiscrepancies.type, data.type!),
        data.transactionId 
          ? eq(reconciliationDiscrepancies.transactionId, data.transactionId)
          : isNull(reconciliationDiscrepancies.transactionId),
        data.invoiceId
          ? eq(reconciliationDiscrepancies.invoiceId, data.invoiceId)
          : isNull(reconciliationDiscrepancies.invoiceId)
      ),
    });

    if (!existing) {
      await db.insert(reconciliationDiscrepancies).values(data);
    }
  }

  private async checkForMissingPayments(
    organizationId: string,
    invoices: InvoiceAndBill[]
  ): Promise<void> {
    for (const invoice of invoices) {
      if (invoice.status !== "paid") continue;

      const match = await db.query.reconciliationMatches.findFirst({
        where: and(
          eq(reconciliationMatches.invoiceId, invoice.id),
          or(
            eq(reconciliationMatches.status, "matched"),
            eq(reconciliationMatches.status, "confirmed")
          )
        ),
      });

      if (!match) {
        const invoiceAmount = parseFloat(invoice.totalAmount);
        
        if (invoiceAmount > 100) {
          await this.createDiscrepancy({
            organizationId,
            invoiceId: invoice.id,
            type: "missing_payment",
            severity: invoiceAmount > 1000 ? "warning" : "info",
            title: `Invoice ${invoice.number || invoice.externalId} marked paid but no matching bank transaction`,
            description: `Invoice for ${invoice.counterpartyName || "unknown"} of ${this.formatCurrency(invoiceAmount)} shows as paid but no corresponding bank transaction found`,
            expectedAmount: invoice.totalAmount,
            suggestedAction: "Verify payment was received and locate the matching bank transaction",
          });
        }
      }
    }
  }

  async confirmMatch(matchId: string, userId: string, notes?: string): Promise<void> {
    await db.update(reconciliationMatches)
      .set({
        status: "confirmed",
        confirmedBy: userId,
        confirmedAt: new Date(),
        notes,
        updatedAt: new Date(),
      })
      .where(eq(reconciliationMatches.id, matchId));
  }

  async rejectMatch(matchId: string, userId: string, notes?: string): Promise<void> {
    await db.update(reconciliationMatches)
      .set({
        status: "rejected",
        confirmedBy: userId,
        confirmedAt: new Date(),
        notes,
        updatedAt: new Date(),
      })
      .where(eq(reconciliationMatches.id, matchId));
  }

  async resolveDiscrepancy(
    discrepancyId: string,
    userId: string,
    resolution: "resolved" | "ignored",
    notes?: string
  ): Promise<void> {
    await db.update(reconciliationDiscrepancies)
      .set({
        resolution,
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(reconciliationDiscrepancies.id, discrepancyId));
  }

  async getReconciliationSummary(organizationId: string): Promise<{
    totalTransactions: number;
    matchedCount: number;
    suggestedCount: number;
    unmatchedCount: number;
    discrepancyCount: number;
    matchRate: number;
  }> {
    const [matches] = await db.select({
      matched: sql<number>`COUNT(*) FILTER (WHERE ${reconciliationMatches.status} IN ('matched', 'confirmed'))`,
      suggested: sql<number>`COUNT(*) FILTER (WHERE ${reconciliationMatches.status} = 'suggested')`,
      rejected: sql<number>`COUNT(*) FILTER (WHERE ${reconciliationMatches.status} = 'rejected')`,
    })
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.organizationId, organizationId));

    const [txnCount] = await db.select({
      count: sql<number>`COUNT(*)`,
    })
      .from(transactions)
      .where(eq(transactions.organizationId, organizationId));

    const [discrepancies] = await db.select({
      count: sql<number>`COUNT(*) FILTER (WHERE ${reconciliationDiscrepancies.resolution} = 'open')`,
    })
      .from(reconciliationDiscrepancies)
      .where(eq(reconciliationDiscrepancies.organizationId, organizationId));

    const total = Number(txnCount?.count || 0);
    const matched = Number(matches?.matched || 0);
    const suggested = Number(matches?.suggested || 0);

    return {
      totalTransactions: total,
      matchedCount: matched,
      suggestedCount: suggested,
      unmatchedCount: total - matched - suggested,
      discrepancyCount: Number(discrepancies?.count || 0),
      matchRate: total > 0 ? (matched / total) * 100 : 0,
    };
  }

  async getPendingMatches(organizationId: string): Promise<any[]> {
    return db.query.reconciliationMatches.findMany({
      where: and(
        eq(reconciliationMatches.organizationId, organizationId),
        eq(reconciliationMatches.status, "suggested")
      ),
      orderBy: [desc(reconciliationMatches.confidenceScore)],
    });
  }

  async getOpenDiscrepancies(organizationId: string): Promise<any[]> {
    return db.query.reconciliationDiscrepancies.findMany({
      where: and(
        eq(reconciliationDiscrepancies.organizationId, organizationId),
        eq(reconciliationDiscrepancies.resolution, "open")
      ),
      orderBy: [
        asc(sql`CASE ${reconciliationDiscrepancies.severity} WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END`),
        desc(reconciliationDiscrepancies.createdAt),
      ],
    });
  }

  private mapQBInvoiceStatus(balance: number | undefined, total: number): "open" | "paid" | "partial" {
    if (!balance || balance === 0) return "paid";
    if (balance < total) return "partial";
    return "open";
  }

  private mapXeroInvoiceStatus(status: string): "open" | "paid" | "partial" | "overdue" | "void" {
    switch (status?.toUpperCase()) {
      case "PAID": return "paid";
      case "VOIDED": return "void";
      case "DELETED": return "void";
      case "AUTHORISED": return "open";
      case "DRAFT": return "open";
      default: return "open";
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
}

export const reconciliationEngine = new ReconciliationEngine();
