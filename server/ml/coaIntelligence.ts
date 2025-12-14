/**
 * COA Intelligence Layer
 * 
 * Handles importing Chart of Accounts from QuickBooks/Xero,
 * seeding the classifier with industry patterns, and auto-mapping accounts.
 */

import { db } from "../db";
import { 
  importedCOA, 
  canonicalAccounts, 
  accountMappings, 
  organizations,
  mappingFeedback 
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { quickBooksService } from "../quickbooksService";
import { xeroService } from "../xeroService";
import { getClassifier, trainClassifier } from "./accountClassifier";

type BusinessType = "saas" | "agency" | "ecommerce" | "marketplace" | "hardware" | "healthcare" | "fintech" | "other";

interface IndustryPattern {
  vendorPatterns: Array<{
    pattern: string;
    canonicalCode: string;
    confidence: number;
  }>;
  accountTypeMap: Record<string, string>;
}

const INDUSTRY_PATTERNS: Record<BusinessType, IndustryPattern> = {
  saas: {
    vendorPatterns: [
      { pattern: "stripe|braintree|chargebee|recurly", canonicalCode: "REV-ARR", confidence: 0.9 },
      { pattern: "aws|amazon web services|gcp|google cloud|azure|heroku|vercel|netlify|digitalocean", canonicalCode: "COGS-HOST", confidence: 0.95 },
      { pattern: "datadog|newrelic|pagerduty|sentry|splunk", canonicalCode: "COGS-HOST", confidence: 0.85 },
      { pattern: "github|gitlab|bitbucket|atlassian|jira", canonicalCode: "OPEX-RD", confidence: 0.85 },
      { pattern: "hubspot|salesforce|intercom|zendesk", canonicalCode: "OPEX-SALES", confidence: 0.9 },
      { pattern: "google ads|facebook ads|linkedin ads|meta ads", canonicalCode: "OPEX-MKTG", confidence: 0.95 },
      { pattern: "gusto|rippling|justworks|deel|remote", canonicalCode: "OPEX-PAYROLL", confidence: 0.95 },
      { pattern: "slack|notion|figma|miro|asana|monday", canonicalCode: "OPEX-GA", confidence: 0.8 },
    ],
    accountTypeMap: {
      "Income": "REV-ARR",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-HOST",
      "Bank": "ASSET-CASH",
      "Accounts Receivable": "ASSET-AR",
      "Accounts Payable": "LIAB-AP",
    }
  },
  agency: {
    vendorPatterns: [
      { pattern: "client payment|consulting|retainer", canonicalCode: "REV-SERVICES", confidence: 0.85 },
      { pattern: "contractor|freelancer|upwork|fiverr|toptal", canonicalCode: "COGS-LABOR", confidence: 0.9 },
      { pattern: "adobe|figma|sketch|invision", canonicalCode: "OPEX-RD", confidence: 0.85 },
      { pattern: "project management|basecamp|teamwork", canonicalCode: "OPEX-GA", confidence: 0.8 },
    ],
    accountTypeMap: {
      "Income": "REV-SERVICES",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-LABOR",
      "Bank": "ASSET-CASH",
    }
  },
  ecommerce: {
    vendorPatterns: [
      { pattern: "shopify|woocommerce|bigcommerce|magento", canonicalCode: "COGS-PLATFORM", confidence: 0.9 },
      { pattern: "stripe|paypal|square|klarna|affirm", canonicalCode: "REV-PRODUCT", confidence: 0.85 },
      { pattern: "usps|ups|fedex|dhl|shipstation|shippo", canonicalCode: "COGS-SHIPPING", confidence: 0.95 },
      { pattern: "inventory|warehouse|3pl|fulfillment", canonicalCode: "COGS-INVENTORY", confidence: 0.9 },
      { pattern: "google shopping|facebook marketplace|amazon seller", canonicalCode: "OPEX-MKTG", confidence: 0.9 },
    ],
    accountTypeMap: {
      "Income": "REV-PRODUCT",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-INVENTORY",
      "Bank": "ASSET-CASH",
    }
  },
  marketplace: {
    vendorPatterns: [
      { pattern: "platform fee|transaction fee|take rate", canonicalCode: "REV-FEES", confidence: 0.9 },
      { pattern: "stripe|payment processing", canonicalCode: "COGS-PAYMENTS", confidence: 0.9 },
      { pattern: "fraud|chargebacks|disputes", canonicalCode: "COGS-PAYMENTS", confidence: 0.85 },
    ],
    accountTypeMap: {
      "Income": "REV-FEES",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-PAYMENTS",
      "Bank": "ASSET-CASH",
    }
  },
  hardware: {
    vendorPatterns: [
      { pattern: "manufacturer|factory|supplier|component", canonicalCode: "COGS-MATERIALS", confidence: 0.9 },
      { pattern: "shipping|logistics|freight|customs", canonicalCode: "COGS-SHIPPING", confidence: 0.9 },
      { pattern: "warehouse|storage|inventory", canonicalCode: "COGS-INVENTORY", confidence: 0.85 },
    ],
    accountTypeMap: {
      "Income": "REV-PRODUCT",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-MATERIALS",
      "Bank": "ASSET-CASH",
      "Inventory Asset": "ASSET-INVENTORY",
    }
  },
  healthcare: {
    vendorPatterns: [
      { pattern: "insurance|medicare|medicaid|united health", canonicalCode: "REV-REIMBURSE", confidence: 0.9 },
      { pattern: "medical supplies|pharmaceutical|drugs", canonicalCode: "COGS-SUPPLIES", confidence: 0.9 },
      { pattern: "ehr|epic|cerner|athenahealth", canonicalCode: "OPEX-RD", confidence: 0.85 },
    ],
    accountTypeMap: {
      "Income": "REV-REIMBURSE",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-SUPPLIES",
      "Bank": "ASSET-CASH",
    }
  },
  fintech: {
    vendorPatterns: [
      { pattern: "transaction fee|interchange|processing", canonicalCode: "REV-FEES", confidence: 0.9 },
      { pattern: "plaid|stripe|dwolla|synapse", canonicalCode: "COGS-PLATFORM", confidence: 0.9 },
      { pattern: "compliance|kyc|aml|fraud detection", canonicalCode: "OPEX-COMPLIANCE", confidence: 0.9 },
    ],
    accountTypeMap: {
      "Income": "REV-FEES",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-PLATFORM",
      "Bank": "ASSET-CASH",
    }
  },
  other: {
    vendorPatterns: [
      { pattern: "payroll|salary|wages", canonicalCode: "OPEX-PAYROLL", confidence: 0.9 },
      { pattern: "rent|lease|office space", canonicalCode: "OPEX-RENT", confidence: 0.95 },
      { pattern: "insurance|liability|coverage", canonicalCode: "OPEX-INSURANCE", confidence: 0.9 },
      { pattern: "legal|attorney|law firm", canonicalCode: "OPEX-LEGAL", confidence: 0.9 },
      { pattern: "accounting|bookkeeping|cpa", canonicalCode: "OPEX-ACCOUNTING", confidence: 0.9 },
    ],
    accountTypeMap: {
      "Income": "REV-OTHER",
      "Expense": "OPEX-GA",
      "Cost of Goods Sold": "COGS-OTHER",
      "Bank": "ASSET-CASH",
    }
  }
};

export class COAIntelligence {
  
  async importCOAFromQuickBooks(userId: string, organizationId: string): Promise<{
    imported: number;
    errors: number;
    accounts: Array<{ name: string; type: string }>;
  }> {
    console.log(`[COA] Importing COA from QuickBooks for org ${organizationId}`);
    
    let imported = 0;
    let errors = 0;
    const accounts: Array<{ name: string; type: string }> = [];
    
    try {
      const qbAccounts = await quickBooksService.getAccounts(userId);
      
      for (const account of qbAccounts) {
        try {
          await db.insert(importedCOA).values({
            organizationId,
            sourceSystem: "quickbooks",
            sourceAccountId: account.Id,
            accountName: account.Name,
            accountType: account.AccountType,
            classification: account.Classification || null,
            currentBalance: account.CurrentBalance?.toString() || null,
            isActive: true,
            mappingStatus: "pending",
          }).onConflictDoUpdate({
            target: [importedCOA.organizationId, importedCOA.sourceSystem, importedCOA.sourceAccountId],
            set: {
              accountName: account.Name,
              accountType: account.AccountType,
              classification: account.Classification || null,
              currentBalance: account.CurrentBalance?.toString() || null,
              updatedAt: new Date(),
            }
          });
          
          accounts.push({ name: account.Name, type: account.AccountType });
          imported++;
        } catch (e) {
          console.error(`[COA] Error importing QB account ${account.Name}:`, e);
          errors++;
        }
      }
      
      console.log(`[COA] Imported ${imported} QuickBooks accounts, ${errors} errors`);
    } catch (e) {
      console.error("[COA] Error fetching QuickBooks accounts:", e);
      throw e;
    }
    
    return { imported, errors, accounts };
  }
  
  async importCOAFromXero(userId: string, organizationId: string): Promise<{
    imported: number;
    errors: number;
    accounts: Array<{ name: string; type: string }>;
  }> {
    console.log(`[COA] Importing COA from Xero for org ${organizationId}`);
    
    let imported = 0;
    let errors = 0;
    const accounts: Array<{ name: string; type: string }> = [];
    
    try {
      const xeroAccounts = await xeroService.getAccounts(userId);
      
      for (const account of xeroAccounts) {
        try {
          await db.insert(importedCOA).values({
            organizationId,
            sourceSystem: "xero",
            sourceAccountId: account.accountID || account.code || `xero-${Date.now()}`,
            accountName: account.name,
            accountCode: account.code || null,
            accountType: account.type,
            classification: account.class || null,
            isActive: account.status === "ACTIVE",
            mappingStatus: "pending",
          }).onConflictDoUpdate({
            target: [importedCOA.organizationId, importedCOA.sourceSystem, importedCOA.sourceAccountId],
            set: {
              accountName: account.name,
              accountCode: account.code || null,
              accountType: account.type,
              classification: account.class || null,
              isActive: account.status === "ACTIVE",
              updatedAt: new Date(),
            }
          });
          
          accounts.push({ name: account.name, type: account.type });
          imported++;
        } catch (e) {
          console.error(`[COA] Error importing Xero account ${account.name}:`, e);
          errors++;
        }
      }
      
      console.log(`[COA] Imported ${imported} Xero accounts, ${errors} errors`);
    } catch (e) {
      console.error("[COA] Error fetching Xero accounts:", e);
      throw e;
    }
    
    return { imported, errors, accounts };
  }
  
  async seedClassifierFromIndustryPatterns(organizationId: string, businessType: BusinessType): Promise<{
    seededMappings: number;
    patterns: IndustryPattern;
  }> {
    console.log(`[COA] Seeding classifier for org ${organizationId} with ${businessType} patterns`);
    
    const patterns = INDUSTRY_PATTERNS[businessType] || INDUSTRY_PATTERNS.other;
    let seededMappings = 0;
    
    const canonicalAccountsList = await db.select().from(canonicalAccounts)
      .where(eq(canonicalAccounts.businessType, businessType));
    
    const codeToAccountId = new Map(canonicalAccountsList.map(a => [a.code, a.id]));
    
    for (const { pattern, canonicalCode, confidence } of patterns.vendorPatterns) {
      const canonicalAccountId = codeToAccountId.get(canonicalCode);
      if (!canonicalAccountId) continue;
      
      const patternParts = pattern.split("|");
      for (const part of patternParts) {
        const sourceAccountName = part.trim();
        
        try {
          await db.insert(accountMappings).values({
            organizationId,
            canonicalAccountId,
            sourceAccountName,
            sourceSystem: "seed",
            confidence: confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low",
            confidenceScore: confidence.toFixed(3),
            source: "rule",
            isActive: true,
          }).onConflictDoNothing();
          
          seededMappings++;
        } catch (e) {
          console.error(`[COA] Error seeding mapping for ${sourceAccountName}:`, e);
        }
      }
    }
    
    await trainClassifier(organizationId);
    
    console.log(`[COA] Seeded ${seededMappings} mappings from ${businessType} patterns`);
    
    return { seededMappings, patterns };
  }
  
  async autoMapImportedAccounts(organizationId: string): Promise<{
    autoMapped: number;
    needsReview: number;
    results: Array<{
      accountName: string;
      mappedTo: string | null;
      confidence: number;
      status: string;
    }>;
  }> {
    console.log(`[COA] Auto-mapping imported accounts for org ${organizationId}`);
    
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    
    const businessType = (org?.businessType as BusinessType) || "other";
    const patterns = INDUSTRY_PATTERNS[businessType] || INDUSTRY_PATTERNS.other;
    
    const importedAccounts = await db.select().from(importedCOA)
      .where(and(
        eq(importedCOA.organizationId, organizationId),
        eq(importedCOA.mappingStatus, "pending")
      ));
    
    const canonicalAccountsList = await db.select().from(canonicalAccounts)
      .where(eq(canonicalAccounts.businessType, businessType));
    
    const codeToAccount = new Map(canonicalAccountsList.map(a => [a.code, a]));
    
    let autoMapped = 0;
    let needsReview = 0;
    const results: Array<{
      accountName: string;
      mappedTo: string | null;
      confidence: number;
      status: string;
    }> = [];
    
    const classifier = await getClassifier(organizationId);
    
    for (const account of importedAccounts) {
      let mappedCanonicalAccountId: string | null = null;
      let confidence = 0;
      let status = "needs_review";
      
      const accountNameLower = account.accountName.toLowerCase();
      for (const { pattern, canonicalCode, confidence: patternConfidence } of patterns.vendorPatterns) {
        const regex = new RegExp(pattern, "i");
        if (regex.test(accountNameLower)) {
          const canonical = codeToAccount.get(canonicalCode);
          if (canonical) {
            mappedCanonicalAccountId = canonical.id;
            confidence = patternConfidence;
            status = patternConfidence >= 0.85 ? "auto_mapped" : "needs_review";
            break;
          }
        }
      }
      
      if (!mappedCanonicalAccountId && account.accountType) {
        const defaultCode = patterns.accountTypeMap[account.accountType];
        if (defaultCode) {
          const canonical = codeToAccount.get(defaultCode);
          if (canonical) {
            mappedCanonicalAccountId = canonical.id;
            confidence = 0.6;
            status = "needs_review";
          }
        }
      }
      
      if (!mappedCanonicalAccountId) {
        const mlResult = classifier.classify(account.accountName);
        if (mlResult && mlResult.confidence >= 0.85) {
          mappedCanonicalAccountId = mlResult.canonicalAccountId;
          confidence = mlResult.confidence;
          status = "auto_mapped";
        } else if (mlResult) {
          mappedCanonicalAccountId = mlResult.canonicalAccountId;
          confidence = mlResult.confidence;
          status = "needs_review";
        }
      }
      
      await db.update(importedCOA)
        .set({
          mappedCanonicalAccountId,
          mappingConfidence: confidence.toFixed(3),
          mappingStatus: status,
          updatedAt: new Date(),
        })
        .where(eq(importedCOA.id, account.id));
      
      if (status === "auto_mapped") {
        autoMapped++;
      } else {
        needsReview++;
        
        if (mappedCanonicalAccountId) {
          await db.insert(mappingFeedback).values({
            organizationId,
            sourceAccountName: account.accountName,
            sourceSystem: account.sourceSystem,
            suggestedCanonicalAccountId: mappedCanonicalAccountId,
            originalConfidence: confidence.toFixed(3),
            status: "pending",
          }).onConflictDoNothing();
        }
      }
      
      const mappedAccount = mappedCanonicalAccountId 
        ? canonicalAccountsList.find(a => a.id === mappedCanonicalAccountId)
        : null;
      
      results.push({
        accountName: account.accountName,
        mappedTo: mappedAccount?.name || null,
        confidence,
        status,
      });
    }
    
    console.log(`[COA] Auto-mapped ${autoMapped} accounts, ${needsReview} need review`);
    
    return { autoMapped, needsReview, results };
  }
  
  async getImportedAccounts(organizationId: string): Promise<Array<{
    id: string;
    accountName: string;
    accountType: string | null;
    sourceSystem: string;
    mappedTo: string | null;
    confidence: number;
    status: string;
  }>> {
    const accounts = await db.select({
      id: importedCOA.id,
      accountName: importedCOA.accountName,
      accountType: importedCOA.accountType,
      sourceSystem: importedCOA.sourceSystem,
      mappedCanonicalAccountId: importedCOA.mappedCanonicalAccountId,
      mappingConfidence: importedCOA.mappingConfidence,
      mappingStatus: importedCOA.mappingStatus,
      canonicalName: canonicalAccounts.name,
    })
    .from(importedCOA)
    .leftJoin(canonicalAccounts, eq(importedCOA.mappedCanonicalAccountId, canonicalAccounts.id))
    .where(eq(importedCOA.organizationId, organizationId));
    
    return accounts.map(a => ({
      id: a.id,
      accountName: a.accountName,
      accountType: a.accountType,
      sourceSystem: a.sourceSystem,
      mappedTo: a.canonicalName || null,
      confidence: parseFloat(a.mappingConfidence || "0"),
      status: a.mappingStatus || "pending",
    }));
  }
  
  async updateAccountMapping(
    importedAccountId: string, 
    canonicalAccountId: string, 
    userId?: string
  ): Promise<void> {
    const account = await db.query.importedCOA.findFirst({
      where: eq(importedCOA.id, importedAccountId),
    });
    
    if (!account) {
      throw new Error("Imported account not found");
    }
    
    await db.update(importedCOA)
      .set({
        mappedCanonicalAccountId: canonicalAccountId,
        mappingConfidence: "1.000",
        mappingStatus: "manual",
        updatedAt: new Date(),
      })
      .where(eq(importedCOA.id, importedAccountId));
    
    await db.insert(accountMappings).values({
      organizationId: account.organizationId,
      canonicalAccountId,
      sourceAccountName: account.accountName,
      sourceAccountCode: account.accountCode,
      sourceSystem: account.sourceSystem,
      confidence: "high",
      confidenceScore: "1.000",
      source: "user",
      isActive: true,
    }).onConflictDoUpdate({
      target: [accountMappings.organizationId, accountMappings.sourceAccountName, accountMappings.sourceSystem],
      set: {
        canonicalAccountId,
        confidence: "high",
        confidenceScore: "1.000",
        source: "user",
        updatedAt: new Date(),
      }
    });
    
    await trainClassifier(account.organizationId);
  }
}

export const coaIntelligence = new COAIntelligence();
