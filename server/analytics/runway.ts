import type { RunwayMetrics, TransactionForAnalytics, PlannedHireForAnalytics } from "./types";
import { calculateMonthlyBurn } from "./burn";

export function calculateRunway(
  transactions: TransactionForAnalytics[],
  currentCash: number,
  plannedHires: PlannedHireForAnalytics[] = []
): RunwayMetrics {
  const monthlyBurn = calculateMonthlyBurn(transactions, 3);
  
  const now = new Date();
  let additionalHireCosts = 0;
  
  for (const hire of plannedHires) {
    if (hire.startDate <= now) {
      additionalHireCosts += hire.monthlyCost;
    }
  }
  
  const totalMonthlyBurn = monthlyBurn + additionalHireCosts;
  
  if (totalMonthlyBurn <= 0) {
    return {
      currentCash,
      monthlyBurn: totalMonthlyBurn,
      runwayMonths: Infinity,
      zeroDate: null,
    };
  }
  
  const runwayMonths = currentCash / totalMonthlyBurn;
  
  const zeroDate = new Date();
  zeroDate.setMonth(zeroDate.getMonth() + Math.floor(runwayMonths));
  
  return {
    currentCash,
    monthlyBurn: totalMonthlyBurn,
    runwayMonths,
    zeroDate,
  };
}

export function calculateRunwayWithScenarios(
  transactions: TransactionForAnalytics[],
  currentCash: number,
  plannedHires: PlannedHireForAnalytics[] = [],
  scenarios: { name: string; burnMultiplier?: number; cashAdjustment?: number }[] = []
): Record<string, RunwayMetrics> {
  const results: Record<string, RunwayMetrics> = {};
  
  results.baseline = calculateRunway(transactions, currentCash, plannedHires);
  
  const baseMonthlyBurn = results.baseline.monthlyBurn;
  
  for (const scenario of scenarios) {
    const adjustedBurn = baseMonthlyBurn * (scenario.burnMultiplier || 1);
    const adjustedCash = currentCash + (scenario.cashAdjustment || 0);
    
    if (adjustedBurn <= 0) {
      results[scenario.name] = {
        currentCash: adjustedCash,
        monthlyBurn: adjustedBurn,
        runwayMonths: Infinity,
        zeroDate: null,
      };
    } else {
      const runwayMonths = adjustedCash / adjustedBurn;
      const zeroDate = new Date();
      zeroDate.setMonth(zeroDate.getMonth() + Math.floor(runwayMonths));
      
      results[scenario.name] = {
        currentCash: adjustedCash,
        monthlyBurn: adjustedBurn,
        runwayMonths,
        zeroDate,
      };
    }
  }
  
  return results;
}
