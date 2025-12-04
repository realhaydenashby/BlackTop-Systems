export type SubscriptionTier = "lite" | "core" | "growth" | null;

export type FeatureKey =
  | "bankSync"
  | "autoCategories"
  | "burnRunwayDashboard"
  | "spendRevenueCharts"
  | "aiInsights"
  | "subscriptionDetection"
  | "aiCopilot"
  | "scenarioModeling"
  | "hiringPlanning"
  | "raisePlanning"
  | "boardPackets"
  | "shareableReports"
  | "anomalyDetection"
  | "departmentBudgets"
  | "customKpis"
  | "multiEntity"
  | "apiAccess"
  | "aiInvestorUpdates"
  | "automatedBoardPackets"
  | "dedicatedOnboarding"
  | "prioritySlackSupport";

export interface PlanConfig {
  name: string;
  displayName: string;
  price: number | null;
  seats: number | null;
  features: FeatureKey[];
}

export const PLAN_CONFIGS: Record<Exclude<SubscriptionTier, null>, PlanConfig> = {
  lite: {
    name: "lite",
    displayName: "Blacktop Lite",
    price: 99,
    seats: 1,
    features: [
      "bankSync",
      "autoCategories",
      "burnRunwayDashboard",
      "spendRevenueCharts",
      "aiInsights",
      "subscriptionDetection",
    ],
  },
  core: {
    name: "core",
    displayName: "Blacktop Core",
    price: 199,
    seats: 3,
    features: [
      "bankSync",
      "autoCategories",
      "burnRunwayDashboard",
      "spendRevenueCharts",
      "aiInsights",
      "subscriptionDetection",
      "aiCopilot",
      "scenarioModeling",
      "hiringPlanning",
      "raisePlanning",
      "boardPackets",
      "shareableReports",
      "anomalyDetection",
      "departmentBudgets",
    ],
  },
  growth: {
    name: "growth",
    displayName: "Blacktop Growth",
    price: null,
    seats: null,
    features: [
      "bankSync",
      "autoCategories",
      "burnRunwayDashboard",
      "spendRevenueCharts",
      "aiInsights",
      "subscriptionDetection",
      "aiCopilot",
      "scenarioModeling",
      "hiringPlanning",
      "raisePlanning",
      "boardPackets",
      "shareableReports",
      "anomalyDetection",
      "departmentBudgets",
      "customKpis",
      "multiEntity",
      "apiAccess",
      "aiInvestorUpdates",
      "automatedBoardPackets",
      "dedicatedOnboarding",
      "prioritySlackSupport",
    ],
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  bankSync: "Bank / QuickBooks / Stripe Sync",
  autoCategories: "Auto-categorized Transactions",
  burnRunwayDashboard: "Burn & Runway Dashboard",
  spendRevenueCharts: "Spend & Revenue Charts",
  aiInsights: "AI-generated Insights",
  subscriptionDetection: "Subscription Detection",
  aiCopilot: "AI Copilot Chat",
  scenarioModeling: "Scenario Modeling Workbook",
  hiringPlanning: "Hiring Planning",
  raisePlanning: "Raise Planning & Recommendations",
  boardPackets: "Investor Board Packets",
  shareableReports: "Shareable Financial Reports",
  anomalyDetection: "Anomaly Detection & Alerts",
  departmentBudgets: "Department Budgets",
  customKpis: "Custom KPIs & Dashboards",
  multiEntity: "Multi-Entity Consolidation",
  apiAccess: "API Access",
  aiInvestorUpdates: "AI-drafted Investor Updates",
  automatedBoardPackets: "Automated Monthly Board Packets",
  dedicatedOnboarding: "Dedicated Onboarding Session",
  prioritySlackSupport: "Priority Slack Support",
};

export function hasFeatureAccess(tier: SubscriptionTier, feature: FeatureKey): boolean {
  if (!tier) return false;
  const config = PLAN_CONFIGS[tier];
  return config.features.includes(feature);
}

export function getMinimumTierForFeature(feature: FeatureKey): SubscriptionTier {
  if (PLAN_CONFIGS.lite.features.includes(feature)) return "lite";
  if (PLAN_CONFIGS.core.features.includes(feature)) return "core";
  if (PLAN_CONFIGS.growth.features.includes(feature)) return "growth";
  return null;
}

export function getUpgradeTier(currentTier: SubscriptionTier): SubscriptionTier {
  if (!currentTier || currentTier === "lite") return "core";
  if (currentTier === "core") return "growth";
  return null;
}
