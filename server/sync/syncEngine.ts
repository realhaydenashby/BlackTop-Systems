import { db } from "../db";
import {
  syncSchedules,
  syncJobs,
  syncWebhookEvents,
  plaidItems,
  bankAccounts,
  transactions,
  quickbooksTokens,
  xeroTokens,
  type SyncSchedule,
  type SyncJob,
  type InsertSyncJob,
  type InsertSyncSchedule,
} from "@shared/schema";
import { eq, and, lte, or, desc, asc, sql, isNull } from "drizzle-orm";
import { addMinutes, subMinutes, format } from "date-fns";

interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  newCursor?: string;
  error?: string;
}

interface SyncStatus {
  source: string;
  connectionId: string;
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  nextScheduledAt: Date | null;
  isEnabled: boolean;
  status: 'healthy' | 'warning' | 'error' | 'stale';
  freshnessMinutes: number | null;
}

export class RealTimeSyncEngine {
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_INTERVAL_MINUTES = 30;
  private readonly MIN_INTERVAL_MINUTES = 5;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly FRESHNESS_WARNING_MINUTES = 60;
  private readonly FRESHNESS_STALE_MINUTES = 180;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[SyncEngine] Already running");
      return;
    }

    this.isRunning = true;
    console.log("[SyncEngine] Starting real-time sync engine...");

    this.pollingInterval = setInterval(() => {
      this.processPendingJobs().catch(console.error);
    }, 60000);

    await this.processPendingJobs();
    
    console.log("[SyncEngine] Real-time sync engine started");
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
    console.log("[SyncEngine] Sync engine stopped");
  }

  async createScheduleForConnection(
    organizationId: string,
    source: "plaid" | "quickbooks" | "xero" | "stripe" | "ramp",
    connectionId: string,
    intervalMinutes?: number
  ): Promise<SyncSchedule> {
    const existing = await db.query.syncSchedules.findFirst({
      where: and(
        eq(syncSchedules.organizationId, organizationId),
        eq(syncSchedules.source, source),
        eq(syncSchedules.connectionId, connectionId)
      ),
    });

    if (existing) {
      await db.update(syncSchedules)
        .set({
          isEnabled: true,
          intervalMinutes: intervalMinutes || this.DEFAULT_INTERVAL_MINUTES,
          nextScheduledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncSchedules.id, existing.id));
      
      return { ...existing, isEnabled: true };
    }

    const [schedule] = await db.insert(syncSchedules)
      .values({
        organizationId,
        source,
        connectionId,
        intervalMinutes: intervalMinutes || this.DEFAULT_INTERVAL_MINUTES,
        nextScheduledAt: new Date(),
      })
      .returning();

    console.log(`[SyncEngine] Created schedule for ${source} connection ${connectionId}`);
    return schedule;
  }

  async triggerManualSync(
    organizationId: string,
    source: "plaid" | "quickbooks" | "xero" | "stripe" | "ramp",
    connectionId: string
  ): Promise<SyncJob> {
    const job = await this.createSyncJob(organizationId, source, connectionId, "manual");
    
    await this.executeSyncJob(job);
    
    const updatedJob = await db.query.syncJobs.findFirst({
      where: eq(syncJobs.id, job.id),
    });
    
    return updatedJob || job;
  }

  private async processPendingJobs(): Promise<void> {
    const now = new Date();
    
    const dueSchedules = await db.query.syncSchedules.findMany({
      where: and(
        eq(syncSchedules.isEnabled, true),
        or(
          lte(syncSchedules.nextScheduledAt, now),
          isNull(syncSchedules.nextScheduledAt)
        )
      ),
      orderBy: [asc(syncSchedules.nextScheduledAt)],
      limit: 10,
    });

    for (const schedule of dueSchedules) {
      if (schedule.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.log(`[SyncEngine] Skipping ${schedule.source}:${schedule.connectionId} - too many failures`);
        continue;
      }

      try {
        const job = await this.createSyncJob(
          schedule.organizationId,
          schedule.source as any,
          schedule.connectionId,
          "scheduled",
          schedule.id
        );
        
        await this.executeSyncJob(job);
      } catch (error) {
        console.error(`[SyncEngine] Error processing schedule ${schedule.id}:`, error);
      }
    }
  }

  private async createSyncJob(
    organizationId: string,
    source: "plaid" | "quickbooks" | "xero" | "stripe" | "ramp",
    connectionId: string,
    trigger: "scheduled" | "webhook" | "manual" | "on_connect",
    scheduleId?: string
  ): Promise<SyncJob> {
    const schedule = scheduleId 
      ? await db.query.syncSchedules.findFirst({ where: eq(syncSchedules.id, scheduleId) })
      : await db.query.syncSchedules.findFirst({
          where: and(
            eq(syncSchedules.organizationId, organizationId),
            eq(syncSchedules.source, source),
            eq(syncSchedules.connectionId, connectionId)
          ),
        });

    const [job] = await db.insert(syncJobs)
      .values({
        organizationId,
        scheduleId: schedule?.id,
        source,
        connectionId,
        trigger,
        status: "pending",
        cursorBefore: schedule?.syncCursor,
      })
      .returning();

    return job;
  }

  private async executeSyncJob(job: SyncJob): Promise<void> {
    await db.update(syncJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(syncJobs.id, job.id));

    let result: SyncResult;

    try {
      switch (job.source) {
        case "plaid":
          result = await this.syncPlaidTransactions(job);
          break;
        case "quickbooks":
          result = await this.syncQuickBooksData(job);
          break;
        case "xero":
          result = await this.syncXeroData(job);
          break;
        default:
          result = { success: false, itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, error: `Unsupported source: ${job.source}` };
      }

      await this.completeSyncJob(job, result);
    } catch (error: any) {
      result = {
        success: false,
        itemsSynced: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        error: error.message || "Unknown error",
      };
      await this.completeSyncJob(job, result);
    }
  }

  private async syncPlaidTransactions(job: SyncJob): Promise<SyncResult> {
    const plaidItem = await db.query.plaidItems.findFirst({
      where: eq(plaidItems.id, job.connectionId),
    });

    if (!plaidItem) {
      return { success: false, itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, error: "Plaid item not found" };
    }

    try {
      const { plaidService } = await import("../plaidService");
      
      const synced = await plaidService.syncTransactions(plaidItem.userId);

      const updatedItem = await db.query.plaidItems.findFirst({
        where: eq(plaidItems.id, plaidItem.id),
      });

      return {
        success: true,
        itemsSynced: synced,
        itemsCreated: synced,
        itemsUpdated: 0,
        itemsSkipped: 0,
        newCursor: updatedItem?.cursor || undefined,
      };
    } catch (error: any) {
      console.error("[SyncEngine] Plaid sync error:", error);
      return {
        success: false,
        itemsSynced: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        error: error.message,
      };
    }
  }

  private async syncQuickBooksData(job: SyncJob): Promise<SyncResult> {
    const token = await db.query.quickbooksTokens.findFirst({
      where: eq(quickbooksTokens.id, job.connectionId),
    });

    if (!token) {
      return { success: false, itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, error: "QuickBooks token not found" };
    }

    try {
      const { quickBooksService } = await import("../quickbooksService");
      const { reconciliationEngine } = await import("../ml/reconciliationEngine");
      
      const thirtyDaysAgo = subMinutes(new Date(), 30 * 24 * 60);
      const now = new Date();
      
      const startDateStr = format(thirtyDaysAgo, "yyyy-MM-dd");
      const endDateStr = format(now, "yyyy-MM-dd");

      const invoices = await quickBooksService.getInvoices(token.userId, startDateStr, endDateStr);
      const purchases = await quickBooksService.getPurchases(token.userId, startDateStr, endDateStr);

      const syncResult = await reconciliationEngine.syncInvoicesFromQuickBooks(
        job.organizationId,
        token.userId,
        thirtyDaysAgo,
        now
      );

      return {
        success: true,
        itemsSynced: syncResult.imported + syncResult.updated,
        itemsCreated: syncResult.imported,
        itemsUpdated: syncResult.updated,
        itemsSkipped: 0,
      };
    } catch (error: any) {
      console.error("[SyncEngine] QuickBooks sync error:", error);
      return {
        success: false,
        itemsSynced: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        error: error.message,
      };
    }
  }

  private async syncXeroData(job: SyncJob): Promise<SyncResult> {
    const token = await db.query.xeroTokens.findFirst({
      where: eq(xeroTokens.id, job.connectionId),
    });

    if (!token) {
      return { success: false, itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, error: "Xero token not found" };
    }

    try {
      const { reconciliationEngine } = await import("../ml/reconciliationEngine");
      
      const thirtyDaysAgo = subMinutes(new Date(), 30 * 24 * 60);
      const now = new Date();

      const syncResult = await reconciliationEngine.syncInvoicesFromXero(
        job.organizationId,
        token.userId,
        thirtyDaysAgo,
        now
      );

      return {
        success: true,
        itemsSynced: syncResult.imported + syncResult.updated,
        itemsCreated: syncResult.imported,
        itemsUpdated: syncResult.updated,
        itemsSkipped: 0,
      };
    } catch (error: any) {
      console.error("[SyncEngine] Xero sync error:", error);
      return {
        success: false,
        itemsSynced: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        error: error.message,
      };
    }
  }

  private async completeSyncJob(job: SyncJob, result: SyncResult): Promise<void> {
    const now = new Date();

    await db.update(syncJobs)
      .set({
        status: result.success ? "completed" : "failed",
        completedAt: now,
        itemsSynced: result.itemsSynced,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsSkipped: result.itemsSkipped,
        cursorAfter: result.newCursor,
        errorMessage: result.error,
        updatedAt: now,
      })
      .where(eq(syncJobs.id, job.id));

    if (job.scheduleId) {
      const schedule = await db.query.syncSchedules.findFirst({
        where: eq(syncSchedules.id, job.scheduleId),
      });

      if (schedule) {
        const nextSyncAt = addMinutes(now, schedule.intervalMinutes);
        
        await db.update(syncSchedules)
          .set({
            lastSyncAt: now,
            lastSuccessAt: result.success ? now : schedule.lastSuccessAt,
            lastErrorAt: result.success ? schedule.lastErrorAt : now,
            lastError: result.success ? null : result.error,
            consecutiveFailures: result.success ? 0 : schedule.consecutiveFailures + 1,
            nextScheduledAt: nextSyncAt,
            syncCursor: result.newCursor || schedule.syncCursor,
            updatedAt: now,
          })
          .where(eq(syncSchedules.id, job.scheduleId));
      }
    }

    console.log(`[SyncEngine] Job ${job.id} completed: ${result.success ? 'success' : 'failed'} - ${result.itemsSynced} items synced`);
  }

  async handleWebhook(
    source: "plaid" | "quickbooks" | "xero" | "stripe" | "ramp",
    eventType: string,
    payload: any
  ): Promise<void> {
    const [webhookEvent] = await db.insert(syncWebhookEvents)
      .values({
        source,
        eventType,
        rawPayload: payload,
        connectionId: this.extractConnectionId(source, payload),
      })
      .returning();

    console.log(`[SyncEngine] Received ${source} webhook: ${eventType}`);

    try {
      if (source === "plaid" && eventType === "TRANSACTIONS") {
        const plaidItemId = payload.item_id;
        const plaidItem = await db.query.plaidItems.findFirst({
          where: eq(plaidItems.plaidItemId, plaidItemId),
        });

        if (plaidItem) {
          const schedule = await db.query.syncSchedules.findFirst({
            where: and(
              eq(syncSchedules.source, "plaid"),
              eq(syncSchedules.connectionId, plaidItem.id)
            ),
          });

          if (schedule) {
            const job = await this.createSyncJob(
              schedule.organizationId,
              "plaid",
              plaidItem.id,
              "webhook",
              schedule.id
            );
            
            await this.executeSyncJob(job);
            
            await db.update(syncWebhookEvents)
              .set({ processed: true, processedAt: new Date(), syncJobId: job.id })
              .where(eq(syncWebhookEvents.id, webhookEvent.id));
          }
        }
      }
    } catch (error: any) {
      await db.update(syncWebhookEvents)
        .set({ processed: true, processedAt: new Date(), error: error.message })
        .where(eq(syncWebhookEvents.id, webhookEvent.id));
    }
  }

  private extractConnectionId(source: string, payload: any): string | null {
    switch (source) {
      case "plaid":
        return payload.item_id || null;
      case "quickbooks":
        return payload.realmId || null;
      case "xero":
        return payload.tenantId || null;
      default:
        return null;
    }
  }

  async getSyncStatus(organizationId: string): Promise<SyncStatus[]> {
    const schedules = await db.query.syncSchedules.findMany({
      where: eq(syncSchedules.organizationId, organizationId),
    });

    const now = new Date();
    
    return schedules.map(schedule => {
      let status: 'healthy' | 'warning' | 'error' | 'stale' = 'healthy';
      let freshnessMinutes: number | null = null;

      if (schedule.lastSuccessAt) {
        freshnessMinutes = Math.floor((now.getTime() - schedule.lastSuccessAt.getTime()) / 60000);
        
        if (freshnessMinutes > this.FRESHNESS_STALE_MINUTES) {
          status = 'stale';
        } else if (freshnessMinutes > this.FRESHNESS_WARNING_MINUTES) {
          status = 'warning';
        }
      } else {
        status = 'stale';
      }

      if (schedule.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        status = 'error';
      } else if (schedule.consecutiveFailures > 0) {
        status = 'warning';
      }

      return {
        source: schedule.source,
        connectionId: schedule.connectionId,
        lastSyncAt: schedule.lastSyncAt,
        lastSuccessAt: schedule.lastSuccessAt,
        nextScheduledAt: schedule.nextScheduledAt,
        isEnabled: schedule.isEnabled,
        status,
        freshnessMinutes,
      };
    });
  }

  async getRecentJobs(organizationId: string, limit = 20): Promise<SyncJob[]> {
    return db.query.syncJobs.findMany({
      where: eq(syncJobs.organizationId, organizationId),
      orderBy: [desc(syncJobs.createdAt)],
      limit,
    });
  }

  async updateScheduleInterval(
    scheduleId: string,
    intervalMinutes: number
  ): Promise<void> {
    const interval = Math.max(this.MIN_INTERVAL_MINUTES, intervalMinutes);
    
    await db.update(syncSchedules)
      .set({
        intervalMinutes: interval,
        nextScheduledAt: addMinutes(new Date(), interval),
        updatedAt: new Date(),
      })
      .where(eq(syncSchedules.id, scheduleId));
  }

  async pauseSchedule(scheduleId: string): Promise<void> {
    await db.update(syncSchedules)
      .set({ isEnabled: false, updatedAt: new Date() })
      .where(eq(syncSchedules.id, scheduleId));
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    await db.update(syncSchedules)
      .set({
        isEnabled: true,
        nextScheduledAt: new Date(),
        consecutiveFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(syncSchedules.id, scheduleId));
  }

  async getDataFreshness(organizationId: string): Promise<{
    overallStatus: 'fresh' | 'stale' | 'disconnected';
    oldestDataMinutes: number | null;
    sources: { source: string; minutesSinceSync: number | null; status: string }[];
  }> {
    const schedules = await db.query.syncSchedules.findMany({
      where: and(
        eq(syncSchedules.organizationId, organizationId),
        eq(syncSchedules.isEnabled, true)
      ),
    });

    if (schedules.length === 0) {
      return {
        overallStatus: 'disconnected',
        oldestDataMinutes: null,
        sources: [],
      };
    }

    const now = new Date();
    let oldestMinutes: number | null = null;
    let hasStale = false;

    const sources = schedules.map(schedule => {
      let minutesSinceSync: number | null = null;
      let status = 'unknown';

      if (schedule.lastSuccessAt) {
        minutesSinceSync = Math.floor((now.getTime() - schedule.lastSuccessAt.getTime()) / 60000);
        
        if (oldestMinutes === null || minutesSinceSync > oldestMinutes) {
          oldestMinutes = minutesSinceSync;
        }

        if (minutesSinceSync <= 60) {
          status = 'fresh';
        } else if (minutesSinceSync <= 180) {
          status = 'recent';
        } else {
          status = 'stale';
          hasStale = true;
        }
      } else {
        status = 'never_synced';
        hasStale = true;
      }

      return {
        source: schedule.source,
        minutesSinceSync,
        status,
      };
    });

    return {
      overallStatus: hasStale ? 'stale' : 'fresh',
      oldestDataMinutes: oldestMinutes,
      sources,
    };
  }
}

export const syncEngine = new RealTimeSyncEngine();
