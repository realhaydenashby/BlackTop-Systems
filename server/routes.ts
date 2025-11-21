import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import {
  extractTransactionsFromDocument,
  generateInsights,
  generateBudgetSuggestions,
  generateActionPlan,
} from "./openai";
import { z } from "zod";
import { User, insertOrganizationSchema, insertDocumentSchema, insertTransactionSchema } from "@shared/schema";
import * as pdfParse from "pdf-parse";
import Papa from "papaparse";
import { subDays, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { generateMockDashboardStats, generateMockAnalytics, generateMockInsights } from "./mockData";

const objectStorageService = new ObjectStorageService();

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

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if Document AI is configured
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
      
      // Create transaction records from AI extraction
      for (const txn of transactions) {
        if (!txn.date || !txn.amount) {
          continue;
        }

        const vendor = txn.vendor
          ? await storage.findOrCreateVendor(organizationId, txn.vendor)
          : null;

        const category = txn.category
          ? await storage.findOrCreateCategory(organizationId, txn.category)
          : null;

        await storage.createTransaction({
          organizationId,
          documentId,
          date: new Date(txn.date),
          amount: txn.amount.toString(),
          currency: "USD",
          vendorId: vendor?.id || null,
          categoryId: category?.id || null,
          description: txn.description || null,
          isRecurring: false,
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

    // Create transaction records
    for (const txn of result.transactions) {
      if (!txn.date || !txn.amount) {
        continue; // Skip invalid transactions
      }

      // Find or create vendor
      const vendor = txn.vendor
        ? await storage.findOrCreateVendor(organizationId, txn.vendor)
        : null;

      // Find or create category
      const category = txn.category
        ? await storage.findOrCreateCategory(organizationId, txn.category)
        : null;

      // Create transaction
      await storage.createTransaction({
        organizationId,
        documentId,
        date: new Date(txn.date),
        amount: txn.amount.toString(),
        currency: "USD",
        vendorId: vendor?.id || null,
        categoryId: category?.id || null,
        description: txn.description || null,
        isRecurring: false, // Will be detected later
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

  async function processDocument(
    documentId: string,
    fileUrl: string,
    documentType: string,
    organizationId: string
  ) {
    try {
      await storage.updateDocument(documentId, { status: "processing" });

      const objectFile = await objectStorageService.getObjectEntityFile(fileUrl);
      const [fileBuffer] = await objectFile.download();

      let parsedText = "";

      if (fileUrl.endsWith(".pdf")) {
        const pdfData = await (pdfParse as any).default(fileBuffer);
        parsedText = pdfData.text;
      } else if (fileUrl.endsWith(".csv")) {
        const csvText = fileBuffer.toString("utf-8");
        parsedText = csvText;
      } else {
        parsedText = fileBuffer.toString("utf-8");
      }

      await storage.updateDocument(documentId, { parsedText });

      const extracted = await extractTransactionsFromDocument(parsedText, documentType);

      if (extracted.transactions && extracted.transactions.length > 0) {
        for (const txn of extracted.transactions) {
          const vendor = await storage.findOrCreateVendor(organizationId, txn.vendor);
          const category = await storage.findOrCreateCategory(organizationId, txn.category || "Misc");

          await storage.createTransaction({
            organizationId,
            documentId,
            date: new Date(txn.date),
            amount: txn.amount.toString(),
            vendorId: vendor.id,
            categoryId: category.id,
            description: txn.description || "",
          });
        }
      }

      await storage.updateDocument(documentId, {
        status: "processed",
        extractionConfidence: extracted.confidence?.toString() || "0.8",
      });
    } catch (error) {
      console.error("Document processing error:", error);
      await storage.updateDocument(documentId, { status: "error" });
    }
  }

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
      // Always return mock data for demo purposes
      return res.json(generateMockDashboardStats());
      
      // Original code commented out for mock data
      /*
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

      const spendByCategory = recentTxns.reduce((acc: any[], txn) => {
        const catName = txn.category?.name || "Uncategorized";
        const existing = acc.find((item) => item.name === catName);
        if (existing) {
          existing.value += parseFloat(txn.amount);
        } else {
          acc.push({ name: catName, value: parseFloat(txn.amount) });
        }
        return acc;
      }, []);

      const spendByDepartment = recentTxns.reduce((acc: any[], txn) => {
        if (txn.department) {
          const deptName = txn.department.name;
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
      });
      */
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Insights
  app.get("/api/insights", isAuthenticated, async (req, res) => {
    try {
      // Always return mock data for demo purposes
      return res.json(generateMockInsights());

      // Original code commented out for mock data
      /*
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json(generateMockInsights());
      }
      const organizationId = orgs[0].id;

      const insights = await storage.getOrganizationInsights(organizationId);

      if (insights.length === 0) {
        const txns = await storage.getOrganizationTransactions(organizationId, {
          startDate: subDays(new Date(), 90),
        });
        const budgets = await storage.getOrganizationBudgets(organizationId);

        if (txns.length > 10) {
          const generatedInsights = await generateInsights(txns, budgets);
          for (const insight of generatedInsights) {
            await storage.createInsight({
              organizationId,
              type: insight.type,
              title: insight.title,
              description: insight.description,
              metricValue: insight.metricValue?.toString(),
              severity: insight.severity,
              period: insight.period,
            });
          }
          const newInsights = await storage.getOrganizationInsights(organizationId);
          return res.json(newInsights);
        }
      }

      res.json(insights);
      */
    } catch (error: any) {
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

      const suggestions = await generateBudgetSuggestions(txns, org);

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
      // Always return comprehensive mock data for all analytics sections
      const { days = "30" } = req.query;
      const daysNum = parseInt(days as string);
      return res.json(generateMockAnalytics(daysNum));

      // Original code commented out for mock data
      /*
      const user = req.user as any;
      const userId = user.claims.sub;

      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.length === 0) {
        return res.json(generateMockAnalytics(30));
      }
      const organizationId = orgs[0].id;

      const startDate = subDays(new Date(), daysNum);

      const txns = await storage.getOrganizationTransactions(organizationId, {
        startDate,
      });

      const spendTrend = txns.reduce((acc: any[], txn) => {
        const date = new Date(txn.date).toISOString().split("T")[0];
        const existing = acc.find((item) => item.date === date);
        if (existing) {
          existing.amount += parseFloat(txn.amount);
        } else {
          acc.push({ date, amount: parseFloat(txn.amount) });
        }
        return acc;
      }, []);

      const categoryDistribution = txns.reduce((acc: any[], txn) => {
        const catName = txn.category?.name || "Uncategorized";
        const existing = acc.find((item) => item.name === catName);
        if (existing) {
          existing.value += parseFloat(txn.amount);
        } else {
          acc.push({ name: catName, value: parseFloat(txn.amount) });
        }
        return acc;
      }, []);

      const departmentSpending = txns.reduce((acc: any[], txn) => {
        if (txn.department) {
          const deptName = txn.department.name;
          const existing = acc.find((item) => item.name === deptName);
          if (existing) {
            existing.value += parseFloat(txn.amount);
          } else {
            acc.push({ name: deptName, value: parseFloat(txn.amount) });
          }
        }
        return acc;
      }, []);

      const topVendors = txns.reduce((acc: any[], txn) => {
        if (txn.vendor) {
          const vendorName = txn.vendor.name;
          const existing = acc.find((item) => item.name === vendorName);
          if (existing) {
            existing.value += parseFloat(txn.amount);
          } else {
            acc.push({ name: vendorName, value: parseFloat(txn.amount) });
          }
        }
        return acc;
      }, []).sort((a, b) => b.value - a.value).slice(0, 10);

      res.json({
        spendTrend,
        categoryDistribution,
        departmentSpending,
        topVendors,
        monthlyComparison: [],
      });
      */
    } catch (error: any) {
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

      const generated = await generateActionPlan(insights, budgets, txns);

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

      for (const item of generated.actionItems || []) {
        await storage.createActionItem({
          actionPlanId: plan.id,
          type: item.type,
          description: item.description,
          impactEstimate: item.impactEstimate?.toString(),
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
          ...yodleeConnection.metadata,
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

  const httpServer = createServer(app);
  return httpServer;
}
