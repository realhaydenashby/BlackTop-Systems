import type {
  Forecast,
  ForecastMonth,
  ForecastAssumptions,
  TransactionForAnalytics,
  PlannedHireForAnalytics,
} from "./types";
import { calculateMonthlyBurn, calculateBurnTrend } from "./burn";

function calculateGrowthRate(values: number[]): number {
  if (values.length < 2) return 0;
  
  const validValues = values.filter((v) => v > 0);
  if (validValues.length < 2) return 0;
  
  const rates: number[] = [];
  for (let i = 1; i < validValues.length; i++) {
    rates.push((validValues[i] - validValues[i - 1]) / validValues[i - 1]);
  }
  
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

export function generateForecast(
  transactions: TransactionForAnalytics[],
  currentCash: number,
  plannedHires: PlannedHireForAnalytics[] = [],
  months: number = 12
): Forecast {
  const burnTrend = calculateBurnTrend(transactions, 6);
  const burnValues = burnTrend.map((t) => t.burn);
  const burnGrowthRate = calculateGrowthRate(burnValues);
  
  const revenueByMonth = burnTrend.map((t) => {
    const monthTxns = transactions.filter(
      (txn) =>
        txn.date >= t.month &&
        txn.date < new Date(t.month.getFullYear(), t.month.getMonth() + 1, 1) &&
        txn.type === "credit"
    );
    return monthTxns.reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
  });
  const revenueGrowthRate = calculateGrowthRate(revenueByMonth);
  
  const currentBurn = calculateMonthlyBurn(transactions, 3);
  const currentRevenue = revenueByMonth.length > 0
    ? revenueByMonth.reduce((sum, r) => sum + r, 0) / revenueByMonth.length
    : 0;
  
  const now = new Date();
  const hireCostsByMonth: Record<string, number> = {};
  
  for (const hire of plannedHires) {
    const hireMonth = new Date(hire.startDate.getFullYear(), hire.startDate.getMonth(), 1);
    for (let i = 0; i < months; i++) {
      const forecastMonth = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      if (forecastMonth >= hireMonth) {
        const key = forecastMonth.toISOString();
        hireCostsByMonth[key] = (hireCostsByMonth[key] || 0) + hire.monthlyCost;
      }
    }
  }
  
  const totalPlannedHireCost = plannedHires.reduce((sum, h) => sum + h.monthlyCost, 0);
  
  const assumptions: ForecastAssumptions = {
    burnGrowthRate,
    revenueGrowthRate,
    plannedHiresCost: totalPlannedHireCost,
    months,
  };
  
  const forecastMonths: ForecastMonth[] = [];
  let projectedCash = currentCash;
  let projectedBurn = currentBurn;
  let projectedRevenue = currentRevenue;
  
  for (let i = 0; i < months; i++) {
    const forecastMonth = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    
    projectedBurn = projectedBurn * (1 + burnGrowthRate);
    projectedRevenue = projectedRevenue * (1 + revenueGrowthRate);
    
    const hireCosts = hireCostsByMonth[forecastMonth.toISOString()] || 0;
    const totalBurn = projectedBurn + hireCosts;
    
    const netBurn = totalBurn - projectedRevenue;
    projectedCash = projectedCash - netBurn;
    
    const projectedRunway = projectedCash > 0 && netBurn > 0
      ? projectedCash / netBurn
      : projectedCash <= 0 ? 0 : Infinity;
    
    forecastMonths.push({
      month: forecastMonth,
      projectedBurn: totalBurn,
      projectedRevenue,
      projectedCash: Math.max(0, projectedCash),
      projectedRunway,
    });
  }
  
  return {
    months: forecastMonths,
    assumptions,
  };
}

export function generateScenarioForecast(
  transactions: TransactionForAnalytics[],
  currentCash: number,
  plannedHires: PlannedHireForAnalytics[],
  scenario: {
    burnAdjustment?: number;
    revenueAdjustment?: number;
    additionalCash?: number;
    additionalHires?: PlannedHireForAnalytics[];
  },
  months: number = 12
): Forecast {
  const adjustedCash = currentCash + (scenario.additionalCash || 0);
  const allHires = [...plannedHires, ...(scenario.additionalHires || [])];
  
  const baseForecast = generateForecast(transactions, adjustedCash, allHires, months);
  
  if (scenario.burnAdjustment || scenario.revenueAdjustment) {
    const burnMult = 1 + (scenario.burnAdjustment || 0);
    const revMult = 1 + (scenario.revenueAdjustment || 0);
    
    let projectedCash = adjustedCash;
    
    for (const month of baseForecast.months) {
      month.projectedBurn *= burnMult;
      month.projectedRevenue *= revMult;
      
      const netBurn = month.projectedBurn - month.projectedRevenue;
      projectedCash -= netBurn;
      month.projectedCash = Math.max(0, projectedCash);
      
      month.projectedRunway = projectedCash > 0 && netBurn > 0
        ? projectedCash / netBurn
        : projectedCash <= 0 ? 0 : Infinity;
    }
  }
  
  return baseForecast;
}
