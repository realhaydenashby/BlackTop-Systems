export * from "./types";
export * from "./slack";
export * from "./sms";

import type { NotificationConfig, NotificationMessage, NotificationResult } from "./types";
import { sendSlackNotification } from "./slack";
import { sendSMSNotification } from "./sms";

function isInQuietHours(config: NotificationConfig): boolean {
  if (!config.preferences.quietHoursStart || !config.preferences.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const timezone = config.preferences.timezone || "America/Los_Angeles";
  
  const currentHour = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: timezone })
  );
  
  const startHour = parseInt(config.preferences.quietHoursStart.split(":")[0]);
  const endHour = parseInt(config.preferences.quietHoursEnd.split(":")[0]);
  
  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    return currentHour >= startHour || currentHour < endHour;
  }
}

function shouldSend(config: NotificationConfig, message: NotificationMessage): boolean {
  const severityOrder = { info: 0, warning: 1, critical: 2 };
  
  if (severityOrder[message.severity] < severityOrder[config.preferences.minSeverity]) {
    return false;
  }
  
  if (message.severity !== "critical" && isInQuietHours(config)) {
    return false;
  }
  
  return true;
}

export async function sendNotification(
  config: NotificationConfig,
  message: NotificationMessage
): Promise<NotificationResult[]> {
  if (!shouldSend(config, message)) {
    return [{
      channel: "all",
      success: false,
      error: "Notification filtered by preferences or quiet hours",
    }];
  }

  const results: NotificationResult[] = [];

  for (const channel of config.channels) {
    if (!channel.enabled) continue;

    switch (channel.type) {
      case "slack":
        results.push(await sendSlackNotification(channel.destination, message));
        break;
      case "sms":
        results.push(await sendSMSNotification(channel.destination, message));
        break;
      case "email":
        results.push({
          channel: "email",
          success: false,
          error: "Email notifications not yet implemented",
        });
        break;
    }
  }

  return results;
}
