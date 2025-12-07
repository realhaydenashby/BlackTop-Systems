export type BusinessType = 
  | "saas" 
  | "agency" 
  | "ecommerce" 
  | "marketplace" 
  | "hardware" 
  | "healthcare" 
  | "fintech" 
  | "other";

export interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  format: "currency" | "percent" | "number" | "months" | "days";
  importance: "primary" | "secondary" | "tertiary";
  calculation?: string;
}

export interface BusinessTypeConfig {
  type: BusinessType;
  displayName: string;
  description: string;
  icon: string;
  primaryMetrics: MetricDefinition[];
  secondaryMetrics: MetricDefinition[];
  unitEconomics: MetricDefinition[];
  healthIndicators: {
    key: string;
    name: string;
    healthyThreshold: number;
    warningThreshold: number;
    criticalThreshold: number;
    direction: "higher_better" | "lower_better";
  }[];
  terminology: Record<string, string>;
}

export const BUSINESS_TYPE_CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  saas: {
    type: "saas",
    displayName: "SaaS / Subscription",
    description: "Software-as-a-Service or subscription-based business model",
    icon: "Cloud",
    primaryMetrics: [
      { key: "mrr", name: "MRR", description: "Monthly Recurring Revenue", format: "currency", importance: "primary" },
      { key: "arr", name: "ARR", description: "Annual Recurring Revenue", format: "currency", importance: "primary" },
      { key: "net_revenue_retention", name: "NRR", description: "Net Revenue Retention", format: "percent", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "gross_churn", name: "Gross Churn", description: "Revenue lost from cancellations", format: "percent", importance: "secondary" },
      { key: "logo_churn", name: "Logo Churn", description: "Customer churn rate", format: "percent", importance: "secondary" },
      { key: "expansion_revenue", name: "Expansion Revenue", description: "Revenue from upsells/cross-sells", format: "currency", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "ltv", name: "LTV", description: "Customer Lifetime Value", format: "currency", importance: "primary" },
      { key: "cac", name: "CAC", description: "Customer Acquisition Cost", format: "currency", importance: "primary" },
      { key: "ltv_cac_ratio", name: "LTV:CAC", description: "Lifetime Value to Acquisition Cost Ratio", format: "number", importance: "primary" },
      { key: "cac_payback", name: "CAC Payback", description: "Months to recover CAC", format: "months", importance: "secondary" },
      { key: "arpu", name: "ARPU", description: "Average Revenue Per User", format: "currency", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "ltv_cac_ratio", name: "LTV:CAC Ratio", healthyThreshold: 3, warningThreshold: 2, criticalThreshold: 1, direction: "higher_better" },
      { key: "gross_churn", name: "Monthly Churn", healthyThreshold: 3, warningThreshold: 5, criticalThreshold: 10, direction: "lower_better" },
      { key: "net_revenue_retention", name: "NRR", healthyThreshold: 110, warningThreshold: 100, criticalThreshold: 90, direction: "higher_better" },
    ],
    terminology: {
      revenue: "Recurring Revenue",
      customer: "Subscriber",
      transaction: "Subscription",
    },
  },
  agency: {
    type: "agency",
    displayName: "Agency / Services",
    description: "Professional services, consulting, or agency business model",
    icon: "Users",
    primaryMetrics: [
      { key: "revenue", name: "Revenue", description: "Total billable revenue", format: "currency", importance: "primary" },
      { key: "utilization_rate", name: "Utilization", description: "Billable hours / Available hours", format: "percent", importance: "primary" },
      { key: "gross_margin", name: "Gross Margin", description: "Revenue minus direct costs", format: "percent", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "billable_hours", name: "Billable Hours", description: "Total hours billed to clients", format: "number", importance: "secondary" },
      { key: "effective_rate", name: "Effective Rate", description: "Revenue per billable hour", format: "currency", importance: "secondary" },
      { key: "client_count", name: "Active Clients", description: "Number of active client accounts", format: "number", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "revenue_per_employee", name: "Revenue/Employee", description: "Revenue per full-time employee", format: "currency", importance: "primary" },
      { key: "profit_per_employee", name: "Profit/Employee", description: "Net profit per full-time employee", format: "currency", importance: "secondary" },
      { key: "client_concentration", name: "Client Concentration", description: "Revenue from top client as % of total", format: "percent", importance: "primary" },
      { key: "project_margin", name: "Project Margin", description: "Average margin per project", format: "percent", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "utilization_rate", name: "Utilization Rate", healthyThreshold: 75, warningThreshold: 65, criticalThreshold: 50, direction: "higher_better" },
      { key: "client_concentration", name: "Top Client Concentration", healthyThreshold: 25, warningThreshold: 40, criticalThreshold: 60, direction: "lower_better" },
      { key: "gross_margin", name: "Gross Margin", healthyThreshold: 50, warningThreshold: 40, criticalThreshold: 30, direction: "higher_better" },
    ],
    terminology: {
      revenue: "Billings",
      customer: "Client",
      transaction: "Project/Retainer",
    },
  },
  ecommerce: {
    type: "ecommerce",
    displayName: "E-commerce",
    description: "Online retail and direct-to-consumer sales",
    icon: "ShoppingCart",
    primaryMetrics: [
      { key: "revenue", name: "Revenue", description: "Total sales revenue", format: "currency", importance: "primary" },
      { key: "orders", name: "Orders", description: "Total number of orders", format: "number", importance: "primary" },
      { key: "aov", name: "AOV", description: "Average Order Value", format: "currency", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "conversion_rate", name: "Conversion Rate", description: "Visitors who complete purchase", format: "percent", importance: "secondary" },
      { key: "return_rate", name: "Return Rate", description: "Orders returned", format: "percent", importance: "secondary" },
      { key: "repeat_rate", name: "Repeat Rate", description: "Customers who order again", format: "percent", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "cac", name: "CAC", description: "Customer Acquisition Cost", format: "currency", importance: "primary" },
      { key: "cac_payback", name: "CAC Payback", description: "Orders to recover CAC", format: "number", importance: "primary" },
      { key: "roas", name: "ROAS", description: "Return on Ad Spend", format: "number", importance: "primary" },
      { key: "contribution_margin", name: "Contribution Margin", description: "Revenue minus variable costs per order", format: "currency", importance: "secondary" },
      { key: "clv", name: "CLV", description: "Customer Lifetime Value", format: "currency", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "roas", name: "ROAS", healthyThreshold: 3, warningThreshold: 2, criticalThreshold: 1, direction: "higher_better" },
      { key: "return_rate", name: "Return Rate", healthyThreshold: 10, warningThreshold: 20, criticalThreshold: 30, direction: "lower_better" },
      { key: "contribution_margin_pct", name: "Contribution Margin %", healthyThreshold: 30, warningThreshold: 20, criticalThreshold: 10, direction: "higher_better" },
    ],
    terminology: {
      revenue: "Sales",
      customer: "Customer",
      transaction: "Order",
    },
  },
  marketplace: {
    type: "marketplace",
    displayName: "Marketplace",
    description: "Two-sided marketplace connecting buyers and sellers",
    icon: "Store",
    primaryMetrics: [
      { key: "gmv", name: "GMV", description: "Gross Merchandise Value", format: "currency", importance: "primary" },
      { key: "net_revenue", name: "Net Revenue", description: "Take rate revenue", format: "currency", importance: "primary" },
      { key: "take_rate", name: "Take Rate", description: "Revenue as % of GMV", format: "percent", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "active_buyers", name: "Active Buyers", description: "Buyers with transactions this period", format: "number", importance: "secondary" },
      { key: "active_sellers", name: "Active Sellers", description: "Sellers with transactions this period", format: "number", importance: "secondary" },
      { key: "transactions", name: "Transactions", description: "Total transactions processed", format: "number", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "buyer_cac", name: "Buyer CAC", description: "Cost to acquire a buyer", format: "currency", importance: "primary" },
      { key: "seller_cac", name: "Seller CAC", description: "Cost to acquire a seller", format: "currency", importance: "primary" },
      { key: "buyer_ltv", name: "Buyer LTV", description: "Lifetime value of a buyer", format: "currency", importance: "secondary" },
      { key: "seller_ltv", name: "Seller LTV", description: "Lifetime value of a seller", format: "currency", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "take_rate", name: "Take Rate", healthyThreshold: 15, warningThreshold: 10, criticalThreshold: 5, direction: "higher_better" },
      { key: "liquidity", name: "Liquidity (Match Rate)", healthyThreshold: 70, warningThreshold: 50, criticalThreshold: 30, direction: "higher_better" },
    ],
    terminology: {
      revenue: "Net Revenue",
      customer: "User",
      transaction: "Transaction",
    },
  },
  hardware: {
    type: "hardware",
    displayName: "Hardware / Manufacturing",
    description: "Physical product manufacturing and sales",
    icon: "Cpu",
    primaryMetrics: [
      { key: "revenue", name: "Revenue", description: "Total product sales", format: "currency", importance: "primary" },
      { key: "units_sold", name: "Units Sold", description: "Total units shipped", format: "number", importance: "primary" },
      { key: "gross_margin", name: "Gross Margin", description: "Revenue minus COGS", format: "percent", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "cogs", name: "COGS", description: "Cost of Goods Sold", format: "currency", importance: "secondary" },
      { key: "inventory_value", name: "Inventory Value", description: "Current inventory at cost", format: "currency", importance: "secondary" },
      { key: "backlog", name: "Order Backlog", description: "Unfulfilled orders value", format: "currency", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "unit_cost", name: "Unit Cost", description: "Cost per unit manufactured", format: "currency", importance: "primary" },
      { key: "asp", name: "ASP", description: "Average Selling Price", format: "currency", importance: "primary" },
      { key: "inventory_turns", name: "Inventory Turns", description: "Times inventory sold per year", format: "number", importance: "secondary" },
      { key: "lead_time_days", name: "Lead Time", description: "Days from order to delivery", format: "days", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "gross_margin", name: "Gross Margin", healthyThreshold: 40, warningThreshold: 30, criticalThreshold: 20, direction: "higher_better" },
      { key: "inventory_turns", name: "Inventory Turns", healthyThreshold: 6, warningThreshold: 4, criticalThreshold: 2, direction: "higher_better" },
      { key: "lead_time_days", name: "Lead Time (Days)", healthyThreshold: 14, warningThreshold: 30, criticalThreshold: 60, direction: "lower_better" },
    ],
    terminology: {
      revenue: "Product Sales",
      customer: "Customer",
      transaction: "Order",
    },
  },
  healthcare: {
    type: "healthcare",
    displayName: "Healthcare",
    description: "Healthcare services, clinics, or medical practices",
    icon: "Heart",
    primaryMetrics: [
      { key: "revenue", name: "Revenue", description: "Total collections", format: "currency", importance: "primary" },
      { key: "patient_visits", name: "Patient Visits", description: "Total encounters", format: "number", importance: "primary" },
      { key: "revenue_per_visit", name: "Revenue/Visit", description: "Average revenue per patient encounter", format: "currency", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "active_patients", name: "Active Patients", description: "Patients seen in last 12 months", format: "number", importance: "secondary" },
      { key: "new_patients", name: "New Patients", description: "First-time patients this period", format: "number", importance: "secondary" },
      { key: "collection_rate", name: "Collection Rate", description: "Billed vs collected", format: "percent", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "patient_ltv", name: "Patient LTV", description: "Lifetime value of a patient", format: "currency", importance: "primary" },
      { key: "cac", name: "PAC", description: "Patient Acquisition Cost", format: "currency", importance: "primary" },
      { key: "revenue_per_provider", name: "Revenue/Provider", description: "Revenue per clinician", format: "currency", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "collection_rate", name: "Collection Rate", healthyThreshold: 95, warningThreshold: 90, criticalThreshold: 80, direction: "higher_better" },
      { key: "no_show_rate", name: "No-Show Rate", healthyThreshold: 5, warningThreshold: 10, criticalThreshold: 20, direction: "lower_better" },
    ],
    terminology: {
      revenue: "Collections",
      customer: "Patient",
      transaction: "Visit",
    },
  },
  fintech: {
    type: "fintech",
    displayName: "Fintech",
    description: "Financial technology and payment services",
    icon: "CreditCard",
    primaryMetrics: [
      { key: "tpv", name: "TPV", description: "Total Payment Volume", format: "currency", importance: "primary" },
      { key: "net_revenue", name: "Net Revenue", description: "Revenue after interchange", format: "currency", importance: "primary" },
      { key: "take_rate", name: "Take Rate", description: "Net revenue as % of TPV", format: "percent", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "transactions", name: "Transactions", description: "Total transactions processed", format: "number", importance: "secondary" },
      { key: "active_accounts", name: "Active Accounts", description: "Accounts with activity this period", format: "number", importance: "secondary" },
      { key: "aum", name: "AUM", description: "Assets Under Management", format: "currency", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "cac", name: "CAC", description: "Customer Acquisition Cost", format: "currency", importance: "primary" },
      { key: "ltv", name: "LTV", description: "Customer Lifetime Value", format: "currency", importance: "primary" },
      { key: "arpu", name: "ARPU", description: "Average Revenue Per User", format: "currency", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "default_rate", name: "Default Rate", healthyThreshold: 2, warningThreshold: 5, criticalThreshold: 10, direction: "lower_better" },
      { key: "fraud_rate", name: "Fraud Rate", healthyThreshold: 0.1, warningThreshold: 0.5, criticalThreshold: 1, direction: "lower_better" },
    ],
    terminology: {
      revenue: "Net Revenue",
      customer: "Account",
      transaction: "Payment",
    },
  },
  other: {
    type: "other",
    displayName: "Other",
    description: "General business metrics for other business types",
    icon: "Building",
    primaryMetrics: [
      { key: "revenue", name: "Revenue", description: "Total revenue", format: "currency", importance: "primary" },
      { key: "gross_margin", name: "Gross Margin", description: "Revenue minus direct costs", format: "percent", importance: "primary" },
      { key: "net_income", name: "Net Income", description: "Profit after all expenses", format: "currency", importance: "primary" },
    ],
    secondaryMetrics: [
      { key: "customers", name: "Customers", description: "Total customers", format: "number", importance: "secondary" },
      { key: "operating_expenses", name: "Operating Expenses", description: "Total OPEX", format: "currency", importance: "secondary" },
    ],
    unitEconomics: [
      { key: "revenue_per_customer", name: "Revenue/Customer", description: "Average revenue per customer", format: "currency", importance: "primary" },
      { key: "cac", name: "CAC", description: "Customer Acquisition Cost", format: "currency", importance: "secondary" },
    ],
    healthIndicators: [
      { key: "gross_margin", name: "Gross Margin", healthyThreshold: 40, warningThreshold: 25, criticalThreshold: 10, direction: "higher_better" },
      { key: "operating_margin", name: "Operating Margin", healthyThreshold: 20, warningThreshold: 10, criticalThreshold: 0, direction: "higher_better" },
    ],
    terminology: {
      revenue: "Revenue",
      customer: "Customer",
      transaction: "Transaction",
    },
  },
};

export function getBusinessTypeConfig(type: BusinessType): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIGS[type] || BUSINESS_TYPE_CONFIGS.other;
}

export function formatMetricValue(value: number, format: MetricDefinition["format"]): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "number":
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(value);
    case "months":
      return `${value.toFixed(1)} mo`;
    case "days":
      return `${Math.round(value)} days`;
    default:
      return String(value);
  }
}
