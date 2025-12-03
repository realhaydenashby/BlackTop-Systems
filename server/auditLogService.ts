import { storage } from "./storage";
import type { InsertAuditLog, AuditLog } from "@shared/schema";
import type { Request } from "express";

export const AuditActions = {
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_FAILED: "auth.failed",
  
  DATA_VIEW: "data.view",
  DATA_EXPORT: "data.export",
  DATA_MODIFY: "data.modify",
  DATA_DELETE: "data.delete",
  
  TRANSACTION_VIEW: "transaction.view",
  TRANSACTION_UPDATE: "transaction.update",
  TRANSACTION_CATEGORIZE: "transaction.categorize",
  TRANSACTION_BULK_UPDATE: "transaction.bulk_update",
  
  INTEGRATION_CONNECT: "integration.connect",
  INTEGRATION_DISCONNECT: "integration.disconnect",
  INTEGRATION_SYNC: "integration.sync",
  INTEGRATION_TOKEN_REFRESH: "integration.token_refresh",
  
  REPORT_GENERATE: "report.generate",
  REPORT_SHARE: "report.share",
  REPORT_VIEW: "report.view",
  
  SETTINGS_UPDATE: "settings.update",
  SETTINGS_VIEW: "settings.view",
  
  ALERT_CREATE: "alert.create",
  ALERT_DISMISS: "alert.dismiss",
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];

export const ResourceTypes = {
  TRANSACTION: "transaction",
  BANK_ACCOUNT: "bank_account",
  PLAID_ITEM: "plaid_item",
  QUICKBOOKS_TOKEN: "quickbooks_token",
  ORGANIZATION: "organization",
  USER: "user",
  REPORT: "report",
  INSIGHT: "insight",
  SETTINGS: "settings",
} as const;

export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes];

interface AuditLogContext {
  userId: string;
  organizationId: string;
  action: AuditAction;
  resourceType?: ResourceType;
  resourceId?: string;
  details?: string;
  req?: Request;
}

function extractRequestMetadata(req?: Request): { ipAddress?: string; userAgent?: string } {
  if (!req) return {};
  
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress = typeof forwarded === "string" 
    ? forwarded.split(",")[0].trim() 
    : req.socket?.remoteAddress || undefined;
  
  const userAgent = req.headers["user-agent"]?.substring(0, 500);
  
  return { ipAddress, userAgent };
}

class AuditLogService {
  async log(context: AuditLogContext): Promise<AuditLog | null> {
    try {
      const { ipAddress, userAgent } = extractRequestMetadata(context.req);
      
      const logEntry: InsertAuditLog = {
        userId: context.userId,
        organizationId: context.organizationId,
        action: context.action,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        details: context.details,
        ipAddress,
        userAgent,
      };
      
      return await storage.createAuditLog(logEntry);
    } catch (error) {
      console.error("[AuditLogService] Failed to create audit log:", error);
      return null;
    }
  }

  async logAuth(
    userId: string,
    organizationId: string,
    action: "login" | "logout" | "failed",
    req?: Request,
    details?: string
  ): Promise<void> {
    const actionMap = {
      login: AuditActions.AUTH_LOGIN,
      logout: AuditActions.AUTH_LOGOUT,
      failed: AuditActions.AUTH_FAILED,
    };
    
    await this.log({
      userId,
      organizationId,
      action: actionMap[action],
      resourceType: ResourceTypes.USER,
      resourceId: userId,
      details,
      req,
    });
  }

  async logDataAccess(
    userId: string,
    organizationId: string,
    resourceType: ResourceType,
    resourceId: string,
    action: "view" | "export",
    req?: Request,
    details?: string
  ): Promise<void> {
    const actionMap = {
      view: AuditActions.DATA_VIEW,
      export: AuditActions.DATA_EXPORT,
    };
    
    await this.log({
      userId,
      organizationId,
      action: actionMap[action],
      resourceType,
      resourceId,
      details,
      req,
    });
  }

  async logIntegrationEvent(
    userId: string,
    organizationId: string,
    resourceType: ResourceType,
    resourceId: string,
    event: "connect" | "disconnect" | "sync" | "token_refresh",
    req?: Request,
    details?: string
  ): Promise<void> {
    const actionMap = {
      connect: AuditActions.INTEGRATION_CONNECT,
      disconnect: AuditActions.INTEGRATION_DISCONNECT,
      sync: AuditActions.INTEGRATION_SYNC,
      token_refresh: AuditActions.INTEGRATION_TOKEN_REFRESH,
    };
    
    await this.log({
      userId,
      organizationId,
      action: actionMap[event],
      resourceType,
      resourceId,
      details,
      req,
    });
  }

  async logTransactionAction(
    userId: string,
    organizationId: string,
    transactionId: string,
    action: "view" | "update" | "categorize" | "bulk_update",
    req?: Request,
    details?: string
  ): Promise<void> {
    const actionMap = {
      view: AuditActions.TRANSACTION_VIEW,
      update: AuditActions.TRANSACTION_UPDATE,
      categorize: AuditActions.TRANSACTION_CATEGORIZE,
      bulk_update: AuditActions.TRANSACTION_BULK_UPDATE,
    };
    
    await this.log({
      userId,
      organizationId,
      action: actionMap[action],
      resourceType: ResourceTypes.TRANSACTION,
      resourceId: transactionId,
      details,
      req,
    });
  }

  async logReportAction(
    userId: string,
    organizationId: string,
    reportId: string,
    action: "generate" | "share" | "view",
    req?: Request,
    details?: string
  ): Promise<void> {
    const actionMap = {
      generate: AuditActions.REPORT_GENERATE,
      share: AuditActions.REPORT_SHARE,
      view: AuditActions.REPORT_VIEW,
    };
    
    await this.log({
      userId,
      organizationId,
      action: actionMap[action],
      resourceType: ResourceTypes.REPORT,
      resourceId: reportId,
      details,
      req,
    });
  }

  async getRecentActivity(
    organizationId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    return storage.getRecentAuditLogs(organizationId, limit);
  }

  async searchAuditLogs(
    organizationId: string,
    filters: {
      userId?: string;
      action?: string;
      resourceType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<AuditLog[]> {
    return storage.getAuditLogs(organizationId, filters);
  }
}

export const auditLogService = new AuditLogService();
