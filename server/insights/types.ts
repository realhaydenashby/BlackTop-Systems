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
  confidence: InsightConfidence;
  createdAt?: Date;
}

/**
 * Confidence scoring for insights
 * - score: 0-1, where 1 is highest confidence
 * - level: human-readable confidence level
 * - factors: what influenced the confidence score
 */
export interface InsightConfidence {
  score: number;
  level: "high" | "medium" | "low";
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  detail?: string;
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
