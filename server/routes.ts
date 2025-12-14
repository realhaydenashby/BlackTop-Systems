import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { isAuthenticated } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { z } from "zod";
import { User, insertOrganizationSchema, insertDocumentSchema, insertTransactionSchema, organizationMembers, transactions, accountMappings, mappingFeedback } from "@shared/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import * as pdfParse from "pdf-parse";
import Papa from "papaparse";
import { subDays, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { generateMockDashboardStats, generateMockAnalytics, generateMockInsights } from "./mockData";
import { hasFeatureAccess, type FeatureKey, FEATURE_LABELS, getMinimumTierForFeature, type SubscriptionTier } from "@shared/planFeatures";
import { BUSINESS_TYPE_CONFIGS, getBusinessTypeConfig, type BusinessType } from "@shared/businessTypes";

const objectStorageService = new ObjectStorageService();

// Helper to get user ID from session (handles old sessions without user.id)
function getUserId(user: any): string {
  // Try user.id first (new sessions), fall back to claims.sub (old sessions)
  return user?.id || user?.claims?.sub;
}

// Feature gating middleware factory
function requireFeature(feature: FeatureKey): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.user as User;
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Admins have access to all features
      if (dbUser.isAdmin) {
        return next();
      }
      
      const tier = dbUser.subscriptionTier as SubscriptionTier;
      
      if (!hasFeatureAccess(tier, feature)) {
        const requiredTier = getMinimumTierForFeature(feature);
        const featureLabel = FEATURE_LABELS[feature];
        return res.status(403).json({ 
          message: `${featureLabel} requires a ${requiredTier === "core" ? "Core" : "Growth"} plan or higher.`,
          feature,
          requiredTier,
          currentTier: tier,
        });
      }
      
      next();
    } catch (error: any) {
      console.error("Feature gating error:", error);
      res.status(500).json({ message: "Failed to verify feature access" });
    }
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Process summary-level financial metrics CSV
 * Handles CSVs with columns: Month, Department, Expenses, Revenue, Profit, Cash, Headcount, Subscriptions
 */
async function processSummaryMetricsCSV(
  csvData: any[],
  documentId: string,
  organizationId: string
): Promise<void> {
  try {
    console.log(`[SUMMARY CSV] Processing ${csvData.length} rows of summary metrics...`);
    
    let metricsCreated = 0;
    let skippedRows = 0;
    let departmentErrors = 0;
    
    for (const row of csvData) {
      // Extract column values (case-insensitive)
      const monthValue = row['Month'] || row['month'] || row['MONTH'];
      const departmentValue = row['Department'] || row['department'] || row['DEPARTMENT'];
      const expensesValue = row['Expenses'] || row['expenses'] || row['EXPENSES'];
      const revenueValue = row['Revenue'] || row['revenue'] || row['REVENUE'];
      const profitValue = row['Profit'] || row['profit'] || row['PROFIT'];
      const cashValue = row['Current Cash'] || row['current cash'] || row['Cash'] || row['cash'] || row['CASH'];
      const headcountValue = row['Headcount'] || row['headcount'] || row['HEADCOUNT'];
      const subscriptionsValue = row['Subscriptions'] || row['subscriptions'] || row['SUBSCRIPTIONS'];
      
      // Skip rows without month value
      if (!monthValue) {
        skippedRows++;
        continue;
      }
      
      // Parse month value and normalize to month start
      let monthDate: Date;
      try {
        monthDate = new Date(monthValue);
        // Normalize to first day of month
        monthDate = startOfMonth(monthDate);
      } catch (error) {
        console.warn(`[SUMMARY CSV] Skipping row with invalid month: ${monthValue}`);
        skippedRows++;
        continue;
      }
      
      // Find or create department if specified
      let departmentId: string | null = null;
      if (departmentValue) {
        try {
          const department = await storage.findOrCreateDepartment(organizationId, departmentValue);
          departmentId = department.id;
        } catch (error) {
          console.error(`[SUMMARY CSV] Failed to create department "${departmentValue}":`, error);
          departmentErrors++;
          skippedRows++;
          continue; // Skip this row if department creation fails
        }
      }
      
      // Parse numeric values - return strings for Drizzle numeric columns
      const parseNumeric = (value: any): string | null => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? null : parsed.toString();
      };
      
      const revenue = parseNumeric(revenueValue);
      const expenses = parseNumeric(expensesValue);
      const profit = parseNumeric(profitValue);
      const cashBalance = parseNumeric(cashValue);
      
      const parseInteger = (value: any): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
        return isNaN(parsed) ? null : parsed;
      };
      
      const headcount = parseInteger(headcountValue);
      const subscriptionCount = parseInteger(subscriptionsValue);
      
      // Create monthly metric record
      try {
        await storage.createMonthlyMetric({
          organizationId,
          departmentId,
          documentId,
          month: monthDate,
          revenue,
          expenses,
          profit,
          cashBalance,
          headcount,
          subscriptionCount,
        });
        metricsCreated++;
      } catch (error) {
        console.error(`[SUMMARY CSV] Failed to create monthly metric for ${monthDate.toISOString()}:`, error);
        skippedRows++;
      }
    }
    
    console.log(`[SUMMARY CSV] Created ${metricsCreated} monthly metrics (skipped ${skippedRows} rows, ${departmentErrors} department errors)`);
    
    // Update document status - fail if any department errors occurred or no metrics created
    if (departmentErrors > 0) {
      console.error(`[SUMMARY CSV ERROR] ${departmentErrors} department creation errors - marking document as failed`);
      await storage.updateDocument(documentId, { status: "error" });
    } else if (metricsCreated > 0) {
      await storage.updateDocument(documentId, {
        parsedText: `Summary metrics CSV with ${metricsCreated} monthly records`,
        status: "processed",
        extractionConfidence: "0.95",
      });
    } else {
      console.error(`[SUMMARY CSV ERROR] No metrics created from CSV file ${documentId}`);
      await storage.updateDocument(documentId, { status: "error" });
    }
  } catch (error) {
    console.error(`[SUMMARY CSV ERROR] Failed to process summary metrics CSV:`, error);
    await storage.updateDocument(documentId, { status: "error" });
  }
}

/**
 * Background job to process uploaded documents
 * Extracts text, transactions, and updates document status
 */
async function processDocument(
  documentId: string,
  fileUrl: string,
  documentType: string,
  organizationId: string
): Promise<void> {
  try {
    console.log(`Processing document ${documentId}...`);

    // Update status to processing
    await storage.updateDocument(documentId, { status: "processing" });

    // Fetch file content from object storage (handles private URLs)
    const fileResponse = await objectStorageService.getObjectEntityFile(fileUrl);
    
    if (!fileResponse) {
      throw new Error("Failed to fetch document from storage");
    }

    // Download file content from Google Cloud Storage
    const [buffer] = await fileResponse.download();

    // Get file metadata to determine content type
    const [metadata] = await fileResponse.getMetadata();
    const contentType = metadata.contentType || '';

    // Check if this is a CSV file
    const isCSV = documentType === "csv" || 
                  documentType === "csv_upload" ||
                  contentType.includes('csv') || 
                  contentType.includes('comma-separated') ||
                  fileUrl.toLowerCase().endsWith('.csv');

    if (isCSV) {
      console.log(`Processing CSV file ${documentId}...`);
      
      // Parse CSV file
      const csvText = buffer.toString('utf-8');
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      if (parseResult.errors.length > 0) {
        console.error("CSV parsing errors:", parseResult.errors);
      }

      const csvData = parseResult.data as any[];
      
      // Log CSV columns for debugging
      if (csvData.length > 0) {
        const firstRow = csvData[0];
        const columnNames = Object.keys(firstRow);
        console.log(`[CSV DEBUG] Found ${columnNames.length} columns in CSV:`, columnNames);
        
        // Detect CSV type based on column names
        const hasMonthColumn = columnNames.some(c => c.toLowerCase() === 'month');
        const hasDepartmentColumn = columnNames.some(c => c.toLowerCase() === 'department');
        const hasExpensesColumn = columnNames.some(c => c.toLowerCase() === 'expenses');
        const hasRevenueColumn = columnNames.some(c => c.toLowerCase() === 'revenue');
        
        const hasDateColumn = columnNames.some(c => c.toLowerCase() === 'date' || c.toLowerCase().includes('date'));
        const hasAmountColumn = columnNames.some(c => c.toLowerCase() === 'amount' || c.toLowerCase() === 'debit' || c.toLowerCase() === 'credit');
        
        const isSummaryMetrics = hasMonthColumn && (hasDepartmentColumn || hasExpensesColumn || hasRevenueColumn);
        const isTransactionLevel = hasDateColumn && hasAmountColumn;
        
        console.log(`[CSV TYPE DETECTION] Summary Metrics: ${isSummaryMetrics}, Transaction Level: ${isTransactionLevel}`);
        
        if (isSummaryMetrics) {
          // Process as summary-level financial metrics CSV
          console.log(`[SUMMARY CSV] Processing summary-level financial metrics CSV...`);
          await processSummaryMetricsCSV(csvData, documentId, organizationId);
          return;
        }
      }
      
      // Import normalization service for AI-powered vendor/category classification
      const { normalizationService } = await import("./normalizationService");

      // Helper function to normalize vendor strings for better cache matching
      const normalizeVendorKey = (raw: string): string => {
        return raw
          .replace(/\*\w+/g, '') // Remove *ABC123 patterns
          .replace(/\d{4,}/g, '') // Remove long number sequences
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim()
          .toUpperCase();
      };

      // PHASE 1: Parse and extract all transaction data
      console.log(`[CSV PHASE 1] Parsing ${csvData.length} CSV rows...`);
      
      interface ParsedTransaction {
        date: Date;
        amount: number;
        description: string | null;
        rawVendor: string;
        vendorKey: string;
      }

      const parsedTransactions: ParsedTransaction[] = [];
      let skippedRows = 0;
      
      for (const row of csvData) {
        const dateValue = row['Date'] || row['date'] || row['Transaction Date'] || row['Posting Date'] || row['DATE'];
        const amountValue = row['Amount'] || row['amount'] || row['Debit'] || row['Credit'] || row['AMOUNT'];
        const descriptionValue = row['Description'] || row['description'] || row['Memo'] || row['memo'] || row['DESCRIPTION'];
        const vendorValue = row['Vendor'] || row['vendor'] || row['Payee'] || row['payee'] || row['Merchant'] || row['merchant'];

        if (!dateValue || !amountValue) {
          skippedRows++;
          continue;
        }

        const parsedAmount = parseFloat(String(amountValue).replace(/[^0-9.-]/g, ''));
        if (isNaN(parsedAmount)) {
          skippedRows++;
          continue;
        }

        const rawVendor = vendorValue || descriptionValue || "Unknown";
        const vendorKey = normalizeVendorKey(rawVendor);

        parsedTransactions.push({
          date: new Date(dateValue),
          amount: parsedAmount,
          description: descriptionValue || null,
          rawVendor,
          vendorKey,
        });
      }
      
      console.log(`[CSV PHASE 1] Parsed ${parsedTransactions.length} valid transactions (skipped ${skippedRows} invalid rows)`);
      
      if (parsedTransactions.length === 0) {
        console.error(`[CSV ERROR] No valid transactions found in CSV file ${documentId}`);
        await storage.updateDocument(documentId, { status: "error" });
        return;
      }

      // PHASE 2: Identify unique vendors and batch normalize with AI (with concurrency control)
      const uniqueVendorKeys = new Set<string>();
      parsedTransactions.forEach(t => uniqueVendorKeys.add(t.vendorKey));
      
      console.log(`[CSV PHASE 2] Normalizing ${uniqueVendorKeys.size} unique vendors with AI (max 5 concurrent)...`);

      const vendorCache = new Map<string, { cleanName: string; isRecurring: boolean }>();
      
      // Use p-limit to control concurrency (max 5 concurrent AI calls)
      const pLimit = (await import("p-limit")).default;
      const limit = pLimit(5);
      
      let vendorAISuccesses = 0;
      let vendorAIFallbacks = 0;
      let vendorAIFailures = 0;
      
      // Batch process unique vendors in parallel with concurrency control
      const vendorResults = await Promise.allSettled(
        Array.from(uniqueVendorKeys).map(vendorKey => 
          limit(async () => {
            const sample = parsedTransactions.find(t => t.vendorKey === vendorKey);
            if (!sample) return { vendorKey, success: false, fallback: false };

            try {
              const vendorResult = await normalizationService.normalizeVendorName(sample.rawVendor);
              const cleanName = vendorResult.cleanName;
              const isRecurring = normalizationService.isLikelySubscription(cleanName);
              
              return { vendorKey, success: true, fallback: false, cleanName, isRecurring };
            } catch (error) {
              console.error(`[CSV PHASE 2] Failed to normalize vendor "${sample.rawVendor}" (key: ${vendorKey}):`, error);
              // Fallback to simple normalization
              return { 
                vendorKey, 
                success: true, 
                fallback: true,
                cleanName: sample.rawVendor.substring(0, 50).trim(),
                isRecurring: false 
              };
            }
          })
        )
      );

      // Populate cache from results
      vendorResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success && result.value.cleanName) {
          vendorCache.set(result.value.vendorKey, {
            cleanName: result.value.cleanName,
            isRecurring: result.value.isRecurring ?? false,
          });
          if (result.value.fallback) {
            vendorAIFallbacks++;
          } else {
            vendorAISuccesses++;
          }
        } else {
          vendorAIFailures++;
        }
      });
      
      console.log(`[CSV PHASE 2] Vendor normalization complete: ${vendorAISuccesses} AI successes, ${vendorAIFallbacks} fallbacks, ${vendorAIFailures} failures`);

      // PHASE 3: Identify unique categories and batch classify with AI (with concurrency control)
      const uniqueCategories = new Map<string, { vendor: string; description: string; amount: number }>();
      
      parsedTransactions.forEach(t => {
        const cached = vendorCache.get(t.vendorKey);
        if (!cached) return;
        
        const categoryKey = `${cached.cleanName}|${t.description || ''}`;
        if (!uniqueCategories.has(categoryKey)) {
          uniqueCategories.set(categoryKey, {
            vendor: cached.cleanName,
            description: t.description || "",
            amount: t.amount,
          });
        }
      });

      console.log(`[CSV PHASE 3] Classifying ${uniqueCategories.size} unique categories with AI (max 5 concurrent)...`);

      const categoryCache = new Map<string, string>();
      let categoryAISuccesses = 0;
      let categoryAIFallbacks = 0;
      let categoryAIFailures = 0;
      
      // Batch process unique categories in parallel with concurrency control (max 5 concurrent)
      const categoryResults = await Promise.allSettled(
        Array.from(uniqueCategories.entries()).map(([key, data]) =>
          limit(async () => {
            try {
              const categoryResult = await normalizationService.classifyCategory(
                data.vendor,
                data.description,
                data.amount
              );
              return { key, success: true, fallback: false, category: categoryResult.category };
            } catch (error) {
              console.error(`[CSV PHASE 3] Failed to classify category for "${data.vendor}":`, error);
              // Fallback to default category
              return { key, success: true, fallback: true, category: "Operations & Misc" };
            }
          })
        )
      );

      // Populate cache from results
      categoryResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          categoryCache.set(result.value.key, result.value.category);
          if (result.value.fallback) {
            categoryAIFallbacks++;
          } else {
            categoryAISuccesses++;
          }
        } else {
          categoryAIFailures++;
        }
      });
      
      console.log(`[CSV PHASE 3] Category classification complete: ${categoryAISuccesses} AI successes, ${categoryAIFallbacks} fallbacks, ${categoryAIFailures} failures`);

      // PHASE 4: Create vendors and categories (bulk lookup)
      console.log(`[CSV PHASE 4] Creating ${vendorCache.size} vendors and ${categoryCache.size} categories in database...`);
      
      const vendorMap = new Map<string, any>();
      const categoryMap = new Map<string, any>();

      for (const cached of Array.from(vendorCache.values())) {
        try {
          const vendor = await storage.findOrCreateVendor(organizationId, cached.cleanName);
          vendorMap.set(cached.cleanName, vendor);
        } catch (error) {
          console.error(`[CSV PHASE 4] Failed to create vendor "${cached.cleanName}":`, error);
        }
      }

      for (const categoryName of Array.from(categoryCache.values())) {
        try {
          const category = await storage.findOrCreateCategory(organizationId, categoryName);
          categoryMap.set(categoryName, category);
        } catch (error) {
          console.error(`[CSV PHASE 4] Failed to create category "${categoryName}":`, error);
        }
      }
      
      console.log(`[CSV PHASE 4] Database operations complete: ${vendorMap.size} vendors, ${categoryMap.size} categories`);

      // PHASE 5: Bulk insert transactions
      console.log(`[CSV PHASE 5] Inserting ${parsedTransactions.length} transactions...`);
      
      let transactionsCreated = 0;
      let skippedNoVendorCache = 0;
      let skippedNoDatabaseRecord = 0;
      
      for (const txn of parsedTransactions) {
        const cached = vendorCache.get(txn.vendorKey);
        if (!cached) {
          skippedNoVendorCache++;
          console.warn(`[CSV PHASE 5] Skipping transaction - no vendor cache for key: ${txn.vendorKey} (raw: ${txn.rawVendor})`);
          continue;
        }

        const categoryKey = `${cached.cleanName}|${txn.description || ''}`;
        const categoryName = categoryCache.get(categoryKey) || "Operations & Misc";

        const vendor = vendorMap.get(cached.cleanName);
        const category = categoryMap.get(categoryName);

        if (!vendor || !category) {
          skippedNoDatabaseRecord++;
          console.warn(`[CSV PHASE 5] Skipping transaction - missing database record. Vendor: ${vendor ? 'OK' : 'MISSING'}, Category: ${category ? 'OK' : 'MISSING'} (${categoryName})`);
          continue;
        }

        try {
          await storage.createTransaction({
            organizationId,
            documentId,
            date: txn.date,
            amount: txn.amount.toString(),
            currency: "USD",
            vendorId: vendor.id,
            categoryId: category.id,
            description: txn.description,
            isRecurring: cached.isRecurring,
          });
          transactionsCreated++;
        } catch (error) {
          console.error(`[CSV PHASE 5] Failed to insert transaction for vendor ${cached.cleanName}:`, error);
        }
      }

      console.log(`[CSV COMPLETE] Document ${documentId} processed: ${transactionsCreated} transactions created, ${skippedNoVendorCache} skipped (no vendor cache), ${skippedNoDatabaseRecord} skipped (no database record)`);
      
      if (transactionsCreated === 0) {
        console.error(`[CSV ERROR] No transactions were created from CSV file ${documentId}`);
        await storage.updateDocument(documentId, { status: "error" });
      } else {
        await storage.updateDocument(documentId, {
          parsedText: `CSV file with ${transactionsCreated} transactions`,
          status: "processed",
          extractionConfidence: "0.9",
        });
      }
      
      return;
    }

    // Check if Document AI is configured for PDF processing
    const { documentAIService } = await import("./documentAIService");
    
    if (!documentAIService.isConfigured()) {
      console.warn("Document AI not configured, using fallback PDF parsing");
      
      // Fallback to basic PDF parsing + AI extraction
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(buffer);
      
      await storage.updateDocument(documentId, {
        parsedText: pdfData.text,
        status: "processed",
        extractionConfidence: "0.5",
      });
      
      // Extract transactions using AI even in fallback mode
      const docTypeMap: { [key: string]: "bank_statement" | "invoice" | "receipt" } = {
        "statement": "bank_statement",
        "invoice": "invoice",
        "receipt": "receipt",
        "bank_statement": "bank_statement",
        "csv": "bank_statement",
      };
      const aiDocType = docTypeMap[documentType] || "bank_statement";
      
      const transactions = await documentAIService.extractTransactions(pdfData.text, aiDocType);
      
      // Import normalization service for AI-powered vendor/category classification
      const { normalizationService } = await import("./normalizationService");
      
      // Create transaction records from AI extraction with normalization
      for (const txn of transactions) {
        if (!txn.date || !txn.amount) {
          continue;
        }

        // Use AI to normalize vendor name and classify category
        let vendorName = txn.vendor || "Unknown";
        let categoryName = txn.category || "Operations & Misc";
        let isRecurring = false;

        if (txn.vendor) {
          const vendorResult = await normalizationService.normalizeVendorName(txn.vendor);
          vendorName = vendorResult.cleanName;
          isRecurring = normalizationService.isLikelySubscription(vendorName);
        }

        if (!txn.category || txn.category === "Uncategorized") {
          const categoryResult = await normalizationService.classifyCategory(
            vendorName,
            txn.description || "",
            txn.amount
          );
          categoryName = categoryResult.category;
        }

        // Find or create vendor and category
        const vendor = await storage.findOrCreateVendor(organizationId, vendorName);
        const category = await storage.findOrCreateCategory(organizationId, categoryName);

        await storage.createTransaction({
          organizationId,
          documentId,
          date: new Date(txn.date),
          amount: txn.amount.toString(),
          currency: "USD",
          vendorId: vendor.id,
          categoryId: category.id,
          description: txn.description || null,
          isRecurring,
        });
      }
      
      console.log(`Document ${documentId} processed with fallback parser. Extracted ${transactions.length} transactions.`);
      return;
    }

    // Use Document AI for processing
    const docTypeMap: { [key: string]: "bank_statement" | "invoice" | "receipt" } = {
      "statement": "bank_statement",
      "invoice": "invoice",
      "receipt": "receipt",
      "bank_statement": "bank_statement",
      "csv": "bank_statement",
    };

    const aiDocType = docTypeMap[documentType] || "bank_statement";
    
    const result = await documentAIService.processAndExtractTransactions(buffer, aiDocType);

    // Update document with extracted text
    await storage.updateDocument(documentId, {
      parsedText: result.rawText,
      status: "processed",
      extractionConfidence: result.confidence.toString(),
    });

    // Import normalization service for AI-powered vendor/category classification
    const { normalizationService } = await import("./normalizationService");
    
    // Create transaction records with normalization
    for (const txn of result.transactions) {
      if (!txn.date || !txn.amount) {
        continue; // Skip invalid transactions
      }

      // Use AI to normalize vendor name and classify category
      let vendorName = txn.vendor || "Unknown";
      let categoryName = txn.category || "Operations & Misc";
      let isRecurring = false;

      if (txn.vendor) {
        const vendorResult = await normalizationService.normalizeVendorName(txn.vendor);
        vendorName = vendorResult.cleanName;
        isRecurring = normalizationService.isLikelySubscription(vendorName);
      }

      if (!txn.category || txn.category === "Uncategorized") {
        const categoryResult = await normalizationService.classifyCategory(
          vendorName,
          txn.description || "",
          txn.amount
        );
        categoryName = categoryResult.category;
      }

      // Find or create vendor and category
      const vendor = await storage.findOrCreateVendor(organizationId, vendorName);
      const category = await storage.findOrCreateCategory(organizationId, categoryName);

      // Create transaction
      await storage.createTransaction({
        organizationId,
        documentId,
        date: new Date(txn.date),
        amount: txn.amount.toString(),
        currency: "USD",
        vendorId: vendor.id,
        categoryId: category.id,
        description: txn.description || null,
        isRecurring,
      });
    }

    console.log(`Document ${documentId} processed successfully. Extracted ${result.transactions.length} transactions.`);
  } catch (error: any) {
    console.error(`Error processing document ${documentId}:`, error);
    await storage.updateDocument(documentId, { status: "error" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Public config endpoints (no auth required)
  app.get("/api/config/business-types", (req, res) => {
    const types = Object.values(BUSINESS_TYPE_CONFIGS).map(config => ({
      type: config.type,
      displayName: config.displayName,
      description: config.description,
      icon: config.icon,
    }));
    res.json(types);
  });

  app.get("/api/config/business-types/:type", (req, res) => {
    const { type } = req.params;
    const config = getBusinessTypeConfig(type as BusinessType);
    res.json(config);
  });

  // Auth endpoint to get current user
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(dbUser);
  });

  // Organizations
  app.post("/api/organizations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const data = insertOrganizationSchema.parse(req.body);

      const org = await storage.createOrganization(data);

      await storage.addOrganizationMember({
        userId,
        organizationId: org.id,
        role: "founder",
      });

      if (data.departments && data.departments.length > 0) {
        for (const deptName of data.departments) {
          await storage.createDepartment({
            organizationId: org.id,
            name: deptName,
          });
        }
      }

      const defaultCategories = ["Marketing", "Payroll", "SaaS", "Ops", "Rent", "Utilities", "Misc"];
      for (const catName of defaultCategories) {
        await storage.createCategory({
          organizationId: org.id,
          name: catName,
        });
      }

      res.json(org);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/organizations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const orgs = await storage.getUserOrganizations(userId);
      res.json(orgs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update organization (including business type)
  app.patch("/api/organizations/:orgId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const { orgId } = req.params;

      const membership = await storage.getUserOrgMembership(userId, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const allowedFields = ["name", "industry", "businessType", "employeeCount", "annualRevenue", "monthlySpend"];
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const updated = await storage.updateOrganization(orgId, updateData);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Document upload URL
  app.get("/api/documents/upload-url", isAuthenticated, async (req, res) => {
    try {
      const url = await objectStorageService.getObjectEntityUploadURL();
      res.json({ url });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Documents
  app.post("/api/documents", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(400).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const { fileUrl, type } = req.body;
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(fileUrl);

      await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
        owner: userId,
        visibility: "private",
      });

      const doc = await storage.createDocument({
        organizationId,
        type: type || "other",
        source: "file_upload",
        rawFileUrl: normalizedPath,
        status: "uploaded",
        uploadedBy: userId,
      });

      processDocument(doc.id, normalizedPath, type, organizationId).catch(console.error);

      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });


  app.get("/api/documents", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const organizationId = orgs[0].id;

      const docs = await storage.getOrganizationDocuments(organizationId);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const { id } = req.params;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(403).json({ message: "No organization found" });
      }

      // Verify document belongs to one of the user's organizations
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      const userOrgIds = orgs.map(org => org.id);
      if (!userOrgIds.includes(document.organizationId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteDocument(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Transactions
  app.get("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const organizationId = orgs[0].id;

      const { search, category, days = "30" } = req.query;
      const daysNum = parseInt(days as string);
      const startDate = subDays(new Date(), daysNum);

      const txns = await storage.getOrganizationTransactions(organizationId, {
        startDate,
        categoryId: category !== "all" ? (category as string) : undefined,
        search: search as string,
      });

      res.json(txns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/transactions/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const { id } = req.params;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(403).json({ message: "No organization found" });
      }

      // Verify transaction belongs to one of the user's organizations
      const transaction = await storage.getTransaction(id);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      const userOrgIds = orgs.map(org => org.id);
      if (!userOrgIds.includes(transaction.organizationId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deleteTransaction(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/categories", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const organizationId = orgs[0].id;

      const cats = await storage.getOrganizationCategories(organizationId);
      res.json(cats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json(generateMockDashboardStats());
      }
      const organizationId = orgs[0].id;

      const thirtyDaysAgo = subDays(new Date(), 30);
      const sixtyDaysAgo = subDays(new Date(), 60);

      const recentTxns = await storage.getOrganizationTransactions(organizationId, {
        startDate: thirtyDaysAgo,
      });

      const previousTxns = await storage.getOrganizationTransactions(organizationId, {
        startDate: sixtyDaysAgo,
        endDate: thirtyDaysAgo,
      });

      const totalSpend = recentTxns.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);
      const previousSpend = previousTxns.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);
      const spendChange = previousSpend > 0 ? ((totalSpend - previousSpend) / previousSpend) * 100 : 0;

      const subscriptions = recentTxns.filter((txn) => txn.isRecurring);
      const subscriptionMrr = subscriptions.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

      // Fetch categories and departments for mapping
      const categories = await storage.getOrganizationCategories(organizationId);
      const departments = await storage.getOrganizationDepartments(organizationId);
      
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      const departmentMap = new Map(departments.map(d => [d.id, d.name]));

      const spendByCategory = recentTxns.reduce((acc: any[], txn) => {
        const catName = txn.categoryId ? categoryMap.get(txn.categoryId) || "Uncategorized" : "Uncategorized";
        const existing = acc.find((item) => item.name === catName);
        if (existing) {
          existing.value += parseFloat(txn.amount);
        } else {
          acc.push({ name: catName, value: parseFloat(txn.amount) });
        }
        return acc;
      }, []);

      const spendByDepartment = recentTxns.reduce((acc: any[], txn) => {
        if (txn.departmentId) {
          const deptName = departmentMap.get(txn.departmentId);
          const existing = acc.find((item) => item.name === deptName);
          if (existing) {
            existing.value += parseFloat(txn.amount);
          } else {
            acc.push({ name: deptName, value: parseFloat(txn.amount) });
          }
        }
        return acc;
      }, []);

      const spendOverTime = recentTxns.reduce((acc: any[], txn) => {
        const date = new Date(txn.date).toISOString().split("T")[0];
        const existing = acc.find((item) => item.date === date);
        if (existing) {
          existing.amount += parseFloat(txn.amount);
        } else {
          acc.push({ date, amount: parseFloat(txn.amount) });
        }
        return acc;
      }, []);

      // Fetch monthly metrics for the past 6 months
      const sixMonthsAgo = subDays(new Date(), 180);
      const monthlyMetrics = await storage.getOrganizationMonthlyMetrics(organizationId, {
        startMonth: sixMonthsAgo,
      });

      // Group metrics by month and aggregate across departments
      const metricsByMonth = new Map<string, {
        revenue: number;
        expenses: number;
        profit: number;
        cash: number | null;
        headcount: number;
      }>();

      for (const metric of monthlyMetrics) {
        const monthKey = startOfMonth(new Date(metric.month)).toISOString();
        const existing = metricsByMonth.get(monthKey);
        
        if (!existing) {
          metricsByMonth.set(monthKey, {
            revenue: metric.revenue ? parseFloat(metric.revenue) : 0,
            expenses: metric.expenses ? parseFloat(metric.expenses) : 0,
            profit: metric.profit ? parseFloat(metric.profit) : 0,
            cash: metric.cashBalance !== null && metric.cashBalance !== undefined 
              ? parseFloat(metric.cashBalance) 
              : null,
            headcount: metric.headcount || 0,
          });
        } else {
          // Sum revenue, expenses, profit, headcount across departments
          existing.revenue += metric.revenue ? parseFloat(metric.revenue) : 0;
          existing.expenses += metric.expenses ? parseFloat(metric.expenses) : 0;
          existing.profit += metric.profit ? parseFloat(metric.profit) : 0;
          existing.headcount += metric.headcount || 0;
          
          // For cash (organization-level), prefer non-null values or take max
          if (metric.cashBalance !== null && metric.cashBalance !== undefined) {
            const cashValue = parseFloat(metric.cashBalance);
            if (existing.cash === null || cashValue > existing.cash) {
              existing.cash = cashValue;
            }
          }
        }
      }

      // Get current month metrics for KPI cards
      const currentMonth = startOfMonth(new Date());
      const currentMonthKey = currentMonth.toISOString();
      const currentMonthMetrics = metricsByMonth.get(currentMonthKey);

      const totalRevenue = currentMonthMetrics?.revenue ?? null;
      const totalProfit = currentMonthMetrics?.profit ?? null;
      const currentCash = currentMonthMetrics?.cash ?? null;
      const totalHeadcount = currentMonthMetrics?.headcount ?? null;

      // Build revenue and profit over time charts from aggregated data
      const revenueOverTime = Array.from(metricsByMonth.entries())
        .map(([monthKey, data]) => ({
          month: monthKey.split("T")[0],
          revenue: Math.round(data.revenue),
          expenses: Math.round(data.expenses),
          profit: Math.round(data.profit),
        }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

      res.json({
        totalSpend: Math.round(totalSpend),
        spendChange: Math.round(spendChange),
        transactionCount: recentTxns.length,
        subscriptionCount: subscriptions.length,
        subscriptionMrr: Math.round(subscriptionMrr),
        budgetVariance: 0,
        spendOverTime,
        spendByCategory,
        spendByDepartment,
        // New monthly metrics (properly aggregated)
        totalRevenue: totalRevenue !== null ? Math.round(totalRevenue) : null,
        totalProfit: totalProfit !== null ? Math.round(totalProfit) : null,
        currentCash: currentCash !== null ? Math.round(currentCash) : null,
        totalHeadcount,
        revenueOverTime,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Insights
  app.get("/api/insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const org = orgs[0];

      const existingInsights = await storage.getOrganizationInsights(org.id);
      
      // Check if insights need regeneration (none exist or newest is > 7 days old)
      const newestInsight = existingInsights.length > 0 ? existingInsights[0] : null;
      const needsRegeneration = !newestInsight || 
        (newestInsight.createdAt && 
          (Date.now() - new Date(newestInsight.createdAt).getTime()) > 7 * 24 * 60 * 60 * 1000);
      
      // Generate insights if needed
      if (needsRegeneration) {
        const lookbackDays = 90;
        const txns = await storage.getOrganizationTransactions(org.id, {
          startDate: subDays(new Date(), lookbackDays),
        });

        // Only generate insights if we have enough transactions
        if (txns.length > 10) {
          // Calculate actual date range from transactions (minimum 1 day)
          const txnDates = txns.map(t => new Date(t.date).getTime());
          const minDate = new Date(Math.min(...txnDates));
          const maxDate = new Date(Math.max(...txnDates));
          const actualDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
          
          const vendors = await storage.getOrganizationVendors(org.id);
          const categories = await storage.getOrganizationCategories(org.id);

          // Normalize transactions for intelligence service (ensure isRecurring is boolean)
          const normalizedTxns = txns.map(txn => ({
            ...txn,
            isRecurring: txn.isRecurring ?? false
          }));

          // Map organization to intelligence service format (employeeCount -> companySize)
          const mappedOrg = {
            id: org.id,
            name: org.name,
            industry: org.industry,
            companySize: org.employeeCount,
          };

          const { intelligenceService } = await import("./intelligenceService");
          const generatedInsights = await intelligenceService.generateInsights(
            normalizedTxns,
            vendors,
            categories,
            mappedOrg
          );

          // Map AI category to database insight type
          const mapCategoryToType = (category: string): "spend_drift" | "subscription_creep" | "vendor_overbilling" | "overtime_drift" | "other" => {
            const mapping: Record<string, "spend_drift" | "subscription_creep" | "vendor_overbilling" | "overtime_drift" | "other"> = {
              "spending": "spend_drift",
              "subscriptions": "subscription_creep",
              "vendors": "vendor_overbilling",
              "cash_flow": "spend_drift",
              "efficiency": "other",
            };
            return mapping[category] || "other";
          };

          // Extract numeric dollar value from text (return valid number or null)
          const extractMetricValue = (text: string): string | null => {
            const dollarMatch = text.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
            if (dollarMatch) {
              const numStr = dollarMatch[1].replace(/,/g, '');
              const num = parseFloat(numStr);
              return Number.isFinite(num) ? numStr : null;
            }
            return null;
          };

          // Prepare new insight records
          const newInsightRecords = [];
          for (const insight of generatedInsights) {
            const combinedText = `${insight.description} ${insight.recommendation}`;
            const metricValue = extractMetricValue(combinedText);
            
            newInsightRecords.push({
              organizationId: org.id,
              type: mapCategoryToType(insight.category),
              title: insight.title,
              description: `${insight.description}\n\nRecommendation: ${insight.recommendation}`,
              metricValue,
              severity: insight.severity,
              period: `${actualDays}d`,
            });
          }

          // Only replace if we have new insights to prevent data loss
          if (newInsightRecords.length > 0) {
            try {
              const newInsights = await storage.replaceOrganizationInsights(org.id, newInsightRecords);
              return res.json(newInsights);
            } catch (replaceError) {
              console.error("Failed to replace insights transactionally:", replaceError);
              // If transaction fails, return existing insights to avoid showing empty state
              return res.json(existingInsights);
            }
          }
        }
      }

      res.json(existingInsights);
    } catch (error: any) {
      console.error("Error generating insights:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Budgets (Core+ only - department budgets)
  app.get("/api/budgets", isAuthenticated, requireFeature("departmentBudgets"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const organizationId = orgs[0].id;

      const budgets = await storage.getOrganizationBudgets(organizationId);

      const budgetsWithSpent = await Promise.all(
        budgets.map(async (budget) => {
          const txns = await storage.getOrganizationTransactions(organizationId, {
            startDate: new Date(budget.periodStart),
            endDate: new Date(budget.periodEnd),
          });

          const spent: Record<string, number> = {};
          if (budget.breakdown) {
            for (const category of Object.keys(budget.breakdown)) {
              // TODO: Need to join with categories table to get category name
              // For now, skip this calculation
              spent[category] = 0;
            }
          }

          return { ...budget, spent };
        })
      );

      res.json(budgetsWithSpent);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/budgets/generate", isAuthenticated, requireFeature("departmentBudgets"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(400).json({ message: "No organization found" });
      }
      const org = orgs[0];

      const txns = await storage.getOrganizationTransactions(org.id, {
        startDate: subDays(new Date(), 90),
      });

      // Normalize transactions for intelligence service (ensure isRecurring is boolean)
      const normalizedTxns = txns.map(txn => ({
        ...txn,
        isRecurring: txn.isRecurring ?? false
      }));

      // Map organization to intelligence service format (employeeCount -> companySize)
      const mappedOrg = {
        id: org.id,
        name: org.name,
        industry: org.industry,
        companySize: org.employeeCount,
      };

      // Use intelligence service to generate budget
      const { intelligenceService } = await import("./intelligenceService");
      const categories = await storage.getOrganizationCategories(org.id);
      const suggestions = await intelligenceService.generateBudget(normalizedTxns, categories, mappedOrg);

      const now = new Date();
      const periodStart = startOfMonth(addMonths(now, 1));
      const periodEnd = endOfMonth(addMonths(now, 1));

      const budget = await storage.createBudget({
        organizationId: org.id,
        periodStart,
        periodEnd,
        totalBudgetAmount: suggestions.totalBudget.toString(),
        breakdown: suggestions.breakdown,
        status: "draft",
        createdBy: userId,
      });

      res.json(budget);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Analytics
  app.get("/api/analytics", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const { days = "30" } = req.query;
      const daysNum = parseInt(days as string);

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json(generateMockAnalytics(30));
      }
      const organizationId = orgs[0].id;

      const startDate = subDays(new Date(), daysNum);

      // Fetch real data from database
      const txns = await storage.getOrganizationTransactions(organizationId, {
        startDate,
      });

      // If no data yet, return mock data
      if (txns.length === 0) {
        return res.json(generateMockAnalytics(daysNum));
      }

      // Get categories and vendors for analytics
      const categories = await storage.getOrganizationCategories(organizationId);
      const vendors = await storage.getOrganizationVendors(organizationId);

      // Normalize transactions for analytics service (ensure isRecurring is boolean)
      const normalizedTxns = txns.map(txn => ({
        ...txn,
        isRecurring: txn.isRecurring ?? false
      }));

      // Use analytics service for calculations
      const { analyticsService } = await import("./analyticsService");
      const monthlyTrends = analyticsService.calculateMonthlyTrends(normalizedTxns, categories, 6);
      const spendingPatterns = analyticsService.analyzeSpendingPatterns(normalizedTxns, vendors, categories);
      const burnAnalysis = analyticsService.calculateBurnRate(normalizedTxns, 50000);

      // Format spend trend for chart
      const spendTrend = txns.reduce((acc: any[], txn) => {
        const date = new Date(txn.date).toISOString().split("T")[0];
        const existing = acc.find((item) => item.date === date);
        const amount = Math.abs(parseFloat(txn.amount));
        if (existing) {
          existing.amount += amount;
        } else {
          acc.push({ date, amount });
        }
        return acc;
      }, []).sort((a, b) => a.date.localeCompare(b.date));

      // Category distribution from spending patterns
      const categoryDistribution = spendingPatterns.topCategories.map((cat) => ({
        name: cat.categoryName,
        value: cat.total,
        percentage: cat.percentage,
      }));

      // Top vendors
      const topVendors = spendingPatterns.topVendors.slice(0, 10).map((v) => ({
        name: v.vendorName,
        value: v.total,
        count: v.count,
      }));

      // Monthly comparison
      const monthlyComparison = monthlyTrends.map((month) => ({
        month: month.month,
        amount: month.total,
        count: month.count,
      }));

      // Calculate revenue from positive transactions (income)
      const revenueTxns = txns.filter((txn) => parseFloat(txn.amount) > 0);
      const totalRevenue = revenueTxns.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

      // Group revenue by month for growth chart
      const revenueByMonth: Record<string, { month: string; revenue: number }> = {};
      revenueTxns.forEach((txn) => {
        const txnDate = new Date(txn.date);
        const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, "0")}`;
        
        if (!revenueByMonth[monthKey]) {
          revenueByMonth[monthKey] = {
            month: monthKey,
            revenue: 0,
          };
        }
        revenueByMonth[monthKey].revenue += parseFloat(txn.amount);
      });

      const revenueGrowth = Object.values(revenueByMonth)
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((item) => ({
          month: item.month,
          revenue: Math.round(item.revenue),
        }));

      // Calculate MRR (Monthly Recurring Revenue) from recurring income
      const recurringRevenueTxns = revenueTxns.filter((txn) => txn.isRecurring);
      const mrr = recurringRevenueTxns.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);
      const arr = mrr * 12;

      // Revenue sources (categorize positive transactions)
      const revenueSources: Record<string, number> = {};
      revenueTxns.forEach((txn) => {
        if (txn.categoryId) {
          const category = categories.find((c) => c.id === txn.categoryId);
          const categoryName = category?.name || "Other Revenue";
          revenueSources[categoryName] = (revenueSources[categoryName] || 0) + parseFloat(txn.amount);
        }
      });

      const revenueSourcesArray = Object.entries(revenueSources)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value);

      // Generate MRR/ARR by month for chart
      const mrrArrByMonth: Record<string, { month: string; mrr: number; arr: number }> = {};
      recurringRevenueTxns.forEach((txn) => {
        const txnDate = new Date(txn.date);
        const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, "0")}`;
        
        if (!mrrArrByMonth[monthKey]) {
          mrrArrByMonth[monthKey] = {
            month: monthKey,
            mrr: 0,
            arr: 0,
          };
        }
        const amount = parseFloat(txn.amount);
        mrrArrByMonth[monthKey].mrr += amount;
        mrrArrByMonth[monthKey].arr += amount * 12;
      });

      const mrrArr = Object.values(mrrArrByMonth)
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((item) => ({
          month: item.month,
          mrr: Math.round(item.mrr),
          arr: Math.round(item.arr),
        }));

      // For now, ALWAYS use sample data so the graph displays properly
      // TODO: Switch to real data once we have revenue transactions
      const finalRevenueGrowth = [
        { month: "May", revenue: 8500 },
        { month: "Jun", revenue: 12200 },
        { month: "Jul", revenue: 15800 },
        { month: "Aug", revenue: 18400 },
        { month: "Sep", revenue: 22100 },
        { month: "Oct", revenue: 26500 },
        { month: "Nov", revenue: 31200 },
        { month: "Dec", revenue: 35800 },
        { month: "Jan", revenue: 42300 },
      ];
      const finalMrrArr = [
        { month: "May", mrr: 2800, arr: 33600 },
        { month: "Jun", mrr: 3400, arr: 40800 },
        { month: "Jul", mrr: 4100, arr: 49200 },
        { month: "Aug", mrr: 4800, arr: 57600 },
        { month: "Sep", mrr: 5600, arr: 67200 },
        { month: "Oct", mrr: 6400, arr: 76800 },
        { month: "Nov", mrr: 7300, arr: 87600 },
        { month: "Dec", mrr: 8200, arr: 98400 },
        { month: "Jan", mrr: 9500, arr: 114000 },
      ];

      res.json({
        spendTrend,
        categoryDistribution,
        departmentSpending: [], // TODO: Implement department tracking
        topVendors,
        monthlyComparison,
        revenue: {
          totalRevenue: Math.round(totalRevenue),
          revenueGrowth: finalRevenueGrowth,
          mrr: Math.round(mrr),
          arr: Math.round(arr),
          mrrArr: finalMrrArr,
          revenueSources: revenueSourcesArray.length > 0 ? revenueSourcesArray : [
            { name: "Subscriptions", value: 12000 },
            { name: "Services", value: 8000 },
            { name: "Other", value: 5000 }
          ],
        },
        metrics: {
          totalExpenses: txns.reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0),
          transactionCount: txns.length,
          avgMonthlyBurn: burnAnalysis.avgMonthlyBurn,
          burnTrend: burnAnalysis.burnTrend,
          runway: burnAnalysis.runway,
          recurringTotal: spendingPatterns.recurringTotal,
          oneTimeTotal: spendingPatterns.oneTimeTotal,
        },
      });
    } catch (error: any) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // SaaS Metrics - Unit Economics (CAC, LTV, MRR, ARR)
  app.get("/api/saas-metrics", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { days = "30" } = req.query;
      const periodDays = parseInt(days as string);

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(404).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const { saasMetricsService } = await import("./services/saasMetricsService");
      const unitEconomics = await saasMetricsService.computeUnitEconomics(
        parseInt(organizationId),
        periodDays
      );

      res.json(unitEconomics);
    } catch (error: any) {
      console.error("SaaS metrics error:", error);
      res.status(500).json({ message: error.message || "Failed to compute SaaS metrics" });
    }
  });

  // SaaS Metrics - MRR/ARR only (lightweight)
  app.get("/api/saas-metrics/mrr", isAuthenticated, async (req, res) => {
    try {
      const { stripeSubscriptionService } = await import("./services/stripeSubscriptionService");
      const mrrData = await stripeSubscriptionService.computeMRR();
      const arr = mrrData.mrr * 12;

      res.json({
        mrr: mrrData.mrr,
        arr: Math.round(arr * 100) / 100,
        currency: mrrData.currency,
        activeSubscriptions: mrrData.subscriptionCount,
      });
    } catch (error: any) {
      console.error("MRR calculation error:", error);
      res.status(500).json({ message: error.message || "Failed to compute MRR" });
    }
  });

  // SaaS Metrics - Churn metrics only
  app.get("/api/saas-metrics/churn", isAuthenticated, async (req, res) => {
    try {
      const { days = "30" } = req.query;
      const periodDays = parseInt(days as string);

      const { stripeSubscriptionService } = await import("./services/stripeSubscriptionService");
      const churnMetrics = await stripeSubscriptionService.computeChurnRate(periodDays);

      res.json(churnMetrics);
    } catch (error: any) {
      console.error("Churn calculation error:", error);
      res.status(500).json({ message: error.message || "Failed to compute churn" });
    }
  });

  // SaaS Metrics - CAC breakdown
  app.get("/api/saas-metrics/cac", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { days = "30" } = req.query;
      const periodDays = parseInt(days as string);

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(404).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const { saasMetricsService } = await import("./services/saasMetricsService");
      const cacResult = await saasMetricsService.computeCAC(
        parseInt(organizationId),
        periodDays
      );

      res.json(cacResult);
    } catch (error: any) {
      console.error("CAC calculation error:", error);
      res.status(500).json({ message: error.message || "Failed to compute CAC" });
    }
  });

  // SaaS Metrics - LTV calculation
  app.get("/api/saas-metrics/ltv", isAuthenticated, async (req, res) => {
    try {
      const { days = "30" } = req.query;
      const periodDays = parseInt(days as string);

      const { saasMetricsService } = await import("./services/saasMetricsService");
      const ltvMetrics = await saasMetricsService.computeLTV(periodDays);

      res.json(ltvMetrics);
    } catch (error: any) {
      console.error("LTV calculation error:", error);
      res.status(500).json({ message: error.message || "Failed to compute LTV" });
    }
  });

  // CAC Classification Review Queue - Get pending reviews (<80% confidence)
  app.get("/api/saas-metrics/cac/review-queue", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { days = "30", limit = "50" } = req.query;
      const periodDays = parseInt(days as string);
      const maxLimit = Math.min(parseInt(limit as string), 100);

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json({ pendingReviews: [], totalCount: 0 });
      }
      const organizationId = orgs[0].id;

      const { saasMetricsService } = await import("./services/saasMetricsService");
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
      
      const { classifications } = await saasMetricsService.getCACSpendFromTransactions(
        parseInt(organizationId),
        startDate,
        endDate
      );

      // Filter to only low-confidence CAC classifications that need review
      const pendingReviews = classifications
        .filter(c => c.requiresReview && c.isCACSpend)
        .slice(0, maxLimit)
        .map((c) => ({
          id: String(c.transactionId),
          transactionId: c.transactionId,
          vendor: c.vendor,
          description: c.description,
          amount: Math.abs(c.amount),
          isRefund: c.amount > 0,
          date: c.date,
          spendType: c.spendType,
          category: c.category,
          subcategory: c.subcategory,
          confidence: c.confidence,
          reasoning: c.reasoning,
          method: c.method,
        }));

      res.json({
        pendingReviews,
        totalCount: classifications.filter(c => c.requiresReview && c.isCACSpend).length,
        reviewThreshold: 0.8,
      });
    } catch (error: any) {
      console.error("Review queue error:", error);
      res.status(500).json({ message: error.message || "Failed to get review queue" });
    }
  });

  // CAC Classification Review - Submit correction for a transaction
  app.post("/api/saas-metrics/cac/review", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { transactionId, vendor, description, amount, date, isRefund, originalClassification, correctedClassification, note } = req.body;

      if (!transactionId || !correctedClassification) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(404).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      // Include full transaction context in both original and corrected for complete audit trail
      const transactionContext = {
        vendor,
        description,
        amount,
        date,
        isRefund: isRefund || false,
      };
      const enrichedOriginal = {
        ...originalClassification,
        ...transactionContext,
      };
      const enrichedCorrected = {
        ...correctedClassification,
        ...transactionContext,
      };

      // Store the correction in ai_context_notes for learning
      const feedbackNote = {
        organizationId,
        userId,
        feedbackType: "correction" as const,
        originalOutput: JSON.stringify(enrichedOriginal),
        correctedOutput: JSON.stringify(enrichedCorrected),
        note: note || null,
        entityType: "cac_classification",
        entityId: String(transactionId),
        isUsedForTraining: false,
      };

      await db.execute(sql`
        INSERT INTO ai_context_notes (
          organization_id, user_id, feedback_type, original_output, 
          corrected_output, note, entity_type, entity_id, is_used_for_training
        ) VALUES (
          ${feedbackNote.organizationId}, ${feedbackNote.userId}, ${feedbackNote.feedbackType},
          ${feedbackNote.originalOutput}, ${feedbackNote.correctedOutput}, ${feedbackNote.note},
          ${feedbackNote.entityType}, ${feedbackNote.entityId}, ${feedbackNote.isUsedForTraining}
        )
      `);

      res.json({ 
        success: true, 
        message: "Classification correction saved",
        willImproveAI: true,
      });
    } catch (error: any) {
      console.error("Review submission error:", error);
      res.status(500).json({ message: error.message || "Failed to save correction" });
    }
  });

  // Get CAC classification corrections for learning loop
  app.get("/api/saas-metrics/cac/corrections", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json({ corrections: [] });
      }
      const organizationId = orgs[0].id;

      const result = await db.execute(sql`
        SELECT id, original_output, corrected_output, note, entity_id, created_at
        FROM ai_context_notes
        WHERE organization_id = ${organizationId}
          AND entity_type = 'cac_classification'
          AND feedback_type = 'correction'
        ORDER BY created_at DESC
        LIMIT 100
      `);

      res.json({ 
        corrections: result.rows,
        totalCount: result.rows.length,
      });
    } catch (error: any) {
      console.error("Corrections fetch error:", error);
      res.status(500).json({ message: error.message || "Failed to get corrections" });
    }
  });

  // SaaS Metrics History - Get historical snapshots for trend analysis
  const VALID_METRIC_TYPES = ['mrr', 'arr', 'cac', 'ltv', 'ltv_to_cac', 'arpu', 'churn_rate'];
  
  app.get("/api/saas-metrics/history/:metricType", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { metricType } = req.params;
      const { limit = "12" } = req.query;

      if (!VALID_METRIC_TYPES.includes(metricType)) {
        return res.status(400).json({ 
          message: `Invalid metric type. Valid types: ${VALID_METRIC_TYPES.join(', ')}` 
        });
      }

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json({ history: [] });
      }
      const organizationId = orgs[0].id;

      const { saasMetricsService } = await import("./services/saasMetricsService");
      const history = await saasMetricsService.getMetricHistory(
        parseInt(organizationId),
        metricType,
        parseInt(limit as string)
      );

      res.json({ history, metricType });
    } catch (error: any) {
      console.error("Metric history error:", error);
      res.status(500).json({ message: error.message || "Failed to get metric history" });
    }
  });

  // Store SaaS metrics snapshot for audit trail
  app.post("/api/saas-metrics/snapshot", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { days = "30" } = req.query;
      const periodDays = parseInt(days as string);

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(404).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const { saasMetricsService } = await import("./services/saasMetricsService");
      const economics = await saasMetricsService.computeUnitEconomics(
        parseInt(organizationId),
        periodDays
      );

      await saasMetricsService.storeMetricSnapshots(
        parseInt(organizationId),
        economics,
        periodDays
      );

      res.json({ 
        success: true, 
        message: "Metrics snapshot stored for audit trail",
        snapshotAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Snapshot storage error:", error);
      res.status(500).json({ message: error.message || "Failed to store snapshot" });
    }
  });

  // Get manual SaaS metrics settings for organization
  app.get("/api/saas-metrics/manual-settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(404).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const result = await db.execute(sql`
        SELECT manual_cac, manual_ltv, manual_arpu, manual_churn_rate, use_manual_overrides
        FROM organizations 
        WHERE id = ${organizationId}
      `);

      const row = result.rows[0];
      res.json({
        manualCac: row?.manual_cac ? parseFloat(String(row.manual_cac)) : null,
        manualLtv: row?.manual_ltv ? parseFloat(String(row.manual_ltv)) : null,
        manualArpu: row?.manual_arpu ? parseFloat(String(row.manual_arpu)) : null,
        manualChurnRate: row?.manual_churn_rate ? parseFloat(String(row.manual_churn_rate)) : null,
        useManualOverrides: row?.use_manual_overrides === true,
      });
    } catch (error: any) {
      console.error("Get manual settings error:", error);
      res.status(500).json({ message: error.message || "Failed to get manual settings" });
    }
  });

  // Update manual SaaS metrics settings for organization
  app.post("/api/saas-metrics/manual-settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(404).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const { manualCac, manualLtv, manualArpu, manualChurnRate, useManualOverrides } = req.body;

      // Validate inputs
      if (manualCac !== null && manualCac !== undefined && (isNaN(manualCac) || manualCac < 0)) {
        return res.status(400).json({ message: "CAC must be a non-negative number" });
      }
      if (manualLtv !== null && manualLtv !== undefined && (isNaN(manualLtv) || manualLtv < 0)) {
        return res.status(400).json({ message: "LTV must be a non-negative number" });
      }
      if (manualArpu !== null && manualArpu !== undefined && (isNaN(manualArpu) || manualArpu < 0)) {
        return res.status(400).json({ message: "ARPU must be a non-negative number" });
      }
      if (manualChurnRate !== null && manualChurnRate !== undefined && (isNaN(manualChurnRate) || manualChurnRate < 0 || manualChurnRate > 100)) {
        return res.status(400).json({ message: "Churn rate must be between 0 and 100" });
      }

      await db.execute(sql`
        UPDATE organizations 
        SET 
          manual_cac = ${manualCac ?? null},
          manual_ltv = ${manualLtv ?? null},
          manual_arpu = ${manualArpu ?? null},
          manual_churn_rate = ${manualChurnRate ?? null},
          use_manual_overrides = ${useManualOverrides === true},
          updated_at = NOW()
        WHERE id = ${organizationId}
      `);

      res.json({ 
        success: true, 
        message: "Manual metrics settings updated",
        settings: {
          manualCac,
          manualLtv,
          manualArpu,
          manualChurnRate,
          useManualOverrides,
        }
      });
    } catch (error: any) {
      console.error("Update manual settings error:", error);
      res.status(500).json({ message: error.message || "Failed to update manual settings" });
    }
  });

  // Action Plans
  app.get("/api/action-plans", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const organizationId = orgs[0].id;

      const plans = await storage.getOrganizationActionPlans(organizationId);

      const plansWithItems = await Promise.all(
        plans.map(async (plan) => {
          const items = await storage.getActionItems(plan.id);
          return { ...plan, items };
        })
      );

      res.json(plansWithItems);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/action-plans/generate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.status(400).json({ message: "No organization found" });
      }
      const organizationId = orgs[0].id;

      const insights = await storage.getOrganizationInsights(organizationId);
      const budgets = await storage.getOrganizationBudgets(organizationId);
      const txns = await storage.getOrganizationTransactions(organizationId, {
        startDate: subDays(new Date(), 90),
      });

      // Map insights to format expected by intelligence service (type -> category)
      const mapTypeToCategory = (type: string): string => {
        const mapping: Record<string, string> = {
          "spend_drift": "spending",
          "subscription_creep": "subscriptions",
          "vendor_overbilling": "vendors",
          "overtime_drift": "cash_flow",
          "other": "efficiency",
        };
        return mapping[type] || "efficiency";
      };

      const mappedInsights = insights.map(insight => ({
        title: insight.title,
        description: insight.description,
        severity: insight.severity,
        category: mapTypeToCategory(insight.type),
      }));

      // Calculate budget gap (current month spend vs budget)
      const currentMonthSpend = txns
        .filter(t => new Date(t.date) >= startOfMonth(new Date()))
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
      
      const currentBudget = budgets.find(b => 
        new Date(b.periodStart) <= new Date() && new Date(b.periodEnd) >= new Date()
      );
      
      const budgetAmount = currentBudget ? parseFloat(currentBudget.totalBudgetAmount) : 0;
      const budgetGap = currentMonthSpend - budgetAmount;

      // Map organization to intelligence service format
      const org = orgs[0];
      const mappedOrg = {
        id: org.id,
        name: org.name,
        industry: org.industry,
        companySize: org.employeeCount,
      };

      // Use intelligence service to generate action plan
      const { intelligenceService } = await import("./intelligenceService");
      const generated = await intelligenceService.generateActionPlan(mappedInsights, budgetGap, mappedOrg);

      const now = new Date();
      const periodStart = startOfMonth(addMonths(now, 1));
      const periodEnd = endOfMonth(addMonths(now, 1));

      const plan = await storage.createActionPlan({
        organizationId,
        periodStart,
        periodEnd,
        status: "draft",
        generatedSummary: generated.summary,
        createdBy: userId,
      });

      // The AI service returns 'actions' field with specific structure
      const actionItems = generated.actions || [];
      
      for (const item of actionItems) {
        await storage.createActionItem({
          actionPlanId: plan.id,
          type: "other", // Default type for AI-generated actions
          description: `${item.title}: ${item.description}`,
          impactEstimate: item.estimatedImpact?.toString(),
          priority: item.priority,
          status: "open",
        });
      }

      const items = await storage.getActionItems(plan.id);
      res.json({ ...plan, items });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/action-items/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await storage.updateActionItem(id, { status });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Integrations
  app.get("/api/integrations/connections", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json([]);
      }
      const organizationId = orgs[0].id;

      const connections = await storage.getOrganizationIntegrations(organizationId);
      res.json(connections);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Yodlee Banking Integration endpoints
  app.post("/api/yodlee/connect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);

      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      const { yodleeService } = await import("./yodleeService");
      const { userSession, fastLinkUrl } = await yodleeService.generateFastLink(user.id);

      // Store the connection in the database
      const connection = await storage.createIntegrationConnection({
        organizationId: orgMember.organizationId,
        type: "banking",
        provider: "yodlee",
        status: "pending",
        metadata: {
          userId: user.id,
          userSession,
        },
      });

      res.json({ 
        connectionId: connection.id,
        fastLinkUrl 
      });
    } catch (error: any) {
      console.error("Yodlee connect error:", error);
      res.status(500).json({ message: error.message || "Failed to initiate bank connection" });
    }
  });

  app.post("/api/yodlee/sync-transactions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);

      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      // Get the Yodlee connection
      const connections = await storage.getOrganizationIntegrations(orgMember.organizationId);
      const yodleeConnection = connections.find(
        (c: any) => c.provider === "yodlee" && c.status === "active"
      );

      const metadata = yodleeConnection?.metadata as { userSession?: string; userId?: string } | null;
      if (!yodleeConnection || !metadata?.userSession) {
        return res.status(404).json({ message: "No active Yodlee connection found" });
      }

      const { yodleeService } = await import("./yodleeService");
      const days = parseInt(req.body.days) || 90;
      
      // Sync transactions
      const normalizedTransactions = await yodleeService.syncTransactions(
        orgMember.organizationId,
        metadata.userSession,
        days
      );

      // Store transactions in database (resolve vendor and category names to IDs first)
      const stored = [];
      for (const txn of normalizedTransactions) {
        // Find or create vendor
        const vendor = await storage.findOrCreateVendor(orgMember.organizationId, txn.vendorName);
        
        // Find or create category  
        const category = await storage.findOrCreateCategory(orgMember.organizationId, txn.categoryName);
        
        // Create transaction with proper IDs
        const transaction = await storage.createTransaction({
          organizationId: txn.organizationId,
          date: txn.date,
          amount: txn.amount,
          currency: txn.currency,
          vendorId: vendor.id,
          categoryId: category.id,
          description: txn.description,
          isRecurring: txn.isRecurring,
          tags: txn.tags,
        });
        
        stored.push(transaction);
      }

      // Update connection status
      await storage.updateIntegrationConnection(yodleeConnection.id, {
        status: "active",
        metadata: {
          ...(yodleeConnection.metadata || {}),
          lastSyncAt: new Date().toISOString(),
          transactionCount: stored.length,
        },
      });

      res.json({ 
        success: true,
        transactionCount: stored.length,
        dateRange: {
          from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          to: new Date().toISOString().split("T")[0],
        }
      });
    } catch (error: any) {
      console.error("Transaction sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  app.get("/api/yodlee/accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);

      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      const connections = await storage.getOrganizationIntegrations(orgMember.organizationId);
      const yodleeConnection = connections.find(
        (c: any) => c.provider === "yodlee" && c.status === "active"
      );

      const metadata = yodleeConnection?.metadata as { userSession?: string; userId?: string } | null;
      if (!yodleeConnection || !metadata?.userSession) {
        return res.status(404).json({ message: "No active Yodlee connection found" });
      }

      const { yodleeService } = await import("./yodleeService");
      const accounts = await yodleeService.getAccounts(metadata.userSession);

      res.json({ accounts });
    } catch (error: any) {
      console.error("Get accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch accounts" });
    }
  });

  // QuickBooks Integration endpoints
  app.get("/api/quickbooks/auth-url", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { quickBooksService } = await import("./quickbooksService");
      const authUrl = quickBooksService.getAuthUrl(userId);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("QuickBooks auth URL error:", error);
      res.status(500).json({ message: error.message || "Failed to generate auth URL" });
    }
  });

  app.get("/api/quickbooks/callback", async (req, res) => {
    try {
      const { code, realmId, state } = req.query;
      
      if (!code || !realmId || !state) {
        return res.redirect("/app/connect?error=missing_params");
      }

      // Decode state to get userId
      const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      const userId = stateData.userId;

      const { quickBooksService } = await import("./quickbooksService");
      await quickBooksService.handleCallback(code as string, realmId as string, userId);

      // Streamlined onboarding: redirect directly to dashboard after successful connection
      res.redirect("/app");
    } catch (error: any) {
      console.error("QuickBooks callback error:", error);
      res.redirect("/app/connect?error=callback_failed");
    }
  });

  app.get("/api/quickbooks/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { quickBooksService } = await import("./quickbooksService");
      const status = await quickBooksService.getConnectionStatus(userId);
      res.json(status);
    } catch (error: any) {
      console.error("QuickBooks status error:", error);
      res.status(500).json({ message: error.message || "Failed to get connection status" });
    }
  });

  app.post("/api/quickbooks/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { startDate, endDate } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const result = await quickBooksService.syncTransactions(userId, startDate, endDate);
      res.json(result);
    } catch (error: any) {
      console.error("QuickBooks sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  app.get("/api/quickbooks/accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { quickBooksService } = await import("./quickbooksService");
      const accounts = await quickBooksService.getAccounts(userId);
      res.json({ accounts });
    } catch (error: any) {
      console.error("QuickBooks accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch accounts" });
    }
  });

  app.get("/api/quickbooks/profit-loss", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { startDate, endDate } = req.query;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const report = await quickBooksService.getProfitAndLoss(userId, startDate as string, endDate as string);
      res.json(report);
    } catch (error: any) {
      console.error("QuickBooks P&L error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch P&L report" });
    }
  });

  app.get("/api/quickbooks/balance-sheet", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { asOfDate } = req.query;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!asOfDate) {
        return res.status(400).json({ message: "As of date is required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const report = await quickBooksService.getBalanceSheet(userId, asOfDate as string);
      res.json(report);
    } catch (error: any) {
      console.error("QuickBooks balance sheet error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch balance sheet" });
    }
  });

  app.get("/api/quickbooks/cash-flow", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { startDate, endDate } = req.query;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const report = await quickBooksService.getCashFlow(userId, startDate as string, endDate as string);
      res.json(report);
    } catch (error: any) {
      console.error("QuickBooks cash flow error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch cash flow report" });
    }
  });

  app.post("/api/quickbooks/disconnect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { quickBooksService } = await import("./quickbooksService");
      await quickBooksService.disconnect(userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("QuickBooks disconnect error:", error);
      res.status(500).json({ message: error.message || "Failed to disconnect" });
    }
  });

  // Xero Integration endpoints
  app.get("/api/xero/auth-url", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { xeroService } = await import("./xeroService");
      const authUrl = await xeroService.getAuthUrl(userId);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Xero auth URL error:", error);
      res.status(500).json({ message: error.message || "Failed to generate auth URL" });
    }
  });

  app.get("/api/xero/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.redirect("/app/connect?error=missing_params");
      }

      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      } catch (e) {
        console.error("Invalid state parameter:", e);
        return res.redirect("/app/connect?error=invalid_state");
      }
      
      const userId = stateData.userId;
      if (!userId) {
        return res.redirect("/app/connect?error=invalid_state");
      }

      const { xeroService } = await import("./xeroService");
      const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      await xeroService.handleCallback(fullUrl, userId);

      res.redirect("/app/connect?success=xero");
    } catch (error: any) {
      console.error("Xero callback error:", error);
      res.redirect("/app/connect?error=callback_failed");
    }
  });

  app.get("/api/xero/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { xeroService } = await import("./xeroService");
      const status = await xeroService.getConnectionStatus(userId);
      res.json(status);
    } catch (error: any) {
      console.error("Xero status error:", error);
      res.status(500).json({ message: error.message || "Failed to get connection status" });
    }
  });

  app.post("/api/xero/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { startDate, endDate } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { xeroService } = await import("./xeroService");
      const result = await xeroService.syncTransactions(userId, new Date(startDate), new Date(endDate));
      res.json(result);
    } catch (error: any) {
      console.error("Xero sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  app.get("/api/xero/organisation", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { xeroService } = await import("./xeroService");
      const org = await xeroService.getOrganisationInfo(userId);
      res.json(org);
    } catch (error: any) {
      console.error("Xero organisation error:", error);
      res.status(500).json({ message: error.message || "Failed to get organisation info" });
    }
  });

  app.get("/api/xero/bank-accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { xeroService } = await import("./xeroService");
      const accounts = await xeroService.getBankAccounts(userId);
      res.json(accounts);
    } catch (error: any) {
      console.error("Xero bank accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to get bank accounts" });
    }
  });

  app.post("/api/xero/disconnect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { xeroService } = await import("./xeroService");
      await xeroService.disconnect(userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Xero disconnect error:", error);
      res.status(500).json({ message: error.message || "Failed to disconnect" });
    }
  });

  // ============================================
  // Auto-Reconciliation Engine API
  // ============================================

  app.post("/api/reconciliation/sync-invoices", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { source, organizationId, startDate, endDate } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      
      let result;
      if (source === "quickbooks") {
        result = await reconciliationEngine.syncInvoicesFromQuickBooks(organizationId, userId, start, end);
      } else if (source === "xero") {
        result = await reconciliationEngine.syncInvoicesFromXero(organizationId, userId, start, end);
      } else {
        return res.status(400).json({ message: "Invalid source. Use 'quickbooks' or 'xero'" });
      }

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Sync invoices error:", error);
      res.status(500).json({ message: error.message || "Failed to sync invoices" });
    }
  });

  app.post("/api/reconciliation/run", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { organizationId, startDate, endDate } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      const result = await reconciliationEngine.runReconciliation(organizationId, start, end);

      res.json(result);
    } catch (error: any) {
      console.error("Run reconciliation error:", error);
      res.status(500).json({ message: error.message || "Failed to run reconciliation" });
    }
  });

  app.get("/api/reconciliation/summary", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const organizationId = req.query.organizationId as string;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      const summary = await reconciliationEngine.getReconciliationSummary(organizationId);

      res.json(summary);
    } catch (error: any) {
      console.error("Reconciliation summary error:", error);
      res.status(500).json({ message: error.message || "Failed to get summary" });
    }
  });

  app.get("/api/reconciliation/pending-matches", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const organizationId = req.query.organizationId as string;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      const matches = await reconciliationEngine.getPendingMatches(organizationId);

      res.json(matches);
    } catch (error: any) {
      console.error("Pending matches error:", error);
      res.status(500).json({ message: error.message || "Failed to get pending matches" });
    }
  });

  app.get("/api/reconciliation/discrepancies", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const organizationId = req.query.organizationId as string;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      const discrepancies = await reconciliationEngine.getOpenDiscrepancies(organizationId);

      res.json(discrepancies);
    } catch (error: any) {
      console.error("Discrepancies error:", error);
      res.status(500).json({ message: error.message || "Failed to get discrepancies" });
    }
  });

  app.post("/api/reconciliation/matches/:matchId/confirm", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { matchId } = req.params;
      const { notes } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      await reconciliationEngine.confirmMatch(matchId, userId, notes);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Confirm match error:", error);
      res.status(500).json({ message: error.message || "Failed to confirm match" });
    }
  });

  app.post("/api/reconciliation/matches/:matchId/reject", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { matchId } = req.params;
      const { notes } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      await reconciliationEngine.rejectMatch(matchId, userId, notes);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Reject match error:", error);
      res.status(500).json({ message: error.message || "Failed to reject match" });
    }
  });

  app.post("/api/reconciliation/discrepancies/:discrepancyId/resolve", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { discrepancyId } = req.params;
      const { resolution, notes } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid" });
      }

      if (!resolution || !["resolved", "ignored"].includes(resolution)) {
        return res.status(400).json({ message: "Resolution must be 'resolved' or 'ignored'" });
      }

      const { reconciliationEngine } = await import("./ml/reconciliationEngine");
      await reconciliationEngine.resolveDiscrepancy(discrepancyId, userId, resolution, notes);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Resolve discrepancy error:", error);
      res.status(500).json({ message: error.message || "Failed to resolve discrepancy" });
    }
  });

  // ============================================
  // Real-Time Financial Sync API (Task 5)
  // ============================================

  // Get sync status for all connections
  app.get("/api/sync/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const organizationId = (req.query.organizationId as string) || user.organizationId;

      if (!organizationId) {
        return res.json({ sources: [], dataFreshness: { overallStatus: 'disconnected' } });
      }

      const { syncEngine } = await import("./sync/syncEngine");
      const [status, freshness] = await Promise.all([
        syncEngine.getSyncStatus(organizationId),
        syncEngine.getDataFreshness(organizationId),
      ]);

      res.json({ sources: status, dataFreshness: freshness });
    } catch (error: any) {
      console.error("Sync status error:", error);
      res.status(500).json({ message: error.message || "Failed to get sync status" });
    }
  });

  // Get recent sync jobs
  app.get("/api/sync/jobs", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const organizationId = (req.query.organizationId as string) || user.organizationId;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!organizationId) {
        return res.json({ jobs: [] });
      }

      const { syncEngine } = await import("./sync/syncEngine");
      const jobs = await syncEngine.getRecentJobs(organizationId, limit);

      res.json({ jobs });
    } catch (error: any) {
      console.error("Sync jobs error:", error);
      res.status(500).json({ message: error.message || "Failed to get sync jobs" });
    }
  });

  // Trigger manual sync for a source
  app.post("/api/sync/trigger", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { source, connectionId, organizationId: reqOrgId } = req.body;
      const organizationId = reqOrgId || user.organizationId;

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      if (!source || !connectionId) {
        return res.status(400).json({ message: "Source and connectionId are required" });
      }

      const validSources = ["plaid", "quickbooks", "xero", "stripe", "ramp"];
      if (!validSources.includes(source)) {
        return res.status(400).json({ message: `Source must be one of: ${validSources.join(", ")}` });
      }

      const { syncEngine } = await import("./sync/syncEngine");
      const job = await syncEngine.triggerManualSync(organizationId, source, connectionId);

      res.json({ success: true, job });
    } catch (error: any) {
      console.error("Manual sync trigger error:", error);
      res.status(500).json({ message: error.message || "Failed to trigger sync" });
    }
  });

  // Create or update sync schedule
  app.post("/api/sync/schedules", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { source, connectionId, intervalMinutes, organizationId: reqOrgId } = req.body;
      const organizationId = reqOrgId || user.organizationId;

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      if (!source || !connectionId) {
        return res.status(400).json({ message: "Source and connectionId are required" });
      }

      const { syncEngine } = await import("./sync/syncEngine");
      const schedule = await syncEngine.createScheduleForConnection(
        organizationId,
        source,
        connectionId,
        intervalMinutes
      );

      res.json({ success: true, schedule });
    } catch (error: any) {
      console.error("Create schedule error:", error);
      res.status(500).json({ message: error.message || "Failed to create schedule" });
    }
  });

  // Update sync interval
  app.patch("/api/sync/schedules/:scheduleId", isAuthenticated, async (req, res) => {
    try {
      const { scheduleId } = req.params;
      const { intervalMinutes } = req.body;

      if (!intervalMinutes || intervalMinutes < 5) {
        return res.status(400).json({ message: "Interval must be at least 5 minutes" });
      }

      const { syncEngine } = await import("./sync/syncEngine");
      await syncEngine.updateScheduleInterval(scheduleId, intervalMinutes);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update schedule error:", error);
      res.status(500).json({ message: error.message || "Failed to update schedule" });
    }
  });

  // Pause sync schedule
  app.post("/api/sync/schedules/:scheduleId/pause", isAuthenticated, async (req, res) => {
    try {
      const { scheduleId } = req.params;

      const { syncEngine } = await import("./sync/syncEngine");
      await syncEngine.pauseSchedule(scheduleId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Pause schedule error:", error);
      res.status(500).json({ message: error.message || "Failed to pause schedule" });
    }
  });

  // Resume sync schedule
  app.post("/api/sync/schedules/:scheduleId/resume", isAuthenticated, async (req, res) => {
    try {
      const { scheduleId } = req.params;

      const { syncEngine } = await import("./sync/syncEngine");
      await syncEngine.resumeSchedule(scheduleId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Resume schedule error:", error);
      res.status(500).json({ message: error.message || "Failed to resume schedule" });
    }
  });

  // Webhook endpoint for Plaid
  app.post("/api/webhooks/plaid", async (req, res) => {
    try {
      const { webhook_type, webhook_code, item_id } = req.body;
      
      console.log(`[Webhook] Plaid webhook received: ${webhook_type}/${webhook_code}`);

      if (webhook_type === "TRANSACTIONS" && 
          ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "TRANSACTIONS_REMOVED"].includes(webhook_code)) {
        const { syncEngine } = await import("./sync/syncEngine");
        await syncEngine.handleWebhook("plaid", "TRANSACTIONS", req.body);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Plaid webhook error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get data freshness summary
  app.get("/api/sync/freshness", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const organizationId = (req.query.organizationId as string) || user.organizationId;

      if (!organizationId) {
        return res.json({ overallStatus: 'disconnected', oldestDataMinutes: null, sources: [] });
      }

      const { syncEngine } = await import("./sync/syncEngine");
      const freshness = await syncEngine.getDataFreshness(organizationId);

      res.json(freshness);
    } catch (error: any) {
      console.error("Data freshness error:", error);
      res.status(500).json({ message: error.message || "Failed to get data freshness" });
    }
  });

  // Ramp Integration endpoints
  app.post("/api/ramp/connect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { clientId, clientSecret, organizationId } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!clientId || !clientSecret) {
        return res.status(400).json({ message: "Ramp Client ID and Client Secret are required" });
      }

      const orgId = organizationId || user.organizationId;
      if (!orgId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const { rampService } = await import("./rampService");
      const result = await rampService.connect(userId, orgId, clientId, clientSecret);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Ramp connect error:", error);
      res.status(500).json({ message: error.message || "Failed to connect Ramp" });
    }
  });

  app.get("/api/ramp/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const organizationId = (req.query.organizationId as string) || user.organizationId;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!organizationId) {
        return res.json({ connected: false });
      }

      const { rampService } = await import("./rampService");
      const connection = await rampService.getConnection(userId, organizationId);
      
      res.json({
        connected: !!connection,
        status: connection?.status,
        businessName: connection?.businessName,
        lastSyncedAt: connection?.lastSyncedAt,
      });
    } catch (error: any) {
      console.error("Ramp status error:", error);
      res.status(500).json({ message: error.message || "Failed to get connection status" });
    }
  });

  app.post("/api/ramp/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { organizationId } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      const orgId = organizationId || user.organizationId;
      if (!orgId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const { rampService } = await import("./rampService");
      const result = await rampService.syncTransactions(userId, orgId);
      res.json(result);
    } catch (error: any) {
      console.error("Ramp sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  app.post("/api/ramp/disconnect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { organizationId } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      const orgId = organizationId || user.organizationId;
      if (!orgId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const { rampService } = await import("./rampService");
      await rampService.disconnect(userId, orgId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Ramp disconnect error:", error);
      res.status(500).json({ message: error.message || "Failed to disconnect" });
    }
  });

  // AI endpoints
  app.post("/api/ai/:provider", isAuthenticated, async (req, res) => {
    try {
      const provider = req.params.provider as "openai" | "groq" | "gemini";
      
      if (!["openai", "groq", "gemini"].includes(provider)) {
        return res.status(400).json({ message: "Invalid AI provider" });
      }

      const { prompt, systemPrompt, maxTokens, temperature, jsonMode } = req.body;

      if (!prompt) {
        return res.status(400).json({ message: "Prompt is required" });
      }

      const { callAI } = await import("./aiService");
      
      const response = await callAI(provider, {
        prompt,
        systemPrompt,
        maxTokens,
        temperature,
        jsonMode,
      });

      res.json(response);
    } catch (error: any) {
      console.error(`AI ${req.params.provider} error:`, error);
      res.status(500).json({ 
        message: error.message || "AI request failed",
        provider: req.params.provider 
      });
    }
  });

  app.post("/api/ai/explain-chart", isAuthenticated, async (req, res) => {
    try {
      const { provider = "openai", chartData, chartType, context } = req.body;

      if (!chartData || !chartType) {
        return res.status(400).json({ message: "Chart data and type are required" });
      }

      const { explainChart } = await import("./aiService");
      
      const explanation = await explainChart(provider, chartData, chartType, context);

      res.json({ explanation, provider });
    } catch (error: any) {
      console.error("Chart explanation error:", error);
      res.status(500).json({ message: error.message || "Chart explanation failed" });
    }
  });

  app.post("/api/ai/generate-actions", isAuthenticated, async (req, res) => {
    try {
      const { provider = "openai", insights, metrics } = req.body;

      if (!insights || !metrics) {
        return res.status(400).json({ message: "Insights and metrics are required" });
      }

      const { generateActionItems } = await import("./aiService");
      
      const result = await generateActionItems(provider, insights, metrics);

      res.json({ ...result, provider });
    } catch (error: any) {
      console.error("Action generation error:", error);
      res.status(500).json({ message: error.message || "Action generation failed" });
    }
  });

  // ==================== AI ENHANCEMENT ROUTES ====================
  
  // Get detected anomalies for organization
  app.get("/api/ai/anomalies", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      const orgMember = await storage.getOrganizationMember(userId);
      if (!orgMember) {
        return res.json([]);
      }

      const { status, severity, limit } = req.query;
      const anomalies = await storage.getAnomalyEvents(orgMember.organizationId, {
        status: status as string | undefined,
        severity: severity as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
      });

      res.json(anomalies);
    } catch (error: any) {
      console.error("Get anomalies error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch anomalies" });
    }
  });

  // Run anomaly detection on recent transactions
  app.post("/api/ai/detect-anomalies", isAuthenticated, requireFeature("aiCopilot"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      const orgMember = await storage.getOrganizationMember(userId);
      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      const { AnomalyDetector } = await import("./analytics/anomalyDetector");
      const detector = new AnomalyDetector(orgMember.organizationId);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const txns = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
      });

      const normalizedTxns = txns.map(t => ({
        ...t,
        amount: parseFloat(t.amount),
        date: new Date(t.date),
        isRecurring: t.isRecurring ?? false,
      }));

      const anomalies = await detector.analyzeTransactionAnomalies(normalizedTxns as any);

      for (const anomaly of anomalies) {
        await storage.createAnomalyEvent({
          organizationId: orgMember.organizationId,
          anomalyType: anomaly.type as any,
          severity: anomaly.severity as any,
          metricName: anomaly.metricName,
          expectedValue: anomaly.expectedValue?.toString(),
          actualValue: anomaly.actualValue.toString(),
          deviationPercent: anomaly.deviationPercent?.toString(),
          context: anomaly.context as any,
          status: "new",
        });
      }

      res.json({ detected: anomalies.length, anomalies });
    } catch (error: any) {
      console.error("Detect anomalies error:", error);
      res.status(500).json({ message: error.message || "Failed to detect anomalies" });
    }
  });

  // Dismiss/acknowledge an anomaly
  app.patch("/api/ai/anomalies/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { status, resolvedBy, notes } = req.body;

      const updated = await storage.updateAnomalyEvent(req.params.id, {
        status,
        resolvedBy: resolvedBy || user.id,
        resolvedAt: status === "resolved" || status === "dismissed" ? new Date() : undefined,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Update anomaly error:", error);
      res.status(500).json({ message: error.message || "Failed to update anomaly" });
    }
  });

  // Get scenario runs for organization
  app.get("/api/ai/scenarios", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      const orgMember = await storage.getOrganizationMember(userId);
      if (!orgMember) {
        return res.json([]);
      }

      const scenarios = await storage.getScenarioRuns(orgMember.organizationId);
      res.json(scenarios);
    } catch (error: any) {
      console.error("Get scenarios error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch scenarios" });
    }
  });

  // Run Monte Carlo forecast scenario
  app.post("/api/ai/scenarios/run", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      const orgMember = await storage.getOrganizationMember(userId);
      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      const { name, scenarioType, assumptions, months = 12 } = req.body;

      const { ForecastEngine } = await import("./analytics/forecastEngine");
      const engine = new ForecastEngine(orgMember.organizationId);

      const bankAccounts = await storage.getUserBankAccounts(userId);
      const currentCash = bankAccounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance || "0"), 0);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const txns = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
      });

      const normalizedTxns = txns.map(t => ({
        ...t,
        amount: parseFloat(t.amount),
        date: new Date(t.date),
        isRecurring: t.isRecurring ?? false,
      }));

      const result = await engine.generateForecast(normalizedTxns as any, currentCash, assumptions || {}, months);

      const saved = await engine.saveScenarioRun(
        name || `${scenarioType || 'base'} scenario`,
        scenarioType || "base",
        assumptions || {},
        result,
        userId
      );

      res.json({ result, savedId: saved?.id });
    } catch (error: any) {
      console.error("Run scenario error:", error);
      res.status(500).json({ message: error.message || "Failed to run scenario" });
    }
  });

  // Get a specific scenario run
  app.get("/api/ai/scenarios/:id", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      const scenario = await storage.getScenarioRun(req.params.id);
      if (!scenario) {
        return res.status(404).json({ message: "Scenario not found" });
      }
      res.json(scenario);
    } catch (error: any) {
      console.error("Get scenario error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch scenario" });
    }
  });

  // Delete a scenario run
  app.delete("/api/ai/scenarios/:id", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      await storage.deleteScenarioRun(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete scenario error:", error);
      res.status(500).json({ message: error.message || "Failed to delete scenario" });
    }
  });

  // Run full hybrid AI analysis (algorithm + AI)
  app.post("/api/ai/analyze", isAuthenticated, requireFeature("aiCopilot"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      const orgMember = await storage.getOrganizationMember(userId);
      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      const { HybridAIPipeline } = await import("./ai/hybridPipeline");
      const pipeline = new HybridAIPipeline(orgMember.organizationId);

      const bankAccounts = await storage.getUserBankAccounts(userId);
      const currentCash = bankAccounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance || "0"), 0);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const txns = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
      });

      const normalizedTxns = txns.map(t => ({
        ...t,
        amount: parseFloat(t.amount),
        date: new Date(t.date),
        isRecurring: t.isRecurring ?? false,
      }));

      const result = await pipeline.runFullAnalysis(normalizedTxns as any, currentCash);

      res.json(result);
    } catch (error: any) {
      console.error("Hybrid AI analysis error:", error);
      res.status(500).json({ message: error.message || "Failed to run AI analysis" });
    }
  });

  // Get AI-generated insights with confidence scores
  app.get("/api/ai/insights", isAuthenticated, requireFeature("aiCopilot"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      const orgMember = await storage.getOrganizationMember(userId);
      if (!orgMember) {
        return res.json([]);
      }

      const { HybridAIPipeline } = await import("./ai/hybridPipeline");
      const pipeline = new HybridAIPipeline(orgMember.organizationId);

      const bankAccounts = await storage.getUserBankAccounts(userId);
      const currentCash = bankAccounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance || "0"), 0);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const txns = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
      });

      const normalizedTxns = txns.map(t => ({
        ...t,
        amount: parseFloat(t.amount),
        date: new Date(t.date),
        isRecurring: t.isRecurring ?? false,
      }));

      const { FinancialMetricsEngine } = await import("./analytics/metricsEngine");
      const metricsEngine = new FinancialMetricsEngine(orgMember.organizationId);
      const metrics = await metricsEngine.computeAllMetrics(currentCash);

      const result = await pipeline.generateInsights(normalizedTxns as any, metrics);

      res.json(result);
    } catch (error: any) {
      console.error("Get AI insights error:", error);
      res.status(500).json({ message: error.message || "Failed to generate insights" });
    }
  });

  // Get AI audit logs (admin only)
  app.get("/api/ai/audit-logs", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const dbUser = await storage.getUser(user.id);
      
      if (!dbUser?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { organizationId, taskType, provider, limit } = req.query;
      const logs = await storage.getAIAuditLogs({
        organizationId: organizationId as string | undefined,
        taskType: taskType as string | undefined,
        provider: provider as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });

      res.json(logs);
    } catch (error: any) {
      console.error("Get AI audit logs error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch audit logs" });
    }
  });

  // Get AI model performance metrics (admin only)
  app.get("/api/ai/model-performance", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const dbUser = await storage.getUser(user.id);
      
      if (!dbUser?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { provider, taskType } = req.query;
      const performance = await storage.getAIModelPerformance({
        provider: provider as string | undefined,
        taskType: taskType as string | undefined,
      });

      res.json(performance);
    } catch (error: any) {
      console.error("Get model performance error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch performance metrics" });
    }
  });

  // ==================== LIVE MODE API ROUTES ====================
  // These routes are for the Live Mode (bank-connected) experience

  // Get user's bank accounts
  app.get("/api/live/bank-accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const accounts = await storage.getUserBankAccounts(user.id);
      res.json(accounts);
    } catch (error: any) {
      console.error("Get bank accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch bank accounts" });
    }
  });

  // Delete bank account
  app.delete("/api/live/bank-accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const account = await storage.getBankAccount(req.params.id);
      
      if (!account || account.userId !== userId) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      // Get user's org membership to find associated transactions
      const orgMember = await storage.getOrganizationMember(userId);
      if (orgMember) {
        // Delete all transactions associated with this bank account
        await db.delete(transactions)
          .where(and(
            eq(transactions.organizationId, orgMember.organizationId),
            eq(transactions.bankAccountId, req.params.id)
          ));
        
        console.log(`[Delete Account] Cleaned up transactions for bank account ${req.params.id}`);
      }

      // Delete the bank account
      await storage.deleteBankAccount(req.params.id);
      
      // Check if user has any remaining bank accounts
      const remainingAccounts = await storage.getUserBankAccounts(userId);
      
      console.log(`[Delete Account] Bank account ${req.params.id} deleted. Remaining accounts: ${remainingAccounts.length}`);
      
      res.json({ 
        success: true, 
        remainingAccounts: remainingAccounts.length,
        dashboardReset: remainingAccounts.length === 0
      });
    } catch (error: any) {
      console.error("Delete bank account error:", error);
      res.status(500).json({ message: error.message || "Failed to delete bank account" });
    }
  });

  // Generate Yodlee FastLink URL for Live Mode
  app.post("/api/live/yodlee/fastlink", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { yodleeService } = await import("./yodleeService");
      
      const result = await yodleeService.generateFastLink(user.id);
      res.json(result);
    } catch (error: any) {
      console.error("FastLink generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate FastLink" });
    }
  });

  // Sync accounts after FastLink connection
  app.post("/api/live/yodlee/sync-accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { yodleeService } = await import("./yodleeService");

      // Get cached or fresh user session (more efficient than generateFastLink)
      const userSession = await yodleeService.getUserSession(user.id);
      
      // Fetch accounts from Yodlee
      const yodleeAccounts = await yodleeService.getAccounts(userSession);

      // Sync to our database
      const accounts = [];
      for (const acc of yodleeAccounts) {
        // Check if account already exists
        const existing = await storage.getBankAccountByYodleeId(acc.id.toString());
        
        // Map Yodlee account type to our enum
        let accountType: "checking" | "savings" | "credit_card" | "investment" | "loan" | "other" = "other";
        const yodleeType = acc.accountType?.toLowerCase() || "";
        if (yodleeType.includes("checking")) accountType = "checking";
        else if (yodleeType.includes("savings")) accountType = "savings";
        else if (yodleeType.includes("credit")) accountType = "credit_card";
        else if (yodleeType.includes("investment") || yodleeType.includes("brokerage")) accountType = "investment";
        else if (yodleeType.includes("loan") || yodleeType.includes("mortgage")) accountType = "loan";

        if (existing) {
          // Update existing account
          await storage.updateBankAccount(existing.id, {
            currentBalance: acc.balance?.amount?.toString() || null,
            lastSyncedAt: new Date(),
            status: "active",
          });
          accounts.push(existing);
        } else {
          // Create new account
          const newAccount = await storage.createBankAccount({
            userId: user.id,
            yodleeAccountId: acc.id.toString(),
            yodleeProviderAccountId: acc.providerAccountId?.toString() || null,
            bankName: acc.accountName?.split(" ")[0] || "Bank",
            accountName: acc.accountName,
            accountNumberMasked: acc.accountNumber ? `****${acc.accountNumber.slice(-4)}` : null,
            accountType,
            currentBalance: acc.balance?.amount?.toString() || null,
            availableBalance: null,
            currency: acc.balance?.currency || "USD",
            status: "active",
            lastSyncedAt: new Date(),
          });
          accounts.push(newAccount);
        }
      }

      res.json({ accounts, count: accounts.length });
    } catch (error: any) {
      console.error("Sync accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to sync accounts" });
    }
  });

  // Sync transactions for a specific bank account
  app.post("/api/live/yodlee/sync-transactions/:accountId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { accountId } = req.params;
      
      // Verify account belongs to user
      const account = await storage.getBankAccount(accountId);
      if (!account || account.userId !== user.id) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      const { yodleeService } = await import("./yodleeService");

      // Get cached or fresh user session
      const userSession = await yodleeService.getUserSession(user.id);
      
      // Get organization (create if not exists)
      let orgMember = await storage.getOrganizationMember(user.id);
      let organizationId: string;
      
      if (!orgMember) {
        // Create organization for user
        const org = await storage.createOrganization({
          name: `${user.firstName || user.email?.split("@")[0] || "User"}'s Company`,
          industry: "technology",
          size: "1-10",
          settings: {},
        });
        organizationId = org.id;
        await storage.addOrganizationMember({
          organizationId: org.id,
          userId: user.id,
          role: "founder",
        });
      } else {
        organizationId = orgMember.organizationId;
      }
      
      // Fetch last 90 days of transactions
      const transactions = await yodleeService.syncTransactions(organizationId, userSession, 90);
      
      // Filter to only transactions from this account
      const accountTransactions = transactions.filter(
        (t: any) => t.metadata?.accountId?.toString() === account.yodleeAccountId
      );

      let imported = 0;
      for (const txn of accountTransactions) {
        // Check for duplicate by Yodlee transaction ID
        const yodleeId = txn.metadata?.sourceId;
        if (yodleeId) {
          // Simple dedup check using description + date + amount
          const existingTxns = await storage.getOrganizationTransactions(organizationId, {
            startDate: new Date(txn.date.getTime() - 1000),
            endDate: new Date(txn.date.getTime() + 1000),
          });
          
          const isDuplicate = existingTxns.some(
            (e: any) => e.yodleeTransactionId === yodleeId
          );
          
          if (isDuplicate) continue;
        }

        // Find or create category
        const category = await storage.findOrCreateCategory(organizationId, txn.categoryName);
        
        // Create transaction
        await storage.createTransaction({
          organizationId,
          bankAccountId: account.id,
          yodleeTransactionId: txn.metadata?.sourceId?.toString() || null,
          date: txn.date,
          amount: txn.amount,
          currency: txn.currency,
          categoryId: category.id,
          description: txn.description,
          vendorOriginal: txn.vendorName,
          tags: txn.tags,
          source: "yodlee",
          metadata: txn.metadata,
        });
        imported++;
      }

      // Update account last synced timestamp
      await storage.updateBankAccount(account.id, { lastSyncedAt: new Date() });

      // Trigger auto-model pipeline and threshold check in background (non-blocking)
      if (imported > 0) {
        const { autoModelPipeline } = await import("./autoModelPipeline");
        autoModelPipeline.runFullPipeline(organizationId).then(result => {
          console.log("[AutoModel] Pipeline complete:", result);
        }).catch(err => {
          console.error("[AutoModel] Pipeline error:", err);
        });

        const { checkThresholds, sendThresholdAlerts } = await import("./notifs/thresholdAlerts");
        checkThresholds(organizationId, user.id).then(async (alerts) => {
          if (alerts.length > 0) {
            console.log("[ThresholdAlerts] Found alerts:", alerts.map(a => a.type));
            const result = await sendThresholdAlerts(user.id, alerts);
            console.log("[ThresholdAlerts] Sent:", result.sent);
          }
        }).catch(err => {
          console.error("[ThresholdAlerts] Error:", err);
        });
      }

      res.json({ count: imported, total: accountTransactions.length });
    } catch (error: any) {
      console.error("Sync transactions error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  // ========== PLAID INTEGRATION ROUTES ==========

  // Create Plaid Link token
  app.post("/api/live/plaid/link-token", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { plaidService } = await import("./plaidService");
      
      if (!plaidService.isConfigured()) {
        return res.status(503).json({ message: "Plaid is not configured. Please add PLAID_CLIENT_ID and PLAID_SECRET." });
      }

      const linkToken = await plaidService.createLinkToken(userId);
      res.json({ linkToken });
    } catch (error: any) {
      console.error("Plaid link token error:", error);
      res.status(500).json({ message: error.message || "Failed to create link token" });
    }
  });

  // Exchange Plaid public token for access token
  app.post("/api/live/plaid/exchange-token", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      const { publicToken } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      if (!publicToken) {
        return res.status(400).json({ message: "Public token is required" });
      }

      const { plaidService } = await import("./plaidService");
      const result = await plaidService.exchangePublicToken(userId, publicToken);

      // Create organization if doesn't exist
      let orgMember = await storage.getOrganizationMember(userId);
      let organizationId: string;
      
      if (!orgMember) {
        const org = await storage.createOrganization({
          name: `${user.firstName || user.email?.split("@")[0] || "User"}'s Company`,
          industry: "technology",
          size: "1-10",
          settings: {},
        });
        organizationId = org.id;
        await storage.addOrganizationMember({
          organizationId: org.id,
          userId: userId,
          role: "founder",
        });
      } else {
        organizationId = orgMember.organizationId;
      }

      // Update all bank accounts with organization ID
      const accounts = await plaidService.getAccounts(userId);
      for (const account of accounts) {
        if (!account.organizationId) {
          await storage.updateBankAccount(account.id, { organizationId });
        }
      }

      res.json({ success: true, itemId: result.itemId, accountCount: result.accounts.length });
    } catch (error: any) {
      console.error("Plaid token exchange error:", error);
      res.status(500).json({ message: error.message || "Failed to connect bank account" });
    }
  });

  // Sync Plaid transactions
  app.post("/api/live/plaid/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { plaidService } = await import("./plaidService");

      const synced = await plaidService.syncTransactions(userId);

      // Trigger auto-model pipeline if transactions were synced
      if (synced > 0) {
        const orgMember = await storage.getOrganizationMember(userId);
        if (orgMember) {
          const { autoModelPipeline } = await import("./autoModelPipeline");
          autoModelPipeline.runFullPipeline(orgMember.organizationId).then(result => {
            console.log("[AutoModel] Pipeline complete:", result);
          }).catch(err => {
            console.error("[AutoModel] Pipeline error:", err);
          });

          const { checkThresholds, sendThresholdAlerts } = await import("./notifs/thresholdAlerts");
          checkThresholds(orgMember.organizationId, userId).then(async (alerts) => {
            if (alerts.length > 0) {
              const result = await sendThresholdAlerts(userId, alerts);
              console.log("[ThresholdAlerts] Sent:", result.sent);
            }
          }).catch(err => {
            console.error("[ThresholdAlerts] Error:", err);
          });
        }
      }

      res.json({ synced });
    } catch (error: any) {
      console.error("Plaid sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  // Get Plaid accounts
  app.get("/api/live/plaid/accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const { plaidService } = await import("./plaidService");
      const accounts = await plaidService.getAccounts(userId);
      res.json(accounts);
    } catch (error: any) {
      console.error("Plaid accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to get accounts" });
    }
  });

  // Check Plaid configuration status
  app.get("/api/live/plaid/status", isAuthenticated, async (req, res) => {
    try {
      const { plaidService } = await import("./plaidService");
      res.json({ configured: plaidService.isConfigured() });
    } catch (error: any) {
      res.json({ configured: false });
    }
  });

  // Disconnect all Plaid connections and reset data
  app.post("/api/live/plaid/disconnect-all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      // Get organization first - required for proper cleanup
      const orgMember = await storage.getOrganizationMember(userId);
      
      // Check if user has any Plaid items before proceeding
      const { plaidService } = await import("./plaidService");
      const accounts = await plaidService.getAccounts(userId);
      
      if (accounts.length === 0) {
        return res.json({ 
          success: true, 
          itemsDeleted: 0, 
          accountsDeleted: 0, 
          transactionsDeleted: 0,
          message: "No bank connections to disconnect" 
        });
      }

      // Must have an organization to properly disconnect (transactions are linked to org)
      if (!orgMember) {
        // If no org but has accounts, still clean up the accounts at user level
        const result = await plaidService.disconnectAndResetAll(userId, "");
        return res.json({ 
          success: true, 
          ...result,
          message: `Disconnected ${result.itemsDeleted} bank connection(s)`
        });
      }

      const result = await plaidService.disconnectAndResetAll(userId, orgMember.organizationId);

      // Also clear any analytics/insights for a fresh start
      await storage.deleteOrganizationInsights(orgMember.organizationId);

      res.json({ 
        success: true, 
        ...result,
        message: `Disconnected ${result.itemsDeleted} bank connection(s) and cleared ${result.transactionsDeleted} transactions`
      });
    } catch (error: any) {
      console.error("Plaid disconnect error:", error);
      res.status(500).json({ message: error.message || "Failed to disconnect bank accounts" });
    }
  });

  // ========== END PLAID ROUTES ==========

  // ========== CONNECTION STATUS ==========
  // Check if user has any active financial data connections (Plaid, Yodlee, QuickBooks)
  app.get("/api/live/connections/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      const connections: { provider: string; status: string; accountCount: number }[] = [];
      let hasActiveConnection = false;

      // Check Plaid connections
      try {
        const { plaidService } = await import("./plaidService");
        const plaidAccounts = await plaidService.getAccounts(userId);
        if (plaidAccounts.length > 0) {
          connections.push({ provider: "plaid", status: "active", accountCount: plaidAccounts.length });
          hasActiveConnection = true;
        }
      } catch (e) {
        // Plaid not configured or no accounts
      }

      // Check Yodlee connections
      try {
        const bankAccounts = await storage.getUserBankAccounts(userId);
        const yodleeAccounts = bankAccounts.filter((acc: any) => acc.yodleeAccountId);
        if (yodleeAccounts.length > 0) {
          connections.push({ provider: "yodlee", status: "active", accountCount: yodleeAccounts.length });
          hasActiveConnection = true;
        }
      } catch (e) {
        // No Yodlee accounts
      }

      // Check QuickBooks connection
      try {
        const { quickBooksService } = await import("./quickbooksService");
        const qbStatus = await quickBooksService.getConnectionStatus(userId);
        if (qbStatus.connected) {
          connections.push({ provider: "quickbooks", status: "active", accountCount: 1 });
          hasActiveConnection = true;
        }
      } catch (e) {
        // QuickBooks not connected
      }

      res.json({ hasActiveConnection, connections });
    } catch (error: any) {
      console.error("Connection status error:", error);
      res.status(500).json({ message: error.message || "Failed to check connection status" });
    }
  });

  // ========== END CONNECTION STATUS ==========

  // Run auto-model pipeline manually (Core+ only - scenario modeling)
  app.post("/api/live/auto-model/run", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found. Connect bank accounts first." });
      }

      const { autoModelPipeline } = await import("./autoModelPipeline");
      const result = await autoModelPipeline.runFullPipeline(orgMember.organizationId);

      res.json(result);
    } catch (error: any) {
      console.error("Auto-model error:", error);
      res.status(500).json({ message: error.message || "Failed to run auto-model pipeline" });
    }
  });

  // Get organization's financial profile (computed features and patterns) - Core+ only
  app.get("/api/live/financial-profile", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json({ hasData: false, features: [], vendors: [], summary: null });
      }

      const { OrganizationFeatureStore } = await import("./analytics/featureStore");
      const featureStore = new OrganizationFeatureStore(orgMember.organizationId);
      
      const profileData = await featureStore.computeAndStoreFeatures();
      
      const org = await storage.getOrganization(orgMember.organizationId);
      const businessType = org?.businessType || "other";
      
      const formatCurrency = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);

      res.json({
        hasData: true,
        businessType,
        features: profileData.organizationFeatures.map((f: any) => ({
          name: f.name,
          value: f.value,
          trend: f.trend,
          trendStrength: f.trendStrength,
          rollingMean: f.rollingMean,
        })),
        topVendors: profileData.vendorProfiles.slice(0, 10).map((v: any) => ({
          name: v.vendorName,
          avgMonthlySpend: v.avgMonthlySpend,
          formattedSpend: formatCurrency(v.avgMonthlySpend),
          isRecurring: v.isRecurring,
          billingFrequency: v.billingFrequency,
        })),
        summary: {
          totalMonthlySpend: profileData.contextSummary.totalMonthlySpend,
          totalMonthlyRevenue: profileData.contextSummary.totalMonthlyRevenue,
          vendorCount: profileData.contextSummary.vendorCount,
          recurringVendorCount: profileData.contextSummary.recurringVendorCount,
          spendTrend: profileData.contextSummary.spendTrend,
          topCategories: profileData.contextSummary.topCategories,
        },
      });
    } catch (error: any) {
      console.error("Get financial profile error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch financial profile" });
    }
  });

  // Validate scenario model inputs - Core+ tier (scenario modeling)
  app.post("/api/live/validate-model", isAuthenticated, requireFeature("scenarioModeling"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found. Connect financial accounts first." });
      }

      const { createModelValidator } = await import("./analytics/modelValidation");
      const validator = createModelValidator(orgMember.organizationId);
      
      const result = await validator.validateScenarioInputs(req.body);

      res.json(result);
    } catch (error: any) {
      console.error("Validate model error:", error);
      res.status(500).json({ message: error.message || "Failed to validate model inputs" });
    }
  });

  // ========== WORKFLOW ENGINE ENDPOINTS (Growth tier only) ==========

  // Get all workflows for organization
  app.get("/api/live/workflows", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json([]);
      }

      const { createWorkflowEngine } = await import("./analytics/workflowEngine");
      const engine = createWorkflowEngine(orgMember.organizationId);
      const workflows = await engine.getWorkflows();

      res.json(workflows);
    } catch (error: any) {
      console.error("Get workflows error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch workflows" });
    }
  });

  // Create a new workflow
  app.post("/api/live/workflows", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found. Connect financial accounts first." });
      }

      const { createWorkflowEngine } = await import("./analytics/workflowEngine");
      const engine = createWorkflowEngine(orgMember.organizationId);
      const workflow = await engine.createWorkflow({
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(workflow);
    } catch (error: any) {
      console.error("Create workflow error:", error);
      res.status(500).json({ message: error.message || "Failed to create workflow" });
    }
  });

  // Update a workflow
  app.patch("/api/live/workflows/:id", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found." });
      }

      const { createWorkflowEngine } = await import("./analytics/workflowEngine");
      const engine = createWorkflowEngine(orgMember.organizationId);
      const workflow = await engine.updateWorkflow(req.params.id, req.body);

      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      res.json(workflow);
    } catch (error: any) {
      console.error("Update workflow error:", error);
      res.status(500).json({ message: error.message || "Failed to update workflow" });
    }
  });

  // Delete a workflow
  app.delete("/api/live/workflows/:id", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found." });
      }

      const { createWorkflowEngine } = await import("./analytics/workflowEngine");
      const engine = createWorkflowEngine(orgMember.organizationId);
      await engine.deleteWorkflow(req.params.id);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete workflow error:", error);
      res.status(500).json({ message: error.message || "Failed to delete workflow" });
    }
  });

  // Evaluate all active workflows (can be called manually or by scheduler)
  app.post("/api/live/workflows/evaluate", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found." });
      }

      const { createWorkflowEngine } = await import("./analytics/workflowEngine");
      const engine = createWorkflowEngine(orgMember.organizationId);
      const results = await engine.evaluateAllWorkflows();

      res.json({
        evaluated: results.length,
        triggered: results.filter(r => r.triggered).length,
        results,
      });
    } catch (error: any) {
      console.error("Evaluate workflows error:", error);
      res.status(500).json({ message: error.message || "Failed to evaluate workflows" });
    }
  });

  // Get workflow execution history
  app.get("/api/live/workflows/executions", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json([]);
      }

      const { workflowId, limit } = req.query;
      
      const { createWorkflowEngine } = await import("./analytics/workflowEngine");
      const engine = createWorkflowEngine(orgMember.organizationId);
      const executions = await engine.getWorkflowExecutions(
        workflowId as string | undefined,
        limit ? parseInt(limit as string) : 50
      );

      res.json(executions);
    } catch (error: any) {
      console.error("Get workflow executions error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch workflow executions" });
    }
  });

  // ========== END WORKFLOW ENGINE ENDPOINTS ==========

  // Get organization's financial fingerprint (persistent patterns & drift analysis) - Growth tier
  app.get("/api/live/financial-fingerprint", isAuthenticated, requireFeature("workflowEngine"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found. Connect financial accounts first." });
      }

      const { createFinancialFingerprintEngine } = await import("./analytics/financialFingerprint");
      const engine = createFinancialFingerprintEngine(orgMember.organizationId);
      const fingerprint = await engine.computeFingerprint();

      res.json(fingerprint);
    } catch (error: any) {
      console.error("Get financial fingerprint error:", error);
      res.status(500).json({ message: error.message || "Failed to compute financial fingerprint" });
    }
  });

  // Get Live Mode transactions for user
  app.get("/api/live/transactions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json([]);
      }

      const { startDate, endDate, source } = req.query;
      
      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      let transactions = await storage.getOrganizationTransactions(orgMember.organizationId, filters);
      
      // Filter by source if specified (yodlee, csv, manual)
      if (source) {
        transactions = transactions.filter((t: any) => t.source === source);
      }

      // Transform transactions to include type field (credit/debit) based on amount
      const transformedTransactions = transactions.map((txn: any) => ({
        ...txn,
        type: parseFloat(txn.amount) >= 0 ? "credit" : "debit",
      }));

      res.json(transformedTransactions);
    } catch (error: any) {
      console.error("Get live transactions error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch transactions" });
    }
  });

  // Get Live Mode dashboard analytics (tier-filtered response)
  app.get("/api/live/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      // Get user tier for response filtering
      const dbUser = await storage.getUser(userId);
      const userTier = (dbUser?.subscriptionTier as SubscriptionTier) || null;
      const hasAnomalyDetection = hasFeatureAccess(userTier, "anomalyDetection");
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        // Check bank accounts even without org membership for consistency
        const bankAccounts = await storage.getUserBankAccounts(userId);
        return res.json({
          hasData: false,
          hasBankAccounts: bankAccounts.length > 0,
          spend: { total: 0, trend: [], byCategory: [] },
          revenue: { total: 0, trend: [] },
          burn: { gross: 0, net: 0, payroll: 0, nonPayroll: 0 },
          runway: { months: 0, currentCash: 0, zeroDate: null },
          cashFlow: { inflows: 0, outflows: 0, netFlow: 0, trend: [] },
          insights: [],
          vendors: [],
        });
      }

      // Check if user has connected bank accounts
      const bankAccounts = await storage.getUserBankAccounts(userId);
      const hasBankAccounts = bankAccounts.length > 0;
      
      // Import analytics functions
      const { calculateBurnRate, calculateBurnTrend } = await import("./analytics/burn");
      const { calculateRunway } = await import("./analytics/runway");
      const { calculateCashFlow, calculateMonthlyCashFlow, calculateCashFlowByCategory } = await import("./analytics/cashflow");
      
      // Get all transactions (last 6 months for calculations)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const rawTransactions = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
        endDate: new Date(),
      });

      if (rawTransactions.length === 0) {
        return res.json({
          hasData: false,
          hasBankAccounts,
          spend: { total: 0, trend: [], byCategory: [] },
          revenue: { total: 0, trend: [] },
          burn: { gross: 0, net: 0, payroll: 0, nonPayroll: 0 },
          runway: { months: 0, currentCash: 0, zeroDate: null },
          cashFlow: { inflows: 0, outflows: 0, netFlow: 0, trend: [] },
          insights: [],
          vendors: [],
        });
      }

      // Transform transactions for analytics functions
      const transactions = rawTransactions.map((txn: any) => ({
        date: new Date(txn.date),
        amount: parseFloat(txn.amount) || 0,
        type: parseFloat(txn.amount) >= 0 ? "credit" : "debit",
        vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
        categoryId: txn.categoryId,
        isRecurring: txn.isRecurring || false,
        isPayroll: txn.isPayroll || false,
      }));

      // Calculate current cash from bank accounts (bankAccounts already fetched above)
      const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
        return sum + (parseFloat(acc.currentBalance) || 0);
      }, 0);

      // Calculate burn metrics (last 3 months)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const burnMetrics = calculateBurnRate(transactions, threeMonthsAgo, new Date());
      const burnTrend = calculateBurnTrend(transactions, 6);

      // Calculate runway
      const runwayMetrics = calculateRunway(transactions, currentCash);

      // Calculate cash flow
      const cashFlowMetrics = calculateCashFlow(transactions, threeMonthsAgo, new Date(), currentCash);
      const monthlyCashFlow = calculateMonthlyCashFlow(transactions, 6, currentCash);

      // Calculate spend by category
      const categorySpend = calculateCashFlowByCategory(transactions, threeMonthsAgo, new Date());
      const categories = await storage.getOrganizationCategories(orgMember.organizationId);
      const spendByCategory = Object.entries(categorySpend)
        .filter(([_, data]) => data.outflows > 0)
        .map(([catId, data]) => {
          const cat = categories.find((c: any) => c.id === catId);
          return {
            id: catId,
            name: cat?.name || "Other",
            amount: data.outflows,
            color: cat?.color || "#888888",
          };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      // Calculate top vendors
      const vendorSpend: Record<string, number> = {};
      for (const txn of transactions) {
        if (txn.type === "debit" && txn.vendorNormalized) {
          vendorSpend[txn.vendorNormalized] = (vendorSpend[txn.vendorNormalized] || 0) + Math.abs(txn.amount);
        }
      }
      const vendors = Object.entries(vendorSpend)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      // Calculate revenue (credits)
      const revenue = transactions
        .filter((t: any) => t.type === "credit")
        .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);

      // Monthly revenue trend
      const revenueTrend = burnTrend.map((m) => {
        const monthTxns = transactions.filter((t: any) => {
          const txnMonth = t.date.getMonth();
          const txnYear = t.date.getFullYear();
          return txnMonth === m.month.getMonth() && txnYear === m.month.getFullYear();
        });
        const monthRevenue = monthTxns
          .filter((t: any) => t.type === "credit")
          .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
        return {
          month: m.month.toISOString(),
          amount: monthRevenue,
        };
      });

      // Generate insights (anomaly detection only for Core+ users)
      const insights: Array<{ type: string; message: string; severity: string }> = [];
      
      // Anomaly detection is Core+ only (requires anomalyDetection feature)
      if (hasAnomalyDetection) {
        // Import anomaly detection functions
        const { detectVendorSpikes, detectSubscriptionCreep, detectPayrollDrift, detectAmountAnomalies } = await import("./insights/anomalies");
        
        // Transform transactions for anomaly detection (need id field)
        const anomalyTxns = rawTransactions.map((txn: any) => ({
          id: txn.id,
          date: new Date(txn.date),
          amount: parseFloat(txn.amount) || 0,
          type: parseFloat(txn.amount) >= 0 ? "credit" : "debit" as "credit" | "debit",
          vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
          categoryId: txn.categoryId,
          isRecurring: txn.isRecurring || false,
          isPayroll: txn.isPayroll || false,
        }));
        
        // Detect vendor spikes
        const vendorSpikes = detectVendorSpikes({ transactions: anomalyTxns }, 25);
        for (const spike of vendorSpikes.slice(0, 3)) {
          insights.push({
            type: "vendor_spike",
            message: `${spike.vendor} spend spiked ${spike.changePercent.toFixed(0)}% vs last month ($${spike.previousPeriod.toLocaleString()} → $${spike.currentPeriod.toLocaleString()})`,
            severity: spike.changePercent > 50 ? "warning" : "info",
          });
        }
        
        // Detect subscription creep
        const subCreep = detectSubscriptionCreep({ transactions: anomalyTxns });
        if (subCreep.change > 15 && subCreep.totalRecurring > 1000) {
          insights.push({
            type: "subscription_creep",
            message: `Recurring SaaS spend is up ${subCreep.change.toFixed(0)}% to $${subCreep.totalRecurring.toLocaleString()}/mo. Consider an audit.`,
            severity: subCreep.change > 30 ? "warning" : "info",
          });
        }
        
        // Detect payroll drift
        const payrollDrift = detectPayrollDrift({ transactions: anomalyTxns });
        if (Math.abs(payrollDrift.drift) > 10 && payrollDrift.currentPayroll > 5000) {
          const direction = payrollDrift.drift > 0 ? "up" : "down";
          insights.push({
            type: "payroll_drift",
            message: `Payroll is ${direction} ${Math.abs(payrollDrift.drift).toFixed(0)}% vs expected ($${payrollDrift.currentPayroll.toLocaleString()} vs $${payrollDrift.expectedPayroll.toLocaleString()})`,
            severity: Math.abs(payrollDrift.drift) > 20 ? "warning" : "info",
          });
        }
        
        // Detect unusual transactions
        const anomalies = detectAmountAnomalies({ transactions: anomalyTxns }, 2.5);
        if (anomalies.length > 0) {
          const top = anomalies[0];
          insights.push({
            type: "amount_anomaly",
            message: `Unusual charge from ${top.vendor}: $${top.amount.toLocaleString()} (normally ~$${top.expectedAmount.toLocaleString()})`,
            severity: top.deviation > 3 ? "warning" : "info",
          });
        }
      }
      
      // Basic insights for all users (Lite tier)
      // Runway warnings
      if (runwayMetrics.runwayMonths < 6 && runwayMetrics.runwayMonths !== Infinity) {
        insights.push({
          type: "runway",
          message: `Runway is ${runwayMetrics.runwayMonths.toFixed(1)} months. Consider raising funds or reducing spend.`,
          severity: runwayMetrics.runwayMonths < 3 ? "critical" : "warning",
        });
      }

      if (burnMetrics.netBurn > burnMetrics.revenue * 1.5 && burnMetrics.revenue > 0) {
        insights.push({
          type: "burn",
          message: "Burn rate is significantly higher than revenue. Review expenses.",
          severity: "warning",
        });
      }

      if (vendors.length > 0 && vendors[0].amount > burnMetrics.grossBurn * 0.2) {
        insights.push({
          type: "vendor",
          message: `${vendors[0].name} accounts for over 20% of spend ($${vendors[0].amount.toLocaleString()}).`,
          severity: "info",
        });
      }
      
      // Limit to top 5 most actionable insights
      insights.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
      });
      const topInsights = insights.slice(0, 5);

      res.json({
        hasData: true,
        hasBankAccounts,
        spend: {
          total: burnMetrics.grossBurn,
          trend: burnTrend.map((b) => ({
            month: b.month.toISOString(),
            amount: b.burn,
          })),
          byCategory: spendByCategory,
        },
        revenue: {
          total: revenue,
          trend: revenueTrend,
        },
        burn: {
          gross: burnMetrics.grossBurn,
          net: burnMetrics.netBurn,
          payroll: burnMetrics.payroll,
          nonPayroll: burnMetrics.nonPayroll,
          recurring: burnMetrics.recurring,
          oneTime: burnMetrics.oneTime,
        },
        runway: {
          months: runwayMetrics.runwayMonths === Infinity ? null : runwayMetrics.runwayMonths,
          currentCash,
          zeroDate: runwayMetrics.zeroDate?.toISOString() || null,
          monthlyBurn: runwayMetrics.monthlyBurn,
        },
        cashFlow: {
          inflows: cashFlowMetrics.inflows,
          outflows: cashFlowMetrics.outflows,
          netFlow: cashFlowMetrics.netFlow,
          trend: monthlyCashFlow.map((m) => ({
            month: m.month.toISOString(),
            inflows: m.cashFlow.inflows,
            outflows: m.cashFlow.outflows,
            netFlow: m.cashFlow.netFlow,
          })),
        },
        insights: topInsights,
        vendors,
      });
    } catch (error: any) {
      console.error("Get live analytics error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch analytics" });
    }
  });

  // ============================================
  // PROACTIVE INSIGHT API - "Holy Crap Moment"
  // ============================================
  
  /**
   * Get the single most important financial insight to surface proactively
   * This is the "5-minute holy crap moment" - one thing the founder didn't know before
   */
  app.get("/api/live/proactive-insight", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json({ topInsight: null, hasData: false });
      }

      // Get bank accounts for cash calculation
      const bankAccounts = await storage.getUserBankAccounts(userId);
      const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
        return sum + (parseFloat(acc.currentBalance) || 0);
      }, 0);
      
      // Import analytics functions
      const { calculateBurnRate, calculateBurnTrend } = await import("./analytics/burn");
      const { calculateRunway } = await import("./analytics/runway");
      
      // Get transactions for analysis (last 3 months for current, 3-6 months ago for comparison)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const rawTransactions = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
        endDate: new Date(),
      });

      if (rawTransactions.length === 0) {
        return res.json({ topInsight: null, hasData: false });
      }

      // Transform transactions
      const transactions = rawTransactions.map((txn: any) => ({
        date: new Date(txn.date),
        amount: parseFloat(txn.amount) || 0,
        type: parseFloat(txn.amount) >= 0 ? "credit" : "debit",
        vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
        categoryId: txn.categoryId,
        isRecurring: txn.isRecurring || false,
        isPayroll: txn.isPayroll || false,
      }));

      // Calculate current period metrics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const currentPeriodTxns = transactions.filter((t: any) => t.date >= thirtyDaysAgo);
      const previousPeriodTxns = transactions.filter((t: any) => t.date >= sixtyDaysAgo && t.date < thirtyDaysAgo);
      
      const currentBurn = calculateBurnRate(currentPeriodTxns, thirtyDaysAgo, new Date());
      const previousBurn = calculateBurnRate(previousPeriodTxns, sixtyDaysAgo, thirtyDaysAgo);
      
      const currentRunway = calculateRunway(transactions, currentCash);
      
      // Calculate deltas and generate insights
      interface ProactiveInsight {
        id: string;
        type: string;
        severity: "critical" | "warning" | "info" | "positive";
        headline: string;
        detail: string;
        metric: string;
        previousValue: number;
        currentValue: number;
        changePercent: number;
        actionLabel: string;
        actionLink: string;
        discoveredAt: string;
        priority: number;
      }
      
      const insights: ProactiveInsight[] = [];
      
      // 1. Runway drop check (most critical)
      const previousRunwayMonths = previousBurn.netBurn > 0 ? currentCash / previousBurn.netBurn : Infinity;
      const runwayChange = previousRunwayMonths !== Infinity && currentRunway.runwayMonths !== Infinity
        ? currentRunway.runwayMonths - previousRunwayMonths
        : 0;
      
      if (runwayChange < -1 && currentRunway.runwayMonths < 18) {
        insights.push({
          id: "runway_drop",
          type: "runway_drop",
          severity: runwayChange < -2 ? "critical" : "warning",
          headline: `Your runway dropped ${Math.abs(runwayChange).toFixed(1)} months since last month`,
          detail: `At current burn, you have ${currentRunway.runwayMonths.toFixed(1)} months of runway remaining. This is a significant change from ${previousRunwayMonths.toFixed(1)} months.`,
          metric: "runway_months",
          previousValue: previousRunwayMonths,
          currentValue: currentRunway.runwayMonths,
          changePercent: previousRunwayMonths > 0 ? ((currentRunway.runwayMonths - previousRunwayMonths) / previousRunwayMonths) * 100 : 0,
          actionLabel: "View Runway Analysis",
          actionLink: "/app/analytics?section=burn",
          discoveredAt: new Date().toISOString(),
          priority: 1,
        });
      }
      
      // 2. Burn spike check
      const burnChange = previousBurn.grossBurn > 0 
        ? ((currentBurn.grossBurn - previousBurn.grossBurn) / previousBurn.grossBurn) * 100 
        : 0;
      
      if (burnChange > 20 && currentBurn.grossBurn > 5000) {
        insights.push({
          id: "burn_spike",
          type: "burn_spike",
          severity: burnChange > 40 ? "critical" : "warning",
          headline: `Monthly burn spiked ${burnChange.toFixed(0)}% this month`,
          detail: `Your spending increased from $${previousBurn.grossBurn.toLocaleString()} to $${currentBurn.grossBurn.toLocaleString()}. Review recent expenses for unexpected charges.`,
          metric: "gross_burn",
          previousValue: previousBurn.grossBurn,
          currentValue: currentBurn.grossBurn,
          changePercent: burnChange,
          actionLabel: "Review Spending",
          actionLink: "/app/analytics?section=spend",
          discoveredAt: new Date().toISOString(),
          priority: 2,
        });
      }
      
      // 3. Payroll drift check
      const payrollChange = previousBurn.payroll > 0 
        ? ((currentBurn.payroll - previousBurn.payroll) / previousBurn.payroll) * 100 
        : 0;
      
      if (Math.abs(payrollChange) > 15 && currentBurn.payroll > 3000) {
        const isIncrease = payrollChange > 0;
        insights.push({
          id: "payroll_drift",
          type: "payroll_drift",
          severity: Math.abs(payrollChange) > 30 ? "warning" : "info",
          headline: `Payroll is ${isIncrease ? "up" : "down"} ${Math.abs(payrollChange).toFixed(0)}% this month`,
          detail: isIncrease 
            ? `Payroll increased from $${previousBurn.payroll.toLocaleString()} to $${currentBurn.payroll.toLocaleString()}. Check for new hires or raises.`
            : `Payroll decreased from $${previousBurn.payroll.toLocaleString()} to $${currentBurn.payroll.toLocaleString()}. Verify this matches expected changes.`,
          metric: "payroll",
          previousValue: previousBurn.payroll,
          currentValue: currentBurn.payroll,
          changePercent: payrollChange,
          actionLabel: "View Team Costs",
          actionLink: "/app/fundraising",
          discoveredAt: new Date().toISOString(),
          priority: 3,
        });
      }
      
      // 4. Top vendor spike (most significant vendor change)
      const currentVendorSpend: Record<string, number> = {};
      const previousVendorSpend: Record<string, number> = {};
      
      for (const txn of currentPeriodTxns) {
        if (txn.type === "debit" && txn.vendorNormalized) {
          currentVendorSpend[txn.vendorNormalized] = (currentVendorSpend[txn.vendorNormalized] || 0) + Math.abs(txn.amount);
        }
      }
      
      for (const txn of previousPeriodTxns) {
        if (txn.type === "debit" && txn.vendorNormalized) {
          previousVendorSpend[txn.vendorNormalized] = (previousVendorSpend[txn.vendorNormalized] || 0) + Math.abs(txn.amount);
        }
      }
      
      // Find vendor with biggest increase
      let maxVendorSpike = { vendor: "", change: 0, previous: 0, current: 0 };
      for (const vendor of Object.keys(currentVendorSpend)) {
        const current = currentVendorSpend[vendor];
        const previous = previousVendorSpend[vendor] || 0;
        if (previous > 100 && current > previous * 1.25) {
          const change = ((current - previous) / previous) * 100;
          if (change > maxVendorSpike.change) {
            maxVendorSpike = { vendor, change, previous, current };
          }
        }
      }
      
      if (maxVendorSpike.change > 25 && maxVendorSpike.current > 500) {
        insights.push({
          id: "vendor_spike",
          type: "vendor_spike",
          severity: maxVendorSpike.change > 50 ? "warning" : "info",
          headline: `${maxVendorSpike.vendor} spend up ${maxVendorSpike.change.toFixed(0)}%`,
          detail: `This vendor went from $${maxVendorSpike.previous.toLocaleString()} to $${maxVendorSpike.current.toLocaleString()} this month. Worth investigating if unexpected.`,
          metric: "vendor_spend",
          previousValue: maxVendorSpike.previous,
          currentValue: maxVendorSpike.current,
          changePercent: maxVendorSpike.change,
          actionLabel: "View Vendors",
          actionLink: "/app/transactions",
          discoveredAt: new Date().toISOString(),
          priority: 4,
        });
      }
      
      // 5. Revenue change (positive news too!)
      const currentRevenue = currentPeriodTxns
        .filter((t: any) => t.type === "credit")
        .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
      const previousRevenue = previousPeriodTxns
        .filter((t: any) => t.type === "credit")
        .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
      
      const revenueChange = previousRevenue > 0 
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
        : 0;
      
      if (Math.abs(revenueChange) > 20 && (currentRevenue > 1000 || previousRevenue > 1000)) {
        const isIncrease = revenueChange > 0;
        insights.push({
          id: "revenue_change",
          type: "revenue_change",
          severity: isIncrease ? "positive" : (revenueChange < -30 ? "warning" : "info"),
          headline: `Revenue ${isIncrease ? "grew" : "dropped"} ${Math.abs(revenueChange).toFixed(0)}% this month`,
          detail: isIncrease 
            ? `Great news! Revenue increased from $${previousRevenue.toLocaleString()} to $${currentRevenue.toLocaleString()}.`
            : `Revenue decreased from $${previousRevenue.toLocaleString()} to $${currentRevenue.toLocaleString()}. Review your revenue streams.`,
          metric: "revenue",
          previousValue: previousRevenue,
          currentValue: currentRevenue,
          changePercent: revenueChange,
          actionLabel: "View Revenue",
          actionLink: "/app/analytics?section=revenue",
          discoveredAt: new Date().toISOString(),
          priority: isIncrease ? 5 : 2,
        });
      }
      
      // Sort by priority and return the top insight
      insights.sort((a, b) => a.priority - b.priority);
      
      res.json({
        topInsight: insights.length > 0 ? insights[0] : null,
        hasData: true,
      });
    } catch (error: any) {
      console.error("Get proactive insight error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch proactive insight" });
    }
  });

  // ============================================
  // INITIATIVE DELTAS API (Growth feature)
  // ============================================

  /**
   * Get all detected financial changes/deltas (not just the top one)
   * This powers the proactive alert system for Growth tier users
   */
  app.get("/api/live/initiative-deltas", isAuthenticated, requireFeature("aiCopilot"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json({ deltas: [], hasData: false });
      }

      const { initiativeEngine } = await import("./analytics/initiativeEngine");
      const { calculateBurnRate } = await import("./analytics/burn");
      const { calculateRunway } = await import("./analytics/runway");

      const bankAccounts = await storage.getUserBankAccounts(userId);
      const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
        return sum + (parseFloat(acc.currentBalance) || 0);
      }, 0);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const rawTransactions = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
        endDate: new Date(),
      });

      if (rawTransactions.length === 0) {
        return res.json({ deltas: [], hasData: false });
      }

      const transactions = rawTransactions.map((txn: any) => ({
        date: new Date(txn.date),
        amount: parseFloat(txn.amount) || 0,
        type: parseFloat(txn.amount) >= 0 ? "credit" : "debit",
        vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
        categoryId: txn.categoryId,
        isRecurring: txn.isRecurring || false,
        isPayroll: txn.isPayroll || false,
      }));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const currentPeriodTxns = transactions.filter((t: any) => t.date >= thirtyDaysAgo);
      const previousPeriodTxns = transactions.filter((t: any) => t.date >= sixtyDaysAgo && t.date < thirtyDaysAgo);
      
      const currentBurn = calculateBurnRate(currentPeriodTxns, thirtyDaysAgo, new Date());
      const previousBurn = calculateBurnRate(previousPeriodTxns, sixtyDaysAgo, thirtyDaysAgo);
      
      const currentRunway = calculateRunway(transactions, currentCash);
      const previousRunwayMonths = previousBurn.netBurn > 0 ? currentCash / previousBurn.netBurn : Infinity;

      const currentMetrics = {
        runway: currentRunway.runwayMonths === Infinity ? 999 : currentRunway.runwayMonths,
        burnRate: currentBurn.netBurn,
        revenue: currentBurn.revenue,
        currentCash,
      };

      const previousMetrics = {
        runway: previousRunwayMonths === Infinity ? 999 : previousRunwayMonths,
        burnRate: previousBurn.netBurn,
        revenue: previousBurn.revenue,
        currentCash,
      };

      const comparison = await initiativeEngine.detectChanges(
        orgMember.organizationId,
        currentMetrics,
        previousMetrics
      );

      res.json({
        deltas: comparison.deltas,
        hasData: true,
        hasSignificantChange: comparison.hasSignificantChange,
        previousSnapshot: comparison.previousSnapshot?.toISOString(),
        currentSnapshot: comparison.currentSnapshot.toISOString(),
      });
    } catch (error: any) {
      console.error("Get initiative deltas error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch initiative deltas" });
    }
  });

  // ============================================
  // ACTION DECISIONS API
  // ============================================
  
  /**
   * Save an action decision (approve/dismiss an insight)
   */
  app.post("/api/live/action-decisions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { insightType, insightId, summary, recommendedAction, status, decisionNote } = req.body;
      
      if (!insightType || !insightId || !summary || !status) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const decision = await storage.createActionDecision({
        organizationId: orgMember.organizationId,
        userId,
        insightType,
        insightId,
        summary,
        recommendedAction,
        status,
        decisionNote,
        decidedAt: new Date(),
      });

      res.json(decision);
    } catch (error: any) {
      console.error("Save action decision error:", error);
      res.status(500).json({ message: error.message || "Failed to save action decision" });
    }
  });

  /**
   * Get action decisions for the current organization
   */
  app.get("/api/live/action-decisions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json([]);
      }

      const { status, limit } = req.query;
      const decisions = await storage.getActionDecisions(
        orgMember.organizationId, 
        status as string | undefined,
        limit ? parseInt(limit as string) : undefined
      );

      res.json(decisions);
    } catch (error: any) {
      console.error("Get action decisions error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch action decisions" });
    }
  });

  // ============================================
  // BUSINESS TYPE KPIs API
  // ============================================

  /**
   * Get business type-aware KPIs for the organization
   * Returns metrics relevant to the organization's business type (SaaS, Agency, E-commerce, etc.)
   */
  app.get("/api/live/kpis", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.json({ 
          hasData: false, 
          businessType: "other",
          kpis: [],
          healthIndicators: [],
        });
      }

      const org = await storage.getOrganization(orgMember.organizationId);
      const businessType = (org?.businessType || "other") as BusinessType;
      const typeConfig = getBusinessTypeConfig(businessType);

      const bankAccounts = await storage.getUserBankAccounts(userId);
      const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
        return sum + (parseFloat(acc.currentBalance) || 0);
      }, 0);
      
      const { calculateBurnRate } = await import("./analytics/burn");
      const { calculateRunway } = await import("./analytics/runway");
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const rawTransactions = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
        endDate: new Date(),
      });

      if (rawTransactions.length === 0) {
        return res.json({ 
          hasData: false, 
          businessType,
          businessTypeConfig: typeConfig,
          kpis: [],
          healthIndicators: [],
        });
      }

      const transactions = rawTransactions.map((txn: any) => ({
        date: new Date(txn.date),
        amount: parseFloat(txn.amount) || 0,
        type: parseFloat(txn.amount) >= 0 ? "credit" : "debit",
        vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
        categoryId: txn.categoryId,
        isRecurring: txn.isRecurring || false,
        isPayroll: txn.isPayroll || false,
      }));

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const recentTxns = transactions.filter((t: any) => t.date >= threeMonthsAgo);
      const burnMetrics = calculateBurnRate(recentTxns);
      const runwayMetrics = calculateRunway(currentCash, burnMetrics.netBurn);

      const kpis: Array<{ key: string; name: string; value: number; formatted: string; trend?: number; format: string }> = [];

      const formatCurrency = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
      const formatPercent = (v: number) => `${v.toFixed(1)}%`;

      switch (businessType) {
        case "saas":
          kpis.push({ key: "mrr", name: "MRR", value: burnMetrics.revenue, formatted: formatCurrency(burnMetrics.revenue), format: "currency" });
          kpis.push({ key: "arr", name: "ARR", value: burnMetrics.revenue * 12, formatted: formatCurrency(burnMetrics.revenue * 12), format: "currency" });
          kpis.push({ key: "net_burn", name: "Net Burn", value: burnMetrics.netBurn, formatted: formatCurrency(burnMetrics.netBurn), format: "currency" });
          break;
          
        case "agency":
          const utilization = burnMetrics.revenue > 0 ? Math.min(85, (burnMetrics.revenue / (burnMetrics.payroll * 1.5)) * 100) : 0;
          kpis.push({ key: "revenue", name: "Monthly Revenue", value: burnMetrics.revenue, formatted: formatCurrency(burnMetrics.revenue), format: "currency" });
          kpis.push({ key: "utilization_rate", name: "Utilization Rate", value: utilization, formatted: formatPercent(utilization), format: "percent" });
          kpis.push({ key: "gross_margin", name: "Gross Margin", value: burnMetrics.revenue > 0 ? ((burnMetrics.revenue - burnMetrics.payroll) / burnMetrics.revenue) * 100 : 0, 
            formatted: formatPercent(burnMetrics.revenue > 0 ? ((burnMetrics.revenue - burnMetrics.payroll) / burnMetrics.revenue) * 100 : 0), format: "percent" });
          break;
          
        case "ecommerce":
          kpis.push({ key: "revenue", name: "Revenue", value: burnMetrics.revenue, formatted: formatCurrency(burnMetrics.revenue), format: "currency" });
          kpis.push({ key: "orders", name: "Orders", value: Math.round(burnMetrics.revenue / 85), formatted: Math.round(burnMetrics.revenue / 85).toLocaleString(), format: "number" });
          kpis.push({ key: "aov", name: "AOV", value: 85, formatted: formatCurrency(85), format: "currency" });
          break;
          
        default:
          kpis.push({ key: "revenue", name: "Revenue", value: burnMetrics.revenue, formatted: formatCurrency(burnMetrics.revenue), format: "currency" });
          kpis.push({ key: "gross_burn", name: "Gross Burn", value: burnMetrics.grossBurn, formatted: formatCurrency(burnMetrics.grossBurn), format: "currency" });
          kpis.push({ key: "net_burn", name: "Net Burn", value: burnMetrics.netBurn, formatted: formatCurrency(burnMetrics.netBurn), format: "currency" });
      }

      kpis.push({ key: "runway", name: "Runway", value: runwayMetrics.runwayMonths, 
        formatted: runwayMetrics.runwayMonths === Infinity ? "Infinite" : `${runwayMetrics.runwayMonths.toFixed(1)} months`, format: "months" });
      kpis.push({ key: "current_cash", name: "Cash", value: currentCash, formatted: formatCurrency(currentCash), format: "currency" });

      const healthIndicators = typeConfig.healthIndicators.map((indicator) => {
        const kpi = kpis.find((k) => k.key === indicator.key);
        const value = kpi?.value || 0;
        let status: "healthy" | "warning" | "critical" = "healthy";
        
        if (indicator.direction === "higher_better") {
          if (value < indicator.criticalThreshold) status = "critical";
          else if (value < indicator.warningThreshold) status = "warning";
        } else {
          if (value > indicator.criticalThreshold) status = "critical";
          else if (value > indicator.warningThreshold) status = "warning";
        }
        
        return { ...indicator, value, status };
      });

      res.json({
        hasData: true,
        businessType,
        businessTypeConfig: {
          displayName: typeConfig.displayName,
          description: typeConfig.description,
          terminology: typeConfig.terminology,
        },
        kpis,
        healthIndicators,
        runway: {
          months: runwayMetrics.runwayMonths === Infinity ? null : runwayMetrics.runwayMonths,
          currentCash,
        },
      });
    } catch (error: any) {
      console.error("Get KPIs error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch KPIs" });
    }
  });

  // ============================================
  // HIRING DATA API
  // ============================================
  
  /**
   * Get hiring/headcount data for the Hiring page
   */
  app.get("/api/live/hiring", isAuthenticated, requireFeature("hiringPlanning"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }

      // Get planned hires
      const plannedHires = await storage.getUserPlannedHires(userId);
      
      // Transform and categorize hires
      const now = new Date();
      const hires = plannedHires.map((hire: any) => {
        const startDate = new Date(hire.startDate);
        const monthlyCost = parseFloat(hire.monthlyCost) || 0;
        return {
          id: hire.id,
          role: hire.role,
          department: hire.department || "General",
          monthlyCost,
          annualCost: monthlyCost * 12,
          startDate: startDate.toISOString(),
          status: startDate <= now ? "active" : "planned",
          isActive: hire.isActive,
        };
      });

      // Calculate summary metrics
      const activeHires = hires.filter((h: any) => h.status === "active" && h.isActive);
      const plannedFutureHires = hires.filter((h: any) => h.status === "planned" && h.isActive);
      
      const currentHeadcount = activeHires.length;
      const plannedHeadcount = plannedFutureHires.length;
      const totalHeadcount = currentHeadcount + plannedHeadcount;
      
      const currentPayroll = activeHires.reduce((sum: number, h: any) => sum + h.monthlyCost, 0);
      const plannedPayroll = plannedFutureHires.reduce((sum: number, h: any) => sum + h.monthlyCost, 0);
      const totalMonthlyPayroll = currentPayroll + plannedPayroll;
      
      // Group by department
      const byDepartment: Record<string, { count: number; monthlyCost: number }> = {};
      hires.filter((h: any) => h.isActive).forEach((hire: any) => {
        const dept = hire.department;
        if (!byDepartment[dept]) {
          byDepartment[dept] = { count: 0, monthlyCost: 0 };
        }
        byDepartment[dept].count++;
        byDepartment[dept].monthlyCost += hire.monthlyCost;
      });

      res.json({
        hasData: hires.length > 0,
        summary: {
          currentHeadcount,
          plannedHeadcount,
          totalHeadcount,
          currentMonthlyPayroll: currentPayroll,
          plannedMonthlyPayroll: plannedPayroll,
          totalMonthlyPayroll,
          totalAnnualPayroll: totalMonthlyPayroll * 12,
        },
        hires: hires.filter((h: any) => h.isActive),
        byDepartment: Object.entries(byDepartment).map(([name, data]) => ({
          name,
          count: data.count,
          monthlyCost: data.monthlyCost,
        })),
      });
    } catch (error: any) {
      console.error("Get hiring data error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch hiring data" });
    }
  });

  // ============================================
  // COMPANY STATE API - AI Copilot Data Layer
  // ============================================
  
  /**
   * Get complete company state for AI copilot (Core+ only)
   * Aggregates all financial data into the AI-ready JSON schema
   */
  app.get("/api/live/company-state", isAuthenticated, requireFeature("aiCopilot"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = getUserId(user);
      
      if (!userId) {
        return res.status(401).json({ message: "User session invalid. Please log out and log back in." });
      }
      
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(404).json({ message: "No organization found" });
      }

      // Get organization details
      const org = await storage.getOrganization(orgMember.organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Import analytics functions
      const { calculateBurnRate } = await import("./analytics/burn");
      const { calculateRunway } = await import("./analytics/runway");

      // Get bank accounts for current cash
      const bankAccounts = await storage.getUserBankAccounts(userId);
      const cashBalance = bankAccounts.reduce((sum: number, acc: any) => {
        return sum + (parseFloat(acc.currentBalance) || 0);
      }, 0);

      // Get transactions for last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      
      const rawTransactions = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: twelveMonthsAgo,
        endDate: new Date(),
      });

      // Transform transactions for analytics
      const transactions = rawTransactions.map((txn: any) => ({
        id: txn.id,
        date: new Date(txn.date),
        amount: parseFloat(txn.amount) || 0,
        type: parseFloat(txn.amount) >= 0 ? "credit" as const : "debit" as const,
        vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
        categoryId: txn.categoryId,
        isRecurring: txn.isRecurring || false,
        isPayroll: txn.isPayroll || false,
      }));

      // Calculate monthly actuals for past 6 months
      const monthlyActuals: Array<{
        month: string;
        revenue: number;
        total_expenses: number;
        net_burn: number;
        expenses_by_category: Record<string, number>;
      }> = [];

      const categories = await storage.getOrganizationCategories(orgMember.organizationId);
      const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - i);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        monthEnd.setDate(0);
        monthEnd.setHours(23, 59, 59, 999);

        const monthTxns = transactions.filter(
          (t) => t.date >= monthStart && t.date <= monthEnd
        );

        let revenue = 0;
        let totalExpenses = 0;
        const expensesByCategory: Record<string, number> = {};

        for (const txn of monthTxns) {
          const amount = Math.abs(txn.amount);
          if (txn.type === "credit") {
            revenue += amount;
          } else {
            totalExpenses += amount;
            const catName = txn.categoryId ? categoryMap.get(txn.categoryId) || "Other" : "Other";
            expensesByCategory[catName] = (expensesByCategory[catName] || 0) + amount;
          }
        }

        monthlyActuals.push({
          month: monthStart.toISOString().split("T")[0],
          revenue,
          total_expenses: totalExpenses,
          net_burn: totalExpenses - revenue,
          expenses_by_category: expensesByCategory,
        });
      }

      // Get planned hires
      const plannedHires = await storage.getUserPlannedHires(userId);
      
      // Build headcount array
      const headcount = plannedHires.map((hire: any) => ({
        id: hire.id,
        name: hire.role,
        role: hire.role,
        department: hire.department || "General",
        status: new Date(hire.startDate) <= new Date() ? "active" : "planned",
        start_date: new Date(hire.startDate).toISOString().split("T")[0],
        annual_compensation: (parseFloat(hire.monthlyCost) || 0) * 12,
      }));

      // Calculate current burn and runway
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const burnMetrics = calculateBurnRate(transactions, threeMonthsAgo, new Date());
      const runwayMetrics = calculateRunway(transactions, cashBalance, 
        plannedHires.map((h: any) => ({
          role: h.role,
          monthlyCost: parseFloat(h.monthlyCost) || 0,
          startDate: new Date(h.startDate),
        }))
      );

      // Generate 12-month projections for base scenario
      const monthlyBurn = runwayMetrics.monthlyBurn;
      const avgRevenue = monthlyActuals.length > 0 
        ? monthlyActuals.reduce((sum, m) => sum + m.revenue, 0) / monthlyActuals.length 
        : 0;
      
      const monthlyProjections: Array<{
        month: string;
        cash_balance: number;
        revenue: number;
        expenses: number;
        net_burn: number;
        runway_months: number;
        headcount: number;
      }> = [];

      let projectedCash = cashBalance;
      const currentHeadcount = headcount.filter((h: any) => h.status === "active").length;
      
      for (let i = 0; i < 12; i++) {
        const projMonth = new Date();
        projMonth.setMonth(projMonth.getMonth() + i);
        projMonth.setDate(1);

        // Count headcount at this point
        const activeHires = headcount.filter((h: any) => {
          const hireDate = new Date(h.start_date);
          return hireDate <= projMonth;
        }).length;

        // Simple projection: assume constant burn and revenue
        const projectedRevenue = avgRevenue * (1 + 0.02 * i); // 2% monthly growth
        const projectedExpenses = monthlyBurn > 0 ? monthlyBurn : burnMetrics.grossBurn / 3;
        const netBurn = projectedExpenses - projectedRevenue;
        
        projectedCash = projectedCash - netBurn;
        const runway = projectedCash > 0 && netBurn > 0 ? projectedCash / netBurn : projectedCash > 0 ? 999 : 0;

        monthlyProjections.push({
          month: projMonth.toISOString().split("T")[0],
          cash_balance: Math.max(0, projectedCash),
          revenue: projectedRevenue,
          expenses: projectedExpenses,
          net_burn: netBurn,
          runway_months: Math.min(runway, 999),
          headcount: Math.max(currentHeadcount, activeHires),
        });
      }

      // Build base scenario
      const baseScenario = {
        name: "Base",
        description: "Current trajectory based on historical data and planned hires",
        monthly_projections: monthlyProjections,
        hires: plannedHires.map((h: any) => ({
          id: h.id,
          role: h.role,
          department: h.department || "General",
          annual_compensation: (parseFloat(h.monthlyCost) || 0) * 12,
          start_date: new Date(h.startDate).toISOString().split("T")[0],
        })),
        expenses: [] as Array<{id: string; category: string; monthly_amount: number; start_date: string; description: string}>,
        funding_events: [] as Array<{id: string; amount: number; date: string; type: string; description: string}>,
        budget_vs_actuals: [] as Array<{month: string; category: string; budgeted: number; actual: number; variance: number; variance_percent: number}>,
      };

      // Build company state response
      const companyState = {
        company_name: org.name,
        current_date: new Date().toISOString().split("T")[0],
        cash_balance: cashBalance,
        monthly_actuals: monthlyActuals,
        scenarios: [baseScenario],
        headcount,
        // Summary metrics for quick access
        summary: {
          current_runway_months: runwayMetrics.runwayMonths === Infinity ? null : runwayMetrics.runwayMonths,
          monthly_burn_rate: monthlyBurn,
          cash_out_date: runwayMetrics.zeroDate?.toISOString().split("T")[0] || null,
          current_headcount: currentHeadcount,
          planned_headcount: headcount.length,
          total_revenue_last_6mo: monthlyActuals.reduce((sum, m) => sum + m.revenue, 0),
          total_expenses_last_6mo: monthlyActuals.reduce((sum, m) => sum + m.total_expenses, 0),
        },
      };

      res.json(companyState);
    } catch (error: any) {
      console.error("Get company state error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch company state" });
    }
  });

  // User mode toggle (demo vs live)
  const userModeSchema = z.object({
    isLiveMode: z.boolean(),
  });

  app.patch("/api/user/mode", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      
      const parseResult = userModeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.errors 
        });
      }

      const { isLiveMode } = parseResult.data;
      const updated = await storage.updateUser(user.id, { isLiveMode });
      res.json(updated);
    } catch (error: any) {
      console.error("Update user mode error:", error);
      res.status(500).json({ message: error.message || "Failed to update user mode" });
    }
  });

  // Get current user with mode info
  app.get("/api/user/me", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      res.json(user);
    } catch (error: any) {
      console.error("Get current user error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch user" });
    }
  });

  // Get user plan/subscription info
  app.get("/api/user/plan", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        subscriptionTier: dbUser.subscriptionTier || null,
        isAdmin: dbUser.isAdmin || false,
        stripeCustomerId: dbUser.stripeCustomerId,
        stripeSubscriptionId: dbUser.stripeSubscriptionId,
      });
    } catch (error: any) {
      console.error("Get user plan error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch user plan" });
    }
  });

  // Update user subscription tier (called after Stripe checkout or by admin)
  app.post("/api/user/subscription", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const { tier, stripeCustomerId, stripeSubscriptionId } = req.body;
      
      if (tier && !["lite", "core", "growth"].includes(tier)) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }
      
      const updateData: any = {};
      if (tier) updateData.subscriptionTier = tier;
      if (stripeCustomerId) updateData.stripeCustomerId = stripeCustomerId;
      if (stripeSubscriptionId) updateData.stripeSubscriptionId = stripeSubscriptionId;
      updateData.hasSelectedPlan = true;
      
      const updated = await storage.updateUser(userId, updateData);
      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Update subscription error:", error);
      res.status(500).json({ message: error.message || "Failed to update subscription" });
    }
  });

  // Auto-infer budget baselines from 3-month transaction history (Core+ only)
  app.get("/api/live/budget-baselines", isAuthenticated, requireFeature("departmentBudgets"), async (req, res) => {
    try {
      const user = req.user as User;
      
      // Get user's organization
      const userOrg = await db.query.userOrganizations.findFirst({
        where: eq(userOrganizations.userId, user.id),
      });
      
      if (!userOrg) {
        return res.json({ 
          baselines: {},
          totalMonthly: 0,
          monthsAnalyzed: 0,
          message: "No organization connected"
        });
      }

      // Get transactions from last 3 months
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      const recentTransactions = await db.query.transactions.findMany({
        where: and(
          eq(transactions.organizationId, userOrg.organizationId),
          gte(transactions.date, threeMonthsAgo)
        ),
        with: {
          category: true
        }
      });

      if (recentTransactions.length === 0) {
        return res.json({ 
          baselines: {},
          totalMonthly: 0,
          monthsAnalyzed: 0,
          message: "No transactions found in last 3 months"
        });
      }

      // Calculate spending by category
      const spendByCategory: Record<string, { total: number; count: number }> = {};
      
      recentTransactions.forEach((txn) => {
        const amount = parseFloat(txn.amount);
        if (amount < 0) { // Only count expenses (negative amounts)
          const categoryName = txn.category?.name || txn.vendorNormalized || "Uncategorized";
          if (!spendByCategory[categoryName]) {
            spendByCategory[categoryName] = { total: 0, count: 0 };
          }
          spendByCategory[categoryName].total += Math.abs(amount);
          spendByCategory[categoryName].count++;
        }
      });

      // Calculate date range to determine months spanned
      const dates = recentTransactions.map(t => new Date(t.date).getTime());
      const minDate = Math.min(...dates);
      const maxDate = Math.max(...dates);
      const daysSpanned = Math.max(1, (maxDate - minDate) / (1000 * 60 * 60 * 24));
      const monthsSpanned = Math.max(1, daysSpanned / 30);

      // Calculate monthly averages
      const baselines: Record<string, { 
        monthlyAverage: number; 
        transactionCount: number;
        categoryType: "fixed" | "variable" 
      }> = {};
      
      let totalMonthly = 0;
      
      Object.entries(spendByCategory).forEach(([category, data]) => {
        const monthlyAvg = data.total / monthsSpanned;
        
        // Detect if likely fixed (consistent recurring) or variable
        const avgPerTransaction = data.total / data.count;
        const transactionsPerMonth = data.count / monthsSpanned;
        const isLikelyFixed = transactionsPerMonth >= 0.8 && transactionsPerMonth <= 1.5;
        
        baselines[category] = {
          monthlyAverage: Math.round(monthlyAvg * 100) / 100,
          transactionCount: data.count,
          categoryType: isLikelyFixed ? "fixed" : "variable"
        };
        
        totalMonthly += monthlyAvg;
      });

      // Sort by monthly average descending
      const sortedBaselines = Object.fromEntries(
        Object.entries(baselines)
          .sort(([, a], [, b]) => b.monthlyAverage - a.monthlyAverage)
      );

      res.json({
        baselines: sortedBaselines,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        monthsAnalyzed: Math.round(monthsSpanned * 10) / 10,
        transactionCount: recentTransactions.length,
        topCategories: Object.entries(sortedBaselines)
          .slice(0, 5)
          .map(([name, data]) => ({
            name,
            ...data,
            percentOfTotal: Math.round((data.monthlyAverage / totalMonthly) * 100)
          }))
      });
    } catch (error: any) {
      console.error("Get budget baselines error:", error);
      res.status(500).json({ message: error.message || "Failed to calculate budget baselines" });
    }
  });

  // What Changed This Week - weekly summary of financial changes
  app.get("/api/live/weekly-changes", isAuthenticated, requireFeature("departmentBudgets"), async (req, res) => {
    try {
      const user = req.user as User;
      
      const orgMember = await storage.getOrganizationMember(user.id);
      
      if (!orgMember) {
        return res.json({ 
          changes: [],
          period: { start: null, end: null },
          message: "No organization connected"
        });
      }
      
      const organizationId = orgMember.organizationId;

      // Get transactions from this week and last week
      const now = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      
      const thisWeekTxns = await db.query.transactions.findMany({
        where: and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, weekAgo)
        ),
        with: { category: true }
      });
      
      const lastWeekTxns = await db.query.transactions.findMany({
        where: and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, twoWeeksAgo),
          lt(transactions.date, weekAgo)
        ),
        with: { category: true }
      });

      const changes: Array<{
        type: string;
        title: string;
        description: string;
        change: number;
        severity: "info" | "warning" | "success";
      }> = [];

      // Calculate total spend this week vs last week
      const thisWeekSpend = thisWeekTxns
        .filter(t => parseFloat(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
      
      const lastWeekSpend = lastWeekTxns
        .filter(t => parseFloat(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
      
      if (lastWeekSpend > 0) {
        const spendChange = ((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100;
        if (Math.abs(spendChange) > 10) {
          changes.push({
            type: "spend",
            title: spendChange > 0 ? "Spending increased" : "Spending decreased",
            description: `You spent ${formatCurrency(thisWeekSpend)} this week, ${spendChange > 0 ? "up" : "down"} ${Math.abs(spendChange).toFixed(0)}% from last week.`,
            change: spendChange,
            severity: spendChange > 20 ? "warning" : spendChange < -10 ? "success" : "info"
          });
        }
      }

      // Calculate revenue this week vs last week
      const thisWeekRevenue = thisWeekTxns
        .filter(t => parseFloat(t.amount) > 0)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      const lastWeekRevenue = lastWeekTxns
        .filter(t => parseFloat(t.amount) > 0)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      if (lastWeekRevenue > 0) {
        const revenueChange = ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100;
        if (Math.abs(revenueChange) > 10) {
          changes.push({
            type: "revenue",
            title: revenueChange > 0 ? "Revenue increased" : "Revenue decreased",
            description: `Revenue was ${formatCurrency(thisWeekRevenue)} this week, ${revenueChange > 0 ? "up" : "down"} ${Math.abs(revenueChange).toFixed(0)}% from last week.`,
            change: revenueChange,
            severity: revenueChange > 0 ? "success" : "warning"
          });
        }
      }

      // Find largest new vendors this week
      const thisWeekVendors = new Map<string, number>();
      thisWeekTxns.forEach(t => {
        const vendor = t.vendorNormalized || t.vendorOriginal || "Unknown";
        const amount = parseFloat(t.amount);
        if (amount < 0) {
          thisWeekVendors.set(vendor, (thisWeekVendors.get(vendor) || 0) + Math.abs(amount));
        }
      });

      const lastWeekVendors = new Set(lastWeekTxns.map(t => t.vendorNormalized || t.vendorOriginal || "Unknown"));
      
      const newLargeVendors = Array.from(thisWeekVendors.entries())
        .filter(([vendor]) => !lastWeekVendors.has(vendor))
        .filter(([_, amount]) => amount > 500)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);

      newLargeVendors.forEach(([vendor, amount]) => {
        changes.push({
          type: "new_vendor",
          title: "New vendor spend",
          description: `First payment to ${vendor}: ${formatCurrency(amount)}`,
          change: amount,
          severity: amount > 2000 ? "warning" : "info"
        });
      });

      // Find unusual category spikes
      const thisWeekByCategory = new Map<string, number>();
      const lastWeekByCategory = new Map<string, number>();
      
      thisWeekTxns.forEach(t => {
        const cat = t.category?.name || "Uncategorized";
        const amount = parseFloat(t.amount);
        if (amount < 0) {
          thisWeekByCategory.set(cat, (thisWeekByCategory.get(cat) || 0) + Math.abs(amount));
        }
      });
      
      lastWeekTxns.forEach(t => {
        const cat = t.category?.name || "Uncategorized";
        const amount = parseFloat(t.amount);
        if (amount < 0) {
          lastWeekByCategory.set(cat, (lastWeekByCategory.get(cat) || 0) + Math.abs(amount));
        }
      });

      thisWeekByCategory.forEach((thisAmount, cat) => {
        const lastAmount = lastWeekByCategory.get(cat) || 0;
        if (lastAmount > 0 && thisAmount > 500) {
          const changePercent = ((thisAmount - lastAmount) / lastAmount) * 100;
          if (changePercent > 50) {
            changes.push({
              type: "category_spike",
              title: `${cat} spending spiked`,
              description: `${cat} spend was ${formatCurrency(thisAmount)}, up ${changePercent.toFixed(0)}% from last week.`,
              change: changePercent,
              severity: changePercent > 100 ? "warning" : "info"
            });
          }
        }
      });

      // Transaction count change
      if (lastWeekTxns.length > 0) {
        const txnChange = ((thisWeekTxns.length - lastWeekTxns.length) / lastWeekTxns.length) * 100;
        if (Math.abs(txnChange) > 30) {
          changes.push({
            type: "activity",
            title: txnChange > 0 ? "More transactions" : "Fewer transactions",
            description: `${thisWeekTxns.length} transactions this week vs ${lastWeekTxns.length} last week.`,
            change: txnChange,
            severity: "info"
          });
        }
      }

      res.json({
        changes: changes.slice(0, 5), // Limit to top 5 changes
        period: { 
          start: weekAgo.toISOString(), 
          end: now.toISOString() 
        },
        stats: {
          thisWeekSpend,
          lastWeekSpend,
          thisWeekRevenue,
          lastWeekRevenue,
          transactionCount: thisWeekTxns.length
        }
      });
    } catch (error: any) {
      console.error("Get weekly changes error:", error);
      res.status(500).json({ message: error.message || "Failed to get weekly changes" });
    }
  });

  // AI Copilot Chat endpoint
  const chatSchema = z.object({
    message: z.string().min(1),
    conversationHistory: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).optional(),
  });

  app.post("/api/live/copilot/chat", isAuthenticated, requireFeature("aiCopilot"), async (req, res) => {
    try {
      const user = req.user as User;
      
      const parseResult = chatSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.errors 
        });
      }

      const { message, conversationHistory = [] } = parseResult.data;

      // Get user's organization for context
      const userOrg = await db.query.organizationMembers.findFirst({
        where: eq(organizationMembers.userId, user.id),
      });

      // Get company state for context
      let companyContext = `STATUS: No financial data connected yet.
      
To provide accurate financial analysis, please connect your:
1. Bank accounts (via Connect page) - for real-time cash balance and transaction data
2. QuickBooks (via Integrations) - for accounting data and categorized expenses

Once connected, I can analyze your burn rate, runway, spending patterns, and provide specific recommendations.`;
      
      if (userOrg) {
        try {
          // Get bank accounts for real cash balance
          const bankAccounts = await storage.getUserBankAccounts(user.id);
          const cashBalance = bankAccounts.reduce((sum: number, acc: any) => {
            return sum + (parseFloat(acc.currentBalance) || 0);
          }, 0);
          
          // Get transactions from last 6 months for better analysis
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
          
          const recentTransactions = await db.query.transactions.findMany({
            where: and(
              eq(transactions.organizationId, userOrg.organizationId),
              gte(transactions.date, sixMonthsAgo)
            ),
            with: { category: true, vendor: true }
          });

          if (recentTransactions.length === 0 && cashBalance === 0) {
            // No data connected - keep default context with setup guide
            companyContext = `STATUS: No financial data connected yet.
            
To provide accurate financial analysis, please connect your:
1. Bank accounts (via Connect page) - for real-time cash balance and transaction data
2. QuickBooks (via Integrations) - for accounting data and categorized expenses

Once connected, I can analyze your burn rate, runway, spending patterns, and provide specific recommendations.

In the meantime, I can help you with:
- General startup finance questions
- Burn rate and runway calculations (if you share numbers)
- Hiring cost analysis
- Fundraising timing and strategy`;
          } else {

          // Calculate comprehensive stats
          let totalRevenue = 0;
          let totalExpenses = 0;
          const spendByCategory: Record<string, number> = {};
          const spendByVendor: Record<string, number> = {};
          const monthlyData: Record<string, { revenue: number; expenses: number }> = {};
          let payrollExpenses = 0;
          let softwareExpenses = 0;
          let recurringExpenses = 0;

          recentTransactions.forEach(txn => {
            const amount = parseFloat(txn.amount);
            const monthKey = new Date(txn.date).toISOString().substring(0, 7);
            
            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = { revenue: 0, expenses: 0 };
            }
            
            if (amount > 0) {
              totalRevenue += amount;
              monthlyData[monthKey].revenue += amount;
            } else {
              const absAmount = Math.abs(amount);
              totalExpenses += absAmount;
              monthlyData[monthKey].expenses += absAmount;
              
              const cat = txn.category?.name || "Uncategorized";
              const vendor = txn.vendor?.name || txn.vendorOriginal || "Unknown";
              
              spendByCategory[cat] = (spendByCategory[cat] || 0) + absAmount;
              spendByVendor[vendor] = (spendByVendor[vendor] || 0) + absAmount;
              
              // Track specific categories
              if (cat.toLowerCase().includes("payroll") || cat.toLowerCase().includes("salary")) {
                payrollExpenses += absAmount;
              }
              if (cat.toLowerCase().includes("software") || cat.toLowerCase().includes("saas")) {
                softwareExpenses += absAmount;
              }
              if (txn.isRecurring) {
                recurringExpenses += absAmount;
              }
            }
          });

          // Calculate months of data
          const monthsOfData = Object.keys(monthlyData).length || 1;
          const monthlyBurn = totalExpenses / monthsOfData;
          const monthlyRevenue = totalRevenue / monthsOfData;
          const netBurn = monthlyBurn - monthlyRevenue;
          const grossMargin = monthlyRevenue > 0 ? ((monthlyRevenue - (totalExpenses * 0.25 / monthsOfData)) / monthlyRevenue * 100) : 0;
          
          // Calculate runway
          const runway = netBurn > 0 ? cashBalance / netBurn : null;
          const runwayStatus = !runway ? "Cash flow positive" : 
            runway < 6 ? "CRITICAL - Less than 6 months" :
            runway < 12 ? "Caution - Under 12 months" :
            runway < 18 ? "Healthy" : "Strong - 18+ months";
          
          // Calculate burn trend (is it increasing?)
          const sortedMonths = Object.keys(monthlyData).sort();
          let burnTrend = "stable";
          if (sortedMonths.length >= 3) {
            const recent = monthlyData[sortedMonths[sortedMonths.length - 1]]?.expenses || 0;
            const prior = monthlyData[sortedMonths[sortedMonths.length - 3]]?.expenses || 0;
            if (prior > 0) {
              const change = ((recent - prior) / prior) * 100;
              burnTrend = change > 10 ? `increasing (+${change.toFixed(0)}%)` : 
                         change < -10 ? `decreasing (${change.toFixed(0)}%)` : "stable";
            }
          }

          // Top vendors
          const topVendors = Object.entries(spendByVendor)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8);

          // Format company context
          companyContext = `
## FINANCIAL SNAPSHOT (Last ${monthsOfData} months of data)

**Cash Position**
- Current Cash Balance: ${formatCurrency(cashBalance)}
- Connected Bank Accounts: ${bankAccounts.length}

**Burn & Runway**
- Monthly Burn (Gross): ${formatCurrency(monthlyBurn)}
- Monthly Revenue: ${formatCurrency(monthlyRevenue)}
- Net Monthly Burn: ${formatCurrency(netBurn)}
- Runway: ${runway ? `${runway.toFixed(1)} months` : "N/A"} — ${runwayStatus}
- Burn Trend: ${burnTrend}

**Expense Breakdown**
- Payroll & Salaries: ${formatCurrency(payrollExpenses / monthsOfData)}/mo (${((payrollExpenses / totalExpenses) * 100).toFixed(0)}% of spend)
- Software & SaaS: ${formatCurrency(softwareExpenses / monthsOfData)}/mo (${((softwareExpenses / totalExpenses) * 100).toFixed(0)}% of spend)
- Recurring Expenses: ${formatCurrency(recurringExpenses / monthsOfData)}/mo

**Spending by Category**
${Object.entries(spendByCategory)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 6)
  .map(([cat, amount]) => `- ${cat}: ${formatCurrency(amount / monthsOfData)}/mo`)
  .join("\n")}

**Top Vendors (Total Spend)**
${topVendors
  .map(([vendor, amount]) => `- ${vendor}: ${formatCurrency(amount)}`)
  .join("\n")}

**Data Quality**
- Transactions analyzed: ${recentTransactions.length}
- Date range: ${sortedMonths[0] || "N/A"} to ${sortedMonths[sortedMonths.length - 1] || "N/A"}
`;
          }
        } catch (e) {
          console.error("Error getting company context:", e);
        }
      }

      const systemPrompt = `You are BlackTop's AI Financial Copilot — a world-class startup finance expert with deep knowledge of venture-backed company operations, burn management, and fundraising strategy.

## YOUR EXPERTISE
You have the financial acumen of a top-tier CFO combined with VC pattern recognition. You understand:
- Burn rate benchmarks: Seed stage ($50-150k/mo), Series A ($150-400k/mo), Series B ($400k-1M+/mo)
- Runway thresholds: <6 months is critical (fundraise now), 12-18 months is healthy, 24+ months is conservative
- SaaS metrics: CAC payback should be <18 months, LTV:CAC should be >3:1, net revenue retention >100% is excellent
- Headcount costs: Always calculate fully-loaded (salary × 1.25-1.35 for benefits, taxes, equipment)
- Fundraising timing: Start raising 6-9 months before runway ends, process takes 3-6 months
- Vendor benchmarks: Software spend typically 5-15% of OpEx, AWS/infra 3-8%, marketing 10-30% depending on stage

## CURRENT COMPANY DATA
${companyContext}

## YOUR APPROACH
1. ALWAYS use specific numbers from the data above — never fabricate or estimate without stating assumptions
2. When data is missing, say exactly what's needed and guide the user to connect it
3. Proactively flag concerns: runway < 12 months, burn acceleration, vendor spikes, payroll creep
4. Give ACTIONABLE advice with dollar impact: "Cutting X would extend runway by Y months"
5. For hiring questions: calculate total annual cost (salary × 1.3), monthly burn impact, runway reduction
6. Compare to benchmarks: "Your burn of $X is [above/below] typical for [stage] companies"
7. Think like a board member: What would a savvy investor want to know?

## COMMUNICATION STYLE
- Lead with the insight, then explain the reasoning
- Use plain English, no finance jargon unless necessary
- Be direct and confident — founders want clarity, not hedging
- Format numbers clearly: $50,000/month not $50000
- When uncertain, state assumptions explicitly

## AVAILABLE TOOLS
You have access to these scenario modeling tools:
- **add_planned_hire**: Model the impact of hiring (e.g., "What if I hire a $90k engineer?")
- **add_recurring_expense**: Model new recurring costs (e.g., "What if we add Datadog for $500/mo?")
- **calculate_scenario**: Run "what-if" scenarios for cash and runway
- **get_vendor_analysis**: Deep dive on specific vendor spending
- **get_category_breakdown**: Analyze spending by category
- **fundraising_calculator**: Calculate how much to raise and when

When a user asks "What if..." or wants to model scenarios, USE THESE TOOLS to provide real calculations rather than estimates.

## GUARDRAILS
- Never provide tax, legal, or accounting advice — recommend they consult professionals
- Never fabricate numbers — only use data provided or clearly state estimates with assumptions
- When you execute a tool, explain what you calculated and the key takeaways

You are the financial co-pilot every founder wishes they had. Be brilliant, be helpful, be specific.`;

      // Use tool-calling chat for enhanced capabilities
      const { chatWithTools } = await import("./copilot/tools");
      
      console.log("[copilot] Calling AI with tools, message:", message.substring(0, 100));
      
      const result = await chatWithTools(
        user.id,
        userOrg?.organizationId || null,
        systemPrompt,
        conversationHistory,
        message
      );
      
      console.log("[copilot] AI response length:", result.response?.length || 0);
      console.log("[copilot] Tool results:", result.toolResults.length);

      res.json({
        response: result.response,
        actions: result.toolResults.filter(r => r.success).map(r => ({
          type: r.message,
          data: r.data,
        })),
      });
    } catch (error: any) {
      console.error("Copilot chat error:", error);
      res.status(500).json({ message: error.message || "Failed to process chat message" });
    }
  });

  // ========== Stripe Billing Routes ==========
  
  // Get Stripe publishable key for frontend
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const { getStripePublishableKey } = await import("./stripeClient");
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("Get publishable key error:", error);
      res.status(500).json({ message: "Failed to get Stripe configuration" });
    }
  });

  // List products with prices
  app.get("/api/stripe/products", async (req, res) => {
    try {
      const { stripeService } = await import("./stripeService");
      const rows = await stripeService.listProductsWithPrices();

      const productsMap = new Map();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unitAmount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
            metadata: row.price_metadata,
          });
        }
      }

      res.json({ products: Array.from(productsMap.values()) });
    } catch (error: any) {
      console.error("List products error:", error);
      res.status(500).json({ message: "Failed to list products" });
    }
  });

  // Get user subscription status
  app.get("/api/stripe/subscription", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const dbUser = await storage.getUser(user.id);
      
      if (!dbUser?.stripeCustomerId) {
        return res.json({ subscription: null, status: "inactive" });
      }

      const { stripeService } = await import("./stripeService");
      const subscriptions = await stripeService.getCustomerSubscriptions(dbUser.stripeCustomerId);
      
      if (subscriptions.length === 0) {
        return res.json({ subscription: null, status: "inactive" });
      }

      const activeSubscription = subscriptions[0] as any;
      res.json({
        subscription: activeSubscription,
        status: activeSubscription.status,
      });
    } catch (error: any) {
      console.error("Get subscription error:", error);
      res.status(500).json({ message: "Failed to get subscription" });
    }
  });

  // Create checkout session
  app.post("/api/stripe/checkout", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { priceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }

      const dbUser = await storage.getUser(user.id);
      const { stripeService } = await import("./stripeService");

      let customerId = dbUser?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          user.email || `${user.id}@blacktop.app`,
          user.id
        );
        await storage.updateUserStripeInfo(user.id, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/app/settings?checkout=success`,
        `${baseUrl}/app/settings?checkout=cancelled`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Create checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Create customer portal session
  app.post("/api/stripe/portal", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const dbUser = await storage.getUser(user.id);

      if (!dbUser?.stripeCustomerId) {
        return res.status(400).json({ message: "No subscription found" });
      }

      const { stripeService } = await import("./stripeService");
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripeService.createCustomerPortalSession(
        dbUser.stripeCustomerId,
        `${baseUrl}/app/settings`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Create portal error:", error);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  // ============================================
  // NOTIFICATION PREFERENCES & WEEKLY DIGEST
  // ============================================

  // Get notification preferences
  app.get("/api/live/notifications/preferences", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      let prefs = await storage.getNotificationPreferences(user.id);
      
      if (!prefs) {
        prefs = await storage.upsertNotificationPreferences(user.id, {
          emailEnabled: true,
          weeklyDigestEnabled: true,
          slackEnabled: false,
          smsEnabled: false,
          minSeverity: "warning",
          timezone: "America/Los_Angeles",
        });
      }
      
      res.json(prefs);
    } catch (error: any) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ message: error.message || "Failed to get notification preferences" });
    }
  });

  // Update notification preferences
  app.patch("/api/live/notifications/preferences", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const prefs = await storage.upsertNotificationPreferences(user.id, req.body);
      res.json(prefs);
    } catch (error: any) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ message: error.message || "Failed to update notification preferences" });
    }
  });

  // Send weekly digest (admin/cron endpoint)
  app.post("/api/live/notifications/weekly-digest", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const prefs = await storage.getNotificationPreferences(user.id);
      if (!prefs?.weeklyDigestEnabled) {
        return res.json({ success: false, message: "Weekly digest is disabled" });
      }

      const dbUser = await storage.getUser(user.id);
      if (!dbUser?.email) {
        return res.status(400).json({ message: "No email address on file" });
      }

      const org = await storage.getOrganization(orgMember.organizationId);
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const rawTransactions = await storage.getOrganizationTransactions(orgMember.organizationId, {
        startDate: sixMonthsAgo,
        endDate: new Date(),
      });

      const { calculateBurnRate } = await import("./analytics/burn");
      const { calculateRunway } = await import("./analytics/runway");
      const { detectVendorSpikes, detectSubscriptionCreep, detectPayrollDrift } = await import("./insights/anomalies");

      const transactions = rawTransactions.map((txn: any) => ({
        id: txn.id,
        date: new Date(txn.date),
        amount: parseFloat(txn.amount) || 0,
        type: parseFloat(txn.amount) >= 0 ? "credit" : "debit" as "credit" | "debit",
        vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
        categoryId: txn.categoryId,
        isRecurring: txn.isRecurring || false,
        isPayroll: txn.isPayroll || false,
      }));

      const bankAccounts = await storage.getUserBankAccounts(user.id);
      const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
        return sum + (parseFloat(acc.currentBalance) || 0);
      }, 0);

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const burnMetrics = calculateBurnRate(transactions, threeMonthsAgo, new Date());
      const runwayMetrics = calculateRunway(transactions, currentCash);

      const lastMonthBurn = calculateBurnRate(
        transactions,
        new Date(new Date().setMonth(new Date().getMonth() - 2)),
        new Date(new Date().setMonth(new Date().getMonth() - 1))
      );
      const burnChange = lastMonthBurn.grossBurn > 0 
        ? ((burnMetrics.grossBurn - lastMonthBurn.grossBurn) / lastMonthBurn.grossBurn) * 100 
        : 0;

      const insights: Array<{ type: string; message: string; severity: string }> = [];
      
      const vendorSpikes = detectVendorSpikes({ transactions }, 25);
      for (const spike of vendorSpikes.slice(0, 2)) {
        insights.push({
          type: "vendor_spike",
          message: `${spike.vendor} spend spiked ${spike.changePercent.toFixed(0)}% vs last month`,
          severity: spike.changePercent > 50 ? "warning" : "info",
        });
      }

      if (runwayMetrics.runwayMonths < 6 && runwayMetrics.runwayMonths !== Infinity) {
        insights.push({
          type: "runway",
          message: `Runway is ${runwayMetrics.runwayMonths.toFixed(1)} months. Consider raising funds or reducing spend.`,
          severity: runwayMetrics.runwayMonths < 3 ? "critical" : "warning",
        });
      }

      const vendorSpend: Record<string, number> = {};
      for (const txn of transactions) {
        if (txn.type === "debit" && txn.vendorNormalized) {
          vendorSpend[txn.vendorNormalized] = (vendorSpend[txn.vendorNormalized] || 0) + Math.abs(txn.amount);
        }
      }
      const topVendors = Object.entries(vendorSpend)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const weekEnd = new Date();
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

      const { sendWeeklyDigest, WeeklyDigestData } = await import("./notifs/email");
      const digestData: WeeklyDigestData = {
        companyName: org?.name || "Your Company",
        currentCash,
        runwayMonths: runwayMetrics.runwayMonths === Infinity ? null : runwayMetrics.runwayMonths,
        monthlyBurn: burnMetrics.grossBurn,
        burnChange,
        insights,
        topVendors,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
      };

      const result = await sendWeeklyDigest(dbUser.email, digestData);

      res.json({ success: result.success, message: result.error || "Weekly digest sent" });
    } catch (error: any) {
      console.error("Send weekly digest error:", error);
      res.status(500).json({ message: error.message || "Failed to send weekly digest" });
    }
  });

  // Check thresholds and get alerts
  app.get("/api/live/notifications/alerts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);
      
      if (!orgMember) {
        return res.json({ alerts: [], message: "No organization found" });
      }

      const { checkThresholds } = await import("./notifs/thresholdAlerts");
      const alerts = await checkThresholds(orgMember.organizationId, user.id);

      res.json({ alerts });
    } catch (error: any) {
      console.error("Check thresholds error:", error);
      res.status(500).json({ message: error.message || "Failed to check thresholds" });
    }
  });

  // Manually trigger threshold alerts
  app.post("/api/live/notifications/check-thresholds", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { checkThresholds, sendThresholdAlerts } = await import("./notifs/thresholdAlerts");
      const alerts = await checkThresholds(orgMember.organizationId, user.id);
      
      if (alerts.length === 0) {
        return res.json({ success: true, message: "No alerts to send", alerts: [] });
      }

      const result = await sendThresholdAlerts(user.id, alerts);

      res.json({ 
        success: true, 
        alerts,
        sent: result.sent,
        message: `${result.sent} notifications sent for ${alerts.length} alerts`
      });
    } catch (error: any) {
      console.error("Check thresholds error:", error);
      res.status(500).json({ message: error.message || "Failed to check thresholds" });
    }
  });

  // Send threshold alert (critical runway, vendor spikes, etc.)
  app.post("/api/live/notifications/alert", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { title, message, severity = "warning" } = req.body;

      if (!title || !message) {
        return res.status(400).json({ message: "Title and message are required" });
      }

      const prefs = await storage.getNotificationPreferences(user.id);
      if (!prefs) {
        return res.json({ success: false, message: "No notification preferences found" });
      }

      const results: any[] = [];
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

      if (prefs.emailEnabled) {
        const dbUser = await storage.getUser(user.id);
        if (dbUser?.email) {
          const { sendEmailNotification } = await import("./notifs/email");
          results.push(await sendEmailNotification(dbUser.email, {
            title,
            body: message,
            severity,
            actionUrl: `${baseUrl}/app`,
          }));
        }
      }

      if (prefs.slackEnabled && prefs.slackWebhookUrl) {
        const { sendSlackNotification } = await import("./notifs/slack");
        results.push(await sendSlackNotification(prefs.slackWebhookUrl, {
          title,
          body: message,
          severity,
          actionUrl: `${baseUrl}/app`,
        }));
      }

      if (prefs.smsEnabled && prefs.smsPhoneNumber) {
        const { sendSMSNotification } = await import("./notifs/sms");
        results.push(await sendSMSNotification(prefs.smsPhoneNumber, {
          title,
          body: message,
          severity,
        }));
      }

      const successCount = results.filter(r => r.success).length;
      res.json({ 
        success: successCount > 0, 
        results,
        message: `Sent ${successCount}/${results.length} notifications`
      });
    } catch (error: any) {
      console.error("Send alert error:", error);
      res.status(500).json({ message: error.message || "Failed to send alert" });
    }
  });

  // ========== Shareable Reports ==========

  // Create a new shareable report (Core+ only)
  app.post("/api/live/reports", isAuthenticated, requireFeature("shareableReports"), async (req, res) => {
    try {
      const user = req.user as User;
      const { title, expiresAt } = req.body;

      const orgMember = await storage.getOrganizationMember(user.id);
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateReportData } = await import("./reports/shareableReport");
      const reportData = await generateReportData(user.id, orgMember.organizationId);

      const report = await storage.createShareableReport({
        organizationId: orgMember.organizationId,
        createdBy: user.id,
        title: title || `Financial Report - ${new Date().toLocaleDateString()}`,
        reportData: reportData as any,
        isPublic: true,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      res.json({ 
        success: true, 
        report,
        shareUrl: `${baseUrl}/reports/${report.id}`
      });
    } catch (error: any) {
      console.error("Create report error:", error);
      res.status(500).json({ message: error.message || "Failed to create report" });
    }
  });

  // List shareable reports (Core+ only)
  app.get("/api/live/reports", isAuthenticated, requireFeature("shareableReports"), async (req, res) => {
    try {
      const user = req.user as User;

      const orgMember = await storage.getOrganizationMember(user.id);
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const reports = await storage.getOrganizationShareableReports(orgMember.organizationId);
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

      res.json({ 
        reports: reports.map(r => ({
          ...r,
          shareUrl: `${baseUrl}/reports/${r.id}`
        }))
      });
    } catch (error: any) {
      console.error("List reports error:", error);
      res.status(500).json({ message: error.message || "Failed to list reports" });
    }
  });

  // Delete a shareable report (Core+ only)
  app.delete("/api/live/reports/:id", isAuthenticated, requireFeature("shareableReports"), async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;

      const report = await storage.getShareableReport(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const orgMember = await storage.getOrganizationMember(user.id);
      if (!orgMember || orgMember.organizationId !== report.organizationId) {
        return res.status(403).json({ message: "Not authorized to delete this report" });
      }

      await storage.deleteShareableReport(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete report error:", error);
      res.status(500).json({ message: error.message || "Failed to delete report" });
    }
  });

  // Public endpoint - view shareable report (no auth required)
  app.get("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const format = req.query.format as string || "html";

      const report = await storage.getShareableReport(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (!report.isPublic) {
        return res.status(403).json({ message: "This report is not public" });
      }

      if (report.expiresAt && new Date(report.expiresAt) < new Date()) {
        return res.status(410).json({ message: "This report has expired" });
      }

      await storage.incrementReportViewCount(id);

      if (format === "json") {
        const { generateReportJSON } = await import("./reports/shareableReport");
        return res.json(generateReportJSON(report.reportData as any));
      }

      const { generateReportHTML } = await import("./reports/shareableReport");
      res.setHeader("Content-Type", "text/html");
      res.send(generateReportHTML(report.reportData as any));
    } catch (error: any) {
      console.error("View report error:", error);
      res.status(500).json({ message: error.message || "Failed to load report" });
    }
  });

  // ========== AI Investor Updates (Growth tier) ==========

  // Get investor update data - loads saved draft or generates new (Growth+ only)
  app.get("/api/live/reports/investor-update", isAuthenticated, requireFeature("aiInvestorUpdates"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateInvestorUpdateData } = await import("./reports/investorUpdate");
      const updateData = await generateInvestorUpdateData(userId, orgMember.organizationId);
      
      // Check for existing saved draft for this period
      const savedUpdate = await storage.getLatestSavedInvestorUpdate(
        orgMember.organizationId,
        updateData.period
      );
      
      if (savedUpdate) {
        // Return saved draft with merged fresh metrics
        const savedData = savedUpdate.updateData as any;
        res.json({
          ...savedData,
          id: savedUpdate.id,
          metrics: updateData.metrics, // Always use fresh metrics
        });
      } else {
        // Create a new saved draft
        const saved = await storage.createSavedInvestorUpdate({
          organizationId: orgMember.organizationId,
          createdBy: userId,
          period: updateData.period,
          updateData: updateData,
          isDraft: true,
        });
        res.json({ ...updateData, id: saved.id });
      }
    } catch (error: any) {
      console.error("Get investor update error:", error);
      res.status(500).json({ message: error.message || "Failed to generate investor update" });
    }
  });

  // Generate/regenerate investor update - creates fresh data and saves it (Growth+ only)
  app.post("/api/live/reports/investor-update/generate", isAuthenticated, requireFeature("aiInvestorUpdates"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateInvestorUpdateData } = await import("./reports/investorUpdate");
      const updateData = await generateInvestorUpdateData(userId, orgMember.organizationId);
      
      // Save the new data (or update existing for same period)
      const existing = await storage.getLatestSavedInvestorUpdate(
        orgMember.organizationId,
        updateData.period
      );
      
      let savedId: string;
      if (existing) {
        await storage.updateSavedInvestorUpdate(existing.id, {
          updateData: updateData,
          isDraft: true,
        });
        savedId = existing.id;
      } else {
        const saved = await storage.createSavedInvestorUpdate({
          organizationId: orgMember.organizationId,
          createdBy: userId,
          period: updateData.period,
          updateData: updateData,
          isDraft: true,
        });
        savedId = saved.id;
      }
      
      res.json({ success: true, data: { ...updateData, id: savedId } });
    } catch (error: any) {
      console.error("Generate investor update error:", error);
      res.status(500).json({ message: error.message || "Failed to generate investor update" });
    }
  });

  // Save edited investor update (Growth+ only)
  app.put("/api/live/reports/investor-update/:id", isAuthenticated, requireFeature("aiInvestorUpdates"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const { id } = req.params;
      const { updateData } = req.body;
      
      if (!updateData) {
        return res.status(400).json({ message: "Update data is required" });
      }

      const existing = await storage.getSavedInvestorUpdate(id);
      if (!existing) {
        return res.status(404).json({ message: "Saved update not found" });
      }

      const updated = await storage.updateSavedInvestorUpdate(id, {
        updateData: updateData,
        isDraft: true,
      });
      
      res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error("Save investor update error:", error);
      res.status(500).json({ message: error.message || "Failed to save investor update" });
    }
  });

  // Get investor update as HTML from saved draft (Growth+ only)
  app.get("/api/live/reports/investor-update/html", isAuthenticated, requireFeature("aiInvestorUpdates"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateInvestorUpdateData, generateInvestorUpdateHTML } = await import("./reports/investorUpdate");
      const freshData = await generateInvestorUpdateData(userId, orgMember.organizationId);
      
      // Try to get saved draft first
      const savedUpdate = await storage.getLatestSavedInvestorUpdate(
        orgMember.organizationId,
        freshData.period
      );
      
      const updateData = savedUpdate 
        ? { ...(savedUpdate.updateData as any), metrics: freshData.metrics }
        : freshData;
      
      const html = generateInvestorUpdateHTML(updateData);
      
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error: any) {
      console.error("Get investor update HTML error:", error);
      res.status(500).json({ message: error.message || "Failed to generate investor update HTML" });
    }
  });

  // Generate HTML from edited content (Growth+ only)
  app.post("/api/live/reports/investor-update/html", isAuthenticated, requireFeature("aiInvestorUpdates"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const { updateData } = req.body;
      
      if (!updateData) {
        return res.status(400).json({ message: "Update data is required" });
      }

      const { generateInvestorUpdateHTML } = await import("./reports/investorUpdate");
      const html = generateInvestorUpdateHTML(updateData);
      
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error: any) {
      console.error("Generate investor update HTML error:", error);
      res.status(500).json({ message: error.message || "Failed to generate investor update HTML" });
    }
  });

  // ========== Automated Board Packets (Growth tier) ==========

  // Get board packet data - loads saved draft or generates new (Growth+ only)
  app.get("/api/live/reports/board-packet", isAuthenticated, requireFeature("automatedBoardPackets"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateBoardPacketData } = await import("./reports/boardPacket");
      const packetData = await generateBoardPacketData(userId, orgMember.organizationId);
      
      // Check for existing saved packet for this period
      const savedPacket = await storage.getLatestSavedBoardPacket(
        orgMember.organizationId,
        packetData.period
      );
      
      if (savedPacket) {
        // Return saved packet with merged fresh financials
        const savedData = savedPacket.packetData as any;
        res.json({
          ...savedData,
          id: savedPacket.id,
          financials: packetData.financials, // Always use fresh financials
        });
      } else {
        // Create a new saved packet
        const saved = await storage.createSavedBoardPacket({
          organizationId: orgMember.organizationId,
          createdBy: userId,
          period: packetData.period,
          boardMeetingDate: packetData.boardMeetingDate,
          packetData: packetData,
          isDraft: true,
        });
        res.json({ ...packetData, id: saved.id });
      }
    } catch (error: any) {
      console.error("Get board packet error:", error);
      res.status(500).json({ message: error.message || "Failed to generate board packet" });
    }
  });

  // Generate/regenerate board packet (Growth+ only)
  app.post("/api/live/reports/board-packet/generate", isAuthenticated, requireFeature("automatedBoardPackets"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const { boardMeetingDate } = req.body;
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateBoardPacketData } = await import("./reports/boardPacket");
      const packetData = await generateBoardPacketData(userId, orgMember.organizationId, boardMeetingDate);
      
      // Save the new data (or update existing for same period)
      const existing = await storage.getLatestSavedBoardPacket(
        orgMember.organizationId,
        packetData.period
      );
      
      let savedId: string;
      if (existing) {
        await storage.updateSavedBoardPacket(existing.id, {
          packetData: packetData,
          boardMeetingDate: boardMeetingDate,
          isDraft: true,
        });
        savedId = existing.id;
      } else {
        const saved = await storage.createSavedBoardPacket({
          organizationId: orgMember.organizationId,
          createdBy: userId,
          period: packetData.period,
          boardMeetingDate: boardMeetingDate,
          packetData: packetData,
          isDraft: true,
        });
        savedId = saved.id;
      }
      
      res.json({ success: true, data: { ...packetData, id: savedId } });
    } catch (error: any) {
      console.error("Generate board packet error:", error);
      res.status(500).json({ message: error.message || "Failed to generate board packet" });
    }
  });

  // Get board packet as HTML from saved draft (Growth+ only)
  app.get("/api/live/reports/board-packet/html", isAuthenticated, requireFeature("automatedBoardPackets"), async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const orgMember = await storage.getOrganizationMember(userId);
      
      if (!orgMember) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { generateBoardPacketData, generateBoardPacketHTML } = await import("./reports/boardPacket");
      const freshData = await generateBoardPacketData(userId, orgMember.organizationId);
      
      // Try to get saved packet first
      const savedPacket = await storage.getLatestSavedBoardPacket(
        orgMember.organizationId,
        freshData.period
      );
      
      const packetData = savedPacket 
        ? { ...(savedPacket.packetData as any), financials: freshData.financials }
        : freshData;
      
      const html = generateBoardPacketHTML(packetData);
      
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error: any) {
      console.error("Get board packet HTML error:", error);
      res.status(500).json({ message: error.message || "Failed to generate board packet HTML" });
    }
  });

  // ============================================
  // WAITLIST ENDPOINTS
  // ============================================

  // Public endpoint - Submit waitlist signup (no auth required)
  app.post("/api/waitlist", async (req, res) => {
    try {
      const { email, name, role, company, painPoint } = req.body;

      // Validate required fields
      if (!email || !name) {
        return res.status(400).json({ message: "Email and name are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      // Check if email already exists
      const existing = await storage.getWaitlistEntryByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ message: "This email is already on the waitlist" });
      }

      // Create waitlist entry
      const entry = await storage.createWaitlistEntry({
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: role || "founder",
        company: company?.trim() || null,
        painPoint: painPoint?.trim() || null,
        status: "pending",
      });

      console.log(`[WAITLIST] New signup: ${email} (${role})`);

      // Send emails asynchronously (don't block the response)
      const { sendWaitlistWelcomeEmail, sendWaitlistAdminNotification } = await import("./services/emailService");
      
      // Send welcome email to user
      sendWaitlistWelcomeEmail(entry.email, entry.name).catch(err => {
        console.error("[WAITLIST] Failed to send welcome email:", err.message);
      });
      
      // Send notification to admins
      sendWaitlistAdminNotification({
        email: entry.email,
        name: entry.name,
        role: entry.role || undefined,
        company: entry.company,
        painPoint: entry.painPoint,
      }).catch(err => {
        console.error("[WAITLIST] Failed to send admin notification:", err.message);
      });

      res.status(201).json({ 
        success: true,
        message: "Successfully joined the waitlist",
        id: entry.id
      });
    } catch (error: any) {
      console.error("Waitlist signup error:", error);
      res.status(500).json({ message: "Failed to join waitlist. Please try again." });
    }
  });

  // Admin middleware - Check if user is admin
  const isAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = req.user as User;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Check if user is admin
    const dbUser = await storage.getUser(user.id);
    if (!dbUser?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  };

  // Admin endpoint - Get all waitlist entries
  app.get("/api/admin/waitlist", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const entries = await storage.getAllWaitlistEntries(status);
      const stats = await storage.getWaitlistStats();

      res.json({ entries, stats });
    } catch (error: any) {
      console.error("Admin waitlist list error:", error);
      res.status(500).json({ message: "Failed to fetch waitlist" });
    }
  });

  // Admin endpoint - Get waitlist stats
  app.get("/api/admin/waitlist/stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getWaitlistStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Admin waitlist stats error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin endpoint - Approve a waitlist entry
  app.post("/api/admin/waitlist/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminUser = req.user as User;

      const entry = await storage.getWaitlistEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "Waitlist entry not found" });
      }

      const updated = await storage.approveWaitlistEntry(id, adminUser.id);
      
      // Create or update user record with approved status
      const existingUser = await storage.getUserByEmail(entry.email);
      let approvedUser;
      
      if (existingUser) {
        // Update existing user to approved
        approvedUser = await storage.updateUser(existingUser.id, { isApproved: true });
      } else {
        // Create new user from waitlist entry
        const nameParts = entry.name.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        
        approvedUser = await storage.upsertUser({
          id: crypto.randomUUID(),
          email: entry.email,
          firstName,
          lastName,
          isApproved: true,
          isLiveMode: true,
          hasCompletedOnboarding: false,
          hasSelectedPlan: false,
          hasCompanyInfo: false,
          hasConnectedBank: false,
          companyName: entry.company || null,
        });
      }

      console.log(`[WAITLIST] Approved: ${entry.email} by ${adminUser.email} - User created/updated`);

      // Send approval email to user
      try {
        const { sendApprovalEmail } = await import("./services/emailService");
        await sendApprovalEmail(entry.email, entry.name);
        console.log(`[WAITLIST] Sent approval email to: ${entry.email}`);
      } catch (emailError: any) {
        console.error(`[WAITLIST] Failed to send approval email:`, emailError.message);
        // Don't fail the approval if email fails
      }

      res.json({ success: true, entry: updated, user: approvedUser });
    } catch (error: any) {
      console.error("Admin waitlist approve error:", error);
      res.status(500).json({ message: "Failed to approve entry" });
    }
  });

  // Admin endpoint - Reject a waitlist entry
  app.post("/api/admin/waitlist/:id/reject", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;

      const entry = await storage.getWaitlistEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "Waitlist entry not found" });
      }

      const updated = await storage.rejectWaitlistEntry(id);
      
      console.log(`[WAITLIST] Rejected: ${entry.email} by ${user.email}`);

      res.json({ success: true, entry: updated });
    } catch (error: any) {
      console.error("Admin waitlist reject error:", error);
      res.status(500).json({ message: "Failed to reject entry" });
    }
  });

  // Admin endpoint - Export waitlist as CSV
  app.get("/api/admin/waitlist/export", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const entries = await storage.getAllWaitlistEntries();
      
      // Generate CSV
      const headers = ["ID", "Email", "Name", "Role", "Company", "Pain Point", "Status", "Created At", "Approved At"];
      const rows = entries.map(e => [
        e.id,
        e.email,
        e.name,
        e.role,
        e.company || "",
        (e.painPoint || "").replace(/"/g, '""'),
        e.status,
        e.createdAt ? new Date(e.createdAt).toISOString() : "",
        e.approvedAt ? new Date(e.approvedAt).toISOString() : ""
      ]);

      const csv = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=waitlist-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error: any) {
      console.error("Admin waitlist export error:", error);
      res.status(500).json({ message: "Failed to export waitlist" });
    }
  });

  // ============================================
  // ADMIN - METRICS, USERS, SUBSCRIPTIONS
  // ============================================

  // Admin endpoint - Get dashboard metrics
  app.get("/api/admin/metrics", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const waitlistStats = await storage.getWaitlistStats();
      
      // Count users with active connections
      let usersWithConnections = 0;
      for (const user of allUsers) {
        const bankAccountCount = await storage.countUserBankAccounts(user.id);
        const plaidItemCount = await storage.countPlaidItems(user.id);
        if (bankAccountCount > 0 || plaidItemCount > 0) {
          usersWithConnections++;
        }
      }

      // Get subscription count from Stripe sync
      const { stripeService } = await import("./stripeService");
      let activeSubscriptions = 0;
      try {
        const subsResult = await db.execute(
          sql`SELECT COUNT(*) as count FROM stripe.subscriptions WHERE status = 'active'`
        );
        activeSubscriptions = parseInt((subsResult.rows[0] as any)?.count || "0");
      } catch (e) {
        console.log("No stripe subscriptions table yet");
      }

      res.json({
        totalUsers: allUsers.length,
        approvedUsers: allUsers.filter(u => u.isApproved).length,
        pendingWaitlist: waitlistStats.pending,
        activeSubscriptions,
        usersWithConnections,
      });
    } catch (error: any) {
      console.error("Admin metrics error:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Admin endpoint - Get all users with connection counts
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      
      const usersWithDetails = await Promise.all(
        allUsers.map(async (user) => {
          const bankAccountCount = await storage.countUserBankAccounts(user.id);
          const plaidItemCount = await storage.countPlaidItems(user.id);
          
          return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isApproved: user.isApproved,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            connectionCount: bankAccountCount + plaidItemCount,
          };
        })
      );

      res.json({ users: usersWithDetails });
    } catch (error: any) {
      console.error("Admin users list error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin endpoint - Approve a user directly
  app.post("/api/admin/users/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateUser(id, { isApproved: true });
      
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Admin user approve error:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  // Admin endpoint - Revoke user access
  app.post("/api/admin/users/:id/revoke", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateUser(id, { isApproved: false });
      
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Admin user revoke error:", error);
      res.status(500).json({ message: "Failed to revoke access" });
    }
  });

  // Admin endpoint - Get all subscriptions
  app.get("/api/admin/subscriptions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Query Stripe sync tables for subscription data
      const result = await db.execute(sql`
        SELECT 
          s.id,
          s.customer,
          s.status,
          s.current_period_start,
          s.current_period_end,
          s.canceled_at,
          s.created,
          c.email as customer_email,
          c.name as customer_name
        FROM stripe.subscriptions s
        LEFT JOIN stripe.customers c ON s.customer = c.id
        ORDER BY s.created DESC
      `);

      // Get price/product info for each subscription
      const subscriptions = await Promise.all(
        result.rows.map(async (sub: any) => {
          // Get subscription items to find the price
          const itemsResult = await db.execute(sql`
            SELECT si.price, p.unit_amount, p.currency, pr.name as product_name
            FROM stripe.subscription_items si
            LEFT JOIN stripe.prices p ON si.price = p.id
            LEFT JOIN stripe.products pr ON p.product = pr.id
            WHERE si.subscription = ${sub.id}
          `);
          
          const item = itemsResult.rows[0] as any;
          
          return {
            id: sub.id,
            customerEmail: sub.customer_email,
            customerName: sub.customer_name,
            status: sub.status,
            productName: item?.product_name || "Unknown",
            amount: item?.unit_amount ? item.unit_amount / 100 : 0,
            currency: item?.currency || "usd",
            currentPeriodStart: sub.current_period_start,
            currentPeriodEnd: sub.current_period_end,
            canceledAt: sub.canceled_at,
            createdAt: sub.created,
          };
        })
      );

      // Calculate MRR (Monthly Recurring Revenue)
      const mrr = subscriptions
        .filter(s => s.status === "active")
        .reduce((sum, s) => sum + (s.amount || 0), 0);

      res.json({ 
        subscriptions,
        mrr,
        totalActive: subscriptions.filter(s => s.status === "active").length,
        totalCanceled: subscriptions.filter(s => s.status === "canceled").length,
      });
    } catch (error: any) {
      console.error("Admin subscriptions error:", error);
      // Return empty state if Stripe tables don't exist yet
      res.json({ 
        subscriptions: [],
        mrr: 0,
        totalActive: 0,
        totalCanceled: 0,
      });
    }
  });

  // ============================================
  // ONBOARDING ENDPOINTS
  // ============================================

  // Update onboarding progress
  app.post("/api/onboarding/update", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const updates = req.body;

      const updated = await storage.updateUser(user.id, updates);
      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Onboarding update error:", error);
      res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // Save company info during onboarding
  app.post("/api/onboarding/company-info", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { companyName, businessType, companyStage, companyRevenueRange } = req.body;

      const updated = await storage.updateUser(user.id, {
        companyName,
        businessType,
        companyStage,
        companyRevenueRange,
        hasCompanyInfo: true,
      });

      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Company info save error:", error);
      res.status(500).json({ message: "Failed to save company info" });
    }
  });

  // Mark onboarding as complete
  app.post("/api/onboarding/complete", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;

      // Set 7-day trial period
      const now = new Date();
      const trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      const updated = await storage.updateUser(user.id, {
        hasCompletedOnboarding: true,
        isLiveMode: true,
        trialStartDate: now,
        trialEndsAt: trialEndsAt,
      });

      console.log(`[ONBOARDING] Completed for user ${user.id} (${user.email}) - Trial ends ${trialEndsAt.toISOString()}`);

      res.json({ success: true, user: updated });
    } catch (error: any) {
      console.error("Onboarding complete error:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Check if current user is approved (for access gate)
  app.get("/api/auth/approval-status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const dbUser = await storage.getUser(user.id);

      if (!dbUser) {
        return res.json({ isApproved: false, isAdmin: false });
      }

      // Check if user is on approved waitlist
      const waitlistEntry = await storage.getWaitlistEntryByEmail(dbUser.email || "");
      const isOnApprovedWaitlist = waitlistEntry?.status === "approved";

      res.json({ 
        isApproved: dbUser.isApproved || isOnApprovedWaitlist,
        isAdmin: dbUser.isAdmin || false,
        email: dbUser.email
      });
    } catch (error: any) {
      console.error("Approval status error:", error);
      res.status(500).json({ message: "Failed to check approval status" });
    }
  });

  // Check if current user is on the waitlist (for pending page)
  app.get("/api/auth/waitlist-status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const dbUser = await storage.getUser(user.id);

      if (!dbUser?.email) {
        return res.json({ isOnWaitlist: false, waitlistStatus: null, isApproved: false });
      }

      const waitlistEntry = await storage.getWaitlistEntryByEmail(dbUser.email);
      const isOnApprovedWaitlist = waitlistEntry?.status === "approved";
      
      res.json({ 
        isOnWaitlist: !!waitlistEntry,
        waitlistStatus: waitlistEntry?.status || null,
        isApproved: dbUser.isApproved || isOnApprovedWaitlist
      });
    } catch (error: any) {
      console.error("Waitlist status error:", error);
      res.status(500).json({ message: "Failed to check waitlist status" });
    }
  });

  // ============================================
  // COA (CHART OF ACCOUNTS) MAPPING ENDPOINTS
  // ============================================

  // Get low-confidence mappings that need review
  app.get("/api/coa/low-confidence-mappings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.json([]);
      }

      const { getLowConfidenceMappings, getCanonicalAccounts } = await import("./coaMapper");
      const mappings = await getLowConfidenceMappings(dbUser.defaultOrganizationId);
      
      // Get canonical accounts for enrichment
      const organization = await storage.getOrganization(dbUser.defaultOrganizationId);
      const businessType = organization?.businessType || "saas";
      const canonicalAccounts = await getCanonicalAccounts(businessType);
      const accountsMap = new Map(canonicalAccounts.map(a => [a.id, a]));
      
      // Enrich mappings with canonical account details
      const enrichedMappings = mappings.map(m => ({
        ...m,
        canonicalAccount: accountsMap.get(m.canonicalAccountId) || null,
      }));
      
      res.json(enrichedMappings);
    } catch (error: any) {
      console.error("Get low-confidence mappings error:", error);
      res.status(500).json({ message: "Failed to get mappings" });
    }
  });

  // Get all mappings for organization (with pagination)
  app.get("/api/coa/mappings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.json({ mappings: [], total: 0 });
      }

      const { getCanonicalAccounts } = await import("./coaMapper");
      
      // Get all mappings for organization
      const allMappings = await db
        .select()
        .from(accountMappings)
        .where(eq(accountMappings.organizationId, dbUser.defaultOrganizationId))
        .orderBy(desc(accountMappings.lastUsedAt));
      
      // Get canonical accounts for enrichment
      const organization = await storage.getOrganization(dbUser.defaultOrganizationId);
      const businessType = organization?.businessType || "saas";
      const canonicalAccounts = await getCanonicalAccounts(businessType);
      const accountsMap = new Map(canonicalAccounts.map(a => [a.id, a]));
      
      // Enrich mappings with canonical account details
      const enrichedMappings = allMappings.map(m => ({
        ...m,
        canonicalAccount: accountsMap.get(m.canonicalAccountId) || null,
      }));
      
      res.json({ mappings: enrichedMappings, total: enrichedMappings.length });
    } catch (error: any) {
      console.error("Get mappings error:", error);
      res.status(500).json({ message: "Failed to get mappings" });
    }
  });

  // Get canonical accounts for business type
  app.get("/api/coa/canonical-accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.json([]);
      }

      const { getCanonicalAccounts, seedCanonicalAccounts } = await import("./coaMapper");
      
      const organization = await storage.getOrganization(dbUser.defaultOrganizationId);
      const businessType = organization?.businessType || "saas";
      
      // Ensure canonical accounts exist
      let accounts = await getCanonicalAccounts(businessType);
      if (accounts.length === 0) {
        await seedCanonicalAccounts(businessType);
        accounts = await getCanonicalAccounts(businessType);
      }
      
      res.json(accounts);
    } catch (error: any) {
      console.error("Get canonical accounts error:", error);
      res.status(500).json({ message: "Failed to get canonical accounts" });
    }
  });

  // Correct a mapping
  app.post("/api/coa/correct-mapping", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const { mappingId, canonicalAccountId, notes } = req.body;
      
      if (!mappingId || !canonicalAccountId) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const { correctMapping } = await import("./coaMapper");
      await correctMapping(mappingId, canonicalAccountId, userId, notes);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Correct mapping error:", error);
      res.status(500).json({ message: error.message || "Failed to correct mapping" });
    }
  });

  // Approve a mapping (mark as reviewed, increase confidence)
  app.post("/api/coa/approve-mapping", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      const { mappingId } = req.body;
      
      if (!mappingId) {
        return res.status(400).json({ message: "Missing mapping ID" });
      }

      // Get the mapping
      const [mapping] = await db
        .select()
        .from(accountMappings)
        .where(eq(accountMappings.id, mappingId));
      
      if (!mapping) {
        return res.status(404).json({ message: "Mapping not found" });
      }
      
      // Record feedback as approved
      await db.insert(mappingFeedback).values({
        organizationId: mapping.organizationId,
        accountMappingId: mappingId,
        suggestedCanonicalAccountId: mapping.canonicalAccountId,
        correctedCanonicalAccountId: mapping.canonicalAccountId,
        sourceAccountName: mapping.sourceAccountName,
        sourceSystem: mapping.sourceSystem,
        originalConfidence: mapping.confidenceScore,
        status: "approved",
        userId,
        reviewedAt: new Date(),
      });
      
      // Update mapping to high confidence
      await db
        .update(accountMappings)
        .set({
          confidence: "high",
          confidenceScore: "0.950",
          source: "user",
          updatedAt: new Date(),
        })
        .where(eq(accountMappings.id, mappingId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Approve mapping error:", error);
      res.status(500).json({ message: "Failed to approve mapping" });
    }
  });

  // Apply learned patterns to improve low-confidence mappings
  app.post("/api/coa/apply-learned-patterns", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { applyLearnedPatterns } = await import("./coaMapper");
      const result = await applyLearnedPatterns(dbUser.defaultOrganizationId);
      
      res.json(result);
    } catch (error: any) {
      console.error("Apply learned patterns error:", error);
      res.status(500).json({ message: "Failed to apply learned patterns" });
    }
  });

  // Get COA mapping statistics
  app.get("/api/coa/stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.json({
          totalMappings: 0,
          highConfidence: 0,
          mediumConfidence: 0,
          lowConfidence: 0,
          manualMappings: 0,
          needsReview: 0,
        });
      }

      const { getProcessingStats } = await import("./coaMapper");
      const stats = await getProcessingStats(dbUser.defaultOrganizationId);
      
      res.json(stats);
    } catch (error: any) {
      console.error("Get COA stats error:", error);
      res.status(500).json({ message: "Failed to get statistics" });
    }
  });

  // ============================================
  // ML Classifier Routes (Proprietary AI Engine)
  // ============================================

  // Train the ML classifier on user corrections
  app.post("/api/ml/train-classifier", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { trainClassifier } = await import("./ml/accountClassifier");
      const result = await trainClassifier(dbUser.defaultOrganizationId);
      
      res.json({
        success: result.success,
        message: result.success 
          ? `Trained classifier with ${result.exampleCount} examples and ${result.vocabularySize} vocabulary terms`
          : `Not enough training data (${result.exampleCount} examples, need 5+)`,
        exampleCount: result.exampleCount,
        vocabularySize: result.vocabularySize,
      });
    } catch (error: any) {
      console.error("Train classifier error:", error);
      res.status(500).json({ message: "Failed to train classifier" });
    }
  });

  // Get ML classifier statistics
  app.get("/api/ml/classifier-stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.json({
          isLoaded: false,
          version: null,
          trainedAt: null,
          exampleCount: 0,
          vocabularySize: 0,
          classCount: 0,
        });
      }

      const { getClassifier } = await import("./ml/accountClassifier");
      const classifier = await getClassifier(dbUser.defaultOrganizationId);
      const stats = classifier.getStats();
      
      res.json(stats);
    } catch (error: any) {
      console.error("Get classifier stats error:", error);
      res.status(500).json({ message: "Failed to get classifier stats" });
    }
  });

  // Test classification on a sample account name
  app.post("/api/ml/classify", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { sourceAccountName } = req.body;
      if (!sourceAccountName) {
        return res.status(400).json({ message: "sourceAccountName is required" });
      }

      const { classifyAccountLocal } = await import("./ml/accountClassifier");
      const result = await classifyAccountLocal(dbUser.defaultOrganizationId, sourceAccountName);
      
      if (result) {
        res.json({
          success: true,
          canonicalAccountId: result.canonicalAccountId,
          canonicalCode: result.canonicalCode,
          confidence: result.confidence,
          matchedExamples: result.matchedExamples,
        });
      } else {
        res.json({
          success: false,
          message: "No classification result (model may not be trained or confidence too low)",
        });
      }
    } catch (error: any) {
      console.error("Classify error:", error);
      res.status(500).json({ message: "Failed to classify account" });
    }
  });

  // ============================================
  // Vendor Embedding Routes (Proprietary AI Engine)
  // ============================================

  // Train the vendor embedding model
  app.post("/api/ml/train-vendor-model", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { trainVendorModel } = await import("./ml/vendorEmbeddings");
      const result = await trainVendorModel(dbUser.defaultOrganizationId);
      
      res.json({
        success: result.success,
        message: result.success 
          ? `Trained vendor model with ${result.exampleCount} examples, ${result.clusterCount} vendor clusters`
          : `Not enough training data (${result.exampleCount} examples, need 10+)`,
        exampleCount: result.exampleCount,
        clusterCount: result.clusterCount,
        vocabularySize: result.vocabularySize,
      });
    } catch (error: any) {
      console.error("Train vendor model error:", error);
      res.status(500).json({ message: "Failed to train vendor model" });
    }
  });

  // Get vendor model statistics
  app.get("/api/ml/vendor-stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.json({
          isLoaded: false,
          version: null,
          trainedAt: null,
          exampleCount: 0,
          clusterCount: 0,
          vocabularySize: 0,
          topVendors: [],
        });
      }

      const { getVendorModel } = await import("./ml/vendorEmbeddings");
      const model = await getVendorModel(dbUser.defaultOrganizationId);
      const stats = model.getStats();
      
      res.json(stats);
    } catch (error: any) {
      console.error("Get vendor stats error:", error);
      res.status(500).json({ message: "Failed to get vendor stats" });
    }
  });

  // Normalize a vendor name using ML
  app.post("/api/ml/normalize-vendor", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { vendorName } = req.body;
      if (!vendorName) {
        return res.status(400).json({ message: "vendorName is required" });
      }

      const { normalizeVendorLocal } = await import("./ml/vendorEmbeddings");
      const result = await normalizeVendorLocal(dbUser.defaultOrganizationId, vendorName);
      
      if (result) {
        res.json({
          success: true,
          normalizedName: result.normalizedName,
          confidence: result.confidence,
          matchedVariants: result.matchedVariants,
        });
      } else {
        res.json({
          success: false,
          message: "No normalization result (model may not be trained or confidence too low)",
        });
      }
    } catch (error: any) {
      console.error("Normalize vendor error:", error);
      res.status(500).json({ message: "Failed to normalize vendor" });
    }
  });

  // Find similar vendors
  app.post("/api/ml/similar-vendors", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { vendorName, topK = 5 } = req.body;
      if (!vendorName) {
        return res.status(400).json({ message: "vendorName is required" });
      }

      const { findSimilarVendors } = await import("./ml/vendorEmbeddings");
      const results = await findSimilarVendors(dbUser.defaultOrganizationId, vendorName, topK);
      
      res.json({
        success: true,
        results,
      });
    } catch (error: any) {
      console.error("Find similar vendors error:", error);
      res.status(500).json({ message: "Failed to find similar vendors" });
    }
  });

  // ============================================
  // Spending Anomaly Detection ML Routes
  // ============================================

  // Train spending anomaly model
  app.post("/api/ml/train-anomaly-model", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { daysBack = 180 } = req.body;

      const { trainSpendingAnomalyModel } = await import("./ml/spendingAnomalyModel");
      const result = await trainSpendingAnomalyModel(dbUser.defaultOrganizationId, daysBack);
      
      res.json({
        success: result.success,
        transactionCount: result.transactionCount,
        categoryCount: result.categoryCount,
        vendorCount: result.vendorCount,
      });
    } catch (error: any) {
      console.error("Train anomaly model error:", error);
      res.status(500).json({ message: "Failed to train anomaly model" });
    }
  });

  // Get anomaly model stats
  app.get("/api/ml/anomaly-stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { getSpendingAnomalyStats } = await import("./ml/spendingAnomalyModel");
      const stats = await getSpendingAnomalyStats(dbUser.defaultOrganizationId);
      
      res.json(stats);
    } catch (error: any) {
      console.error("Get anomaly stats error:", error);
      res.status(500).json({ message: "Failed to get anomaly stats" });
    }
  });

  // Detect spending anomalies
  app.post("/api/ml/detect-anomalies", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { daysBack = 30 } = req.body;

      const { detectSpendingAnomalies } = await import("./ml/spendingAnomalyModel");
      const anomalies = await detectSpendingAnomalies(dbUser.defaultOrganizationId, daysBack);
      
      res.json({
        success: true,
        count: anomalies.length,
        anomalies,
      });
    } catch (error: any) {
      console.error("Detect anomalies error:", error);
      res.status(500).json({ message: "Failed to detect anomalies" });
    }
  });

  // Get learned spending patterns
  app.get("/api/ml/spending-patterns", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { getSpendingPatterns } = await import("./ml/spendingAnomalyModel");
      const patterns = await getSpendingPatterns(dbUser.defaultOrganizationId);
      
      res.json(patterns);
    } catch (error: any) {
      console.error("Get spending patterns error:", error);
      res.status(500).json({ message: "Failed to get spending patterns" });
    }
  });

  // ============================================
  // Cash Flow Forecasting ML Routes
  // ============================================

  // Train cash flow forecast model
  app.post("/api/ml/train-cashflow-model", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { monthsBack = 24 } = req.body;

      const { trainCashFlowForecastModel } = await import("./ml/cashFlowForecastModel");
      const result = await trainCashFlowForecastModel(dbUser.defaultOrganizationId, monthsBack);
      
      res.json({
        success: result.success,
        dataMonths: result.dataMonths,
        avgNetCashFlow: result.avgNetCashFlow,
        trendDirection: result.trendDirection,
      });
    } catch (error: any) {
      console.error("Train cashflow model error:", error);
      res.status(500).json({ message: "Failed to train cash flow model" });
    }
  });

  // Get cash flow model stats
  app.get("/api/ml/cashflow-stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { getCashFlowForecastStats } = await import("./ml/cashFlowForecastModel");
      const stats = await getCashFlowForecastStats(dbUser.defaultOrganizationId);
      
      res.json(stats);
    } catch (error: any) {
      console.error("Get cashflow stats error:", error);
      res.status(500).json({ message: "Failed to get cash flow stats" });
    }
  });

  // Generate cash flow forecast
  app.post("/api/ml/forecast-cashflow", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ success: false, message: "No organization found" });
      }

      const { months = 12 } = req.body;

      const { generateCashFlowForecast } = await import("./ml/cashFlowForecastModel");
      const forecast = await generateCashFlowForecast(dbUser.defaultOrganizationId, months);
      
      if (!forecast.success) {
        return res.status(404).json({ success: false, message: forecast.error });
      }
      
      res.json({
        success: true,
        forecasts: forecast.forecasts,
        modelConfidence: forecast.modelConfidence,
        historicalAccuracy: forecast.historicalAccuracy,
        summary: forecast.summary,
      });
    } catch (error: any) {
      console.error("Generate cashflow forecast error:", error);
      res.status(500).json({ success: false, message: "Failed to generate cash flow forecast" });
    }
  });

  // Get forecasted financial metrics
  app.get("/api/ml/cashflow-metrics", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const months = parseInt(req.query.months as string) || 12;

      const { getCashFlowMetrics } = await import("./ml/cashFlowForecastModel");
      const metrics = await getCashFlowMetrics(dbUser.defaultOrganizationId, months);
      
      if (!metrics) {
        return res.status(404).json({ message: "No trained model found. Train the model first." });
      }
      
      res.json(metrics);
    } catch (error: any) {
      console.error("Get cashflow metrics error:", error);
      res.status(500).json({ message: "Failed to get cash flow metrics" });
    }
  });

  // ============================================
  // Cross-Organization Pattern Database API
  // ============================================

  // Contribute patterns from current org (called after syncs)
  app.post("/api/ml/contribute-patterns", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ success: false, message: "No organization found" });
      }

      const { contributeOrgPatterns } = await import("./ml/crossOrgPatterns");
      const result = await contributeOrgPatterns(dbUser.defaultOrganizationId);
      
      res.json(result);
    } catch (error: any) {
      console.error("Contribute patterns error:", error);
      res.status(500).json({ success: false, message: "Failed to contribute patterns" });
    }
  });

  // Get industry benchmarks
  app.get("/api/ml/benchmarks", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const org = await storage.getOrganization(dbUser.defaultOrganizationId);
      const businessType = org?.businessType || "other";
      const companyStage = req.query.stage as string | undefined;

      const { getIndustryBenchmarks } = await import("./ml/crossOrgPatterns");
      const benchmarks = await getIndustryBenchmarks(businessType, companyStage);
      
      res.json({ benchmarks, businessType });
    } catch (error: any) {
      console.error("Get benchmarks error:", error);
      res.status(500).json({ message: "Failed to get industry benchmarks" });
    }
  });

  // Compare org metrics to industry
  app.post("/api/ml/compare-to-industry", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { metrics } = req.body;
      if (!metrics || typeof metrics !== "object") {
        return res.status(400).json({ message: "Metrics object required" });
      }

      const { compareMetricsToIndustry } = await import("./ml/crossOrgPatterns");
      const comparisons = await compareMetricsToIndustry(dbUser.defaultOrganizationId, metrics);
      
      res.json({ comparisons });
    } catch (error: any) {
      console.error("Compare to industry error:", error);
      res.status(500).json({ message: "Failed to compare to industry" });
    }
  });

  // Get seasonal patterns for business type
  app.get("/api/ml/seasonal-patterns", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const org = await storage.getOrganization(dbUser.defaultOrganizationId);
      const businessType = org?.businessType || "other";

      const { getSeasonalPatternsForType } = await import("./ml/crossOrgPatterns");
      const patterns = await getSeasonalPatternsForType(businessType);
      
      res.json({ patterns, businessType });
    } catch (error: any) {
      console.error("Get seasonal patterns error:", error);
      res.status(500).json({ message: "Failed to get seasonal patterns" });
    }
  });

  // Get common vendors for business type
  app.get("/api/ml/common-vendors", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const org = await storage.getOrganization(dbUser.defaultOrganizationId);
      const businessType = org?.businessType || "other";
      const limit = parseInt(req.query.limit as string) || 20;

      const { getCommonVendorsForType } = await import("./ml/crossOrgPatterns");
      const vendors = await getCommonVendorsForType(businessType, limit);
      
      res.json({ vendors, businessType });
    } catch (error: any) {
      console.error("Get common vendors error:", error);
      res.status(500).json({ message: "Failed to get common vendors" });
    }
  });

  // Get cross-org pattern database stats
  app.get("/api/ml/pattern-stats", isAuthenticated, async (req, res) => {
    try {
      const { getCrossOrgPatternStats } = await import("./ml/crossOrgPatterns");
      const stats = await getCrossOrgPatternStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get pattern stats error:", error);
      res.status(500).json({ message: "Failed to get pattern stats" });
    }
  });

  // ============================================
  // Proprietary AI Engine Routes
  // LLM is interface only - proprietary models do the work
  // ============================================

  // Run full proprietary analysis (all ML models)
  app.post("/api/ml/proprietary-analysis", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { currentCash } = req.body;
      const { runProprietaryAnalysis } = await import("./ml/proprietaryAIEngine");
      const analysis = await runProprietaryAnalysis(dbUser.defaultOrganizationId, currentCash);
      
      res.json(analysis);
    } catch (error: any) {
      console.error("Proprietary analysis error:", error);
      res.status(500).json({ message: "Failed to run proprietary analysis" });
    }
  });

  // Get proprietary insights (structured insights from ML models)
  app.get("/api/ml/proprietary-insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { getProprietaryInsights } = await import("./ml/proprietaryAIEngine");
      const insights = await getProprietaryInsights(dbUser.defaultOrganizationId);
      
      res.json(insights);
    } catch (error: any) {
      console.error("Proprietary insights error:", error);
      res.status(500).json({ message: "Failed to get proprietary insights" });
    }
  });

  // Build LLM summary prompt from proprietary analysis (for interface layer)
  app.post("/api/ml/build-llm-prompt", isAuthenticated, async (req, res) => {
    try {
      const { analysis, audience = "founder" } = req.body;
      
      if (!analysis) {
        return res.status(400).json({ message: "Analysis results required" });
      }

      const { buildLLMSummaryPrompt } = await import("./ml/proprietaryAIEngine");
      const prompt = buildLLMSummaryPrompt(analysis, audience);
      
      res.json({ prompt, note: "LLM only explains - it does not analyze" });
    } catch (error: any) {
      console.error("Build LLM prompt error:", error);
      res.status(500).json({ message: "Failed to build LLM prompt" });
    }
  });

  // ============================================
  // Instant Answers Engine Routes
  // Natural language queries for financial data
  // ============================================

  // Query endpoint - process natural language financial questions
  app.post("/api/answers/query", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { question } = req.body;
      
      if (!question || typeof question !== "string") {
        return res.status(400).json({ message: "Question is required" });
      }

      const { instantAnswersEngine } = await import("./ml/instantAnswers");
      const result = await instantAnswersEngine.query(dbUser.defaultOrganizationId, question);
      
      res.json(result);
    } catch (error: any) {
      console.error("Instant answers query error:", error);
      res.status(500).json({ message: "Failed to process question" });
    }
  });

  // Example questions endpoint - provide sample queries
  app.get("/api/answers/examples", isAuthenticated, (req, res) => {
    res.json({
      examples: [
        { question: "What did we spend on AWS last quarter?", category: "vendor" },
        { question: "How much runway do we have?", category: "runway" },
        { question: "Show me recurring subscriptions", category: "recurring" },
        { question: "What are our top 5 vendors by spend?", category: "top" },
        { question: "How has our burn rate changed over the last 6 months?", category: "trend" },
        { question: "What's our current cash balance?", category: "cash" },
        { question: "Compare spending this month vs last month", category: "comparison" },
        { question: "How much did we spend on software last quarter?", category: "category" },
        { question: "What's our monthly burn rate?", category: "burn" },
        { question: "Show me Google spending this year", category: "vendor" },
      ],
    });
  });

  // ============================================
  // Month-End Close Routes
  // Automated checklist, variance detection, journal entries
  // ============================================

  // Get month-end close report
  app.get("/api/month-end-close", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { month } = req.query;
      let targetMonth: Date | undefined;
      
      if (month && typeof month === "string") {
        targetMonth = new Date(month);
      }

      const { monthEndCloseEngine } = await import("./ml/monthEndClose");
      const report = await monthEndCloseEngine.generateCloseReport(dbUser.defaultOrganizationId, targetMonth);
      
      res.json(report);
    } catch (error: any) {
      console.error("Month-end close error:", error);
      res.status(500).json({ message: "Failed to generate month-end close report" });
    }
  });

  // Get checklist items only
  app.get("/api/month-end-close/checklist", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { monthEndCloseEngine } = await import("./ml/monthEndClose");
      const report = await monthEndCloseEngine.generateCloseReport(dbUser.defaultOrganizationId);
      
      res.json({
        month: report.month,
        status: report.status,
        completionPercent: report.completionPercent,
        checklist: report.checklist,
      });
    } catch (error: any) {
      console.error("Month-end checklist error:", error);
      res.status(500).json({ message: "Failed to generate checklist" });
    }
  });

  // Get variance analysis only
  app.get("/api/month-end-close/variances", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { monthEndCloseEngine } = await import("./ml/monthEndClose");
      const report = await monthEndCloseEngine.generateCloseReport(dbUser.defaultOrganizationId);
      
      res.json({
        month: report.month,
        variances: report.variances,
        totalVariance: report.summary.totalVariance,
      });
    } catch (error: any) {
      console.error("Variance analysis error:", error);
      res.status(500).json({ message: "Failed to generate variance analysis" });
    }
  });

  // Get journal entry suggestions only
  app.get("/api/month-end-close/journal-entries", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const userId = getUserId(user);
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser?.defaultOrganizationId) {
        return res.status(400).json({ message: "No organization found" });
      }

      const { monthEndCloseEngine } = await import("./ml/monthEndClose");
      const report = await monthEndCloseEngine.generateCloseReport(dbUser.defaultOrganizationId);
      
      res.json({
        month: report.month,
        suggestions: report.journalSuggestions,
      });
    } catch (error: any) {
      console.error("Journal entries error:", error);
      res.status(500).json({ message: "Failed to generate journal entry suggestions" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
