/**
 * Chart of Accounts (COA) Mapper Service
 * 
 * Normalizes messy account names from various sources (QuickBooks, Xero, Ramp, Plaid)
 * to a canonical chart of accounts specific to the business type.
 */

import { db } from "./db";
import { 
  canonicalAccounts, 
  accountMappings, 
  mappingFeedback,
  organizations,
  transactions,
  type CanonicalAccount,
  type AccountMapping,
  type InsertAccountMapping,
} from "@shared/schema";
import { eq, and, ilike, sql, isNull, desc } from "drizzle-orm";
import { AIOrchestrator } from "./ai/orchestrator";
import { classifyAccountLocal } from "./ml/accountClassifier";

const aiOrchestrator = new AIOrchestrator();

// Guard to prevent repeated ML classifier error logging
let mlClassifierErrorLogged = false;

// ============================================
// Canonical Account Definitions by Business Type
// ============================================

type AccountGroup = "revenue" | "cogs" | "opex" | "non_operating" | "assets" | "liabilities" | "equity";

interface CanonicalAccountDef {
  code: string;
  name: string;
  description: string;
  group: AccountGroup;
  parentCode?: string;
  displayOrder: number;
}

// SaaS / Subscription Business
const SAAS_ACCOUNTS: CanonicalAccountDef[] = [
  // Revenue
  { code: "REV-ARR", name: "Annual Recurring Revenue", description: "Annual subscription revenue", group: "revenue", displayOrder: 10 },
  { code: "REV-MRR", name: "Monthly Recurring Revenue", description: "Monthly subscription revenue", group: "revenue", displayOrder: 20 },
  { code: "REV-USAGE", name: "Usage-Based Revenue", description: "Metered/consumption revenue", group: "revenue", displayOrder: 30 },
  { code: "REV-SERVICES", name: "Professional Services", description: "Implementation, consulting, training", group: "revenue", displayOrder: 40 },
  { code: "REV-OTHER", name: "Other Revenue", description: "One-time fees, refunds", group: "revenue", displayOrder: 50 },
  
  // COGS
  { code: "COGS-HOSTING", name: "Hosting & Infrastructure", description: "AWS, GCP, Azure, Vercel, etc.", group: "cogs", displayOrder: 100 },
  { code: "COGS-SUPPORT", name: "Customer Support", description: "Support team salaries, tools", group: "cogs", displayOrder: 110 },
  { code: "COGS-PAYMENTS", name: "Payment Processing", description: "Stripe, PayPal fees", group: "cogs", displayOrder: 120 },
  { code: "COGS-THIRD-PARTY", name: "Third-Party Services", description: "APIs, data providers", group: "cogs", displayOrder: 130 },
  
  // OpEx - R&D
  { code: "OPEX-RD", name: "Research & Development", description: "R&D department costs", group: "opex", displayOrder: 200 },
  { code: "OPEX-RD-ENG", name: "Engineering Salaries", description: "Engineering team compensation", group: "opex", parentCode: "OPEX-RD", displayOrder: 210 },
  { code: "OPEX-RD-PRODUCT", name: "Product Salaries", description: "Product team compensation", group: "opex", parentCode: "OPEX-RD", displayOrder: 220 },
  { code: "OPEX-RD-TOOLS", name: "Dev Tools & Software", description: "GitHub, Linear, Figma, etc.", group: "opex", parentCode: "OPEX-RD", displayOrder: 230 },
  
  // OpEx - S&M
  { code: "OPEX-SM", name: "Sales & Marketing", description: "S&M department costs", group: "opex", displayOrder: 300 },
  { code: "OPEX-SM-MARKETING", name: "Marketing", description: "Ads, content, events", group: "opex", parentCode: "OPEX-SM", displayOrder: 310 },
  { code: "OPEX-SM-SALES", name: "Sales", description: "Sales team, commissions", group: "opex", parentCode: "OPEX-SM", displayOrder: 320 },
  { code: "OPEX-SM-TOOLS", name: "Sales & Marketing Tools", description: "HubSpot, Salesforce, etc.", group: "opex", parentCode: "OPEX-SM", displayOrder: 330 },
  
  // OpEx - G&A
  { code: "OPEX-GA", name: "General & Administrative", description: "G&A department costs", group: "opex", displayOrder: 400 },
  { code: "OPEX-GA-ADMIN", name: "Administrative", description: "Admin salaries, office", group: "opex", parentCode: "OPEX-GA", displayOrder: 410 },
  { code: "OPEX-GA-HR", name: "Human Resources", description: "HR, recruiting, benefits admin", group: "opex", parentCode: "OPEX-GA", displayOrder: 420 },
  { code: "OPEX-GA-LEGAL", name: "Legal & Compliance", description: "Legal fees, compliance", group: "opex", parentCode: "OPEX-GA", displayOrder: 430 },
  { code: "OPEX-GA-FINANCE", name: "Finance & Accounting", description: "Accounting, bookkeeping", group: "opex", parentCode: "OPEX-GA", displayOrder: 440 },
  { code: "OPEX-GA-IT", name: "IT & Security", description: "IT infrastructure, security", group: "opex", parentCode: "OPEX-GA", displayOrder: 450 },
  
  // Non-Operating
  { code: "NONOP-INTEREST", name: "Interest Expense", description: "Loan interest", group: "non_operating", displayOrder: 500 },
  { code: "NONOP-TAXES", name: "Taxes", description: "Income taxes", group: "non_operating", displayOrder: 510 },
  { code: "NONOP-OTHER", name: "Other Non-Operating", description: "Misc non-operating", group: "non_operating", displayOrder: 520 },
];

// E-commerce Business
const ECOMMERCE_ACCOUNTS: CanonicalAccountDef[] = [
  // Revenue
  { code: "REV-PRODUCTS", name: "Product Sales", description: "Revenue from product sales", group: "revenue", displayOrder: 10 },
  { code: "REV-SHIPPING", name: "Shipping Revenue", description: "Shipping fees collected", group: "revenue", displayOrder: 20 },
  { code: "REV-RETURNS", name: "Returns & Refunds", description: "Return/refund contra-revenue", group: "revenue", displayOrder: 30 },
  { code: "REV-OTHER", name: "Other Revenue", description: "Gift cards, misc revenue", group: "revenue", displayOrder: 40 },
  
  // COGS
  { code: "COGS-INVENTORY", name: "Inventory Cost", description: "Cost of goods sold", group: "cogs", displayOrder: 100 },
  { code: "COGS-FULFILLMENT", name: "Fulfillment", description: "Picking, packing, shipping", group: "cogs", displayOrder: 110 },
  { code: "COGS-RETURNS", name: "Returns Processing", description: "Return handling costs", group: "cogs", displayOrder: 120 },
  { code: "COGS-PACKAGING", name: "Packaging", description: "Boxes, materials", group: "cogs", displayOrder: 130 },
  { code: "COGS-PAYMENTS", name: "Payment Processing", description: "Stripe, PayPal fees", group: "cogs", displayOrder: 140 },
  
  // OpEx
  { code: "OPEX-MARKETING", name: "Marketing", description: "Ads, influencers, content", group: "opex", displayOrder: 200 },
  { code: "OPEX-PLATFORM", name: "Platform & Tech", description: "Shopify, website, apps", group: "opex", displayOrder: 210 },
  { code: "OPEX-WAREHOUSE", name: "Warehousing", description: "Storage, 3PL fees", group: "opex", displayOrder: 220 },
  { code: "OPEX-CUSTOMER", name: "Customer Service", description: "Support team, tools", group: "opex", displayOrder: 230 },
  { code: "OPEX-ADMIN", name: "General & Admin", description: "Admin, legal, finance", group: "opex", displayOrder: 240 },
  { code: "OPEX-PAYROLL", name: "Payroll", description: "Employee salaries", group: "opex", displayOrder: 250 },
  
  // Non-Operating
  { code: "NONOP-INTEREST", name: "Interest Expense", description: "Loan interest", group: "non_operating", displayOrder: 300 },
  { code: "NONOP-TAXES", name: "Taxes", description: "Income taxes", group: "non_operating", displayOrder: 310 },
];

// Marketplace Business
const MARKETPLACE_ACCOUNTS: CanonicalAccountDef[] = [
  // Revenue
  { code: "REV-TAKE-RATE", name: "Take Rate / Commissions", description: "Transaction fees from GMV", group: "revenue", displayOrder: 10 },
  { code: "REV-SUBSCRIPTION", name: "Seller Subscriptions", description: "Monthly seller fees", group: "revenue", displayOrder: 20 },
  { code: "REV-ADVERTISING", name: "Advertising", description: "Promoted listings, ads", group: "revenue", displayOrder: 30 },
  { code: "REV-VALUE-ADD", name: "Value-Add Services", description: "Payments, fulfillment, etc.", group: "revenue", displayOrder: 40 },
  
  // COGS
  { code: "COGS-PAYMENTS", name: "Payment Processing", description: "Stripe, PayPal fees", group: "cogs", displayOrder: 100 },
  { code: "COGS-TRUST-SAFETY", name: "Trust & Safety", description: "Fraud, chargebacks, moderation", group: "cogs", displayOrder: 110 },
  { code: "COGS-SUPPORT", name: "Customer Support", description: "Support for buyers/sellers", group: "cogs", displayOrder: 120 },
  
  // OpEx
  { code: "OPEX-MARKETING", name: "Marketing", description: "User acquisition", group: "opex", displayOrder: 200 },
  { code: "OPEX-PLATFORM", name: "Platform Engineering", description: "Engineering team, infra", group: "opex", displayOrder: 210 },
  { code: "OPEX-OPERATIONS", name: "Operations", description: "Ops team, processes", group: "opex", displayOrder: 220 },
  { code: "OPEX-ADMIN", name: "General & Admin", description: "Admin, legal, finance", group: "opex", displayOrder: 230 },
  { code: "OPEX-PAYROLL", name: "Payroll", description: "Employee salaries", group: "opex", displayOrder: 240 },
  
  // Non-Operating
  { code: "NONOP-INTEREST", name: "Interest Expense", description: "Loan interest", group: "non_operating", displayOrder: 300 },
  { code: "NONOP-TAXES", name: "Taxes", description: "Income taxes", group: "non_operating", displayOrder: 310 },
];

// Services / Agency Business
const SERVICES_ACCOUNTS: CanonicalAccountDef[] = [
  // Revenue
  { code: "REV-RETAINER", name: "Retainer Revenue", description: "Monthly retainer fees", group: "revenue", displayOrder: 10 },
  { code: "REV-BILLABLE", name: "Billable Hours", description: "Hourly billing revenue", group: "revenue", displayOrder: 20 },
  { code: "REV-PROJECT", name: "Project / Milestone", description: "Fixed-price projects", group: "revenue", displayOrder: 30 },
  { code: "REV-OTHER", name: "Other Revenue", description: "Expense reimbursement, etc.", group: "revenue", displayOrder: 40 },
  
  // COGS
  { code: "COGS-CONTRACTORS", name: "Contractors", description: "Freelancer/contractor costs", group: "cogs", displayOrder: 100 },
  { code: "COGS-DIRECT-LABOR", name: "Direct Labor", description: "Billable employee time", group: "cogs", displayOrder: 110 },
  { code: "COGS-TOOLS", name: "Project Tools", description: "Client-specific tools", group: "cogs", displayOrder: 120 },
  
  // OpEx
  { code: "OPEX-BIZDEV", name: "Business Development", description: "Sales, pitches, proposals", group: "opex", displayOrder: 200 },
  { code: "OPEX-MARKETING", name: "Marketing", description: "Website, content, events", group: "opex", displayOrder: 210 },
  { code: "OPEX-TOOLS", name: "Tools & Software", description: "Internal tools, software", group: "opex", displayOrder: 220 },
  { code: "OPEX-ADMIN", name: "General & Admin", description: "Admin, legal, finance", group: "opex", displayOrder: 230 },
  { code: "OPEX-PAYROLL", name: "Non-Billable Payroll", description: "Admin, management salaries", group: "opex", displayOrder: 240 },
  { code: "OPEX-OFFICE", name: "Office & Facilities", description: "Rent, utilities", group: "opex", displayOrder: 250 },
  
  // Non-Operating
  { code: "NONOP-INTEREST", name: "Interest Expense", description: "Loan interest", group: "non_operating", displayOrder: 300 },
  { code: "NONOP-TAXES", name: "Taxes", description: "Income taxes", group: "non_operating", displayOrder: 310 },
];

// Hardware / Manufacturing Business
const HARDWARE_ACCOUNTS: CanonicalAccountDef[] = [
  // Revenue
  { code: "REV-DEVICES", name: "Device Sales", description: "Hardware product sales", group: "revenue", displayOrder: 10 },
  { code: "REV-ACCESSORIES", name: "Accessories", description: "Add-on products", group: "revenue", displayOrder: 20 },
  { code: "REV-WARRANTIES", name: "Extended Warranties", description: "Warranty revenue", group: "revenue", displayOrder: 30 },
  { code: "REV-SOFTWARE", name: "Software/Services", description: "Recurring software", group: "revenue", displayOrder: 40 },
  { code: "REV-OTHER", name: "Other Revenue", description: "Licensing, royalties", group: "revenue", displayOrder: 50 },
  
  // COGS
  { code: "COGS-COMPONENTS", name: "Components", description: "Raw materials, parts", group: "cogs", displayOrder: 100 },
  { code: "COGS-MANUFACTURING", name: "Manufacturing", description: "Assembly, production", group: "cogs", displayOrder: 110 },
  { code: "COGS-SHIPPING", name: "Shipping & Freight", description: "Inbound/outbound freight", group: "cogs", displayOrder: 120 },
  { code: "COGS-WARRANTY", name: "Warranty Costs", description: "Repairs, replacements", group: "cogs", displayOrder: 130 },
  { code: "COGS-QUALITY", name: "Quality Control", description: "Testing, QA", group: "cogs", displayOrder: 140 },
  
  // OpEx
  { code: "OPEX-RD", name: "R&D / Engineering", description: "Product development", group: "opex", displayOrder: 200 },
  { code: "OPEX-DISTRIBUTION", name: "Distribution", description: "Warehousing, logistics", group: "opex", displayOrder: 210 },
  { code: "OPEX-SUPPORT", name: "Customer Support", description: "Support team, tools", group: "opex", displayOrder: 220 },
  { code: "OPEX-MARKETING", name: "Marketing & Sales", description: "Ads, sales team", group: "opex", displayOrder: 230 },
  { code: "OPEX-ADMIN", name: "General & Admin", description: "Admin, legal, finance", group: "opex", displayOrder: 240 },
  { code: "OPEX-PAYROLL", name: "Payroll", description: "Employee salaries", group: "opex", displayOrder: 250 },
  
  // Non-Operating
  { code: "NONOP-INTEREST", name: "Interest Expense", description: "Loan interest", group: "non_operating", displayOrder: 300 },
  { code: "NONOP-TAXES", name: "Taxes", description: "Income taxes", group: "non_operating", displayOrder: 310 },
];

// Get accounts for a business type
export function getCanonicalAccountsForType(businessType: string): CanonicalAccountDef[] {
  switch (businessType) {
    case "saas":
      return SAAS_ACCOUNTS;
    case "ecommerce":
      return ECOMMERCE_ACCOUNTS;
    case "marketplace":
      return MARKETPLACE_ACCOUNTS;
    case "agency":
      return SERVICES_ACCOUNTS;
    case "hardware":
      return HARDWARE_ACCOUNTS;
    default:
      // Default to SaaS for other types
      return SAAS_ACCOUNTS;
  }
}

// ============================================
// Mapping Rules Engine
// ============================================

interface MappingRule {
  patterns: RegExp[];
  canonicalCode: string;
  confidence: number;
}

// Common mapping rules that apply across business types
const COMMON_MAPPING_RULES: MappingRule[] = [
  // Revenue patterns
  { patterns: [/revenue/i, /sales/i, /income/i], canonicalCode: "REV-", confidence: 0.7 },
  { patterns: [/subscription/i, /recurring/i, /mrr/i, /arr/i], canonicalCode: "REV-MRR", confidence: 0.9 },
  
  // Hosting/Infrastructure
  { patterns: [/aws/i, /amazon web services/i], canonicalCode: "COGS-HOSTING", confidence: 0.95 },
  { patterns: [/google cloud/i, /gcp/i], canonicalCode: "COGS-HOSTING", confidence: 0.95 },
  { patterns: [/azure/i, /microsoft cloud/i], canonicalCode: "COGS-HOSTING", confidence: 0.95 },
  { patterns: [/heroku/i, /vercel/i, /netlify/i, /render/i], canonicalCode: "COGS-HOSTING", confidence: 0.95 },
  { patterns: [/hosting/i, /server/i, /infrastructure/i, /cloud/i], canonicalCode: "COGS-HOSTING", confidence: 0.85 },
  
  // Payment Processing
  { patterns: [/stripe/i, /paypal/i, /square/i, /braintree/i], canonicalCode: "COGS-PAYMENTS", confidence: 0.9 },
  { patterns: [/payment processing/i, /transaction fee/i, /merchant fee/i], canonicalCode: "COGS-PAYMENTS", confidence: 0.9 },
  
  // Software/SaaS Tools
  { patterns: [/slack/i, /zoom/i, /notion/i, /figma/i, /github/i], canonicalCode: "OPEX-RD-TOOLS", confidence: 0.85 },
  { patterns: [/atlassian/i, /jira/i, /confluence/i, /linear/i], canonicalCode: "OPEX-RD-TOOLS", confidence: 0.85 },
  { patterns: [/hubspot/i, /salesforce/i, /mailchimp/i], canonicalCode: "OPEX-SM-TOOLS", confidence: 0.85 },
  { patterns: [/software/i, /subscription/i, /saas/i], canonicalCode: "OPEX-RD-TOOLS", confidence: 0.7 },
  
  // Marketing
  { patterns: [/google ads/i, /facebook ads/i, /meta ads/i, /linkedin ads/i], canonicalCode: "OPEX-SM-MARKETING", confidence: 0.9 },
  { patterns: [/advertising/i, /marketing/i, /ads\b/i], canonicalCode: "OPEX-SM-MARKETING", confidence: 0.8 },
  
  // Payroll
  { patterns: [/payroll/i, /gusto/i, /adp/i, /paychex/i], canonicalCode: "OPEX-PAYROLL", confidence: 0.9 },
  { patterns: [/salaries/i, /wages/i, /compensation/i], canonicalCode: "OPEX-PAYROLL", confidence: 0.85 },
  
  // Legal/Professional
  { patterns: [/legal/i, /attorney/i, /lawyer/i, /law firm/i], canonicalCode: "OPEX-GA-LEGAL", confidence: 0.9 },
  { patterns: [/accounting/i, /bookkeeping/i, /cpa/i], canonicalCode: "OPEX-GA-FINANCE", confidence: 0.9 },
  
  // Office/Admin
  { patterns: [/office/i, /rent/i, /lease/i], canonicalCode: "OPEX-GA-ADMIN", confidence: 0.8 },
  { patterns: [/utilities/i, /internet/i, /phone/i], canonicalCode: "OPEX-GA-ADMIN", confidence: 0.75 },
  
  // Bank/Interest
  { patterns: [/interest expense/i, /loan interest/i], canonicalCode: "NONOP-INTEREST", confidence: 0.9 },
  { patterns: [/bank fee/i, /wire fee/i, /transaction fee/i], canonicalCode: "OPEX-GA-FINANCE", confidence: 0.7 },
  
  // Taxes
  { patterns: [/income tax/i, /tax expense/i, /federal tax/i, /state tax/i], canonicalCode: "NONOP-TAXES", confidence: 0.9 },
  { patterns: [/payroll tax/i, /fica/i, /unemployment/i], canonicalCode: "OPEX-PAYROLL", confidence: 0.85 },
];

// Business-type specific rules
const BUSINESS_TYPE_RULES: Record<string, MappingRule[]> = {
  saas: [
    { patterns: [/support/i, /customer success/i], canonicalCode: "COGS-SUPPORT", confidence: 0.85 },
    { patterns: [/engineering/i, /developer/i, /programmer/i], canonicalCode: "OPEX-RD-ENG", confidence: 0.85 },
    { patterns: [/product/i, /pm\b/i, /product manager/i], canonicalCode: "OPEX-RD-PRODUCT", confidence: 0.8 },
  ],
  ecommerce: [
    { patterns: [/inventory/i, /merchandise/i, /product cost/i], canonicalCode: "COGS-INVENTORY", confidence: 0.9 },
    { patterns: [/fulfillment/i, /shipping/i, /3pl/i], canonicalCode: "COGS-FULFILLMENT", confidence: 0.9 },
    { patterns: [/returns/i, /refund/i], canonicalCode: "COGS-RETURNS", confidence: 0.85 },
    { patterns: [/packaging/i, /boxes/i], canonicalCode: "COGS-PACKAGING", confidence: 0.85 },
    { patterns: [/warehouse/i, /storage/i], canonicalCode: "OPEX-WAREHOUSE", confidence: 0.85 },
  ],
  marketplace: [
    { patterns: [/commission/i, /take rate/i, /gmv/i], canonicalCode: "REV-TAKE-RATE", confidence: 0.9 },
    { patterns: [/fraud/i, /chargeback/i, /moderation/i], canonicalCode: "COGS-TRUST-SAFETY", confidence: 0.85 },
  ],
  agency: [
    { patterns: [/retainer/i], canonicalCode: "REV-RETAINER", confidence: 0.9 },
    { patterns: [/billable/i, /hourly/i, /time\s*tracking/i], canonicalCode: "REV-BILLABLE", confidence: 0.85 },
    { patterns: [/contractor/i, /freelancer/i, /subcontract/i], canonicalCode: "COGS-CONTRACTORS", confidence: 0.9 },
  ],
  hardware: [
    { patterns: [/component/i, /parts/i, /raw material/i, /bom\b/i], canonicalCode: "COGS-COMPONENTS", confidence: 0.9 },
    { patterns: [/manufacturing/i, /assembly/i, /production/i], canonicalCode: "COGS-MANUFACTURING", confidence: 0.9 },
    { patterns: [/freight/i, /shipping/i, /logistics/i], canonicalCode: "COGS-SHIPPING", confidence: 0.85 },
    { patterns: [/warranty/i, /repair/i, /rma\b/i], canonicalCode: "COGS-WARRANTY", confidence: 0.85 },
  ],
};

// ============================================
// COA Mapper Service
// ============================================

export interface MappingResult {
  canonicalAccountId: string;
  canonicalCode: string;
  canonicalName: string;
  confidence: number;
  source: "rule" | "ai" | "user" | "imported" | "default" | "ml_local";
  matchedRule?: string;
}

export interface MappingSuggestion {
  sourceAccountName: string;
  mapping: MappingResult;
  needsReview: boolean;
}

/**
 * Seed canonical accounts for a business type
 */
export async function seedCanonicalAccounts(businessType: string): Promise<number> {
  const accounts = getCanonicalAccountsForType(businessType);
  
  let insertedCount = 0;
  for (const account of accounts) {
    try {
      await db
        .insert(canonicalAccounts)
        .values({
          businessType: businessType as any,
          accountGroup: account.group,
          code: account.code,
          name: account.name,
          description: account.description,
          parentCode: account.parentCode,
          displayOrder: account.displayOrder,
        })
        .onConflictDoNothing();
      insertedCount++;
    } catch (error) {
      console.error(`Error inserting canonical account ${account.code}:`, error);
    }
  }
  
  console.log(`[COA] Seeded ${insertedCount} canonical accounts for ${businessType}`);
  return insertedCount;
}

/**
 * Get all canonical accounts for a business type from database
 */
export async function getCanonicalAccounts(businessType: string): Promise<CanonicalAccount[]> {
  return db
    .select()
    .from(canonicalAccounts)
    .where(eq(canonicalAccounts.businessType, businessType as any))
    .orderBy(canonicalAccounts.displayOrder);
}

/**
 * Map a source account name to a canonical account
 */
export async function mapAccountToCanonical(
  organizationId: string,
  sourceAccountName: string,
  sourceSystem: string,
  businessType: string
): Promise<MappingResult> {
  // First check if we have an existing mapping
  const existingMapping = await db
    .select({
      mapping: accountMappings,
      canonical: canonicalAccounts,
    })
    .from(accountMappings)
    .innerJoin(canonicalAccounts, eq(accountMappings.canonicalAccountId, canonicalAccounts.id))
    .where(
      and(
        eq(accountMappings.organizationId, organizationId),
        ilike(accountMappings.sourceAccountName, sourceAccountName),
        eq(accountMappings.isActive, true)
      )
    )
    .limit(1);
  
  if (existingMapping.length > 0) {
    const { mapping, canonical } = existingMapping[0];
    
    // Update usage count
    await db
      .update(accountMappings)
      .set({ 
        usageCount: sql`${accountMappings.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(accountMappings.id, mapping.id));
    
    return {
      canonicalAccountId: canonical.id,
      canonicalCode: canonical.code,
      canonicalName: canonical.name,
      confidence: parseFloat(mapping.confidenceScore || "0.9"),
      source: mapping.source as any,
    };
  }
  
  // Try local ML classifier first (proprietary model - no external API calls)
  // The classifier internally enforces confidence thresholds and returns null for low confidence
  try {
    const mlResult = await classifyAccountLocal(organizationId, sourceAccountName);
    if (mlResult) {
      console.log(`[COA] Using local ML for "${sourceAccountName}" -> ${mlResult.canonicalCode} (${(mlResult.confidence * 100).toFixed(1)}%)`);
      // Use the cached canonical account info from the model - no DB query needed
      const result: MappingResult = {
        canonicalAccountId: mlResult.canonicalAccountId,
        canonicalCode: mlResult.canonicalCode,
        canonicalName: mlResult.canonicalName,
        confidence: mlResult.confidence,
        source: "ml_local",
        matchedRule: `ML matched: ${mlResult.matchedExamples.slice(0, 2).join(", ")}`,
      };
      await storeMapping(organizationId, sourceAccountName, sourceSystem, result);
      return result;
    }
  } catch (mlError: any) {
    // Log once and continue - don't let ML failures block core mapping flow
    if (!mlClassifierErrorLogged) {
      console.warn(`[COA] Local ML classification unavailable, falling back to patterns:`, mlError.message || mlError);
      mlClassifierErrorLogged = true;
    }
  }
  
  // No existing mapping - try learned patterns (from user corrections)
  const learnedResult = await matchLearnedPattern(organizationId, sourceAccountName);
  if (learnedResult && learnedResult.confidence >= 0.7) {
    console.log(`[COA] Using learned pattern for "${sourceAccountName}" -> ${learnedResult.canonicalCode}`);
    await storeMapping(organizationId, sourceAccountName, sourceSystem, learnedResult);
    return learnedResult;
  }
  
  // Fall back to rules engine
  let result = await mapUsingRules(sourceAccountName, businessType);
  
  // If confidence is low, try AI-assisted mapping
  if (result.confidence < 0.7 && aiOrchestrator.hasAnyProviderAvailable()) {
    const aiResult = await mapUsingAI(sourceAccountName, businessType);
    if (aiResult && aiResult.confidence > result.confidence) {
      result = aiResult;
    }
  }
  
  // Store the new mapping
  await storeMapping(organizationId, sourceAccountName, sourceSystem, result);
  
  return result;
}

/**
 * Apply mapping rules to find best match
 */
async function mapUsingRules(sourceAccountName: string, businessType: string): Promise<MappingResult> {
  const searchText = sourceAccountName.toLowerCase();
  
  // Get canonical accounts from DB
  const accounts = await getCanonicalAccounts(businessType);
  if (accounts.length === 0) {
    // Seed if not exists
    await seedCanonicalAccounts(businessType);
  }
  const accountsMap = new Map(accounts.map(a => [a.code, a]));
  
  // Try business-type specific rules first
  const typeRules = BUSINESS_TYPE_RULES[businessType] || [];
  for (const rule of typeRules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(searchText)) {
        const account = findAccountByCodePrefix(accountsMap, rule.canonicalCode);
        if (account) {
          return {
            canonicalAccountId: account.id,
            canonicalCode: account.code,
            canonicalName: account.name,
            confidence: rule.confidence,
            source: "rule",
            matchedRule: pattern.source,
          };
        }
      }
    }
  }
  
  // Try common rules
  for (const rule of COMMON_MAPPING_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(searchText)) {
        const account = findAccountByCodePrefix(accountsMap, rule.canonicalCode);
        if (account) {
          return {
            canonicalAccountId: account.id,
            canonicalCode: account.code,
            canonicalName: account.name,
            confidence: rule.confidence,
            source: "rule",
            matchedRule: pattern.source,
          };
        }
      }
    }
  }
  
  // Default fallback - map to G&A if no match
  const defaultAccount = findAccountByCodePrefix(accountsMap, "OPEX-GA-ADMIN") || 
                         findAccountByCodePrefix(accountsMap, "OPEX-ADMIN") ||
                         accounts[0];
  
  if (defaultAccount) {
    return {
      canonicalAccountId: defaultAccount.id,
      canonicalCode: defaultAccount.code,
      canonicalName: defaultAccount.name,
      confidence: 0.3,
      source: "default",
    };
  }
  
  throw new Error(`No canonical accounts found for business type ${businessType}`);
}

/**
 * Find account by code or code prefix
 */
function findAccountByCodePrefix(
  accountsMap: Map<string, CanonicalAccount>, 
  codePrefix: string
): CanonicalAccount | undefined {
  // Exact match first
  if (accountsMap.has(codePrefix)) {
    return accountsMap.get(codePrefix);
  }
  
  // Prefix match
  for (const [code, account] of accountsMap) {
    if (code.startsWith(codePrefix)) {
      return account;
    }
  }
  
  return undefined;
}

/**
 * Use AI to suggest canonical account mapping for ambiguous accounts
 */
async function mapUsingAI(
  sourceAccountName: string,
  businessType: string
): Promise<MappingResult | null> {
  try {
    const accounts = await getCanonicalAccounts(businessType);
    if (accounts.length === 0) {
      return null;
    }
    
    const accountsMap = new Map(accounts.map(a => [a.code, a]));
    
    const accountOptions = accounts.map(a => ({
      code: a.code,
      name: a.name,
      description: a.description,
      group: a.accountGroup,
    }));
    
    const systemPrompt = `You are a financial categorization expert. Your task is to map source account names to canonical chart of accounts categories.

Business Type: ${businessType}

Available canonical accounts:
${JSON.stringify(accountOptions, null, 2)}

Rules:
1. Match based on the semantic meaning of the account name
2. Consider industry-specific terminology
3. If the name suggests revenue/income, map to a REV-* account
4. If the name suggests direct costs of delivering service/product, map to COGS-*
5. If the name suggests operating expenses, map to OPEX-*
6. If the name suggests interest, taxes, or other non-operating items, map to NONOP-*
7. When uncertain, prefer OPEX-GA-ADMIN or OPEX-ADMIN as a safe default
8. Provide a confidence score between 0 and 1

Respond in JSON format only:
{
  "code": "ACCOUNT_CODE",
  "confidence": 0.8,
  "reasoning": "Brief explanation of why this mapping was chosen"
}`;

    const prompt = `Map this account name to the most appropriate canonical account:

Source Account Name: "${sourceAccountName}"

Analyze the account name and return the best matching canonical account code with your confidence level.`;

    let response;
    const providers = ["openai", "groq", "gemini"] as const;
    
    for (const provider of providers) {
      try {
        response = await aiOrchestrator.callSingleProvider(provider, {
          prompt,
          systemPrompt,
          taskType: "categorization",
          jsonMode: provider !== "gemini",
          maxTokens: 200,
          temperature: 0.2,
        });
        break;
      } catch (providerError) {
        console.warn(`[COA AI] Provider ${provider} failed, trying next...`);
        continue;
      }
    }
    
    if (!response) {
      console.warn(`[COA AI] All AI providers failed for "${sourceAccountName}"`);
      return null;
    }

    const parsed = JSON.parse(response.content);
    const matchedCode = parsed.code;
    const aiConfidence = Math.min(Math.max(parsed.confidence || 0.6, 0), 1);
    
    const account = accountsMap.get(matchedCode) || findAccountByCodePrefix(accountsMap, matchedCode);
    
    if (!account) {
      console.warn(`[COA AI] AI suggested unknown code ${matchedCode} for "${sourceAccountName}"`);
      return null;
    }
    
    console.log(`[COA AI] Mapped "${sourceAccountName}" -> ${account.code} (confidence: ${aiConfidence})`);
    
    return {
      canonicalAccountId: account.id,
      canonicalCode: account.code,
      canonicalName: account.name,
      confidence: aiConfidence * 0.95,
      source: "ai",
      matchedRule: parsed.reasoning,
    };
  } catch (error) {
    console.error(`[COA AI] Error mapping "${sourceAccountName}":`, error);
    return null;
  }
}

/**
 * Store a mapping in the database
 */
async function storeMapping(
  organizationId: string,
  sourceAccountName: string,
  sourceSystem: string,
  result: MappingResult
): Promise<void> {
  const confidenceLevel = result.confidence >= 0.9 ? "high" :
                          result.confidence >= 0.7 ? "medium" : "low";
  
  try {
    await db
      .insert(accountMappings)
      .values({
        organizationId,
        canonicalAccountId: result.canonicalAccountId,
        sourceAccountName,
        sourceSystem,
        confidence: confidenceLevel as any,
        confidenceScore: result.confidence.toFixed(3),
        source: result.source as any,
        usageCount: 1,
        lastUsedAt: new Date(),
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error(`[COA] Error storing mapping for ${sourceAccountName}:`, error);
  }
}

/**
 * Batch map multiple accounts
 */
export async function batchMapAccounts(
  organizationId: string,
  accounts: Array<{ name: string; code?: string; system: string }>,
  businessType: string
): Promise<MappingSuggestion[]> {
  const results: MappingSuggestion[] = [];
  
  for (const account of accounts) {
    const mapping = await mapAccountToCanonical(
      organizationId,
      account.name,
      account.system,
      businessType
    );
    
    results.push({
      sourceAccountName: account.name,
      mapping,
      needsReview: mapping.confidence < 0.7,
    });
  }
  
  return results;
}

/**
 * Get low-confidence mappings that need review
 */
export async function getLowConfidenceMappings(organizationId: string): Promise<AccountMapping[]> {
  return db
    .select()
    .from(accountMappings)
    .where(
      and(
        eq(accountMappings.organizationId, organizationId),
        eq(accountMappings.confidence, "low")
      )
    );
}

/**
 * Update a mapping with user correction
 */
export async function correctMapping(
  mappingId: string,
  newCanonicalAccountId: string,
  userId: string,
  notes?: string
): Promise<void> {
  const [existingMapping] = await db
    .select()
    .from(accountMappings)
    .where(eq(accountMappings.id, mappingId));
  
  if (!existingMapping) {
    throw new Error("Mapping not found");
  }
  
  // Record feedback
  await db.insert(mappingFeedback).values({
    organizationId: existingMapping.organizationId,
    accountMappingId: mappingId,
    suggestedCanonicalAccountId: existingMapping.canonicalAccountId,
    correctedCanonicalAccountId: newCanonicalAccountId,
    sourceAccountName: existingMapping.sourceAccountName,
    sourceSystem: existingMapping.sourceSystem,
    originalConfidence: existingMapping.confidenceScore,
    status: "corrected",
    userId,
    notes,
    reviewedAt: new Date(),
  });
  
  // Update the mapping
  await db
    .update(accountMappings)
    .set({
      canonicalAccountId: newCanonicalAccountId,
      confidence: "manual",
      confidenceScore: "1.000",
      source: "user",
      updatedAt: new Date(),
    })
    .where(eq(accountMappings.id, mappingId));
  
  console.log(`[COA] User ${userId} corrected mapping ${mappingId}`);
}

/**
 * Initialize COA system for an organization
 */
export async function initializeCOA(organizationId: string): Promise<{ accountsSeeded: number }> {
  // Get organization business type
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  
  if (!org) {
    throw new Error("Organization not found");
  }
  
  const businessType = org.businessType || "other";
  
  // Seed canonical accounts if needed
  const existingAccounts = await getCanonicalAccounts(businessType);
  let accountsSeeded = 0;
  
  if (existingAccounts.length === 0) {
    accountsSeeded = await seedCanonicalAccounts(businessType);
  }
  
  console.log(`[COA] Initialized COA for org ${organizationId} (type: ${businessType})`);
  
  return { accountsSeeded };
}

// ============================================
// Retroactive Batch Processor
// ============================================

export interface BatchProcessResult {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  lowConfidenceCount: number;
  errors: Array<{ transactionId: string; error: string }>;
}

/**
 * Process historical transactions and assign canonical account IDs
 * Processes in batches to avoid memory issues
 */
export async function processHistoricalTransactions(
  organizationId: string,
  options: {
    batchSize?: number;
    onlyUnmapped?: boolean;
    limit?: number;
  } = {}
): Promise<BatchProcessResult> {
  const { batchSize = 100, onlyUnmapped = true, limit } = options;
  
  // Get organization business type
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  
  if (!org) {
    throw new Error("Organization not found");
  }
  
  const businessType = org.businessType || "other";
  
  // Ensure canonical accounts are seeded
  const existingAccounts = await getCanonicalAccounts(businessType);
  if (existingAccounts.length === 0) {
    await seedCanonicalAccounts(businessType);
  }
  
  const result: BatchProcessResult = {
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    lowConfidenceCount: 0,
    errors: [],
  };
  
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Build query for transactions
    let query = db
      .select()
      .from(transactions)
      .where(
        onlyUnmapped
          ? and(
              eq(transactions.organizationId, organizationId),
              isNull(transactions.canonicalAccountId)
            )
          : eq(transactions.organizationId, organizationId)
      )
      .orderBy(desc(transactions.date))
      .limit(batchSize)
      .offset(offset);
    
    const batch = await query;
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    // Process each transaction in the batch
    for (const txn of batch) {
      if (limit && result.totalProcessed >= limit) {
        hasMore = false;
        break;
      }
      
      try {
        // Determine source account name from available fields
        const sourceAccountName = txn.vendorNormalized || 
                                   txn.vendorOriginal || 
                                   txn.description || 
                                   "Unknown";
        
        // Get source system
        const sourceSystem = txn.source || "unknown";
        
        // Map to canonical account
        const mapping = await mapAccountToCanonical(
          organizationId,
          sourceAccountName,
          sourceSystem,
          businessType
        );
        
        // Update transaction with canonical account ID
        await db
          .update(transactions)
          .set({
            canonicalAccountId: mapping.canonicalAccountId,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, txn.id));
        
        result.successCount++;
        
        if (mapping.confidence < 0.7) {
          result.lowConfidenceCount++;
        }
      } catch (error) {
        result.errorCount++;
        result.errors.push({
          transactionId: txn.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      result.totalProcessed++;
    }
    
    offset += batchSize;
    
    // Log progress every 500 transactions
    if (result.totalProcessed % 500 === 0) {
      console.log(`[COA] Processed ${result.totalProcessed} transactions...`);
    }
  }
  
  console.log(`[COA] Batch processing complete: ${result.successCount} success, ${result.errorCount} errors, ${result.lowConfidenceCount} low confidence`);
  
  return result;
}

/**
 * Get processing status/stats for an organization
 */
export async function getProcessingStats(organizationId: string): Promise<{
  totalMappings: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  manualMappings: number;
  needsReview: number;
}> {
  const [stats] = await db.execute<{
    total: string;
    high: string;
    medium: string;
    low: string;
    manual: string;
  }>(sql`
    SELECT 
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE confidence = 'high')::text as high,
      COUNT(*) FILTER (WHERE confidence = 'medium')::text as medium,
      COUNT(*) FILTER (WHERE confidence = 'low')::text as low,
      COUNT(*) FILTER (WHERE confidence = 'manual' OR source = 'user')::text as manual
    FROM account_mappings
    WHERE organization_id = ${organizationId}
  `);
  
  const total = parseInt(stats?.total || "0", 10);
  const high = parseInt(stats?.high || "0", 10);
  const medium = parseInt(stats?.medium || "0", 10);
  const low = parseInt(stats?.low || "0", 10);
  const manual = parseInt(stats?.manual || "0", 10);
  
  return {
    totalMappings: total,
    highConfidence: high,
    mediumConfidence: medium,
    lowConfidence: low,
    manualMappings: manual,
    needsReview: low,
  };
}

// ============================================
// Learning Loop - Improve Mappings from Corrections
// ============================================

interface LearnedPattern {
  pattern: string;
  canonicalAccountId: string;
  canonicalCode: string;
  confidence: number;
  correctionCount: number;
}

/**
 * Learn mapping patterns from user corrections
 * Analyzes feedback history to find patterns in corrected mappings
 */
export async function learnFromCorrections(organizationId: string): Promise<LearnedPattern[]> {
  // Get all corrections for this organization
  const corrections = await db
    .select()
    .from(mappingFeedback)
    .where(
      and(
        eq(mappingFeedback.organizationId, organizationId),
        eq(mappingFeedback.status, "corrected")
      )
    );
  
  if (corrections.length === 0) {
    return [];
  }
  
  // Build pattern map from corrections
  const patternMap = new Map<string, {
    canonicalAccountId: string;
    count: number;
    sourceNames: string[];
  }>();
  
  for (const correction of corrections) {
    if (!correction.sourceAccountName || !correction.correctedCanonicalAccountId) continue;
    
    // Extract common patterns from source account name
    const patterns = extractPatterns(correction.sourceAccountName);
    
    for (const pattern of patterns) {
      const key = `${pattern}:${correction.correctedCanonicalAccountId}`;
      const existing = patternMap.get(key);
      
      if (existing) {
        existing.count++;
        if (!existing.sourceNames.includes(correction.sourceAccountName)) {
          existing.sourceNames.push(correction.sourceAccountName);
        }
      } else {
        patternMap.set(key, {
          canonicalAccountId: correction.correctedCanonicalAccountId,
          count: 1,
          sourceNames: [correction.sourceAccountName],
        });
      }
    }
  }
  
  // Get canonical accounts for enrichment
  const allAccounts = await db.select().from(canonicalAccounts);
  const accountsMap = new Map(allAccounts.map(a => [a.id, a]));
  
  // Convert to learned patterns (only keep patterns with multiple corrections)
  const learnedPatterns: LearnedPattern[] = [];
  
  for (const [key, data] of patternMap) {
    if (data.count < 2) continue; // Need at least 2 corrections to learn a pattern
    
    const [pattern] = key.split(":");
    const account = accountsMap.get(data.canonicalAccountId);
    
    if (account) {
      learnedPatterns.push({
        pattern,
        canonicalAccountId: data.canonicalAccountId,
        canonicalCode: account.code,
        confidence: Math.min(0.9, 0.7 + (data.count * 0.05)), // Increase confidence with more corrections
        correctionCount: data.count,
      });
    }
  }
  
  console.log(`[COA LEARNING] Found ${learnedPatterns.length} patterns from ${corrections.length} corrections`);
  
  return learnedPatterns;
}

/**
 * Extract common patterns from an account name for learning
 */
function extractPatterns(accountName: string): string[] {
  const patterns: string[] = [];
  const normalized = accountName.toLowerCase().trim();
  
  // Add full normalized name
  patterns.push(normalized);
  
  // Extract significant words (remove common words)
  const stopWords = new Set(["the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at", "by"]);
  const words = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  // Add individual significant words
  for (const word of words) {
    if (word.length >= 4) {
      patterns.push(word);
    }
  }
  
  // Add 2-word combinations
  for (let i = 0; i < words.length - 1; i++) {
    patterns.push(`${words[i]} ${words[i + 1]}`);
  }
  
  return patterns;
}

/**
 * Check if a source account matches any learned patterns
 */
export async function matchLearnedPattern(
  organizationId: string,
  sourceAccountName: string
): Promise<MappingResult | null> {
  const patterns = await learnFromCorrections(organizationId);
  
  if (patterns.length === 0) {
    return null;
  }
  
  const normalized = sourceAccountName.toLowerCase().trim();
  const sourcePatterns = extractPatterns(sourceAccountName);
  
  // Find best matching pattern
  let bestMatch: LearnedPattern | null = null;
  let bestScore = 0;
  
  for (const learned of patterns) {
    // Exact match
    if (normalized === learned.pattern) {
      bestMatch = learned;
      bestScore = 1.0;
      break;
    }
    
    // Substring match
    if (normalized.includes(learned.pattern) || learned.pattern.includes(normalized)) {
      const score = learned.confidence * 0.9;
      if (score > bestScore) {
        bestMatch = learned;
        bestScore = score;
      }
    }
    
    // Pattern overlap
    for (const srcPattern of sourcePatterns) {
      if (srcPattern === learned.pattern) {
        const score = learned.confidence * 0.95;
        if (score > bestScore) {
          bestMatch = learned;
          bestScore = score;
        }
      }
    }
  }
  
  if (bestMatch && bestScore >= 0.7) {
    // Get the canonical account details
    const [account] = await db
      .select()
      .from(canonicalAccounts)
      .where(eq(canonicalAccounts.id, bestMatch.canonicalAccountId))
      .limit(1);
    
    if (account) {
      console.log(`[COA LEARNING] Matched "${sourceAccountName}" to learned pattern "${bestMatch.pattern}" -> ${account.code}`);
      
      return {
        canonicalAccountId: account.id,
        canonicalCode: account.code,
        canonicalName: account.name,
        confidence: bestScore,
        source: "user", // Mark as user since it's based on user corrections
        matchedRule: `Learned from ${bestMatch.correctionCount} corrections`,
      };
    }
  }
  
  return null;
}

/**
 * Apply learned patterns to existing low-confidence mappings
 * This retroactively improves mappings based on accumulated user corrections
 */
export async function applyLearnedPatterns(organizationId: string): Promise<{
  improved: number;
  unchanged: number;
}> {
  const lowConfMappings = await getLowConfidenceMappings(organizationId);
  
  let improved = 0;
  let unchanged = 0;
  
  for (const mapping of lowConfMappings) {
    const learnedResult = await matchLearnedPattern(organizationId, mapping.sourceAccountName);
    
    if (learnedResult && learnedResult.confidence > parseFloat(mapping.confidenceScore || "0")) {
      // Update mapping with learned result
      await db
        .update(accountMappings)
        .set({
          canonicalAccountId: learnedResult.canonicalAccountId,
          confidence: learnedResult.confidence >= 0.9 ? "high" : "medium",
          confidenceScore: learnedResult.confidence.toFixed(3),
          source: "user",
          updatedAt: new Date(),
        })
        .where(eq(accountMappings.id, mapping.id));
      
      improved++;
    } else {
      unchanged++;
    }
  }
  
  console.log(`[COA LEARNING] Applied patterns: ${improved} improved, ${unchanged} unchanged`);
  
  return { improved, unchanged };
}

/**
 * Get transaction breakdown by canonical account group
 */
export async function getTransactionsByAccountGroup(
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Array<{
  accountGroup: string;
  accountCode: string;
  accountName: string;
  transactionCount: number;
  totalAmount: string;
}>> {
  const results = await db.execute<{
    account_group: string;
    code: string;
    name: string;
    transaction_count: string;
    total_amount: string;
  }>(sql`
    SELECT 
      ca.account_group,
      ca.code,
      ca.name,
      COUNT(t.id)::text as transaction_count,
      COALESCE(SUM(t.amount), 0)::text as total_amount
    FROM transactions t
    JOIN canonical_accounts ca ON t.canonical_account_id = ca.id
    WHERE t.organization_id = ${organizationId}
      ${startDate ? sql`AND t.date >= ${startDate}` : sql``}
      ${endDate ? sql`AND t.date <= ${endDate}` : sql``}
    GROUP BY ca.account_group, ca.code, ca.name
    ORDER BY ca.account_group, ca.code
  `);
  
  return results.map(r => ({
    accountGroup: r.account_group,
    accountCode: r.code,
    accountName: r.name,
    transactionCount: parseInt(r.transaction_count, 10),
    totalAmount: r.total_amount,
  }));
}
