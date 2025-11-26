import type { NotificationMessage, NotificationResult } from "./types";

export async function sendSlackNotification(
  webhookUrl: string,
  message: NotificationMessage
): Promise<NotificationResult> {
  try {
    const severityEmoji = {
      critical: ":rotating_light:",
      warning: ":warning:",
      info: ":information_source:",
    };

    const payload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${severityEmoji[message.severity]} ${message.title}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message.body,
          },
        },
      ],
    };

    if (message.actionUrl) {
      payload.blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Details",
              emoji: true,
            },
            url: message.actionUrl,
          },
        ],
      } as any);
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    return { channel: "slack", success: true };
  } catch (error) {
    return {
      channel: "slack",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
