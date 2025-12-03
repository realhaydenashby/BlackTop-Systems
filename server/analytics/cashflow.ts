import type { CashFlowMetrics, MonthlyData, TransactionForAnalytics } from "./types";
import { calculateBurnRate } from "./burn";

/**
 * Safely parse and validate a numeric amount
 */
function safeAmount(amount: number | string | undefined | null): number {
  if (amount === undefined || amount === null) return 0;
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculate cash flow metrics for a given period
 * Handles edge cases like empty transactions, invalid dates, and NaN values
 */
export function calculateCashFlow(
  transactions: TransactionForAnalytics[],
  startDate: Date,
  endDate: Date,
  startingBalance: number = 0
): CashFlowMetrics {
  // Guard against invalid date ranges
  if (startDate > endDate) {
    return createEmptyCashFlowMetrics(startingBalance);
  }

  // Guard against null/undefined transactions
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return createEmptyCashFlowMetrics(startingBalance);
  }

  const safeStartBalance = safeAmount(startingBalance);

  const filteredTxns = transactions.filter((txn) => {
    if (!txn?.date) return false;
    const txnDate = txn.date instanceof Date ? txn.date : new Date(txn.date);
    if (isNaN(txnDate.getTime())) return false;
    return txnDate >= startDate && txnDate <= endDate;
  });

  let inflows = 0;
  let outflows = 0;

  for (const txn of filteredTxns) {
    const amount = Math.abs(safeAmount(txn.amount));
    if (amount === 0) continue;
    
    if (txn.type === "credit") {
      inflows += amount;
    } else {
      outflows += amount;
    }
  }

  const netFlow = inflows - outflows;
  const endingBalance = safeStartBalance + netFlow;

  return {
    inflows: Math.round(inflows * 100) / 100,
    outflows: Math.round(outflows * 100) / 100,
    netFlow: Math.round(netFlow * 100) / 100,
    endingBalance: Math.round(endingBalance * 100) / 100,
  };
}

function createEmptyCashFlowMetrics(startingBalance: number = 0): CashFlowMetrics {
  const safeBalance = safeAmount(startingBalance);
  return {
    inflows: 0,
    outflows: 0,
    netFlow: 0,
    endingBalance: safeBalance,
  };
}

/**
 * Calculate monthly cash flow over a period
 * Returns array with cash flow data for each month
 */
export function calculateMonthlyCashFlow(
  transactions: TransactionForAnalytics[],
  months: number = 12,
  currentCash: number = 0
): MonthlyData[] {
  // Guard against invalid months value
  if (months <= 0 || !Number.isFinite(months)) {
    return [];
  }

  const monthlyData: MonthlyData[] = [];
  const now = new Date();
  let runningBalance = safeAmount(currentCash);

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const monthTxns = (transactions || []).filter((txn) => {
      if (!txn?.date) return false;
      const txnDate = txn.date instanceof Date ? txn.date : new Date(txn.date);
      return txnDate >= monthStart && txnDate <= monthEnd;
    });

    const burn = calculateBurnRate(transactions, monthStart, monthEnd);
    
    const cashFlow = calculateCashFlow(
      transactions,
      monthStart,
      monthEnd,
      runningBalance
    );

    runningBalance = cashFlow.endingBalance;

    monthlyData.push({
      month: monthStart,
      burn,
      cashFlow,
      transactionCount: monthTxns.length,
    });
  }

  return monthlyData;
}

/**
 * Calculate cash flow broken down by category
 * Handles edge cases like missing categories and invalid amounts
 */
export function calculateCashFlowByCategory(
  transactions: TransactionForAnalytics[],
  startDate: Date,
  endDate: Date
): Record<string, { inflows: number; outflows: number }> {
  // Guard against invalid date ranges
  if (startDate > endDate) {
    return {};
  }

  // Guard against null/undefined transactions
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {};
  }

  const filteredTxns = transactions.filter((txn) => {
    if (!txn?.date) return false;
    const txnDate = txn.date instanceof Date ? txn.date : new Date(txn.date);
    if (isNaN(txnDate.getTime())) return false;
    return txnDate >= startDate && txnDate <= endDate;
  });

  const byCategory: Record<string, { inflows: number; outflows: number }> = {};

  for (const txn of filteredTxns) {
    const category = txn.categoryId || "uncategorized";
    if (!byCategory[category]) {
      byCategory[category] = { inflows: 0, outflows: 0 };
    }

    const amount = Math.abs(safeAmount(txn.amount));
    if (amount === 0) continue;
    
    if (txn.type === "credit") {
      byCategory[category].inflows += amount;
    } else {
      byCategory[category].outflows += amount;
    }
  }

  // Round all values
  for (const category of Object.keys(byCategory)) {
    byCategory[category].inflows = Math.round(byCategory[category].inflows * 100) / 100;
    byCategory[category].outflows = Math.round(byCategory[category].outflows * 100) / 100;
  }

  return byCategory;
}
