import type { BurnMetrics, TransactionForAnalytics } from "./types";

const PAYROLL_KEYWORDS = [
  "payroll",
  "salary",
  "wage",
  "gusto",
  "adp",
  "paychex",
  "rippling",
  "justworks",
  "deel",
  "remote.com",
];

function isPayrollTransaction(txn: TransactionForAnalytics): boolean {
  if (txn.isPayroll !== undefined) return txn.isPayroll;
  
  const vendor = (txn.vendorNormalized || "").toLowerCase();
  return PAYROLL_KEYWORDS.some((keyword) => vendor.includes(keyword));
}

export function calculateBurnRate(
  transactions: TransactionForAnalytics[],
  startDate: Date,
  endDate: Date
): BurnMetrics {
  const filteredTxns = transactions.filter(
    (txn) => txn.date >= startDate && txn.date <= endDate
  );

  let revenue = 0;
  let grossBurn = 0;
  let payroll = 0;
  let nonPayroll = 0;
  let recurring = 0;
  let oneTime = 0;

  for (const txn of filteredTxns) {
    const amount = Math.abs(txn.amount);

    if (txn.type === "credit") {
      revenue += amount;
    } else {
      grossBurn += amount;

      if (isPayrollTransaction(txn)) {
        payroll += amount;
      } else {
        nonPayroll += amount;
      }

      if (txn.isRecurring) {
        recurring += amount;
      } else {
        oneTime += amount;
      }
    }
  }

  const netBurn = grossBurn - revenue;

  return {
    grossBurn,
    netBurn,
    revenue,
    payroll,
    nonPayroll,
    recurring,
    oneTime,
  };
}

export function calculateMonthlyBurn(
  transactions: TransactionForAnalytics[],
  months: number = 3
): number {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0);

  const burn = calculateBurnRate(transactions, startDate, endDate);
  return burn.netBurn / months;
}

export function calculateBurnTrend(
  transactions: TransactionForAnalytics[],
  months: number = 6
): { month: Date; burn: number }[] {
  const trend: { month: Date; burn: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const burn = calculateBurnRate(transactions, monthStart, monthEnd);
    trend.push({
      month: monthStart,
      burn: burn.netBurn,
    });
  }

  return trend;
}
