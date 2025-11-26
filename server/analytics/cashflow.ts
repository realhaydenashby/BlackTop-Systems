import type { CashFlowMetrics, MonthlyData, TransactionForAnalytics } from "./types";
import { calculateBurnRate } from "./burn";

export function calculateCashFlow(
  transactions: TransactionForAnalytics[],
  startDate: Date,
  endDate: Date,
  startingBalance: number = 0
): CashFlowMetrics {
  const filteredTxns = transactions.filter(
    (txn) => txn.date >= startDate && txn.date <= endDate
  );

  let inflows = 0;
  let outflows = 0;

  for (const txn of filteredTxns) {
    const amount = Math.abs(txn.amount);
    if (txn.type === "credit") {
      inflows += amount;
    } else {
      outflows += amount;
    }
  }

  const netFlow = inflows - outflows;
  const endingBalance = startingBalance + netFlow;

  return {
    inflows,
    outflows,
    netFlow,
    endingBalance,
  };
}

export function calculateMonthlyCashFlow(
  transactions: TransactionForAnalytics[],
  months: number = 12,
  currentCash: number = 0
): MonthlyData[] {
  const monthlyData: MonthlyData[] = [];
  const now = new Date();
  let runningBalance = currentCash;

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const monthTxns = transactions.filter(
      (txn) => txn.date >= monthStart && txn.date <= monthEnd
    );

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

export function calculateCashFlowByCategory(
  transactions: TransactionForAnalytics[],
  startDate: Date,
  endDate: Date
): Record<string, { inflows: number; outflows: number }> {
  const filteredTxns = transactions.filter(
    (txn) => txn.date >= startDate && txn.date <= endDate
  );

  const byCategory: Record<string, { inflows: number; outflows: number }> = {};

  for (const txn of filteredTxns) {
    const category = txn.categoryId || "uncategorized";
    if (!byCategory[category]) {
      byCategory[category] = { inflows: 0, outflows: 0 };
    }

    const amount = Math.abs(txn.amount);
    if (txn.type === "credit") {
      byCategory[category].inflows += amount;
    } else {
      byCategory[category].outflows += amount;
    }
  }

  return byCategory;
}
