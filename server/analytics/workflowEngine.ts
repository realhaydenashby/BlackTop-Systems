import { db } from "../db";
import { 
  workflows, 
  workflowExecutions, 
  transactions, 
  bankAccounts,
  organizations,
  insights,
  actionPlans 
} from "@shared/schema";
import { eq, and, gte, desc, sql, inArray } from "drizzle-orm";
import { subMonths, format, startOfMonth, endOfMonth } from "date-fns";

interface TriggerConfig {
  threshold?: number;
  percentageChange?: number;
  comparisonPeriod?: "day" | "week" | "month";
  operator?: "gt" | "lt" | "gte" | "lte" | "eq";
  categoryId?: string;
  vendorId?: string;
}

interface ActionConfig {
  type: string;
  config: {
    recipients?: string[];
    subject?: string;
    message?: string;
    webhookUrl?: string;
    slackChannel?: string;
    insightType?: string;
    actionPlanTitle?: string;
  };
}

interface WorkflowCheckResult {
  triggered: boolean;
  currentValue: number;
  thresholdValue: number;
  context: Record<string, any>;
}

export class WorkflowEngine {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  async getWorkflows(): Promise<any[]> {
    return db.query.workflows.findMany({
      where: eq(workflows.organizationId, this.organizationId),
      orderBy: [desc(workflows.priority), desc(workflows.createdAt)],
    });
  }

  async createWorkflow(data: {
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig: TriggerConfig;
    actions: ActionConfig[];
    priority?: number;
    createdBy?: string;
  }): Promise<any> {
    const [workflow] = await db.insert(workflows).values({
      organizationId: this.organizationId,
      name: data.name,
      description: data.description,
      triggerType: data.triggerType as any,
      triggerConfig: data.triggerConfig,
      actions: data.actions,
      priority: data.priority || 50,
      createdBy: data.createdBy,
      status: "active",
    }).returning();

    return workflow;
  }

  async updateWorkflow(
    workflowId: string,
    data: Partial<{
      name: string;
      description: string;
      triggerConfig: TriggerConfig;
      actions: ActionConfig[];
      priority: number;
      status: "active" | "paused" | "disabled";
    }>
  ): Promise<any> {
    const [updated] = await db
      .update(workflows)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.organizationId, this.organizationId)
        )
      )
      .returning();

    return updated;
  }

  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const result = await db
      .delete(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.organizationId, this.organizationId)
        )
      );

    return true;
  }

  async evaluateAllWorkflows(): Promise<any[]> {
    const activeWorkflows = await db.query.workflows.findMany({
      where: and(
        eq(workflows.organizationId, this.organizationId),
        eq(workflows.status, "active")
      ),
    });

    const results: any[] = [];

    for (const workflow of activeWorkflows) {
      try {
        const checkResult = await this.checkTriggerCondition(workflow);
        
        if (checkResult.triggered) {
          const execution = await this.executeWorkflow(workflow, checkResult);
          results.push({
            workflow: workflow.name,
            triggered: true,
            execution,
          });
        }
      } catch (error: any) {
        console.error(`[WorkflowEngine] Error evaluating workflow ${workflow.name}:`, error);
        results.push({
          workflow: workflow.name,
          triggered: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  private async checkTriggerCondition(workflow: any): Promise<WorkflowCheckResult> {
    const rawConfig = workflow.triggerConfig || {};
    const triggerConfig: TriggerConfig = {
      threshold: rawConfig.threshold ?? undefined,
      percentageChange: rawConfig.percentageChange ?? undefined,
      comparisonPeriod: rawConfig.comparisonPeriod ?? "month",
      operator: rawConfig.operator ?? "gt",
      categoryId: rawConfig.categoryId ?? undefined,
      vendorId: rawConfig.vendorId ?? undefined,
    };
    
    try {
      switch (workflow.triggerType) {
        case "budget_exceeded":
          return await this.checkBudgetExceeded(triggerConfig);
        case "burn_rate_spike":
          return await this.checkBurnRateSpike(triggerConfig);
        case "runway_warning":
          return await this.checkRunwayWarning(triggerConfig);
        case "vendor_spike":
          return await this.checkVendorSpike(triggerConfig);
        case "revenue_drop":
          return await this.checkRevenueDrop(triggerConfig);
        case "cash_low":
          return await this.checkCashLow(triggerConfig);
        case "recurring_creep":
          return await this.checkRecurringCreep(triggerConfig);
        case "hiring_guardrail":
          return await this.checkHiringGuardrail(triggerConfig);
        default:
          return { triggered: false, currentValue: 0, thresholdValue: 0, context: {} };
      }
    } catch (error: any) {
      console.error(`[WorkflowEngine] Trigger check failed for ${workflow.triggerType}:`, error);
      return { triggered: false, currentValue: 0, thresholdValue: 0, context: { error: error.message } };
    }
  }

  private async checkBudgetExceeded(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    
    const monthlySpend = await db
      .select({ total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(startOfCurrentMonth, "yyyy-MM-dd")),
          sql`CAST(${transactions.amount} AS NUMERIC) < 0` // Expenses only
        )
      );

    const currentSpend = Number(monthlySpend[0]?.total || 0);
    const threshold = config.threshold || 100000;

    return {
      triggered: currentSpend > threshold,
      currentValue: currentSpend,
      thresholdValue: threshold,
      context: {
        month: format(now, "MMMM yyyy"),
        percentOver: threshold > 0 ? ((currentSpend - threshold) / threshold * 100).toFixed(1) : 0,
      },
    };
  }

  private async checkBurnRateSpike(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const previousMonth = startOfMonth(subMonths(now, 1));

    const [currentMonthData, previousMonthData] = await Promise.all([
      db.select({ total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, this.organizationId),
            gte(transactions.date, format(currentMonth, "yyyy-MM-dd")),
            sql`CAST(${transactions.amount} AS NUMERIC) < 0`
          )
        ),
      db.select({ total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, this.organizationId),
            gte(transactions.date, format(previousMonth, "yyyy-MM-dd")),
            sql`${transactions.date} < ${format(currentMonth, "yyyy-MM-dd")}`,
            sql`CAST(${transactions.amount} AS NUMERIC) < 0`
          )
        ),
    ]);

    const currentBurn = Number(currentMonthData[0]?.total || 0);
    const previousBurn = Number(previousMonthData[0]?.total || 0);
    const percentChange = previousBurn > 0 ? ((currentBurn - previousBurn) / previousBurn * 100) : 0;
    const threshold = config.percentageChange || 20; // Default 20% increase triggers

    return {
      triggered: percentChange > threshold,
      currentValue: percentChange,
      thresholdValue: threshold,
      context: {
        currentBurn,
        previousBurn,
        changeAmount: currentBurn - previousBurn,
      },
    };
  }

  private async checkRunwayWarning(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const accounts = await db.query.bankAccounts.findMany({
      where: eq(bankAccounts.organizationId, this.organizationId),
    });

    const totalCash = accounts.reduce((sum, acc) => sum + Number(acc.currentBalance || 0), 0);

    const threeMonthsAgo = subMonths(new Date(), 3);
    const expenses = await db
      .select({ total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(threeMonthsAgo, "yyyy-MM-dd")),
          sql`CAST(${transactions.amount} AS NUMERIC) < 0`
        )
      );

    const totalExpenses = Number(expenses[0]?.total || 0);
    const monthlyBurn = totalExpenses / 3;
    const runway = monthlyBurn > 0 ? totalCash / monthlyBurn : 999;
    const threshold = config.threshold || 6; // Default 6 months warning

    return {
      triggered: runway < threshold,
      currentValue: runway,
      thresholdValue: threshold,
      context: {
        totalCash,
        monthlyBurn,
        cashOutDate: monthlyBurn > 0 
          ? format(new Date(Date.now() + runway * 30 * 24 * 60 * 60 * 1000), "MMMM yyyy")
          : "N/A",
      },
    };
  }

  private async checkVendorSpike(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const previousMonth = startOfMonth(subMonths(now, 1));

    const currentMonthVendors = await db
      .select({
        vendorId: transactions.vendorId,
        total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(currentMonth, "yyyy-MM-dd")),
          sql`CAST(${transactions.amount} AS NUMERIC) < 0`,
          sql`${transactions.vendorId} IS NOT NULL`
        )
      )
      .groupBy(transactions.vendorId);

    const previousMonthVendors = await db
      .select({
        vendorId: transactions.vendorId,
        total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(previousMonth, "yyyy-MM-dd")),
          sql`${transactions.date} < ${format(currentMonth, "yyyy-MM-dd")}`,
          sql`CAST(${transactions.amount} AS NUMERIC) < 0`,
          sql`${transactions.vendorId} IS NOT NULL`
        )
      )
      .groupBy(transactions.vendorId);

    const previousMap = new Map(previousMonthVendors.map(v => [v.vendorId, Number(v.total)]));
    const threshold = config.percentageChange || 50; // Default 50% increase

    let maxSpike = 0;
    let spikedVendorId = null;

    for (const vendor of currentMonthVendors) {
      const current = Number(vendor.total);
      const previous = previousMap.get(vendor.vendorId) || 0;
      
      if (previous > 100) { // Only check vendors with meaningful previous spend
        const percentChange = ((current - previous) / previous) * 100;
        if (percentChange > maxSpike) {
          maxSpike = percentChange;
          spikedVendorId = vendor.vendorId;
        }
      }
    }

    return {
      triggered: maxSpike > threshold,
      currentValue: maxSpike,
      thresholdValue: threshold,
      context: {
        vendorId: spikedVendorId,
        vendorCount: currentMonthVendors.length,
      },
    };
  }

  private async checkRevenueDrop(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const previousMonth = startOfMonth(subMonths(now, 1));

    const [currentRevenue, previousRevenue] = await Promise.all([
      db.select({ total: sql<number>`COALESCE(SUM(CAST(${transactions.amount} AS NUMERIC)), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, this.organizationId),
            gte(transactions.date, format(currentMonth, "yyyy-MM-dd")),
            sql`CAST(${transactions.amount} AS NUMERIC) > 0`
          )
        ),
      db.select({ total: sql<number>`COALESCE(SUM(CAST(${transactions.amount} AS NUMERIC)), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, this.organizationId),
            gte(transactions.date, format(previousMonth, "yyyy-MM-dd")),
            sql`${transactions.date} < ${format(currentMonth, "yyyy-MM-dd")}`,
            sql`CAST(${transactions.amount} AS NUMERIC) > 0`
          )
        ),
    ]);

    const current = Number(currentRevenue[0]?.total || 0);
    const previous = Number(previousRevenue[0]?.total || 0);
    const percentDrop = previous > 0 ? ((previous - current) / previous * 100) : 0;
    const threshold = config.percentageChange || 15; // Default 15% drop triggers

    return {
      triggered: percentDrop > threshold,
      currentValue: percentDrop,
      thresholdValue: threshold,
      context: {
        currentRevenue: current,
        previousRevenue: previous,
        dropAmount: previous - current,
      },
    };
  }

  private async checkCashLow(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const accounts = await db.query.bankAccounts.findMany({
      where: eq(bankAccounts.organizationId, this.organizationId),
    });

    const totalCash = accounts.reduce((sum, acc) => sum + Number(acc.currentBalance || 0), 0);
    const threshold = config.threshold || 50000; // Default $50k threshold

    return {
      triggered: totalCash < threshold,
      currentValue: totalCash,
      thresholdValue: threshold,
      context: {
        accountCount: accounts.length,
        shortfall: threshold - totalCash,
      },
    };
  }

  private async checkRecurringCreep(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const threeMonthsAgo = startOfMonth(subMonths(now, 3));

    const recurringTxns = await db
      .select({
        month: sql<string>`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`,
        total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(threeMonthsAgo, "yyyy-MM-dd")),
          eq(transactions.isRecurring, true),
          sql`CAST(${transactions.amount} AS NUMERIC) < 0`
        )
      )
      .groupBy(sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`);

    if (recurringTxns.length < 2) {
      return { triggered: false, currentValue: 0, thresholdValue: 0, context: {} };
    }

    const oldest = Number(recurringTxns[0]?.total || 0);
    const newest = Number(recurringTxns[recurringTxns.length - 1]?.total || 0);
    const percentIncrease = oldest > 0 ? ((newest - oldest) / oldest * 100) : 0;
    const threshold = config.percentageChange || 10; // Default 10% creep

    return {
      triggered: percentIncrease > threshold,
      currentValue: percentIncrease,
      thresholdValue: threshold,
      context: {
        oldestMonthSpend: oldest,
        newestMonthSpend: newest,
        absoluteIncrease: newest - oldest,
      },
    };
  }

  private async checkHiringGuardrail(config: TriggerConfig): Promise<WorkflowCheckResult> {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);

    const payrollExpenses = await db
      .select({ total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(startOfCurrentMonth, "yyyy-MM-dd")),
          sql`CAST(${transactions.amount} AS NUMERIC) < 0`,
          sql`LOWER(${transactions.normalizedName}) LIKE '%payroll%' OR LOWER(${transactions.categoryId}) LIKE '%payroll%'`
        )
      );

    const totalExpenses = await db
      .select({ total: sql<number>`COALESCE(SUM(ABS(CAST(${transactions.amount} AS NUMERIC))), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, this.organizationId),
          gte(transactions.date, format(startOfCurrentMonth, "yyyy-MM-dd")),
          sql`CAST(${transactions.amount} AS NUMERIC) < 0`
        )
      );

    const payroll = Number(payrollExpenses[0]?.total || 0);
    const total = Number(totalExpenses[0]?.total || 1);
    const payrollPercentage = (payroll / total) * 100;
    const threshold = config.threshold || 70; // Default 70% of spend on payroll

    return {
      triggered: payrollPercentage > threshold,
      currentValue: payrollPercentage,
      thresholdValue: threshold,
      context: {
        payrollSpend: payroll,
        totalSpend: total,
      },
    };
  }

  private async executeWorkflow(workflow: any, checkResult: WorkflowCheckResult): Promise<any> {
    const actions = (workflow.actions as ActionConfig[]) || [];
    const executedActions: any[] = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action, workflow, checkResult);
        executedActions.push({
          type: action.type,
          success: true,
          result,
        });
      } catch (error: any) {
        executedActions.push({
          type: action.type,
          success: false,
          error: error.message,
        });
      }
    }

    await db.update(workflows).set({
      lastTriggeredAt: new Date(),
      triggerCount: sql`COALESCE(${workflows.triggerCount}, 0) + 1`,
    }).where(eq(workflows.id, workflow.id));

    const [execution] = await db.insert(workflowExecutions).values({
      workflowId: workflow.id,
      organizationId: this.organizationId,
      triggeredValue: checkResult.currentValue.toString(),
      thresholdValue: checkResult.thresholdValue.toString(),
      triggerContext: checkResult.context,
      actionsExecuted: executedActions,
      status: executedActions.every(a => a.success) ? "completed" : "partial",
    }).returning();

    return execution;
  }

  private async executeAction(
    action: ActionConfig, 
    workflow: any, 
    checkResult: WorkflowCheckResult
  ): Promise<any> {
    switch (action.type) {
      case "create_insight":
        return this.createInsightAction(workflow, checkResult, action.config);
      case "create_action_plan":
        return this.createActionPlanAction(workflow, checkResult, action.config);
      case "log_audit":
        return this.logAuditAction(workflow, checkResult);
      case "email_alert":
        return { type: "email_alert", queued: true, recipients: action.config.recipients };
      case "slack_message":
        return { type: "slack_message", queued: true, channel: action.config.slackChannel };
      default:
        return { type: action.type, status: "not_implemented" };
    }
  }

  private async createInsightAction(
    workflow: any, 
    checkResult: WorkflowCheckResult,
    config: any
  ): Promise<any> {
    const [insight] = await db.insert(insights).values({
      organizationId: this.organizationId,
      type: "alert",
      title: `Alert: ${workflow.name}`,
      description: this.formatInsightDescription(workflow, checkResult),
      confidence: 95,
      impact: "high",
      status: "new",
      aiGenerated: true,
      metadata: {
        workflowId: workflow.id,
        triggerType: workflow.triggerType,
        currentValue: checkResult.currentValue,
        thresholdValue: checkResult.thresholdValue,
      },
    }).returning();

    return { insightId: insight.id };
  }

  private async createActionPlanAction(
    workflow: any,
    checkResult: WorkflowCheckResult,
    config: any
  ): Promise<any> {
    const [actionPlan] = await db.insert(actionPlans).values({
      organizationId: this.organizationId,
      title: config.actionPlanTitle || `Action Required: ${workflow.name}`,
      description: this.formatActionPlanDescription(workflow, checkResult),
      priority: "high",
      status: "pending",
      aiGenerated: true,
      estimatedImpact: {
        type: "cost_savings",
        value: checkResult.currentValue - checkResult.thresholdValue,
      },
    }).returning();

    return { actionPlanId: actionPlan.id };
  }

  private async logAuditAction(workflow: any, checkResult: WorkflowCheckResult): Promise<any> {
    console.log(`[WorkflowEngine] AUDIT: Workflow "${workflow.name}" triggered. ` +
      `Current: ${checkResult.currentValue}, Threshold: ${checkResult.thresholdValue}`);
    return { logged: true };
  }

  private formatInsightDescription(workflow: any, checkResult: WorkflowCheckResult): string {
    const formatCurrency = (v: number) => 
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);

    switch (workflow.triggerType) {
      case "budget_exceeded":
        return `Monthly spending has exceeded your budget cap. Current spend: ${formatCurrency(checkResult.currentValue)}, Budget: ${formatCurrency(checkResult.thresholdValue)}.`;
      case "burn_rate_spike":
        return `Burn rate increased by ${checkResult.currentValue.toFixed(1)}% compared to last month, exceeding your ${checkResult.thresholdValue}% threshold.`;
      case "runway_warning":
        return `Current runway is ${checkResult.currentValue.toFixed(1)} months, below your ${checkResult.thresholdValue} month warning threshold.`;
      case "vendor_spike":
        return `Vendor spending spiked by ${checkResult.currentValue.toFixed(1)}%, exceeding your ${checkResult.thresholdValue}% alert threshold.`;
      case "revenue_drop":
        return `Revenue dropped by ${checkResult.currentValue.toFixed(1)}% compared to last month, triggering your ${checkResult.thresholdValue}% alert.`;
      case "cash_low":
        return `Cash balance (${formatCurrency(checkResult.currentValue)}) is below your ${formatCurrency(checkResult.thresholdValue)} minimum threshold.`;
      case "recurring_creep":
        return `Recurring subscriptions increased by ${checkResult.currentValue.toFixed(1)}% over the past 3 months.`;
      case "hiring_guardrail":
        return `Payroll costs represent ${checkResult.currentValue.toFixed(1)}% of total spend, exceeding your ${checkResult.thresholdValue}% guardrail.`;
      default:
        return `Workflow "${workflow.name}" was triggered.`;
    }
  }

  private formatActionPlanDescription(workflow: any, checkResult: WorkflowCheckResult): string {
    const base = this.formatInsightDescription(workflow, checkResult);
    return `${base} Review your spending and consider adjustments to stay within targets.`;
  }

  async getWorkflowExecutions(workflowId?: string, limit: number = 50): Promise<any[]> {
    if (workflowId) {
      return db.query.workflowExecutions.findMany({
        where: and(
          eq(workflowExecutions.workflowId, workflowId),
          eq(workflowExecutions.organizationId, this.organizationId)
        ),
        orderBy: [desc(workflowExecutions.executedAt)],
        limit,
      });
    }

    return db.query.workflowExecutions.findMany({
      where: eq(workflowExecutions.organizationId, this.organizationId),
      orderBy: [desc(workflowExecutions.executedAt)],
      limit,
    });
  }
}

export const createWorkflowEngine = (organizationId: string) => new WorkflowEngine(organizationId);
