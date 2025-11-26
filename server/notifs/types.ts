export interface NotificationConfig {
  userId: string;
  organizationId?: string;
  channels: NotificationChannel[];
  preferences: NotificationPreferences;
}

export interface NotificationChannel {
  type: "slack" | "sms" | "email";
  enabled: boolean;
  destination: string;
}

export interface NotificationPreferences {
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
  minSeverity: "info" | "warning" | "critical";
}

export interface NotificationMessage {
  type: "insight" | "alert" | "summary";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  channel: string;
  success: boolean;
  messageId?: string;
  error?: string;
}
