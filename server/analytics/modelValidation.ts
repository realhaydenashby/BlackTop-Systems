import { db } from "../db";
import { transactions, orgFeatureHistory } from "@shared/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { subMonths, startOfMonth, format } from "date-fns";

export interface ValidationIssue {
  id: string;
  field: string;
  fieldLabel: string;
  currentValue: number;
  suggestedValue: number;
  severity: "warning" | "critical";
  reason: string;
  historical: {
    min: number;
    max: number;
    average: number;
    trend: "increasing" | "decreasing" | "stable";
  };
}

export interface ValidationResult {
  isValid: boolean;
  confidenceScore: number;
  issues: ValidationIssue[];
  historicalBaseline: {
    avgMonthlyRevenue: number;
    avgMonthlyExpenses: number;
    avgBurnRate: number;
    revenueGrowthRate: number;
    expenseGrowthRate: number;
  };
}

export interface ScenarioInputs {
  startingCash?: number;
  monthlyRevenueGrowth?: number;
  revenueVolatility?: number;
  monthlyExpenseGrowth?: number;
  expenseVolatility?: number;
  forecastMonths?: number;
  plannedHires?: { role: string; annualSalary: number; startMonth: number }[];
  plannedExpenses?: { name: string; monthlyAmount: number; startMonth: number }[];
}

const VALIDATION_THRESHOLDS = {
  revenueGrowth: { min: -0.5, max: 0.5, realistic: 0.15 },
  expenseGrowth: { min: -0.3, max: 0.3, realistic: 0.05 },
  revenueVolatility: { min: 0, max: 0.5, realistic: 0.15 },
  expenseVolatility: { min: 0, max: 0.3, realistic: 0.08 },
  startingCashDeviation: { warningThreshold: 0.2, criticalThreshold: 0.5 },
  salaryRange: { min: 30000, max: 500000 },
  hireCountPerMonth: { warning: 3, critical: 10 },
};

export class ModelValidator {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  async validateScenarioInputs(inputs: ScenarioInputs): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    
    const historicalBaseline = await this.computeHistoricalBaseline();
    
    if (inputs.monthlyRevenueGrowth !== undefined) {
      const revenueGrowthIssue = this.validateGrowthRate(
        "monthlyRevenueGrowth",
        "Monthly Revenue Growth",
        inputs.monthlyRevenueGrowth,
        historicalBaseline.revenueGrowthRate,
        VALIDATION_THRESHOLDS.revenueGrowth
      );
      if (revenueGrowthIssue) issues.push(revenueGrowthIssue);
    }

    if (inputs.monthlyExpenseGrowth !== undefined) {
      const expenseGrowthIssue = this.validateGrowthRate(
        "monthlyExpenseGrowth",
        "Monthly Expense Growth",
        inputs.monthlyExpenseGrowth,
        historicalBaseline.expenseGrowthRate,
        VALIDATION_THRESHOLDS.expenseGrowth
      );
      if (expenseGrowthIssue) issues.push(expenseGrowthIssue);
    }

    if (inputs.revenueVolatility !== undefined) {
      const revenueVolIssue = this.validateRange(
        "revenueVolatility",
        "Revenue Volatility",
        inputs.revenueVolatility,
        VALIDATION_THRESHOLDS.revenueVolatility
      );
      if (revenueVolIssue) issues.push(revenueVolIssue);
    }

    if (inputs.expenseVolatility !== undefined) {
      const expenseVolIssue = this.validateRange(
        "expenseVolatility",
        "Expense Volatility",
        inputs.expenseVolatility,
        VALIDATION_THRESHOLDS.expenseVolatility
      );
      if (expenseVolIssue) issues.push(expenseVolIssue);
    }

    if (inputs.startingCash !== undefined) {
      const actualCash = await this.getCurrentCashBalance();
      if (actualCash > 0) {
        const cashDeviation = Math.abs(inputs.startingCash - actualCash) / actualCash;
        if (cashDeviation > VALIDATION_THRESHOLDS.startingCashDeviation.criticalThreshold) {
          issues.push({
            id: `cash-${Date.now()}`,
            field: "startingCash",
            fieldLabel: "Starting Cash",
            currentValue: inputs.startingCash,
            suggestedValue: actualCash,
            severity: "critical",
            reason: `Starting cash differs from actual balance by ${Math.round(cashDeviation * 100)}%. Your connected accounts show $${actualCash.toLocaleString()}.`,
            historical: {
              min: actualCash * 0.8,
              max: actualCash * 1.2,
              average: actualCash,
              trend: "stable",
            },
          });
        } else if (cashDeviation > VALIDATION_THRESHOLDS.startingCashDeviation.warningThreshold) {
          issues.push({
            id: `cash-${Date.now()}`,
            field: "startingCash",
            fieldLabel: "Starting Cash",
            currentValue: inputs.startingCash,
            suggestedValue: actualCash,
            severity: "warning",
            reason: `Starting cash differs from actual balance by ${Math.round(cashDeviation * 100)}%. Consider using the actual value.`,
            historical: {
              min: actualCash * 0.9,
              max: actualCash * 1.1,
              average: actualCash,
              trend: "stable",
            },
          });
        }
      }
    }

    if (inputs.plannedHires && inputs.plannedHires.length > 0) {
      const hireIssues = this.validatePlannedHires(inputs.plannedHires);
      issues.push(...hireIssues);
    }

    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const confidenceScore = Math.max(0, 100 - criticalCount * 25 - warningCount * 10);

    return {
      isValid: criticalCount === 0,
      confidenceScore,
      issues,
      historicalBaseline,
    };
  }

  private validateGrowthRate(
    field: string,
    label: string,
    value: number,
    historicalRate: number,
    thresholds: { min: number; max: number; realistic: number }
  ): ValidationIssue | null {
    if (value < thresholds.min) {
      return {
        id: `${field}-${Date.now()}`,
        field,
        fieldLabel: label,
        currentValue: value,
        suggestedValue: Math.max(thresholds.min, historicalRate),
        severity: "critical",
        reason: `${Math.round(value * 100)}% growth is extremely pessimistic. Historical data suggests around ${Math.round(historicalRate * 100)}%.`,
        historical: {
          min: thresholds.min,
          max: thresholds.max,
          average: historicalRate,
          trend: historicalRate > 0 ? "increasing" : historicalRate < 0 ? "decreasing" : "stable",
        },
      };
    }

    if (value > thresholds.max) {
      return {
        id: `${field}-${Date.now()}`,
        field,
        fieldLabel: label,
        currentValue: value,
        suggestedValue: Math.min(thresholds.max, thresholds.realistic),
        severity: "critical",
        reason: `${Math.round(value * 100)}% monthly growth is unrealistic for most businesses. Even hyper-growth companies rarely exceed ${Math.round(thresholds.realistic * 100)}%.`,
        historical: {
          min: thresholds.min,
          max: thresholds.max,
          average: historicalRate,
          trend: historicalRate > 0 ? "increasing" : historicalRate < 0 ? "decreasing" : "stable",
        },
      };
    }

    const deviationFromHistorical = Math.abs(value - historicalRate);
    if (deviationFromHistorical > 0.1 && Math.abs(value) > 0.1) {
      return {
        id: `${field}-${Date.now()}`,
        field,
        fieldLabel: label,
        currentValue: value,
        suggestedValue: historicalRate,
        severity: "warning",
        reason: `Your projected ${Math.round(value * 100)}% differs significantly from historical ${Math.round(historicalRate * 100)}%. Consider if this is realistic.`,
        historical: {
          min: thresholds.min,
          max: thresholds.max,
          average: historicalRate,
          trend: historicalRate > 0 ? "increasing" : historicalRate < 0 ? "decreasing" : "stable",
        },
      };
    }

    return null;
  }

  private validateRange(
    field: string,
    label: string,
    value: number,
    thresholds: { min: number; max: number; realistic: number }
  ): ValidationIssue | null {
    if (value < thresholds.min || value > thresholds.max) {
      return {
        id: `${field}-${Date.now()}`,
        field,
        fieldLabel: label,
        currentValue: value,
        suggestedValue: thresholds.realistic,
        severity: "critical",
        reason: `${Math.round(value * 100)}% is outside the reasonable range of ${Math.round(thresholds.min * 100)}%-${Math.round(thresholds.max * 100)}%.`,
        historical: {
          min: thresholds.min,
          max: thresholds.max,
          average: thresholds.realistic,
          trend: "stable",
        },
      };
    }

    if (value > thresholds.realistic * 2) {
      return {
        id: `${field}-${Date.now()}`,
        field,
        fieldLabel: label,
        currentValue: value,
        suggestedValue: thresholds.realistic,
        severity: "warning",
        reason: `${Math.round(value * 100)}% volatility is higher than typical. Consider using ${Math.round(thresholds.realistic * 100)}% for more conservative projections.`,
        historical: {
          min: thresholds.min,
          max: thresholds.max,
          average: thresholds.realistic,
          trend: "stable",
        },
      };
    }

    return null;
  }

  private validatePlannedHires(
    hires: { role: string; annualSalary: number; startMonth: number }[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const hire of hires) {
      if (hire.annualSalary < VALIDATION_THRESHOLDS.salaryRange.min) {
        issues.push({
          id: `hire-salary-${hire.role}-${Date.now()}`,
          field: "plannedHires",
          fieldLabel: `Salary for ${hire.role}`,
          currentValue: hire.annualSalary,
          suggestedValue: VALIDATION_THRESHOLDS.salaryRange.min,
          severity: "warning",
          reason: `$${hire.annualSalary.toLocaleString()} annual salary is unusually low. Verify this is correct.`,
          historical: {
            min: VALIDATION_THRESHOLDS.salaryRange.min,
            max: VALIDATION_THRESHOLDS.salaryRange.max,
            average: 85000,
            trend: "increasing",
          },
        });
      }

      if (hire.annualSalary > VALIDATION_THRESHOLDS.salaryRange.max) {
        issues.push({
          id: `hire-salary-${hire.role}-${Date.now()}`,
          field: "plannedHires",
          fieldLabel: `Salary for ${hire.role}`,
          currentValue: hire.annualSalary,
          suggestedValue: VALIDATION_THRESHOLDS.salaryRange.max,
          severity: "warning",
          reason: `$${hire.annualSalary.toLocaleString()} annual salary exceeds typical C-level compensation. Verify this is correct.`,
          historical: {
            min: VALIDATION_THRESHOLDS.salaryRange.min,
            max: VALIDATION_THRESHOLDS.salaryRange.max,
            average: 150000,
            trend: "increasing",
          },
        });
      }
    }

    const hiresByMonth = new Map<number, number>();
    for (const hire of hires) {
      hiresByMonth.set(hire.startMonth, (hiresByMonth.get(hire.startMonth) || 0) + 1);
    }

    for (const [month, count] of hiresByMonth.entries()) {
      if (count >= VALIDATION_THRESHOLDS.hireCountPerMonth.critical) {
        issues.push({
          id: `hire-count-${month}-${Date.now()}`,
          field: "plannedHires",
          fieldLabel: `Hires in Month ${month + 1}`,
          currentValue: count,
          suggestedValue: 2,
          severity: "critical",
          reason: `${count} hires in a single month is very aggressive. Consider spreading hires across multiple months for realistic onboarding.`,
          historical: {
            min: 0,
            max: 5,
            average: 1,
            trend: "stable",
          },
        });
      } else if (count >= VALIDATION_THRESHOLDS.hireCountPerMonth.warning) {
        issues.push({
          id: `hire-count-${month}-${Date.now()}`,
          field: "plannedHires",
          fieldLabel: `Hires in Month ${month + 1}`,
          currentValue: count,
          suggestedValue: 2,
          severity: "warning",
          reason: `${count} hires in a single month may be aggressive. Consider if your team can handle this onboarding load.`,
          historical: {
            min: 0,
            max: 5,
            average: 1,
            trend: "stable",
          },
        });
      }
    }

    return issues;
  }

  private async computeHistoricalBaseline(): Promise<{
    avgMonthlyRevenue: number;
    avgMonthlyExpenses: number;
    avgBurnRate: number;
    revenueGrowthRate: number;
    expenseGrowthRate: number;
  }> {
    const sixMonthsAgo = subMonths(new Date(), 6);
    
    const txns = await db.query.transactions.findMany({
      where: and(
        eq(transactions.organizationId, this.organizationId),
        gte(transactions.date, format(sixMonthsAgo, "yyyy-MM-dd"))
      ),
    });

    const monthlyData = new Map<string, { revenue: number; expenses: number }>();
    
    for (const txn of txns) {
      const monthKey = format(new Date(txn.date), "yyyy-MM");
      const existing = monthlyData.get(monthKey) || { revenue: 0, expenses: 0 };
      const amount = parseFloat(txn.amount);
      
      if (amount > 0) {
        existing.revenue += amount;
      } else {
        existing.expenses += Math.abs(amount);
      }
      
      monthlyData.set(monthKey, existing);
    }

    const months = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    if (months.length < 2) {
      return {
        avgMonthlyRevenue: 0,
        avgMonthlyExpenses: 0,
        avgBurnRate: 0,
        revenueGrowthRate: 0,
        expenseGrowthRate: 0,
      };
    }

    const totalRevenue = months.reduce((sum, [_, data]) => sum + data.revenue, 0);
    const totalExpenses = months.reduce((sum, [_, data]) => sum + data.expenses, 0);
    const avgMonthlyRevenue = totalRevenue / months.length;
    const avgMonthlyExpenses = totalExpenses / months.length;
    const avgBurnRate = avgMonthlyExpenses - avgMonthlyRevenue;

    let revenueGrowthSum = 0;
    let expenseGrowthSum = 0;
    let growthCount = 0;

    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1][1];
      const curr = months[i][1];

      if (prev.revenue > 0) {
        revenueGrowthSum += (curr.revenue - prev.revenue) / prev.revenue;
      }
      if (prev.expenses > 0) {
        expenseGrowthSum += (curr.expenses - prev.expenses) / prev.expenses;
      }
      growthCount++;
    }

    return {
      avgMonthlyRevenue,
      avgMonthlyExpenses,
      avgBurnRate,
      revenueGrowthRate: growthCount > 0 ? revenueGrowthSum / growthCount : 0,
      expenseGrowthRate: growthCount > 0 ? expenseGrowthSum / growthCount : 0,
    };
  }

  private async getCurrentCashBalance(): Promise<number> {
    const { bankAccounts } = await import("@shared/schema");
    
    const accounts = await db.query.bankAccounts.findMany({
      where: eq(bankAccounts.organizationId, this.organizationId),
    });

    return accounts.reduce((sum, acc) => {
      const balance = parseFloat(acc.currentBalance || "0");
      return sum + balance;
    }, 0);
  }
}

export const createModelValidator = (organizationId: string) => new ModelValidator(organizationId);
