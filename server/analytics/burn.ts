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
  "paylocity",
  "bamboohr",
  "zenefits",
  "quickbooks payroll",
  "intuit payroll",
];

function isPayrollTransaction(txn: TransactionForAnalytics): boolean {
  if (txn.isPayroll !== undefined) return txn.isPayroll;
  
  const vendor = (txn.vendorNormalized || "").toLowerCase();
  return PAYROLL_KEYWORDS.some((keyword) => vendor.includes(keyword));
}

/**
 * Safely parse and validate a numeric amount
 * Returns 0 for NaN, undefined, null, or non-numeric values
 */
function safeAmount(amount: number | string | undefined | null): number {
  if (amount === undefined || amount === null) return 0;
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculate burn rate metrics for a given period
 * Handles edge cases like empty transactions, NaN values, and negative amounts
 */
export function calculateBurnRate(
  transactions: TransactionForAnalytics[],
  startDate: Date,
  endDate: Date
): BurnMetrics {
  // Guard against invalid date ranges
  if (startDate > endDate) {
    return createEmptyBurnMetrics();
  }

  // Guard against null/undefined transactions array
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return createEmptyBurnMetrics();
  }

  const filteredTxns = transactions.filter((txn) => {
    // Validate transaction has required fields
    if (!txn || !txn.date) return false;
    const txnDate = txn.date instanceof Date ? txn.date : new Date(txn.date);
    if (isNaN(txnDate.getTime())) return false;
    return txnDate >= startDate && txnDate <= endDate;
  });

  let revenue = 0;
  let grossBurn = 0;
  let payroll = 0;
  let nonPayroll = 0;
  let recurring = 0;
  let oneTime = 0;

  for (const txn of filteredTxns) {
    const amount = Math.abs(safeAmount(txn.amount));
    
    // Skip zero amounts
    if (amount === 0) continue;

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
    grossBurn: Math.round(grossBurn * 100) / 100,
    netBurn: Math.round(netBurn * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    payroll: Math.round(payroll * 100) / 100,
    nonPayroll: Math.round(nonPayroll * 100) / 100,
    recurring: Math.round(recurring * 100) / 100,
    oneTime: Math.round(oneTime * 100) / 100,
  };
}

function createEmptyBurnMetrics(): BurnMetrics {
  return {
    grossBurn: 0,
    netBurn: 0,
    revenue: 0,
    payroll: 0,
    nonPayroll: 0,
    recurring: 0,
    oneTime: 0,
  };
}

/**
 * Calculate average monthly burn over a period
 * Returns 0 if no valid data or negative months value
 */
export function calculateMonthlyBurn(
  transactions: TransactionForAnalytics[],
  months: number = 3
): number {
  // Guard against invalid months value
  if (months <= 0 || !Number.isFinite(months)) {
    return 0;
  }

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0);

  const burn = calculateBurnRate(transactions, startDate, endDate);
  
  // Round to 2 decimal places
  return Math.round((burn.netBurn / months) * 100) / 100;
}

/**
 * Calculate monthly burn trend over time
 * Returns array with burn data for each month
 */
export function calculateBurnTrend(
  transactions: TransactionForAnalytics[],
  months: number = 6
): { month: Date; burn: number; transactionCount: number }[] {
  // Guard against invalid months value
  if (months <= 0 || !Number.isFinite(months)) {
    return [];
  }

  const trend: { month: Date; burn: number; transactionCount: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    // Count transactions in this month for data quality indicator
    const monthTxns = (transactions || []).filter((txn) => {
      if (!txn?.date) return false;
      const txnDate = txn.date instanceof Date ? txn.date : new Date(txn.date);
      return txnDate >= monthStart && txnDate <= monthEnd;
    });
    
    const burn = calculateBurnRate(transactions, monthStart, monthEnd);
    trend.push({
      month: monthStart,
      burn: burn.netBurn,
      transactionCount: monthTxns.length,
    });
  }

  return trend;
}

/**
 * Get data quality metrics for burn calculations
 * Helps users understand reliability of the numbers
 */
export function getBurnDataQuality(
  transactions: TransactionForAnalytics[],
  months: number = 3
): { 
  hasEnoughData: boolean; 
  monthsWithData: number;
  totalTransactions: number;
  averageTransactionsPerMonth: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
} {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      hasEnoughData: false,
      monthsWithData: 0,
      totalTransactions: 0,
      averageTransactionsPerMonth: 0,
      confidence: 'insufficient',
    };
  }

  const now = new Date();
  const monthsData: number[] = [];
  
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const count = transactions.filter((txn) => {
      if (!txn?.date) return false;
      const txnDate = txn.date instanceof Date ? txn.date : new Date(txn.date);
      return txnDate >= monthStart && txnDate <= monthEnd;
    }).length;
    
    monthsData.push(count);
  }

  const monthsWithData = monthsData.filter((c) => c > 0).length;
  const totalTransactions = monthsData.reduce((a, b) => a + b, 0);
  const averageTransactionsPerMonth = totalTransactions / months;

  let confidence: 'high' | 'medium' | 'low' | 'insufficient';
  if (monthsWithData < 2 || totalTransactions < 10) {
    confidence = 'insufficient';
  } else if (monthsWithData >= months && averageTransactionsPerMonth >= 20) {
    confidence = 'high';
  } else if (monthsWithData >= months - 1 && averageTransactionsPerMonth >= 10) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    hasEnoughData: monthsWithData >= 2 && totalTransactions >= 10,
    monthsWithData,
    totalTransactions,
    averageTransactionsPerMonth: Math.round(averageTransactionsPerMonth),
    confidence,
  };
}
