/**
 * Plaid Transaction Transformation Service
 * 
 * Converts raw Plaid sandbox transactions into realistic startup financial data
 * by categorizing transactions, normalizing vendors, and applying startup-specific logic.
 */

import { db } from "./db";
import { transactions, categories, vendors } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

// Startup-focused category mappings from Plaid categories
const PLAID_TO_STARTUP_CATEGORY: Record<string, string> = {
  // Payroll & HR
  "TRANSFER_PAYROLL": "Payroll",
  "PAYROLL": "Payroll",
  "GOVERNMENT_DEPARTMENTS_AND_AGENCIES": "Payroll Taxes",
  "TAX_PAYMENT": "Payroll Taxes",
  
  // Software & SaaS
  "GENERAL_SERVICES_COMPUTER_AND_DATA_SERVICES": "Software & SaaS",
  "SERVICE_COMPUTER_AND_DATA_SERVICES": "Software & SaaS",
  "SUBSCRIPTIONS": "Software & SaaS",
  
  // Infrastructure
  "UTILITIES": "Infrastructure",
  "CLOUD_COMPUTING": "Infrastructure",
  
  // Office & Operations
  "SHOPS_OFFICE_SUPPLIES": "Office & Operations",
  "RENT": "Office & Operations",
  "FOOD_AND_DRINK_RESTAURANTS": "Office & Operations",
  "TRAVEL": "Travel & Entertainment",
  
  // Marketing & Sales
  "GENERAL_SERVICES_ADVERTISING_SERVICES": "Marketing",
  "ADVERTISING": "Marketing",
  "MARKETING_AND_ADVERTISING": "Marketing",
  
  // Professional Services
  "GENERAL_SERVICES_LEGAL": "Professional Services",
  "GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING": "Professional Services",
  "BANK_FEES": "Bank & Fees",
  
  // Revenue
  "TRANSFER_CREDIT": "Revenue",
  "TRANSFER_DEPOSIT": "Revenue",
  "INCOME_DIVIDENDS": "Revenue",
  "PAYMENT": "Revenue",
};

// Vendor normalization patterns for common Plaid sandbox vendors
const VENDOR_PATTERNS: Array<{ pattern: RegExp; normalized: string; category: string }> = [
  // Payroll providers
  { pattern: /gusto|adp|payroll|paychex/i, normalized: "Gusto", category: "Payroll" },
  { pattern: /irs|internal revenue|tax\s*payment/i, normalized: "IRS", category: "Payroll Taxes" },
  
  // Cloud & Infrastructure
  { pattern: /amazon.*web.*services|aws/i, normalized: "AWS", category: "Infrastructure" },
  { pattern: /google.*cloud|gcp/i, normalized: "Google Cloud", category: "Infrastructure" },
  { pattern: /microsoft.*azure|azure/i, normalized: "Microsoft Azure", category: "Infrastructure" },
  { pattern: /heroku/i, normalized: "Heroku", category: "Infrastructure" },
  { pattern: /vercel/i, normalized: "Vercel", category: "Infrastructure" },
  { pattern: /digitalocean/i, normalized: "DigitalOcean", category: "Infrastructure" },
  { pattern: /cloudflare/i, normalized: "Cloudflare", category: "Infrastructure" },
  
  // SaaS & Software
  { pattern: /slack/i, normalized: "Slack", category: "Software & SaaS" },
  { pattern: /zoom/i, normalized: "Zoom", category: "Software & SaaS" },
  { pattern: /notion/i, normalized: "Notion", category: "Software & SaaS" },
  { pattern: /figma/i, normalized: "Figma", category: "Software & SaaS" },
  { pattern: /github/i, normalized: "GitHub", category: "Software & SaaS" },
  { pattern: /atlassian|jira|confluence/i, normalized: "Atlassian", category: "Software & SaaS" },
  { pattern: /salesforce/i, normalized: "Salesforce", category: "Software & SaaS" },
  { pattern: /hubspot/i, normalized: "HubSpot", category: "Software & SaaS" },
  { pattern: /intercom/i, normalized: "Intercom", category: "Software & SaaS" },
  { pattern: /zendesk/i, normalized: "Zendesk", category: "Software & SaaS" },
  { pattern: /1password|lastpass|onepassword/i, normalized: "1Password", category: "Software & SaaS" },
  { pattern: /dropbox/i, normalized: "Dropbox", category: "Software & SaaS" },
  { pattern: /google.*workspace|gsuite/i, normalized: "Google Workspace", category: "Software & SaaS" },
  { pattern: /microsoft.*365|office.*365/i, normalized: "Microsoft 365", category: "Software & SaaS" },
  { pattern: /linear/i, normalized: "Linear", category: "Software & SaaS" },
  { pattern: /asana/i, normalized: "Asana", category: "Software & SaaS" },
  { pattern: /monday\.com/i, normalized: "Monday.com", category: "Software & SaaS" },
  
  // Marketing
  { pattern: /google.*ads|adwords/i, normalized: "Google Ads", category: "Marketing" },
  { pattern: /facebook.*ads|meta.*ads/i, normalized: "Meta Ads", category: "Marketing" },
  { pattern: /linkedin.*ads/i, normalized: "LinkedIn Ads", category: "Marketing" },
  { pattern: /mailchimp/i, normalized: "Mailchimp", category: "Marketing" },
  { pattern: /sendgrid/i, normalized: "SendGrid", category: "Marketing" },
  { pattern: /typeform/i, normalized: "Typeform", category: "Marketing" },
  
  // Payment processors (Revenue indicators)
  { pattern: /stripe/i, normalized: "Stripe", category: "Revenue" },
  { pattern: /paypal/i, normalized: "PayPal", category: "Revenue" },
  { pattern: /square/i, normalized: "Square", category: "Revenue" },
  
  // Professional Services
  { pattern: /lawyer|legal|law\s*firm/i, normalized: "Legal Services", category: "Professional Services" },
  { pattern: /accountant|cpa|bookkeep/i, normalized: "Accounting", category: "Professional Services" },
  
  // Banking
  { pattern: /bank.*fee|overdraft|wire.*fee/i, normalized: "Bank Fees", category: "Bank & Fees" },
  { pattern: /mercury|brex|ramp|silicon.*valley/i, normalized: "Business Banking", category: "Bank & Fees" },
  
  // Office
  { pattern: /wework|regus|office\s*space/i, normalized: "Office Space", category: "Office & Operations" },
  { pattern: /uber.*eats|doordash|grubhub/i, normalized: "Team Meals", category: "Office & Operations" },
  { pattern: /starbucks|coffee/i, normalized: "Coffee & Snacks", category: "Office & Operations" },
  { pattern: /amazon\b(?!.*web.*services)/i, normalized: "Amazon", category: "Office & Operations" },
  
  // Travel
  { pattern: /united.*air|delta|american.*air|southwest/i, normalized: "Airlines", category: "Travel & Entertainment" },
  { pattern: /uber|lyft/i, normalized: "Ride Share", category: "Travel & Entertainment" },
  { pattern: /hotel|marriott|hilton/i, normalized: "Hotels", category: "Travel & Entertainment" },
];

// Recurring transaction patterns (monthly/annual)
const RECURRING_INDICATORS = [
  /subscription/i,
  /monthly/i,
  /annual/i,
  /recurring/i,
  /membership/i,
];

// Typical startup expense amounts by category (for sandbox data enhancement)
const CATEGORY_AMOUNT_RANGES: Record<string, { min: number; max: number; typical: number }> = {
  "Payroll": { min: 15000, max: 150000, typical: 45000 },
  "Payroll Taxes": { min: 3000, max: 30000, typical: 9000 },
  "Infrastructure": { min: 500, max: 25000, typical: 5000 },
  "Software & SaaS": { min: 50, max: 2000, typical: 500 },
  "Office & Operations": { min: 100, max: 5000, typical: 1000 },
  "Marketing": { min: 500, max: 50000, typical: 5000 },
  "Professional Services": { min: 500, max: 25000, typical: 3000 },
  "Bank & Fees": { min: 10, max: 500, typical: 50 },
  "Travel & Entertainment": { min: 50, max: 5000, typical: 500 },
  "Revenue": { min: 1000, max: 500000, typical: 25000 },
};

export interface TransformResult {
  vendorNormalized: string;
  categoryName: string;
  isRecurring: boolean;
  isPayroll: boolean;
  confidence: number;
  suggestedAmount?: number;
}

/**
 * Transform a Plaid transaction into startup-friendly data
 */
export function transformPlaidTransaction(
  merchantName: string | null,
  description: string,
  amount: number,
  plaidCategories: string[] | null
): TransformResult {
  const searchText = `${merchantName || ""} ${description}`.toLowerCase();
  
  // Try vendor pattern matching first (highest confidence)
  for (const { pattern, normalized, category } of VENDOR_PATTERNS) {
    if (pattern.test(searchText)) {
      return {
        vendorNormalized: normalized,
        categoryName: category,
        isRecurring: isRecurringTransaction(searchText, category),
        isPayroll: category === "Payroll" || category === "Payroll Taxes",
        confidence: 0.95,
      };
    }
  }
  
  // Try Plaid category mapping
  if (plaidCategories && plaidCategories.length > 0) {
    const categoryKey = plaidCategories.join("_").toUpperCase();
    const mappedCategory = findBestCategoryMatch(categoryKey, plaidCategories);
    
    if (mappedCategory) {
      return {
        vendorNormalized: normalizeVendorName(merchantName || description),
        categoryName: mappedCategory,
        isRecurring: isRecurringTransaction(searchText, mappedCategory),
        isPayroll: mappedCategory === "Payroll" || mappedCategory === "Payroll Taxes",
        confidence: 0.8,
      };
    }
  }
  
  // Infer from amount (credits are likely revenue)
  if (amount > 0) {
    return {
      vendorNormalized: normalizeVendorName(merchantName || description),
      categoryName: "Revenue",
      isRecurring: false,
      isPayroll: false,
      confidence: 0.6,
    };
  }
  
  // Default categorization based on amount patterns
  const absAmount = Math.abs(amount);
  const inferredCategory = inferCategoryFromAmount(absAmount);
  
  return {
    vendorNormalized: normalizeVendorName(merchantName || description),
    categoryName: inferredCategory,
    isRecurring: isRecurringTransaction(searchText, inferredCategory),
    isPayroll: inferredCategory === "Payroll",
    confidence: 0.5,
  };
}

/**
 * Find best matching category from Plaid categories
 */
function findBestCategoryMatch(categoryKey: string, plaidCategories: string[]): string | null {
  // Direct mapping
  if (PLAID_TO_STARTUP_CATEGORY[categoryKey]) {
    return PLAID_TO_STARTUP_CATEGORY[categoryKey];
  }
  
  // Try individual category parts
  for (const cat of plaidCategories) {
    const upperCat = cat.toUpperCase().replace(/\s+/g, "_");
    if (PLAID_TO_STARTUP_CATEGORY[upperCat]) {
      return PLAID_TO_STARTUP_CATEGORY[upperCat];
    }
  }
  
  // Keyword matching
  const catText = plaidCategories.join(" ").toLowerCase();
  
  if (/payroll|salary|wage/i.test(catText)) return "Payroll";
  if (/tax/i.test(catText)) return "Payroll Taxes";
  if (/software|subscription|saas/i.test(catText)) return "Software & SaaS";
  if (/cloud|server|hosting/i.test(catText)) return "Infrastructure";
  if (/office|rent|space/i.test(catText)) return "Office & Operations";
  if (/advertis|market/i.test(catText)) return "Marketing";
  if (/legal|account|consult/i.test(catText)) return "Professional Services";
  if (/bank|fee|interest/i.test(catText)) return "Bank & Fees";
  if (/travel|hotel|air|flight/i.test(catText)) return "Travel & Entertainment";
  if (/payment|deposit|credit|income|transfer.*in/i.test(catText)) return "Revenue";
  
  return null;
}

/**
 * Normalize vendor name to clean format
 */
function normalizeVendorName(rawName: string): string {
  if (!rawName) return "Unknown";
  
  // Remove common prefixes/suffixes
  let normalized = rawName
    .replace(/^(payment\s+to\s+|transfer\s+to\s+|ach\s+|wire\s+|debit\s+)/i, "")
    .replace(/\s*(inc\.?|llc|corp\.?|ltd\.?|co\.?)$/i, "")
    .replace(/\s*\*+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  // Title case
  normalized = normalized
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  
  return normalized || "Unknown";
}

/**
 * Check if transaction appears to be recurring
 */
function isRecurringTransaction(searchText: string, category: string): boolean {
  // Category-based recurring detection
  const recurringCategories = ["Software & SaaS", "Infrastructure", "Office & Operations"];
  if (recurringCategories.includes(category)) {
    return true;
  }
  
  // Text-based recurring detection
  return RECURRING_INDICATORS.some(pattern => pattern.test(searchText));
}

/**
 * Infer category from transaction amount
 */
function inferCategoryFromAmount(amount: number): string {
  // Very large amounts likely payroll
  if (amount > 10000) return "Payroll";
  
  // Medium amounts likely professional services or marketing
  if (amount > 2000) return "Professional Services";
  
  // Small recurring-like amounts likely SaaS
  if (amount < 500) return "Software & SaaS";
  
  // Default
  return "Office & Operations";
}

/**
 * Transform and categorize all uncategorized transactions for an organization
 */
export async function transformOrganizationTransactions(organizationId: string): Promise<{
  processed: number;
  categorized: number;
  errors: number;
}> {
  console.log(`[Transform] Starting transaction transformation for org ${organizationId}`);
  
  let processed = 0;
  let categorized = 0;
  let errors = 0;
  
  // Get uncategorized transactions
  const uncategorizedTxns = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.organizationId, organizationId),
        isNull(transactions.categoryId)
      )
    );
  
  console.log(`[Transform] Found ${uncategorizedTxns.length} uncategorized transactions`);
  
  // Get or create categories for this org
  const orgCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.organizationId, organizationId));
  
  const categoryMap = new Map(orgCategories.map(c => [c.name, c.id]));
  
  for (const txn of uncategorizedTxns) {
    try {
      processed++;
      
      const metadata = txn.metadata as { category?: string[]; pending?: boolean } | null;
      const plaidCategories = metadata?.category || null;
      const amount = parseFloat(txn.amount || "0");
      
      const result = transformPlaidTransaction(
        txn.vendorOriginal || null,
        txn.description || "",
        amount,
        plaidCategories
      );
      
      // Get or create category
      let categoryId = categoryMap.get(result.categoryName);
      if (!categoryId) {
        const [newCategory] = await db
          .insert(categories)
          .values({
            organizationId,
            name: result.categoryName,
            type: result.categoryName === "Revenue" ? "income" : "expense",
          })
          .onConflictDoNothing()
          .returning();
        
        if (newCategory) {
          categoryId = newCategory.id;
          categoryMap.set(result.categoryName, categoryId);
        } else {
          // Category might have been created by another process
          const existing = await db
            .select()
            .from(categories)
            .where(
              and(
                eq(categories.organizationId, organizationId),
                eq(categories.name, result.categoryName)
              )
            )
            .limit(1);
          
          if (existing.length > 0) {
            categoryId = existing[0].id;
            categoryMap.set(result.categoryName, categoryId);
          }
        }
      }
      
      // Update transaction
      await db
        .update(transactions)
        .set({
          vendorNormalized: result.vendorNormalized,
          categoryId,
          isRecurring: result.isRecurring,
          isPayroll: result.isPayroll,
          classificationConfidence: result.confidence.toString(),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, txn.id));
      
      categorized++;
      
    } catch (error) {
      console.error(`[Transform] Error processing transaction ${txn.id}:`, error);
      errors++;
    }
  }
  
  console.log(`[Transform] Complete: ${processed} processed, ${categorized} categorized, ${errors} errors`);
  
  return { processed, categorized, errors };
}

/**
 * Get category color for charts
 */
export function getCategoryColor(categoryName: string): string {
  const colors: Record<string, string> = {
    "Payroll": "#ef4444",
    "Payroll Taxes": "#f97316",
    "Infrastructure": "#3b82f6",
    "Software & SaaS": "#8b5cf6",
    "Office & Operations": "#06b6d4",
    "Marketing": "#10b981",
    "Professional Services": "#f59e0b",
    "Bank & Fees": "#6b7280",
    "Travel & Entertainment": "#ec4899",
    "Revenue": "#22c55e",
  };
  
  return colors[categoryName] || "#6b7280";
}
