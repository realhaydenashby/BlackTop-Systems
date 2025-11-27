import { NotificationMessage, NotificationResult } from "./types";
import { sendEmail } from "../gmail";

export async function sendEmailNotification(
  to: string,
  message: NotificationMessage
): Promise<NotificationResult> {
  try {
    const severityLabel = {
      critical: "🚨 URGENT",
      warning: "⚠️ Alert",
      info: "ℹ️ Update",
    };

    const subject = `${severityLabel[message.severity]} ${message.title}`;
    
    let body = message.body;
    if (message.actionUrl) {
      body += `\n\nView details: ${message.actionUrl}`;
    }
    body += "\n\n—\nBlackTop Systems - Your Financial Autopilot";

    await sendEmail(to, subject, body);

    return { channel: "email", success: true };
  } catch (error) {
    return {
      channel: "email",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface WeeklyDigestData {
  companyName: string;
  currentCash: number;
  runwayMonths: number | null;
  monthlyBurn: number;
  burnChange: number;
  insights: Array<{ type: string; message: string; severity: string }>;
  topVendors: Array<{ name: string; amount: number }>;
  weekStartDate: Date;
  weekEndDate: Date;
}

export function formatWeeklyDigest(data: WeeklyDigestData): { subject: string; body: string; html: string } {
  const formatCurrency = (n: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  
  const formatDate = (d: Date) => 
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const runwayText = data.runwayMonths === null 
    ? "∞ (profitable)" 
    : `${data.runwayMonths.toFixed(1)} months`;

  const burnChangeText = data.burnChange >= 0 
    ? `↑ ${data.burnChange.toFixed(1)}%`
    : `↓ ${Math.abs(data.burnChange).toFixed(1)}%`;

  const burnChangeEmoji = data.burnChange > 10 ? "⚠️" : data.burnChange < -10 ? "✅" : "→";

  const subject = `Weekly Financial Digest: ${runwayText} runway, ${formatCurrency(data.monthlyBurn)}/mo burn`;

  const criticalInsights = data.insights.filter(i => i.severity === "critical");
  const warningInsights = data.insights.filter(i => i.severity === "warning");
  const infoInsights = data.insights.filter(i => i.severity === "info");

  let body = `
${data.companyName} - Weekly Financial Summary
${formatDate(data.weekStartDate)} - ${formatDate(data.weekEndDate)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 KEY METRICS

  Cash Position: ${formatCurrency(data.currentCash)}
  Runway: ${runwayText}
  Monthly Burn: ${formatCurrency(data.monthlyBurn)} ${burnChangeEmoji} ${burnChangeText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  if (criticalInsights.length > 0) {
    body += `
🚨 CRITICAL ALERTS

${criticalInsights.map(i => `  • ${i.message}`).join("\n")}

`;
  }

  if (warningInsights.length > 0) {
    body += `
⚠️ NEEDS ATTENTION

${warningInsights.map(i => `  • ${i.message}`).join("\n")}

`;
  }

  if (infoInsights.length > 0) {
    body += `
ℹ️ INSIGHTS

${infoInsights.map(i => `  • ${i.message}`).join("\n")}

`;
  }

  if (data.topVendors.length > 0) {
    body += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 TOP VENDORS THIS WEEK

${data.topVendors.slice(0, 5).map((v, i) => `  ${i + 1}. ${v.name}: ${formatCurrency(v.amount)}`).join("\n")}

`;
  }

  body += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

View full dashboard: ${process.env.REPLIT_DEPLOYMENT_URL || "https://blacktop.systems"}/app

—
BlackTop Systems - Your Financial Autopilot
To unsubscribe, update your notification settings in the app.
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Financial Digest</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #111; color: #fff; padding: 24px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .header p { margin: 8px 0 0; opacity: 0.8; font-size: 14px; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 24px; background: #f8f8f8; }
    .metric { text-align: center; }
    .metric-value { font-size: 24px; font-weight: 700; color: #111; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .section { padding: 20px 24px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 14px; font-weight: 600; color: #666; margin-bottom: 12px; }
    .alert-critical { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 8px 0; border-radius: 4px; }
    .alert-warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin: 8px 0; border-radius: 4px; }
    .alert-info { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 8px 0; border-radius: 4px; }
    .vendor-list { list-style: none; padding: 0; margin: 0; }
    .vendor-list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .footer { padding: 24px; text-align: center; color: #666; font-size: 12px; }
    .cta-button { display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0; }
    .burn-up { color: #dc2626; }
    .burn-down { color: #16a34a; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.companyName}</h1>
    <p>Weekly Financial Summary • ${formatDate(data.weekStartDate)} - ${formatDate(data.weekEndDate)}</p>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="metric-value">${formatCurrency(data.currentCash)}</div>
      <div class="metric-label">Cash Position</div>
    </div>
    <div class="metric">
      <div class="metric-value">${runwayText}</div>
      <div class="metric-label">Runway</div>
    </div>
    <div class="metric">
      <div class="metric-value">${formatCurrency(data.monthlyBurn)}</div>
      <div class="metric-label">Monthly Burn <span class="${data.burnChange >= 0 ? 'burn-up' : 'burn-down'}">${burnChangeText}</span></div>
    </div>
  </div>

  ${criticalInsights.length > 0 ? `
  <div class="section">
    <div class="section-title">🚨 Critical Alerts</div>
    ${criticalInsights.map(i => `<div class="alert-critical">${i.message}</div>`).join("")}
  </div>
  ` : ""}

  ${warningInsights.length > 0 ? `
  <div class="section">
    <div class="section-title">⚠️ Needs Attention</div>
    ${warningInsights.map(i => `<div class="alert-warning">${i.message}</div>`).join("")}
  </div>
  ` : ""}

  ${infoInsights.length > 0 ? `
  <div class="section">
    <div class="section-title">ℹ️ Insights</div>
    ${infoInsights.map(i => `<div class="alert-info">${i.message}</div>`).join("")}
  </div>
  ` : ""}

  ${data.topVendors.length > 0 ? `
  <div class="section">
    <div class="section-title">💰 Top Vendors This Week</div>
    <ul class="vendor-list">
      ${data.topVendors.slice(0, 5).map(v => `<li><span>${v.name}</span><span><strong>${formatCurrency(v.amount)}</strong></span></li>`).join("")}
    </ul>
  </div>
  ` : ""}

  <div class="footer">
    <a href="${process.env.REPLIT_DEPLOYMENT_URL || "https://blacktop.systems"}/app" class="cta-button">View Full Dashboard</a>
    <p>BlackTop Systems - Your Financial Autopilot</p>
    <p>To unsubscribe, update your notification settings in the app.</p>
  </div>
</body>
</html>
`;

  return { subject, body, html };
}

export async function sendWeeklyDigest(to: string, data: WeeklyDigestData): Promise<NotificationResult> {
  try {
    const { subject, body, html } = formatWeeklyDigest(data);
    
    const gmail = await import("../gmail").then(m => m.getGmailClient());
    
    const boundary = "----=_Part_" + Date.now().toString(36);
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      body,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      '',
      html,
      `--${boundary}--`
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return { channel: "email", success: true };
  } catch (error) {
    console.error("[Email Digest] Failed to send:", error);
    return {
      channel: "email",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
