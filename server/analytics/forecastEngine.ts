import { storage } from "../storage";
import type { Transaction, ScenarioRun, InsertScenarioRun } from "@shared/schema";
import { addMonths, subMonths, startOfMonth, format } from "date-fns";

export interface ForecastResult {
  projectedValues: MonthlyProjection[];
  confidenceIntervals: ConfidenceInterval[];
  keyMetrics: {
    projectedRunway: number;
    projectedBurnRate: number;
    breakEvenDate: Date | null;
    probabilityOfSuccess: number;
  };
}

export interface MonthlyProjection {
  month: string;
  revenue: number;
  expenses: number;
  netCashFlow: number;
  endingCash: number;
  runwayRemaining: number;
}

export interface ConfidenceInterval {
  month: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface ScenarioAssumptions {
  startingCash: number;
  monthlyRevenueGrowth: number;
  revenueVolatility: number;
  monthlyExpenseGrowth: number;
  expenseVolatility: number;
  plannedHires?: PlannedHire[];
  plannedExpenses?: PlannedExpense[];
  fundraiseAmount?: number;
  fundraiseMonth?: number;
}

export interface PlannedHire {
  role: string;
  annualSalary: number;
  startMonth: number;
  benefits: number;
}

export interface PlannedExpense {
  name: string;
  monthlyAmount: number;
  startMonth: number;
  endMonth?: number;
}

export interface MonteCarloResult {
  simulations: number[][];
  percentiles: { month: string; p10: number; p50: number; p90: number }[];
  probabilityOfSurvival: number[];
  expectedRunway: number;
  runwayDistribution: { months: number; probability: number }[];
}

export class ForecastEngine {
  private organizationId: string;
  private simulationCount: number = 1000;

  constructor(organizationId: string, simulationCount: number = 1000) {
    this.organizationId = organizationId;
    this.simulationCount = simulationCount;
  }

  async generateForecast(
    assumptions: ScenarioAssumptions,
    forecastMonths: number = 12
  ): Promise<ForecastResult> {
    const historicalData = await this.getHistoricalData(6);
    const baselineMetrics = this.computeBaselineMetrics(historicalData);

    const projections = this.generateDeterministicForecast(
      assumptions,
      baselineMetrics,
      forecastMonths
    );

    const monteCarlo = this.runMonteCarloSimulation(
      assumptions,
      baselineMetrics,
      forecastMonths
    );

    const breakEvenDate = this.findBreakEvenDate(projections);
    const avgBurnRate = this.calculateAverageBurnRate(projections);

    return {
      projectedValues: projections,
      confidenceIntervals: monteCarlo.percentiles,
      keyMetrics: {
        projectedRunway: monteCarlo.expectedRunway,
        projectedBurnRate: avgBurnRate,
        breakEvenDate,
        probabilityOfSuccess: monteCarlo.probabilityOfSurvival[monteCarlo.probabilityOfSurvival.length - 1] || 0,
      },
    };
  }

  private async getHistoricalData(months: number): Promise<Map<string, { revenue: number; expenses: number }>> {
    const txns = await storage.getOrganizationTransactions(this.organizationId);
    const monthlyData = new Map<string, { revenue: number; expenses: number }>();

    const cutoff = subMonths(new Date(), months);

    for (const txn of txns) {
      const txnDate = new Date(txn.date);
      if (txnDate < cutoff) continue;

      const monthKey = format(startOfMonth(txnDate), "yyyy-MM");
      const amount = parseFloat(txn.amount);

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { revenue: 0, expenses: 0 });
      }

      const data = monthlyData.get(monthKey)!;
      if (amount > 0) {
        data.revenue += amount;
      } else {
        data.expenses += Math.abs(amount);
      }
    }

    return monthlyData;
  }

  private computeBaselineMetrics(
    historicalData: Map<string, { revenue: number; expenses: number }>
  ): { avgRevenue: number; avgExpenses: number; revenueGrowth: number; expenseGrowth: number } {
    const months = Array.from(historicalData.keys()).sort();
    const revenueValues = months.map((m) => historicalData.get(m)!.revenue);
    const expenseValues = months.map((m) => historicalData.get(m)!.expenses);

    const avgRevenue = revenueValues.reduce((a, b) => a + b, 0) / (revenueValues.length || 1);
    const avgExpenses = expenseValues.reduce((a, b) => a + b, 0) / (expenseValues.length || 1);

    let revenueGrowth = 0;
    let expenseGrowth = 0;

    if (revenueValues.length >= 2) {
      const recentRevenue = revenueValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderRevenue = revenueValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (olderRevenue > 0) {
        revenueGrowth = (recentRevenue - olderRevenue) / olderRevenue / (months.length / 12);
      }
    }

    if (expenseValues.length >= 2) {
      const recentExpenses = expenseValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderExpenses = expenseValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (olderExpenses > 0) {
        expenseGrowth = (recentExpenses - olderExpenses) / olderExpenses / (months.length / 12);
      }
    }

    return { avgRevenue, avgExpenses, revenueGrowth, expenseGrowth };
  }

  private generateDeterministicForecast(
    assumptions: ScenarioAssumptions,
    baseline: { avgRevenue: number; avgExpenses: number; revenueGrowth: number; expenseGrowth: number },
    months: number
  ): MonthlyProjection[] {
    const projections: MonthlyProjection[] = [];
    let cash = assumptions.startingCash;
    let revenue = baseline.avgRevenue;
    let expenses = baseline.avgExpenses;

    const monthlyRevenueGrowth = 1 + (assumptions.monthlyRevenueGrowth || baseline.revenueGrowth / 12);
    const monthlyExpenseGrowth = 1 + (assumptions.monthlyExpenseGrowth || baseline.expenseGrowth / 12);

    for (let i = 0; i < months; i++) {
      const monthDate = addMonths(new Date(), i + 1);
      const monthKey = format(startOfMonth(monthDate), "yyyy-MM");

      revenue *= monthlyRevenueGrowth;
      expenses *= monthlyExpenseGrowth;

      if (assumptions.plannedHires) {
        for (const hire of assumptions.plannedHires) {
          if (i >= hire.startMonth) {
            expenses += (hire.annualSalary + hire.benefits) / 12;
          }
        }
      }

      if (assumptions.plannedExpenses) {
        for (const expense of assumptions.plannedExpenses) {
          if (i >= expense.startMonth && (!expense.endMonth || i <= expense.endMonth)) {
            expenses += expense.monthlyAmount;
          }
        }
      }

      if (assumptions.fundraiseAmount && assumptions.fundraiseMonth && i === assumptions.fundraiseMonth) {
        cash += assumptions.fundraiseAmount;
      }

      const netCashFlow = revenue - expenses;
      cash += netCashFlow;

      const runwayRemaining = netCashFlow < 0 ? Math.max(0, cash / Math.abs(netCashFlow)) : 999;

      projections.push({
        month: monthKey,
        revenue: Math.round(revenue),
        expenses: Math.round(expenses),
        netCashFlow: Math.round(netCashFlow),
        endingCash: Math.round(cash),
        runwayRemaining: Math.round(runwayRemaining),
      });
    }

    return projections;
  }

  runMonteCarloSimulation(
    assumptions: ScenarioAssumptions,
    baseline: { avgRevenue: number; avgExpenses: number; revenueGrowth: number; expenseGrowth: number },
    months: number
  ): MonteCarloResult {
    const simulations: number[][] = [];
    const survivalCounts: number[] = new Array(months).fill(0);

    for (let sim = 0; sim < this.simulationCount; sim++) {
      const cashPath = this.runSingleSimulation(assumptions, baseline, months);
      simulations.push(cashPath);

      for (let m = 0; m < months; m++) {
        if (cashPath[m] > 0) {
          survivalCounts[m]++;
        }
      }
    }

    const percentiles = this.computePercentiles(simulations, months);
    const probabilityOfSurvival = survivalCounts.map((count) => count / this.simulationCount);
    const expectedRunway = this.computeExpectedRunway(simulations);
    const runwayDistribution = this.computeRunwayDistribution(simulations);

    return {
      simulations,
      percentiles,
      probabilityOfSurvival,
      expectedRunway,
      runwayDistribution,
    };
  }

  private runSingleSimulation(
    assumptions: ScenarioAssumptions,
    baseline: { avgRevenue: number; avgExpenses: number; revenueGrowth: number; expenseGrowth: number },
    months: number
  ): number[] {
    const cashPath: number[] = [];
    let cash = assumptions.startingCash;
    let revenue = baseline.avgRevenue;
    let expenses = baseline.avgExpenses;

    const revenueVolatility = assumptions.revenueVolatility || 0.1;
    const expenseVolatility = assumptions.expenseVolatility || 0.05;
    const baseRevenueGrowth = 1 + (assumptions.monthlyRevenueGrowth || baseline.revenueGrowth / 12);
    const baseExpenseGrowth = 1 + (assumptions.monthlyExpenseGrowth || baseline.expenseGrowth / 12);

    for (let i = 0; i < months; i++) {
      const revenueShock = this.generateNormalRandom() * revenueVolatility;
      const expenseShock = this.generateNormalRandom() * expenseVolatility;

      revenue *= baseRevenueGrowth * (1 + revenueShock);
      expenses *= baseExpenseGrowth * (1 + expenseShock);

      if (assumptions.plannedHires) {
        for (const hire of assumptions.plannedHires) {
          if (i >= hire.startMonth) {
            expenses += (hire.annualSalary + hire.benefits) / 12;
          }
        }
      }

      if (assumptions.plannedExpenses) {
        for (const expense of assumptions.plannedExpenses) {
          if (i >= expense.startMonth && (!expense.endMonth || i <= expense.endMonth)) {
            expenses += expense.monthlyAmount;
          }
        }
      }

      if (assumptions.fundraiseAmount && assumptions.fundraiseMonth && i === assumptions.fundraiseMonth) {
        cash += assumptions.fundraiseAmount;
      }

      cash += revenue - expenses;
      cashPath.push(cash);
    }

    return cashPath;
  }

  private computePercentiles(
    simulations: number[][],
    months: number
  ): { month: string; p10: number; p50: number; p90: number }[] {
    const percentiles: { month: string; p10: number; p50: number; p90: number }[] = [];

    for (let m = 0; m < months; m++) {
      const monthDate = addMonths(new Date(), m + 1);
      const monthKey = format(startOfMonth(monthDate), "yyyy-MM");

      const values = simulations.map((sim) => sim[m]).sort((a, b) => a - b);
      const p10Index = Math.floor(values.length * 0.1);
      const p50Index = Math.floor(values.length * 0.5);
      const p90Index = Math.floor(values.length * 0.9);

      percentiles.push({
        month: monthKey,
        p10: Math.round(values[p10Index]),
        p50: Math.round(values[p50Index]),
        p90: Math.round(values[p90Index]),
      });
    }

    return percentiles;
  }

  private computeExpectedRunway(simulations: number[][]): number {
    const runways = simulations.map((sim) => {
      for (let m = 0; m < sim.length; m++) {
        if (sim[m] <= 0) return m;
      }
      return sim.length;
    });

    return Math.round(runways.reduce((a, b) => a + b, 0) / runways.length);
  }

  private computeRunwayDistribution(simulations: number[][]): { months: number; probability: number }[] {
    const runwayCounts = new Map<number, number>();

    for (const sim of simulations) {
      let runway = sim.length;
      for (let m = 0; m < sim.length; m++) {
        if (sim[m] <= 0) {
          runway = m;
          break;
        }
      }
      runwayCounts.set(runway, (runwayCounts.get(runway) || 0) + 1);
    }

    const distribution: { months: number; probability: number }[] = [];
    for (let m = 0; m <= simulations[0].length; m++) {
      const count = runwayCounts.get(m) || 0;
      if (count > 0) {
        distribution.push({ months: m, probability: count / simulations.length });
      }
    }

    return distribution.sort((a, b) => a.months - b.months);
  }

  private findBreakEvenDate(projections: MonthlyProjection[]): Date | null {
    for (const proj of projections) {
      if (proj.netCashFlow >= 0) {
        return new Date(proj.month + "-01");
      }
    }
    return null;
  }

  private calculateAverageBurnRate(projections: MonthlyProjection[]): number {
    const burnRates = projections.filter((p) => p.netCashFlow < 0).map((p) => Math.abs(p.netCashFlow));
    if (burnRates.length === 0) return 0;
    return burnRates.reduce((a, b) => a + b, 0) / burnRates.length;
  }

  private generateNormalRandom(): number {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  runSensitivityAnalysis(
    assumptions: ScenarioAssumptions,
    baseline: { avgRevenue: number; avgExpenses: number; revenueGrowth: number; expenseGrowth: number },
    months: number = 12
  ): { driver: string; impact: number; sensitivity: number }[] {
    const baseResult = this.generateDeterministicForecast(assumptions, baseline, months);
    const baseRunway = this.calculateRunwayFromProjections(baseResult);

    const drivers = [
      { name: "Revenue Growth", key: "monthlyRevenueGrowth", delta: 0.01 },
      { name: "Expense Growth", key: "monthlyExpenseGrowth", delta: 0.01 },
      { name: "Revenue Volatility", key: "revenueVolatility", delta: 0.05 },
      { name: "Expense Volatility", key: "expenseVolatility", delta: 0.05 },
      { name: "Starting Cash", key: "startingCash", delta: assumptions.startingCash * 0.1 },
    ];

    const sensitivities: { driver: string; impact: number; sensitivity: number }[] = [];

    for (const driver of drivers) {
      const modifiedAssumptions = { ...assumptions };
      (modifiedAssumptions as any)[driver.key] = ((modifiedAssumptions as any)[driver.key] || 0) + driver.delta;

      const modifiedResult = this.generateDeterministicForecast(modifiedAssumptions, baseline, months);
      const modifiedRunway = this.calculateRunwayFromProjections(modifiedResult);

      const impact = modifiedRunway - baseRunway;
      const sensitivity = impact / driver.delta;

      sensitivities.push({
        driver: driver.name,
        impact: Math.round(impact * 10) / 10,
        sensitivity: Math.round(sensitivity * 100) / 100,
      });
    }

    return sensitivities.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  private calculateRunwayFromProjections(projections: MonthlyProjection[]): number {
    for (let i = 0; i < projections.length; i++) {
      if (projections[i].endingCash <= 0) {
        return i;
      }
    }
    return projections.length;
  }

  async saveScenarioRun(
    name: string,
    scenarioType: string,
    assumptions: ScenarioAssumptions,
    result: ForecastResult,
    userId: string
  ): Promise<ScenarioRun | null> {
    try {
      const data: InsertScenarioRun = {
        organizationId: this.organizationId,
        createdBy: userId,
        name: name || `Scenario ${new Date().toISOString().slice(0, 10)}`,
        scenarioType: scenarioType as any,
        assumptions: assumptions as any,
        results: result.projectedValues as any,
        simulationCount: this.simulationCount,
        confidenceIntervals: result.confidenceIntervals as any,
        projectedRunway: result.keyMetrics.projectedRunway,
        projectedBurnRate: result.keyMetrics.projectedBurnRate.toString(),
        breakEvenDate: result.keyMetrics.breakEvenDate,
        probabilityOfSuccess: result.keyMetrics.probabilityOfSuccess.toString(),
      };

      return await storage.createScenarioRun(data);
    } catch (error) {
      console.error("[ForecastEngine] Failed to save scenario run:", error);
      return null;
    }
  }
}

export function createForecastEngine(organizationId: string, simulationCount?: number): ForecastEngine {
  return new ForecastEngine(organizationId, simulationCount);
}
