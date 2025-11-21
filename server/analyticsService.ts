// Financial analytics and insights calculation
import { subDays, subMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

interface Transaction {
  id: string;
  date: Date;
  amount: string;
  vendorId: string | null;
  categoryId: string | null;
  isRecurring: boolean;
}

interface Vendor {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface MonthlySpend {
  month: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
}

interface BurnAnalysis {
  avgMonthlyBurn: number;
  currentMonthBurn: number;
  burnTrend: "increasing" | "decreasing" | "stable";
  runway: number | null; // months
}

interface SpendingPattern {
  topVendors: Array<{ vendorId: string; vendorName: string; total: number; count: number }>;
  topCategories: Array<{ categoryId: string; categoryName: string; total: number; percentage: number }>;
  recurringTotal: number;
  oneTimeTotal: number;
}

export class AnalyticsService {
  /**
   * Calculate monthly spending trends
   */
  calculateMonthlyTrends(
    transactions: Transaction[],
    categories: Category[],
    months: number = 6
  ): MonthlySpend[] {
    const monthlyData: Record<string, MonthlySpend> = {};

    // Group transactions by month
    transactions.forEach((txn) => {
      const txnDate = new Date(txn.date);
      const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          total: 0,
          count: 0,
          byCategory: {},
        };
      }

      const amount = Math.abs(parseFloat(txn.amount));
      monthlyData[monthKey].total += amount;
      monthlyData[monthKey].count += 1;

      // Track by category
      if (txn.categoryId) {
        const category = categories.find((c) => c.id === txn.categoryId);
        const categoryName = category?.name || "Uncategorized";

        if (!monthlyData[monthKey].byCategory[categoryName]) {
          monthlyData[monthKey].byCategory[categoryName] = 0;
        }
        monthlyData[monthKey].byCategory[categoryName] += amount;
      }
    });

    // Sort by month and return
    return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Calculate burn rate and runway
   */
  calculateBurnRate(transactions: Transaction[], currentBalance: number = 0): BurnAnalysis {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const last3MonthsStart = startOfMonth(subMonths(now, 3));

    // Current month burn
    const currentMonthTxns = transactions.filter(
      (txn) => new Date(txn.date) >= currentMonthStart
    );
    const currentMonthBurn = currentMonthTxns.reduce(
      (sum, txn) => sum + Math.abs(parseFloat(txn.amount)),
      0
    );

    // Last 3 months average
    const last3MonthsTxns = transactions.filter(
      (txn) => new Date(txn.date) >= last3MonthsStart
    );
    const monthlyTotals: number[] = [];

    for (let i = 0; i < 3; i++) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));

      const monthTxns = transactions.filter((txn) => {
        const txnDate = new Date(txn.date);
        return txnDate >= monthStart && txnDate <= monthEnd;
      });

      const monthTotal = monthTxns.reduce(
        (sum, txn) => sum + Math.abs(parseFloat(txn.amount)),
        0
      );
      monthlyTotals.push(monthTotal);
    }

    const avgMonthlyBurn =
      monthlyTotals.reduce((sum, val) => sum + val, 0) / Math.max(monthlyTotals.length, 1);

    // Determine trend
    let burnTrend: "increasing" | "decreasing" | "stable" = "stable";
    if (monthlyTotals.length >= 2) {
      const recent = monthlyTotals.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const older = monthlyTotals.slice(2).reduce((a, b) => a + b, 0) / Math.max(monthlyTotals.slice(2).length, 1);

      if (recent > older * 1.1) burnTrend = "increasing";
      else if (recent < older * 0.9) burnTrend = "decreasing";
    }

    // Calculate runway (only if we have a positive balance)
    const runway = currentBalance > 0 && avgMonthlyBurn > 0
      ? currentBalance / avgMonthlyBurn
      : null;

    return {
      avgMonthlyBurn,
      currentMonthBurn,
      burnTrend,
      runway,
    };
  }

  /**
   * Analyze spending patterns
   */
  analyzeSpendingPatterns(
    transactions: Transaction[],
    vendors: Vendor[],
    categories: Category[]
  ): SpendingPattern {
    // Top vendors
    const vendorTotals: Record<string, { total: number; count: number; name: string }> = {};
    transactions.forEach((txn) => {
      if (txn.vendorId) {
        if (!vendorTotals[txn.vendorId]) {
          const vendor = vendors.find((v) => v.id === txn.vendorId);
          vendorTotals[txn.vendorId] = {
            total: 0,
            count: 0,
            name: vendor?.name || "Unknown",
          };
        }
        vendorTotals[txn.vendorId].total += Math.abs(parseFloat(txn.amount));
        vendorTotals[txn.vendorId].count += 1;
      }
    });

    const topVendors = Object.entries(vendorTotals)
      .map(([vendorId, data]) => ({
        vendorId,
        vendorName: data.name,
        total: data.total,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Top categories
    const categoryTotals: Record<string, { total: number; name: string }> = {};
    let totalSpend = 0;

    transactions.forEach((txn) => {
      const amount = Math.abs(parseFloat(txn.amount));
      totalSpend += amount;

      if (txn.categoryId) {
        if (!categoryTotals[txn.categoryId]) {
          const category = categories.find((c) => c.id === txn.categoryId);
          categoryTotals[txn.categoryId] = {
            total: 0,
            name: category?.name || "Uncategorized",
          };
        }
        categoryTotals[txn.categoryId].total += amount;
      }
    });

    const topCategories = Object.entries(categoryTotals)
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        total: data.total,
        percentage: totalSpend > 0 ? (data.total / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Recurring vs one-time
    const recurringTotal = transactions
      .filter((txn) => txn.isRecurring)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    const oneTimeTotal = transactions
      .filter((txn) => !txn.isRecurring)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    return {
      topVendors,
      topCategories,
      recurringTotal,
      oneTimeTotal,
    };
  }

  /**
   * Detect recurring transactions (subscriptions)
   * Groups transactions by vendor and looks for monthly patterns
   */
  async detectSubscriptions(transactions: Transaction[]): Promise<
    Array<{
      vendorId: string;
      avgAmount: number;
      frequency: number; // days between charges
      confidence: number;
      transactionIds: string[];
    }>
  > {
    // Group by vendor
    const byVendor: Record<string, Transaction[]> = {};

    transactions.forEach((txn) => {
      if (txn.vendorId) {
        if (!byVendor[txn.vendorId]) {
          byVendor[txn.vendorId] = [];
        }
        byVendor[txn.vendorId].push(txn);
      }
    });

    const subscriptions: Array<{
      vendorId: string;
      avgAmount: number;
      frequency: number;
      confidence: number;
      transactionIds: string[];
    }> = [];

    // Analyze each vendor
    for (const [vendorId, vendorTxns] of Object.entries(byVendor)) {
      // Need at least 3 transactions to detect pattern
      if (vendorTxns.length < 3) continue;

      // Sort by date
      const sorted = vendorTxns.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Calculate intervals between transactions
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const days = differenceInDays(new Date(sorted[i].date), new Date(sorted[i - 1].date));
        intervals.push(days);
      }

      // Check if intervals are consistent (monthly ~28-31 days)
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const variance =
        intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) /
        intervals.length;
      const stdDev = Math.sqrt(variance);

      // Monthly subscription: avg ~28-31 days, low variance
      const isMonthly = avgInterval >= 25 && avgInterval <= 35 && stdDev < 5;

      // Check amount consistency
      const amounts = sorted.map((txn) => Math.abs(parseFloat(txn.amount)));
      const avgAmount = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
      const amountVariance =
        amounts.reduce((sum, val) => sum + Math.pow(val - avgAmount, 2), 0) / amounts.length;
      const amountStdDev = Math.sqrt(amountVariance);

      // Low amount variance = likely subscription
      const amountConsistent = amountStdDev < avgAmount * 0.1; // Within 10%

      if (isMonthly && amountConsistent) {
        subscriptions.push({
          vendorId,
          avgAmount,
          frequency: Math.round(avgInterval),
          confidence: 0.9,
          transactionIds: sorted.map((txn) => txn.id),
        });
      } else if (isMonthly || amountConsistent) {
        // Partial match
        subscriptions.push({
          vendorId,
          avgAmount,
          frequency: Math.round(avgInterval),
          confidence: 0.6,
          transactionIds: sorted.map((txn) => txn.id),
        });
      }
    }

    return subscriptions;
  }
}

export const analyticsService = new AnalyticsService();
