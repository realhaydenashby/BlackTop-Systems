export interface BurnMetrics {
  grossBurn: number;
  netBurn: number;
  revenue: number;
  payroll: number;
  nonPayroll: number;
  recurring: number;
  oneTime: number;
}

export interface RunwayMetrics {
  currentCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  zeroDate: Date | null;
}

export interface CashFlowMetrics {
  inflows: number;
  outflows: number;
  netFlow: number;
  endingBalance: number;
}

export interface MonthlyData {
  month: Date;
  burn: BurnMetrics;
  cashFlow: CashFlowMetrics;
  transactionCount: number;
}

export interface Forecast {
  months: ForecastMonth[];
  assumptions: ForecastAssumptions;
}

export interface ForecastMonth {
  month: Date;
  projectedBurn: number;
  projectedRevenue: number;
  projectedCash: number;
  projectedRunway: number;
}

export interface ForecastAssumptions {
  burnGrowthRate: number;
  revenueGrowthRate: number;
  plannedHiresCost: number;
  months: number;
}

export interface TransactionForAnalytics {
  id: string;
  date: Date;
  amount: number;
  type: "debit" | "credit";
  isRecurring?: boolean;
  isPayroll?: boolean;
  vendorNormalized?: string;
  categoryId?: string;
}

export interface PlannedHireForAnalytics {
  role: string;
  monthlyCost: number;
  startDate: Date;
}
