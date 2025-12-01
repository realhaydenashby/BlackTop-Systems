import { db } from "./db";
import { transactions, categories, budgets, budgetLines, forecasts, organizations, bankAccounts } from "@shared/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { normalizationService } from "./normalizationService";
import { callAI } from "./aiService";
import { transformPlaidTransaction, getCategoryColor as getTransformCategoryColor } from "./plaidTransformService";

interface AutoModelResult {
  categorized: number;
  budgetGenerated: boolean;
  forecastGenerated: boolean;
  insights: string[];
  errors: string[];
}

interface MonthlySpend {
  month: string;
  category: string;
  amount: number;
}

interface BudgetLineData {
  categoryId: string;
  categoryName: string;
  monthlyBudget: number;
  basedOn: string;
}

interface ForecastMonth {
  month: string;
  revenue: number;
  expenses: number;
  netCash: number;
  runway: number | null;
}

export class AutoModelPipeline {
  
  async runFullPipeline(organizationId: string): Promise<AutoModelResult> {
    const result: AutoModelResult = {
      categorized: 0,
      budgetGenerated: false,
      forecastGenerated: false,
      insights: [],
      errors: [],
    };

    try {
      console.log(`[AutoModel] Starting pipeline for org ${organizationId}`);
      
      const categorizedCount = await this.autoCategorizeTransactions(organizationId);
      result.categorized = categorizedCount;
      
      const budgetSuccess = await this.autoGenerateBudget(organizationId);
      result.budgetGenerated = budgetSuccess;
      
      const forecastSuccess = await this.autoGenerateForecast(organizationId);
      result.forecastGenerated = forecastSuccess;
      
      const insights = await this.generateInsights(organizationId);
      result.insights = insights;
      
      console.log(`[AutoModel] Pipeline complete for org ${organizationId}`, result);
    } catch (error: any) {
      console.error(`[AutoModel] Pipeline error for org ${organizationId}:`, error);
      result.errors.push(error.message);
    }

    return result;
  }

  async autoCategorizeTransactions(organizationId: string): Promise<number> {
    const uncategorizedTxns = await db.query.transactions.findMany({
      where: and(
        eq(transactions.organizationId, organizationId),
        sql`${transactions.categoryId} IS NULL OR ${transactions.classificationConfidence} < 0.5`
      ),
      limit: 200,
    });

    if (uncategorizedTxns.length === 0) {
      console.log(`[AutoModel] No uncategorized transactions for org ${organizationId}`);
      return 0;
    }

    console.log(`[AutoModel] Categorizing ${uncategorizedTxns.length} transactions using Plaid transform service`);

    const allCategories = await db.query.categories.findMany({
      where: eq(categories.organizationId, organizationId),
    });

    const categoryMap = new Map(allCategories.map(c => [c.name, c.id]));

    // Startup-focused default categories (matching transformation service)
    const defaultCategories = [
      "Payroll",
      "Payroll Taxes",
      "Infrastructure",
      "Software & SaaS",
      "Office & Operations",
      "Marketing",
      "Professional Services",
      "Bank & Fees",
      "Travel & Entertainment",
      "Revenue",
    ];

    for (const catName of defaultCategories) {
      if (!categoryMap.has(catName)) {
        const [newCat] = await db.insert(categories).values({
          organizationId,
          name: catName,
          type: catName === "Revenue" ? "income" : "expense",
          color: getTransformCategoryColor(catName),
        }).returning();
        categoryMap.set(catName, newCat.id);
      }
    }

    let categorized = 0;

    for (const txn of uncategorizedTxns) {
      try {
        const amount = parseFloat(txn.amount);
        const metadata = txn.metadata as { category?: string[]; pending?: boolean } | null;
        const plaidCategories = metadata?.category || null;
        
        // Use the Plaid transformation service for smart categorization
        const result = transformPlaidTransaction(
          txn.vendorOriginal || null,
          txn.description || "",
          amount,
          plaidCategories
        );
        
        // Get or create the category
        let categoryId = categoryMap.get(result.categoryName);
        if (!categoryId) {
          const [newCat] = await db.insert(categories).values({
            organizationId,
            name: result.categoryName,
            type: result.categoryName === "Revenue" ? "income" : "expense",
            color: getTransformCategoryColor(result.categoryName),
          }).onConflictDoNothing().returning();
          
          if (newCat) {
            categoryId = newCat.id;
            categoryMap.set(result.categoryName, categoryId);
          } else {
            // Category might exist, fetch it
            const existing = await db.query.categories.findFirst({
              where: and(
                eq(categories.organizationId, organizationId),
                eq(categories.name, result.categoryName)
              ),
            });
            if (existing) {
              categoryId = existing.id;
              categoryMap.set(result.categoryName, categoryId);
            }
          }
        }
        
        if (categoryId) {
          const confidenceRounded = Math.round(result.confidence * 100) / 100;
          await db.update(transactions)
            .set({
              vendorNormalized: result.vendorNormalized,
              categoryId,
              isRecurring: result.isRecurring,
              isPayroll: result.isPayroll,
              classificationConfidence: confidenceRounded.toString(),
              updatedAt: new Date(),
            })
            .where(eq(transactions.id, txn.id));
          categorized++;
        }
      } catch (error) {
        console.error(`[AutoModel] Error categorizing txn ${txn.id}:`, error);
      }
    }

    console.log(`[AutoModel] Categorized ${categorized} transactions`);
    return categorized;
  }

  async autoGenerateBudget(organizationId: string): Promise<boolean> {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const recentTxns = await db.query.transactions.findMany({
        where: and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, threeMonthsAgo),
          sql`${transactions.amount}::numeric < 0`
        ),
        with: { category: true },
      });

      if (recentTxns.length < 10) {
        console.log(`[AutoModel] Not enough transactions (${recentTxns.length}) to generate budget`);
        return false;
      }

      const spendByCategory: Record<string, number[]> = {};

      recentTxns.forEach(txn => {
        const catName = txn.category?.name || "Operations & Misc";
        const monthKey = new Date(txn.date).toISOString().substring(0, 7);
        
        if (!spendByCategory[catName]) {
          spendByCategory[catName] = [];
        }
        spendByCategory[catName].push(Math.abs(parseFloat(txn.amount)));
      });

      const budgetLinesData: BudgetLineData[] = [];
      const allCategories = await db.query.categories.findMany({
        where: eq(categories.organizationId, organizationId),
      });

      let totalBudget = 0;
      for (const [catName, amounts] of Object.entries(spendByCategory)) {
        const category = allCategories.find(c => c.name === catName);
        if (!category) continue;

        const avgMonthly = amounts.reduce((a, b) => a + b, 0) / 3;
        const buffer = avgMonthly * 1.1;
        totalBudget += buffer;

        budgetLinesData.push({
          categoryId: category.id,
          categoryName: catName,
          monthlyBudget: Math.round(buffer),
          basedOn: "3-month average + 10% buffer",
        });
      }

      const existingBudgets = await db.query.budgets.findMany({
        where: eq(budgets.organizationId, organizationId),
      });

      if (existingBudgets.length > 0) {
        console.log(`[AutoModel] Budget already exists for org ${organizationId}`);
        return true;
      }

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const [newBudget] = await db.insert(budgets).values({
        organizationId,
        periodStart,
        periodEnd,
        totalBudgetAmount: Math.round(totalBudget).toString(),
        breakdown: { source: "AI-generated from 3-month average + 10% buffer" },
        status: "active",
      }).returning();

      for (const line of budgetLinesData) {
        await db.insert(budgetLines).values({
          budgetId: newBudget.id,
          categoryId: line.categoryId,
          targetAmount: line.monthlyBudget.toString(),
        });
      }

      console.log(`[AutoModel] Generated budget with ${budgetLinesData.length} lines`);
      return true;
    } catch (error) {
      console.error("[AutoModel] Budget generation error:", error);
      return false;
    }
  }

  async autoGenerateForecast(organizationId: string): Promise<boolean> {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const historicalTxns = await db.query.transactions.findMany({
        where: and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, sixMonthsAgo)
        ),
      });

      if (historicalTxns.length < 20) {
        console.log(`[AutoModel] Not enough transactions (${historicalTxns.length}) to generate forecast`);
        return false;
      }

      const monthlyData: Record<string, { revenue: number; expenses: number }> = {};

      historicalTxns.forEach(txn => {
        const monthKey = new Date(txn.date).toISOString().substring(0, 7);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { revenue: 0, expenses: 0 };
        }
        
        const amount = parseFloat(txn.amount);
        if (amount > 0) {
          monthlyData[monthKey].revenue += amount;
        } else {
          monthlyData[monthKey].expenses += Math.abs(amount);
        }
      });

      const months = Object.keys(monthlyData).sort();
      const avgRevenue = months.reduce((sum, m) => sum + monthlyData[m].revenue, 0) / months.length;
      const avgExpenses = months.reduce((sum, m) => sum + monthlyData[m].expenses, 0) / months.length;

      let revenueTrend = 0;
      let expenseTrend = 0;
      if (months.length >= 3) {
        const recentRevenue = monthlyData[months[months.length - 1]]?.revenue || 0;
        const olderRevenue = monthlyData[months[0]]?.revenue || 0;
        if (olderRevenue > 0) {
          revenueTrend = (recentRevenue - olderRevenue) / olderRevenue / months.length;
        }

        const recentExpenses = monthlyData[months[months.length - 1]]?.expenses || 0;
        const olderExpenses = monthlyData[months[0]]?.expenses || 0;
        if (olderExpenses > 0) {
          expenseTrend = (recentExpenses - olderExpenses) / olderExpenses / months.length;
        }
      }

      revenueTrend = Math.max(-0.1, Math.min(0.15, revenueTrend));
      expenseTrend = Math.max(-0.05, Math.min(0.1, expenseTrend));

      const accounts = await db.query.bankAccounts.findMany({
        where: eq(bankAccounts.organizationId, organizationId),
      });
      
      let currentCash = accounts.reduce((sum, acc) => {
        return sum + (parseFloat(acc.currentBalance || "0"));
      }, 0);

      if (currentCash === 0) {
        currentCash = 500000;
      }

      const forecastMonths: ForecastMonth[] = [];
      let runningCash = currentCash;

      for (let i = 1; i <= 12; i++) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + i);
        const monthKey = futureDate.toISOString().substring(0, 7);

        const projectedRevenue = avgRevenue * Math.pow(1 + revenueTrend, i);
        const projectedExpenses = avgExpenses * Math.pow(1 + expenseTrend, i);
        const netCash = projectedRevenue - projectedExpenses;
        
        runningCash += netCash;
        const runway = netCash < 0 ? Math.max(0, runningCash / Math.abs(netCash)) : null;

        forecastMonths.push({
          month: monthKey,
          revenue: Math.round(projectedRevenue),
          expenses: Math.round(projectedExpenses),
          netCash: Math.round(netCash),
          runway,
        });
      }

      const existingForecasts = await db.query.forecasts.findMany({
        where: eq(forecasts.organizationId, organizationId),
      });

      if (existingForecasts.length > 0) {
        await db.delete(forecasts).where(eq(forecasts.organizationId, organizationId));
      }

      for (const fm of forecastMonths) {
        await db.insert(forecasts).values({
          organizationId,
          month: fm.month,
          projectedRevenue: fm.revenue.toString(),
          projectedExpenses: fm.expenses.toString(),
          projectedNetCash: fm.netCash.toString(),
          projectedRunway: fm.runway?.toFixed(1) || null,
          assumptions: JSON.stringify({
            revenueTrend: `${(revenueTrend * 100).toFixed(1)}% monthly growth`,
            expenseTrend: `${(expenseTrend * 100).toFixed(1)}% monthly growth`,
            basedOn: `${months.length} months of historical data`,
          }),
        });
      }

      console.log(`[AutoModel] Generated 12-month forecast`);
      return true;
    } catch (error) {
      console.error("[AutoModel] Forecast generation error:", error);
      return false;
    }
  }

  async generateInsights(organizationId: string): Promise<string[]> {
    const insights: string[] = [];

    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const recentTxns = await db.query.transactions.findMany({
        where: and(
          eq(transactions.organizationId, organizationId),
          gte(transactions.date, threeMonthsAgo)
        ),
        with: { category: true },
      });

      let totalExpenses = 0;
      let totalRevenue = 0;
      const vendorSpend: Record<string, number> = {};

      recentTxns.forEach(txn => {
        const amount = parseFloat(txn.amount);
        if (amount > 0) {
          totalRevenue += amount;
        } else {
          totalExpenses += Math.abs(amount);
          const vendor = txn.vendorNormalized || txn.vendorOriginal || "Unknown";
          vendorSpend[vendor] = (vendorSpend[vendor] || 0) + Math.abs(amount);
        }
      });

      const monthlyBurn = totalExpenses / 3;
      const monthlyRevenue = totalRevenue / 3;
      const netBurn = monthlyBurn - monthlyRevenue;

      const accounts = await db.query.bankAccounts.findMany({
        where: eq(bankAccounts.organizationId, organizationId),
      });
      
      const cashBalance = accounts.reduce((sum, acc) => {
        return sum + (parseFloat(acc.currentBalance || "0"));
      }, 0) || 500000;

      const runway = netBurn > 0 ? cashBalance / netBurn : null;

      if (runway !== null) {
        if (runway < 6) {
          insights.push(`CRITICAL: Only ${runway.toFixed(1)} months of runway remaining. Start fundraising immediately.`);
        } else if (runway < 12) {
          insights.push(`Your runway is ${runway.toFixed(1)} months. Consider starting fundraise discussions in the next 3-4 months.`);
        } else {
          insights.push(`Healthy runway of ${runway.toFixed(1)} months. You have time to focus on growth.`);
        }
      }

      const sortedVendors = Object.entries(vendorSpend)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      if (sortedVendors.length > 0) {
        const topVendor = sortedVendors[0];
        const topVendorPercent = ((topVendor[1] / totalExpenses) * 100).toFixed(0);
        insights.push(`Top vendor: ${topVendor[0]} accounts for ${topVendorPercent}% of your spend.`);
      }

      if (monthlyRevenue > monthlyBurn) {
        insights.push(`You're cash flow positive! Revenue exceeds expenses by $${(monthlyRevenue - monthlyBurn).toFixed(0)}/month.`);
      }

      if (monthlyBurn > 100000) {
        insights.push(`Your burn rate of $${(monthlyBurn / 1000).toFixed(0)}k/month is typical for a Series A company.`);
      } else if (monthlyBurn > 50000) {
        insights.push(`Your burn rate of $${(monthlyBurn / 1000).toFixed(0)}k/month is in the Seed-stage range.`);
      }

    } catch (error) {
      console.error("[AutoModel] Insights generation error:", error);
    }

    return insights;
  }

  private getCategoryColor(name: string): string {
    const colors: Record<string, string> = {
      "Software & SaaS": "#3B82F6",
      "Marketing & Advertising": "#8B5CF6",
      "Payroll & Benefits": "#10B981",
      "Office & Equipment": "#F59E0B",
      "Professional Services": "#EC4899",
      "Travel & Meals": "#06B6D4",
      "Operations & Misc": "#6B7280",
      "Revenue": "#22C55E",
    };
    return colors[name] || "#6B7280";
  }
}

export const autoModelPipeline = new AutoModelPipeline();
