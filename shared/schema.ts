import { sql, relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Subscription tier enum - defined before users table since it's used there
export const subscriptionTierEnumPg = pgEnum("subscription_tier", ["lite", "core", "growth"]);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isLiveMode: boolean("is_live_mode").default(false), // Live mode = real bank connection, Demo mode = existing features
  isApproved: boolean("is_approved").default(false), // Waitlist: user approved to access live workspace
  isAdmin: boolean("is_admin").default(false), // Admin access for waitlist management
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false), // Track if user finished onboarding flow
  hasSelectedPlan: boolean("has_selected_plan").default(false), // Track if user selected a subscription plan
  hasCompanyInfo: boolean("has_company_info").default(false), // Track if user entered company info
  hasConnectedBank: boolean("has_connected_bank").default(false), // Track if user connected a bank account
  subscriptionTier: varchar("subscription_tier", { length: 20 }), // lite, core, growth - null means no subscription
  stripeCustomerId: varchar("stripe_customer_id"), // Stripe customer ID
  stripeSubscriptionId: varchar("stripe_subscription_id"), // Stripe subscription ID
  companyName: varchar("company_name", { length: 255 }),
  companyIndustry: varchar("company_industry", { length: 100 }),
  companyStage: varchar("company_stage", { length: 50 }), // seed, series-a, series-b, growth, profitable
  companyRevenueRange: varchar("company_revenue_range", { length: 50 }), // pre-revenue, 0-100k, 100k-1m, 1m-10m, 10m+
  yodleeUserSession: varchar("yodlee_user_session"), // Cached Yodlee user session
  currentCash: numeric("current_cash", { precision: 15, scale: 2 }), // User's current cash on hand for runway calc
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Waitlist role enum
export const waitlistRoleEnum = pgEnum("waitlist_role", ["founder", "cfo", "ops", "investor", "other"]);

// Waitlist status enum
export const waitlistStatusEnum = pgEnum("waitlist_status", ["pending", "approved", "rejected"]);

// Waitlist - Pre-launch signups
export const waitlist = pgTable("waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: waitlistRoleEnum("role").default("founder"),
  company: varchar("company", { length: 255 }),
  painPoint: text("pain_point"), // "What's your biggest financial blindspot?"
  status: waitlistStatusEnum("status").default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_waitlist_email").on(table.email),
  index("idx_waitlist_status").on(table.status),
  index("idx_waitlist_created_at").on(table.createdAt),
]);

export const userRoleEnum = pgEnum("user_role", ["founder", "ops", "accountant", "cfo"]);

// Organization - the tenant entity
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 100 }),
  employeeCount: varchar("employee_count", { length: 50 }),
  annualRevenue: varchar("annual_revenue", { length: 50 }),
  monthlySpend: varchar("monthly_spend", { length: 50 }),
  departments: text("departments").array(),
  goals: text("goals").array(),
  planTier: varchar("plan_tier", { length: 50 }).default("free"),
  status: varchar("status", { length: 50 }).default("active"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User-Organization membership with roles
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").default("ops").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.organizationId)
]);

// Notification Preferences - per user notification settings
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  emailEnabled: boolean("email_enabled").default(true),
  weeklyDigestEnabled: boolean("weekly_digest_enabled").default(true),
  
  slackEnabled: boolean("slack_enabled").default(false),
  slackWebhookUrl: varchar("slack_webhook_url"),
  
  smsEnabled: boolean("sms_enabled").default(false),
  smsPhoneNumber: varchar("sms_phone_number"),
  
  minSeverity: varchar("min_severity", { length: 20 }).default("warning"),
  quietHoursStart: varchar("quiet_hours_start", { length: 10 }),
  quietHoursEnd: varchar("quiet_hours_end", { length: 10 }),
  timezone: varchar("timezone", { length: 50 }).default("America/Los_Angeles"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferences.$inferInsert;
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });

// Vendors
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 255 }),
  typicalCategory: varchar("typical_category", { length: 100 }),
  isSubscription: boolean("is_subscription").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Categories
export const categoryTypeEnum = pgEnum("category_type", ["income", "expense"]);

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  type: categoryTypeEnum("type").default("expense"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Departments
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document types
export const documentTypeEnum = pgEnum("document_type", [
  "bank_statement",
  "invoice",
  "receipt",
  "payroll",
  "subscription_email",
  "csv_upload",
  "other"
]);

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "processing",
  "processed",
  "error"
]);

// Documents
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: documentTypeEnum("type").notNull(),
  source: varchar("source", { length: 50 }).default("file_upload"),
  rawFileUrl: text("raw_file_url"),
  parsedText: text("parsed_text"),
  status: documentStatusEnum("status").default("uploaded").notNull(),
  extractionConfidence: numeric("extraction_confidence", { precision: 3, scale: 2 }),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bank Accounts (Yodlee/Plaid connections)
export const bankAccountTypeEnum = pgEnum("bank_account_type", ["checking", "savings", "credit_card", "investment", "loan", "other"]);
export const bankAccountStatusEnum = pgEnum("bank_account_status", ["active", "disconnected", "error"]);
export const bankConnectionProviderEnum = pgEnum("bank_connection_provider", ["yodlee", "plaid"]);

// Plaid Items (stores access tokens for connected institutions)
export const plaidItems = pgTable("plaid_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plaidItemId: varchar("plaid_item_id").notNull().unique(),
  accessToken: varchar("access_token").notNull(),
  institutionId: varchar("institution_id"),
  institutionName: varchar("institution_name"),
  cursor: varchar("cursor"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_plaid_items_user").on(table.userId),
]);

export const bankAccounts = pgTable("bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  provider: bankConnectionProviderEnum("provider").default("yodlee"),
  yodleeAccountId: varchar("yodlee_account_id"), // Yodlee's account ID
  yodleeProviderAccountId: varchar("yodlee_provider_account_id"), // Yodlee's provider account ID
  plaidAccountId: varchar("plaid_account_id"), // Plaid's account ID
  plaidItemId: varchar("plaid_item_id").references(() => plaidItems.id, { onDelete: "cascade" }),
  bankName: varchar("bank_name", { length: 255 }),
  accountName: varchar("account_name", { length: 255 }),
  accountNumberMasked: varchar("account_number_masked", { length: 50 }), // e.g., "****1234"
  accountType: bankAccountTypeEnum("account_type").default("checking"),
  currentBalance: numeric("current_balance", { precision: 15, scale: 2 }),
  availableBalance: numeric("available_balance", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: bankAccountStatusEnum("status").default("active"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_bank_accounts_user").on(table.userId),
  index("idx_bank_accounts_yodlee").on(table.yodleeAccountId),
  index("idx_bank_accounts_plaid").on(table.plaidAccountId),
]);

// Transaction source enum for distinguishing Yodlee vs Plaid vs CSV vs manual
export const transactionSourceEnum = pgEnum("transaction_source", ["yodlee", "plaid", "csv", "manual", "stripe"]);

// Transactions (updated with Yodlee/Plaid fields)
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "set null" }),
  bankAccountId: varchar("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }), // Link to bank account
  yodleeTransactionId: varchar("yodlee_transaction_id"), // Yodlee's transaction ID (for deduplication)
  plaidTransactionId: varchar("plaid_transaction_id"), // Plaid's transaction ID (for deduplication)
  date: timestamp("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  vendorId: varchar("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  vendorOriginal: varchar("vendor_original", { length: 255 }), // Raw vendor string from bank
  vendorNormalized: varchar("vendor_normalized", { length: 255 }), // AI-cleaned vendor name
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  departmentId: varchar("department_id").references(() => departments.id, { onDelete: "set null" }),
  description: text("description"),
  tags: text("tags").array(),
  isRecurring: boolean("is_recurring").default(false),
  source: transactionSourceEnum("source").default("csv"), // Where transaction came from
  classificationConfidence: numeric("classification_confidence", { precision: 3, scale: 2 }), // AI confidence 0-1
  notes: text("notes"),
  metadata: jsonb("metadata"), // Extra data from Yodlee/Stripe
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_transactions_org_date").on(table.organizationId, table.date),
  index("idx_transactions_vendor").on(table.vendorId),
  index("idx_transactions_category").on(table.categoryId),
  index("idx_transactions_yodlee").on(table.yodleeTransactionId),
  index("idx_transactions_plaid").on(table.plaidTransactionId),
  index("idx_transactions_bank_account").on(table.bankAccountId),
]);

// Planned Hires (for runway calculations)
export const plannedHires = pgTable("planned_hires", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  role: varchar("role", { length: 255 }).notNull(),
  department: varchar("department", { length: 100 }),
  monthlyCost: numeric("monthly_cost", { precision: 12, scale: 2 }).notNull(), // Fully-loaded cost
  startDate: timestamp("start_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Burn Metrics (calculated financial metrics for analytics)
export const burnMetrics = pgTable("burn_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  month: timestamp("month").notNull(), // First day of month
  grossBurn: numeric("gross_burn", { precision: 15, scale: 2 }), // Total expenses
  netBurn: numeric("net_burn", { precision: 15, scale: 2 }), // Expenses - Revenue
  revenue: numeric("revenue", { precision: 15, scale: 2 }),
  runway: numeric("runway", { precision: 5, scale: 1 }), // Months of runway
  cashBalance: numeric("cash_balance", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_burn_metrics_user_month").on(table.userId, table.month),
]);

// Raise Recommendations (AI-generated fundraising suggestions)
export const raiseRecommendations = pgTable("raise_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  recommendedAmount: numeric("recommended_amount", { precision: 15, scale: 2 }).notNull(),
  targetRunwayMonths: integer("target_runway_months").default(18),
  currentRunwayMonths: numeric("current_runway_months", { precision: 5, scale: 1 }),
  avgMonthlyBurn: numeric("avg_monthly_burn", { precision: 15, scale: 2 }),
  reasoning: text("reasoning"), // AI explanation
  milestones: jsonb("milestones"), // Key milestones to hit with raise
  createdAt: timestamp("created_at").defaultNow(),
});

// Budgets
export const budgets = pgTable("budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalBudgetAmount: numeric("total_budget_amount", { precision: 12, scale: 2 }).notNull(),
  breakdown: jsonb("breakdown"),
  status: varchar("status", { length: 50 }).default("draft"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Budget Lines
export const budgetLines = pgTable("budget_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: varchar("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  departmentId: varchar("department_id").references(() => departments.id, { onDelete: "set null" }),
  targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
  minAmount: numeric("min_amount", { precision: 12, scale: 2 }),
  maxAmount: numeric("max_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Forecasts (AI-generated 12-month projections)
export const forecasts = pgTable("forecasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM format
  projectedRevenue: numeric("projected_revenue", { precision: 15, scale: 2 }),
  projectedExpenses: numeric("projected_expenses", { precision: 15, scale: 2 }),
  projectedNetCash: numeric("projected_net_cash", { precision: 15, scale: 2 }),
  projectedRunway: varchar("projected_runway", { length: 10 }),
  assumptions: jsonb("assumptions"),
  scenario: varchar("scenario", { length: 50 }).default("base"), // base, optimistic, pessimistic
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_forecasts_org_month").on(table.organizationId, table.month),
]);

// Action Plans
export const actionPlanStatusEnum = pgEnum("action_plan_status", ["draft", "active", "completed"]);

export const actionPlans = pgTable("action_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: actionPlanStatusEnum("status").default("draft").notNull(),
  generatedSummary: text("generated_summary"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Action Items
export const actionItemTypeEnum = pgEnum("action_item_type", [
  "cut_subscription",
  "renegotiate_vendor",
  "adjust_budget",
  "review_department_spend",
  "other"
]);

export const actionItemStatusEnum = pgEnum("action_item_status", ["open", "in_progress", "done"]);
export const actionItemPriorityEnum = pgEnum("action_item_priority", ["high", "medium", "low"]);

export const actionItems = pgTable("action_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionPlanId: varchar("action_plan_id").notNull().references(() => actionPlans.id, { onDelete: "cascade" }),
  type: actionItemTypeEnum("type").default("other").notNull(),
  description: text("description").notNull(),
  impactEstimate: numeric("impact_estimate", { precision: 12, scale: 2 }),
  priority: actionItemPriorityEnum("priority").default("medium").notNull(),
  status: actionItemStatusEnum("status").default("open").notNull(),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insights
export const insightTypeEnum = pgEnum("insight_type", [
  "spend_drift",
  "subscription_creep",
  "vendor_overbilling",
  "overtime_drift",
  "other"
]);

export const insightSeverityEnum = pgEnum("insight_severity", ["info", "warning", "critical"]);

export const insights = pgTable("insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: insightTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  metricValue: numeric("metric_value", { precision: 12, scale: 2 }),
  severity: insightSeverityEnum("severity").default("info").notNull(),
  period: varchar("period", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_insights_org").on(table.organizationId),
]);

// Integration Connections
export const integrationConnections = pgTable("integration_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// QuickBooks OAuth Tokens
export const quickbooksTokens = pgTable("quickbooks_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  realmId: varchar("realm_id", { length: 100 }).notNull(), // QuickBooks company ID
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
  companyName: varchar("company_name", { length: 255 }),
  lastSyncedAt: timestamp("last_synced_at"),
  status: varchar("status", { length: 50 }).default("active"), // active, expired, revoked
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_qb_tokens_user").on(table.userId),
  index("idx_qb_tokens_realm").on(table.realmId),
]);

// Subscription Plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),
  yearlyPrice: numeric("yearly_price", { precision: 10, scale: 2 }),
  features: text("features").array().notNull(),
  maxUsers: integer("max_users"),
  maxOrganizations: integer("max_organizations"),
  maxDocuments: integer("max_documents"),
  maxTransactions: integer("max_transactions"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Monthly Financial Metrics (summary-level data by department and month)
export const monthlyMetrics = pgTable("monthly_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  departmentId: varchar("department_id").references(() => departments.id, { onDelete: "set null" }),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "set null" }),
  month: timestamp("month").notNull(), // Stored as first day of month
  revenue: numeric("revenue", { precision: 12, scale: 2 }).default("0"),
  expenses: numeric("expenses", { precision: 12, scale: 2 }).default("0"),
  profit: numeric("profit", { precision: 12, scale: 2 }).default("0"),
  cashBalance: numeric("cash_balance", { precision: 12, scale: 2 }),
  headcount: integer("headcount").default(0),
  subscriptionCount: integer("subscription_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_monthly_metrics_org_month").on(table.organizationId, table.month),
  index("idx_monthly_metrics_department").on(table.departmentId),
]);

// Shareable Reports
export const shareableReports = pgTable("shareable_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  reportData: jsonb("report_data").notNull(),
  isPublic: boolean("is_public").default(true),
  expiresAt: timestamp("expires_at"),
  viewCount: integer("view_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_shareable_reports_org").on(table.organizationId),
  index("idx_shareable_reports_created_by").on(table.createdBy),
]);

export type ShareableReport = typeof shareableReports.$inferSelect;
export type InsertShareableReport = typeof shareableReports.$inferInsert;
export const insertShareableReportSchema = createInsertSchema(shareableReports).omit({ id: true, createdAt: true, viewCount: true });

// Audit Logs - Track user actions on financial data for compliance
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 255 }),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_audit_logs_user").on(table.userId),
  index("idx_audit_logs_org").on(table.organizationId),
  index("idx_audit_logs_action").on(table.action),
  index("idx_audit_logs_created_at").on(table.createdAt),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  organizationMembers: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  documents: many(documents),
  transactions: many(transactions),
  vendors: many(vendors),
  categories: many(categories),
  departments: many(departments),
  budgets: many(budgets),
  actionPlans: many(actionPlans),
  insights: many(insights),
  integrations: many(integrationConnections),
  auditLogs: many(auditLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [transactions.organizationId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [transactions.documentId],
    references: [documents.id],
  }),
  vendor: one(vendors, {
    fields: [transactions.vendorId],
    references: [vendors.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  department: one(departments, {
    fields: [transactions.departmentId],
    references: [departments.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [budgets.organizationId],
    references: [organizations.id],
  }),
  lines: many(budgetLines),
}));

export const budgetLinesRelations = relations(budgetLines, ({ one }) => ({
  budget: one(budgets, {
    fields: [budgetLines.budgetId],
    references: [budgets.id],
  }),
  category: one(categories, {
    fields: [budgetLines.categoryId],
    references: [categories.id],
  }),
  department: one(departments, {
    fields: [budgetLines.departmentId],
    references: [departments.id],
  }),
}));

export const forecastsRelations = relations(forecasts, ({ one }) => ({
  organization: one(organizations, {
    fields: [forecasts.organizationId],
    references: [organizations.id],
  }),
}));

export const actionPlansRelations = relations(actionPlans, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [actionPlans.organizationId],
    references: [organizations.id],
  }),
  items: many(actionItems),
}));

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  actionPlan: one(actionPlans, {
    fields: [actionItems.actionPlanId],
    references: [actionPlans.id],
  }),
  assignee: one(users, {
    fields: [actionItems.assignedTo],
    references: [users.id],
  }),
}));

// Zod schemas for inserts
export const upsertUserSchema = createInsertSchema(users).omit({ createdAt: true, updatedAt: true }); // Keep id for upsert
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true });
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBudgetLineSchema = createInsertSchema(budgetLines).omit({ id: true, createdAt: true });
export const insertForecastSchema = createInsertSchema(forecasts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertActionPlanSchema = createInsertSchema(actionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertActionItemSchema = createInsertSchema(actionItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInsightSchema = createInsertSchema(insights).omit({ id: true, createdAt: true });
export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export const insertMonthlyMetricSchema = createInsertSchema(monthlyMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlaidItemSchema = createInsertSchema(plaidItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlannedHireSchema = createInsertSchema(plannedHires).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBurnMetricSchema = createInsertSchema(burnMetrics).omit({ id: true, createdAt: true });
export const insertRaiseRecommendationSchema = createInsertSchema(raiseRecommendations).omit({ id: true, createdAt: true });
export const insertQuickbooksTokenSchema = createInsertSchema(quickbooksTokens).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWaitlistSchema = createInsertSchema(waitlist).omit({ id: true, createdAt: true, approvedAt: true, approvedBy: true });

// Types
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type BudgetLine = typeof budgetLines.$inferSelect;
export type InsertBudgetLine = z.infer<typeof insertBudgetLineSchema>;
export type Forecast = typeof forecasts.$inferSelect;
export type InsertForecast = z.infer<typeof insertForecastSchema>;
export type ActionPlan = typeof actionPlans.$inferSelect;
export type InsertActionPlan = z.infer<typeof insertActionPlanSchema>;
export type ActionItem = typeof actionItems.$inferSelect;
export type InsertActionItem = z.infer<typeof insertActionItemSchema>;
export type Insight = typeof insights.$inferSelect;
export type InsertInsight = z.infer<typeof insertInsightSchema>;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type MonthlyMetric = typeof monthlyMetrics.$inferSelect;
export type InsertMonthlyMetric = z.infer<typeof insertMonthlyMetricSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type PlaidItem = typeof plaidItems.$inferSelect;
export type InsertPlaidItem = z.infer<typeof insertPlaidItemSchema>;
export type PlannedHire = typeof plannedHires.$inferSelect;
export type InsertPlannedHire = z.infer<typeof insertPlannedHireSchema>;
export type BurnMetric = typeof burnMetrics.$inferSelect;
export type InsertBurnMetric = z.infer<typeof insertBurnMetricSchema>;
export type RaiseRecommendation = typeof raiseRecommendations.$inferSelect;
export type InsertRaiseRecommendation = z.infer<typeof insertRaiseRecommendationSchema>;
export type QuickbooksToken = typeof quickbooksTokens.$inferSelect;
export type InsertQuickbooksToken = z.infer<typeof insertQuickbooksTokenSchema>;

// Waitlist types
export type WaitlistEntry = typeof waitlist.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistSchema>;

// Extended types with relations
export type TransactionWithRelations = Transaction & {
  vendor?: Vendor | null;
  category?: Category | null;
  department?: Department | null;
};
