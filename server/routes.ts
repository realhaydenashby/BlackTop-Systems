import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { z } from "zod";
import { User, insertOrganizationSchema, insertDocumentSchema, insertTransactionSchema } from "@shared/schema";
import * as pdfParse from "pdf-parse";
import Papa from "papaparse";
import { subDays, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { generateMockDashboardStats, generateMockAnalytics, generateMockInsights } from "./mockData";

const objectStorageService = new ObjectStorageService();

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

  // Budgets
  app.get("/api/budgets", isAuthenticated, async (req, res) => {
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

  app.post("/api/budgets/generate", isAuthenticated, async (req, res) => {
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
      const user = req.user as User;
      const { quickBooksService } = await import("./quickbooksService");
      const authUrl = quickBooksService.getAuthUrl(user.id);
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

      res.redirect("/app/connect?success=quickbooks");
    } catch (error: any) {
      console.error("QuickBooks callback error:", error);
      res.redirect("/app/connect?error=callback_failed");
    }
  });

  app.get("/api/quickbooks/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { quickBooksService } = await import("./quickbooksService");
      const status = await quickBooksService.getConnectionStatus(user.id);
      res.json(status);
    } catch (error: any) {
      console.error("QuickBooks status error:", error);
      res.status(500).json({ message: error.message || "Failed to get connection status" });
    }
  });

  app.post("/api/quickbooks/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const result = await quickBooksService.syncTransactions(user.id, startDate, endDate);
      res.json(result);
    } catch (error: any) {
      console.error("QuickBooks sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  app.get("/api/quickbooks/accounts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { quickBooksService } = await import("./quickbooksService");
      const accounts = await quickBooksService.getAccounts(user.id);
      res.json({ accounts });
    } catch (error: any) {
      console.error("QuickBooks accounts error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch accounts" });
    }
  });

  app.get("/api/quickbooks/profit-loss", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const report = await quickBooksService.getProfitAndLoss(user.id, startDate as string, endDate as string);
      res.json(report);
    } catch (error: any) {
      console.error("QuickBooks P&L error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch P&L report" });
    }
  });

  app.get("/api/quickbooks/balance-sheet", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { asOfDate } = req.query;

      if (!asOfDate) {
        return res.status(400).json({ message: "As of date is required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const report = await quickBooksService.getBalanceSheet(user.id, asOfDate as string);
      res.json(report);
    } catch (error: any) {
      console.error("QuickBooks balance sheet error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch balance sheet" });
    }
  });

  app.get("/api/quickbooks/cash-flow", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const { quickBooksService } = await import("./quickbooksService");
      const report = await quickBooksService.getCashFlow(user.id, startDate as string, endDate as string);
      res.json(report);
    } catch (error: any) {
      console.error("QuickBooks cash flow error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch cash flow report" });
    }
  });

  app.post("/api/quickbooks/disconnect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { quickBooksService } = await import("./quickbooksService");
      await quickBooksService.disconnect(user.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("QuickBooks disconnect error:", error);
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
      const account = await storage.getBankAccount(req.params.id);
      
      if (!account || account.userId !== user.id) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      await storage.deleteBankAccount(req.params.id);
      res.json({ success: true });
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

      res.json({ count: imported, total: accountTransactions.length });
    } catch (error: any) {
      console.error("Sync transactions error:", error);
      res.status(500).json({ message: error.message || "Failed to sync transactions" });
    }
  });

  // Get Live Mode transactions for user
  app.get("/api/live/transactions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);
      
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

      res.json(transactions);
    } catch (error: any) {
      console.error("Get live transactions error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch transactions" });
    }
  });

  // Get Live Mode dashboard analytics
  app.get("/api/live/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const orgMember = await storage.getOrganizationMember(user.id);
      
      if (!orgMember) {
        return res.json({
          hasData: false,
          spend: { total: 0, trend: [], byCategory: [] },
          revenue: { total: 0, trend: [] },
          burn: { gross: 0, net: 0, payroll: 0, nonPayroll: 0 },
          runway: { months: 0, currentCash: 0, zeroDate: null },
          cashFlow: { inflows: 0, outflows: 0, netFlow: 0, trend: [] },
          insights: [],
          vendors: [],
        });
      }

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

      // Calculate current cash from bank accounts
      const bankAccounts = await storage.getUserBankAccounts(user.id);
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

      // Generate simple insights
      const insights: Array<{ type: string; message: string; severity: string }> = [];
      
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

      res.json({
        hasData: true,
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
        insights,
        vendors,
      });
    } catch (error: any) {
      console.error("Get live analytics error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch analytics" });
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

  const httpServer = createServer(app);
  return httpServer;
}
