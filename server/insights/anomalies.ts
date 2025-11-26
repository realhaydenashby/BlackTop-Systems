import type { InsightGeneratorInput, VendorSpend, AnomalyDetectionResult } from "./types";

export function detectVendorSpikes(
  input: InsightGeneratorInput,
  thresholdPercent: number = 30
): VendorSpend[] {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const currentPeriodByVendor: Record<string, number> = {};
  const previousPeriodByVendor: Record<string, number> = {};

  for (const txn of input.transactions) {
    if (txn.type !== "debit" || !txn.vendorNormalized) continue;

    const vendor = txn.vendorNormalized;
    const amount = Math.abs(txn.amount);

    if (txn.date >= thisMonthStart) {
      currentPeriodByVendor[vendor] = (currentPeriodByVendor[vendor] || 0) + amount;
    } else if (txn.date >= lastMonthStart && txn.date <= lastMonthEnd) {
      previousPeriodByVendor[vendor] = (previousPeriodByVendor[vendor] || 0) + amount;
    }
  }

  const spikes: VendorSpend[] = [];

  for (const vendor of Object.keys(currentPeriodByVendor)) {
    const current = currentPeriodByVendor[vendor];
    const previous = previousPeriodByVendor[vendor] || 0;

    if (previous > 0) {
      const changePercent = ((current - previous) / previous) * 100;
      if (changePercent >= thresholdPercent) {
        spikes.push({
          vendor,
          currentPeriod: current,
          previousPeriod: previous,
          changePercent,
        });
      }
    }
  }

  return spikes.sort((a, b) => b.changePercent - a.changePercent);
}

export function detectSubscriptionCreep(
  input: InsightGeneratorInput
): { totalRecurring: number; change: number; subscriptions: Array<{ vendor: string; amount: number }> } {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const recentRecurring: Record<string, number[]> = {};
  const olderRecurring: Record<string, number[]> = {};

  for (const txn of input.transactions) {
    if (!txn.isRecurring || txn.type !== "debit" || !txn.vendorNormalized) continue;

    const vendor = txn.vendorNormalized;
    const amount = Math.abs(txn.amount);

    if (txn.date >= threeMonthsAgo) {
      if (!recentRecurring[vendor]) recentRecurring[vendor] = [];
      recentRecurring[vendor].push(amount);
    } else if (txn.date >= sixMonthsAgo) {
      if (!olderRecurring[vendor]) olderRecurring[vendor] = [];
      olderRecurring[vendor].push(amount);
    }
  }

  let recentTotal = 0;
  let olderTotal = 0;
  const subscriptions: Array<{ vendor: string; amount: number }> = [];

  for (const [vendor, amounts] of Object.entries(recentRecurring)) {
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    recentTotal += avgAmount;
    subscriptions.push({ vendor, amount: avgAmount });
  }

  for (const amounts of Object.values(olderRecurring)) {
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    olderTotal += avgAmount;
  }

  const change = olderTotal > 0 ? ((recentTotal - olderTotal) / olderTotal) * 100 : 0;

  return {
    totalRecurring: recentTotal,
    change,
    subscriptions: subscriptions.sort((a, b) => b.amount - a.amount),
  };
}

export function detectPayrollDrift(
  input: InsightGeneratorInput
): { currentPayroll: number; expectedPayroll: number; drift: number } {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const payrollByMonth: Record<string, number> = {};

  for (const txn of input.transactions) {
    if (!txn.isPayroll || txn.type !== "debit") continue;

    const monthKey = `${txn.date.getFullYear()}-${txn.date.getMonth()}`;
    payrollByMonth[monthKey] = (payrollByMonth[monthKey] || 0) + Math.abs(txn.amount);
  }

  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const currentPayroll = payrollByMonth[currentMonthKey] || 0;

  const historicalPayrolls: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (payrollByMonth[key]) {
      historicalPayrolls.push(payrollByMonth[key]);
    }
  }

  const expectedPayroll = historicalPayrolls.length > 0
    ? historicalPayrolls.reduce((a, b) => a + b, 0) / historicalPayrolls.length
    : currentPayroll;

  const drift = expectedPayroll > 0
    ? ((currentPayroll - expectedPayroll) / expectedPayroll) * 100
    : 0;

  return {
    currentPayroll,
    expectedPayroll,
    drift,
  };
}

export function detectAmountAnomalies(
  input: InsightGeneratorInput,
  stdDevThreshold: number = 2
): AnomalyDetectionResult[] {
  const vendorAmounts: Record<string, number[]> = {};

  for (const txn of input.transactions) {
    if (!txn.vendorNormalized || txn.type !== "debit") continue;
    
    const vendor = txn.vendorNormalized;
    if (!vendorAmounts[vendor]) vendorAmounts[vendor] = [];
    vendorAmounts[vendor].push(Math.abs(txn.amount));
  }

  const vendorStats: Record<string, { mean: number; stdDev: number }> = {};
  
  for (const [vendor, amounts] of Object.entries(vendorAmounts)) {
    if (amounts.length < 3) continue;
    
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    
    vendorStats[vendor] = { mean, stdDev };
  }

  const anomalies: AnomalyDetectionResult[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const txn of input.transactions) {
    if (!txn.vendorNormalized || txn.type !== "debit") continue;
    if (txn.date < thirtyDaysAgo) continue;

    const vendor = txn.vendorNormalized;
    const stats = vendorStats[vendor];
    if (!stats || stats.stdDev === 0) continue;

    const amount = Math.abs(txn.amount);
    const deviation = Math.abs(amount - stats.mean) / stats.stdDev;

    if (deviation > stdDevThreshold) {
      anomalies.push({
        transactionId: txn.id,
        vendor,
        amount,
        expectedAmount: stats.mean,
        deviation,
        date: txn.date,
      });
    }
  }

  return anomalies.sort((a, b) => b.deviation - a.deviation);
}
