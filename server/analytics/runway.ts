import type { RunwayMetrics, TransactionForAnalytics, PlannedHireForAnalytics } from "./types";
import { calculateMonthlyBurn, getBurnDataQuality } from "./burn";

/**
 * Safely parse and validate a numeric amount
 */
function safeAmount(amount: number | string | undefined | null): number {
  if (amount === undefined || amount === null) return 0;
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculate runway metrics with confidence indicators
 * Handles edge cases like zero burn, negative cash, and insufficient data
 */
export function calculateRunway(
  transactions: TransactionForAnalytics[],
  currentCash: number,
  plannedHires: PlannedHireForAnalytics[] = []
): RunwayMetrics & { confidence?: 'high' | 'medium' | 'low' | 'insufficient' } {
  // Validate and sanitize currentCash
  const safeCash = safeAmount(currentCash);
  
  // Get data quality metrics to understand reliability
  const dataQuality = getBurnDataQuality(transactions, 3);
  
  // Calculate monthly burn with fallback
  const monthlyBurn = calculateMonthlyBurn(transactions, 3);
  
  const now = new Date();
  let additionalHireCosts = 0;
  
  // Calculate additional hire costs for hires that have already started
  for (const hire of plannedHires || []) {
    if (!hire) continue;
    const hireDate = hire.startDate instanceof Date ? hire.startDate : new Date(hire.startDate);
    if (hireDate <= now) {
      additionalHireCosts += safeAmount(hire.monthlyCost);
    }
  }
  
  const totalMonthlyBurn = monthlyBurn + additionalHireCosts;
  
  // Handle zero or negative burn (company is profitable or break-even)
  if (totalMonthlyBurn <= 0) {
    return {
      currentCash: Math.round(safeCash * 100) / 100,
      monthlyBurn: Math.round(totalMonthlyBurn * 100) / 100,
      runwayMonths: Infinity,
      zeroDate: null,
      confidence: dataQuality.confidence,
    };
  }
  
  // Handle zero or negative cash (already out of runway)
  if (safeCash <= 0) {
    return {
      currentCash: Math.round(safeCash * 100) / 100,
      monthlyBurn: Math.round(totalMonthlyBurn * 100) / 100,
      runwayMonths: 0,
      zeroDate: new Date(), // Already at zero
      confidence: dataQuality.confidence,
    };
  }
  
  const runwayMonths = safeCash / totalMonthlyBurn;
  
  // Calculate zero date with safeguards
  const zeroDate = new Date();
  const monthsToAdd = Math.min(Math.floor(runwayMonths), 120); // Cap at 10 years
  zeroDate.setMonth(zeroDate.getMonth() + monthsToAdd);
  
  return {
    currentCash: Math.round(safeCash * 100) / 100,
    monthlyBurn: Math.round(totalMonthlyBurn * 100) / 100,
    runwayMonths: Math.round(runwayMonths * 10) / 10, // Round to 1 decimal
    zeroDate,
    confidence: dataQuality.confidence,
  };
}

/**
 * Calculate runway with multiple scenarios for comparison
 */
export function calculateRunwayWithScenarios(
  transactions: TransactionForAnalytics[],
  currentCash: number,
  plannedHires: PlannedHireForAnalytics[] = [],
  scenarios: { name: string; burnMultiplier?: number; cashAdjustment?: number }[] = []
): Record<string, RunwayMetrics> {
  const results: Record<string, RunwayMetrics> = {};
  
  const baseline = calculateRunway(transactions, currentCash, plannedHires);
  results.baseline = baseline;
  
  const baseMonthlyBurn = baseline.monthlyBurn;
  const safeCash = safeAmount(currentCash);
  
  for (const scenario of scenarios || []) {
    if (!scenario?.name) continue;
    
    const burnMultiplier = Number.isFinite(scenario.burnMultiplier) ? scenario.burnMultiplier : 1;
    const cashAdjustment = Number.isFinite(scenario.cashAdjustment) ? scenario.cashAdjustment : 0;
    
    const adjustedBurn = baseMonthlyBurn * burnMultiplier;
    const adjustedCash = safeCash + cashAdjustment;
    
    if (adjustedBurn <= 0) {
      results[scenario.name] = {
        currentCash: Math.round(adjustedCash * 100) / 100,
        monthlyBurn: Math.round(adjustedBurn * 100) / 100,
        runwayMonths: Infinity,
        zeroDate: null,
      };
    } else if (adjustedCash <= 0) {
      results[scenario.name] = {
        currentCash: Math.round(adjustedCash * 100) / 100,
        monthlyBurn: Math.round(adjustedBurn * 100) / 100,
        runwayMonths: 0,
        zeroDate: new Date(),
      };
    } else {
      const runwayMonths = adjustedCash / adjustedBurn;
      const zeroDate = new Date();
      const monthsToAdd = Math.min(Math.floor(runwayMonths), 120);
      zeroDate.setMonth(zeroDate.getMonth() + monthsToAdd);
      
      results[scenario.name] = {
        currentCash: Math.round(adjustedCash * 100) / 100,
        monthlyBurn: Math.round(adjustedBurn * 100) / 100,
        runwayMonths: Math.round(runwayMonths * 10) / 10,
        zeroDate,
      };
    }
  }
  
  return results;
}
