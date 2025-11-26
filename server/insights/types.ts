export interface Insight {
  id?: string;
  type: InsightType;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  metric?: string;
  value?: number;
  previousValue?: number;
  changePercent?: number;
  recommendation?: string;
  createdAt?: Date;
}

export type InsightType =
  | "vendor_spike"
  | "burn_acceleration"
  | "runway_warning"
  | "subscription_creep"
  | "payroll_drift"
  | "revenue_change"
  | "anomaly"
  | "opportunity";

export interface VendorSpend {
  vendor: string;
  currentPeriod: number;
  previousPeriod: number;
  changePercent: number;
}

export interface SubscriptionInfo {
  vendor: string;
  monthlyAmount: number;
  isNew?: boolean;
  growthRate?: number;
}

export interface AnomalyDetectionResult {
  transactionId: string;
  vendor: string;
  amount: number;
  expectedAmount: number;
  deviation: number;
  date: Date;
}

export interface InsightGeneratorInput {
  transactions: Array<{
    id: string;
    date: Date;
    amount: number;
    type: "debit" | "credit";
    vendorNormalized?: string;
    isRecurring?: boolean;
    isPayroll?: boolean;
  }>;
  currentCash: number;
  previousMonthBurn?: number;
  currentMonthBurn?: number;
  runwayMonths?: number;
}
