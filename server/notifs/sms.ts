import type { NotificationMessage, NotificationResult } from "./types";

export async function sendSMSNotification(
  phoneNumber: string,
  message: NotificationMessage
): Promise<NotificationResult> {
  const smsText = `${message.title}\n\n${message.body}`;

  console.log(`[SMS] Would send to ${phoneNumber}: ${smsText.substring(0, 100)}...`);

  return {
    channel: "sms",
    success: false,
    error: "SMS integration not yet implemented. Configure Twilio or similar service.",
  };
}
