import { db } from "./db";
import { auditLogs } from "@shared/schema";
import { hashForLogging } from "./encryption";

export type AuditAction =
  | "bank_connect"
  | "bank_disconnect"
  | "transaction_view"
  | "transaction_export"
  | "transaction_categorize"
  | "analytics_view"
  | "report_generate"
  | "report_share"
  | "settings_update"
  | "user_login"
  | "user_logout"
  | "plaid_sync"
  | "quickbooks_sync";

export interface AuditLogEntry {
  userId: string;
  organizationId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const sanitizedDetails = sanitizeDetails(entry.details);
    
    await db.insert(auditLogs).values({
      userId: entry.userId,
      organizationId: entry.organizationId,
      action: entry.action,
      resourceType: entry.resourceType || null,
      resourceId: entry.resourceId || null,
      details: sanitizedDetails ? JSON.stringify(sanitizedDetails) : null,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 500) : null,
      createdAt: new Date(),
    });
    
    console.log(`[audit] ${entry.action} by user ${hashForLogging(entry.userId)} on ${entry.resourceType || "system"}`);
  } catch (error) {
    console.error("[audit] Failed to log audit event:", error);
  }
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | null {
  if (!details) return null;
  
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "token", "secret", "accessToken", "refreshToken", "apiKey"];
  
  for (const [key, value] of Object.entries(details)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "string" && value.length > 1000) {
      sanitized[key] = value.slice(0, 1000) + "...[truncated]";
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function getClientInfo(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): {
  ipAddress: string;
  userAgent: string;
} {
  const forwarded = req.headers?.["x-forwarded-for"];
  const ipAddress = typeof forwarded === "string" 
    ? forwarded.split(",")[0].trim() 
    : req.ip || "unknown";
  
  const userAgent = typeof req.headers?.["user-agent"] === "string"
    ? req.headers["user-agent"]
    : "unknown";
  
  return { ipAddress, userAgent };
}

export const auditService = {
  logAuditEvent,
  getClientInfo,
};
