import { storage } from "../storage";

export interface ThresholdConfig {
  runwayWarningMonths: number;
  runwayCriticalMonths: number;
  vendorSpikeThreshold: number;
  burnAccelerationThreshold: number;
  largeTransactionThreshold: number;
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  runwayWarningMonths: 6,
  runwayCriticalMonths: 3,
  vendorSpikeThreshold: 30,
  burnAccelerationThreshold: 20,
  largeTransactionThreshold: 10000,
};

export interface ThresholdAlert {
  type: "runway_critical" | "runway_warning" | "vendor_spike" | "burn_acceleration" | "large_transaction";
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
  metadata?: Record<string, any>;
}

export async function checkThresholds(
  organizationId: string,
  userId: string,
  config: Partial<ThresholdConfig> = {}
): Promise<ThresholdAlert[]> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config };
  const alerts: ThresholdAlert[] = [];

  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const rawTransactions = await storage.getOrganizationTransactions(organizationId, {
      startDate: sixMonthsAgo,
      endDate: new Date(),
    });

    if (rawTransactions.length === 0) {
      return alerts;
    }

    const transactions = rawTransactions.map((txn: any) => ({
      id: txn.id,
      date: new Date(txn.date),
      amount: parseFloat(txn.amount) || 0,
      type: parseFloat(txn.amount) >= 0 ? "credit" : "debit" as "credit" | "debit",
      vendorNormalized: txn.vendorNormalized || txn.vendorOriginal || txn.description,
      categoryId: txn.categoryId,
      isRecurring: txn.isRecurring || false,
      isPayroll: txn.isPayroll || false,
    }));

    const bankAccounts = await storage.getUserBankAccounts(userId);
    const currentCash = bankAccounts.reduce((sum: number, acc: any) => {
      return sum + (parseFloat(acc.currentBalance) || 0);
    }, 0);

    const { calculateBurnRate } = await import("../analytics/burn");
    const { calculateRunway } = await import("../analytics/runway");
    const { detectVendorSpikes } = await import("../insights/anomalies");

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const burnMetrics = calculateBurnRate(transactions, threeMonthsAgo, new Date());
    const runwayMetrics = calculateRunway(transactions, currentCash);

    if (runwayMetrics.runwayMonths !== Infinity && runwayMetrics.runwayMonths < thresholds.runwayCriticalMonths) {
      alerts.push({
        type: "runway_critical",
        title: "Critical Runway Alert",
        message: `Your runway is only ${runwayMetrics.runwayMonths.toFixed(1)} months. At current burn rate ($${burnMetrics.grossBurn.toLocaleString()}/mo), you'll run out of cash by ${runwayMetrics.zeroDate?.toLocaleDateString() || "soon"}.`,
        severity: "critical",
        metadata: {
          runwayMonths: runwayMetrics.runwayMonths,
          monthlyBurn: burnMetrics.grossBurn,
          currentCash,
          zeroDate: runwayMetrics.zeroDate?.toISOString(),
        },
      });
    } else if (runwayMetrics.runwayMonths !== Infinity && runwayMetrics.runwayMonths < thresholds.runwayWarningMonths) {
      alerts.push({
        type: "runway_warning",
        title: "Runway Warning",
        message: `Your runway is ${runwayMetrics.runwayMonths.toFixed(1)} months. Consider reducing burn or raising funds soon.`,
        severity: "warning",
        metadata: {
          runwayMonths: runwayMetrics.runwayMonths,
          monthlyBurn: burnMetrics.grossBurn,
          currentCash,
        },
      });
    }

    const vendorSpikes = detectVendorSpikes({ transactions }, thresholds.vendorSpikeThreshold);
    for (const spike of vendorSpikes.slice(0, 3)) {
      if (spike.changePercent >= 50) {
        alerts.push({
          type: "vendor_spike",
          title: "Vendor Cost Spike",
          message: `${spike.vendor} spending increased ${spike.changePercent.toFixed(0)}% this month ($${spike.previousPeriod.toLocaleString()} → $${spike.currentPeriod.toLocaleString()}).`,
          severity: spike.changePercent >= 100 ? "warning" : "info",
          metadata: {
            vendor: spike.vendor,
            previousAmount: spike.previousPeriod,
            currentAmount: spike.currentPeriod,
            changePercent: spike.changePercent,
          },
        });
      }
    }

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    const lastMonthBurn = calculateBurnRate(transactions, twoMonthsAgo, oneMonthAgo);
    
    if (lastMonthBurn.grossBurn > 0) {
      const burnChange = ((burnMetrics.grossBurn - lastMonthBurn.grossBurn) / lastMonthBurn.grossBurn) * 100;
      
      if (burnChange > thresholds.burnAccelerationThreshold) {
        alerts.push({
          type: "burn_acceleration",
          title: "Burn Rate Acceleration",
          message: `Your burn rate increased ${burnChange.toFixed(0)}% this month ($${lastMonthBurn.grossBurn.toLocaleString()} → $${burnMetrics.grossBurn.toLocaleString()}).`,
          severity: burnChange > 40 ? "warning" : "info",
          metadata: {
            previousBurn: lastMonthBurn.grossBurn,
            currentBurn: burnMetrics.grossBurn,
            changePercent: burnChange,
          },
        });
      }
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTransactions = transactions.filter(
      (t: any) => t.date >= thirtyDaysAgo && t.type === "debit"
    );
    
    for (const txn of recentTransactions) {
      if (Math.abs(txn.amount) > thresholds.largeTransactionThreshold) {
        alerts.push({
          type: "large_transaction",
          title: "Large Transaction Detected",
          message: `Unusual charge of $${Math.abs(txn.amount).toLocaleString()} from ${txn.vendorNormalized} on ${txn.date.toLocaleDateString()}.`,
          severity: Math.abs(txn.amount) > thresholds.largeTransactionThreshold * 5 ? "warning" : "info",
          metadata: {
            vendor: txn.vendorNormalized,
            amount: Math.abs(txn.amount),
            date: txn.date.toISOString(),
          },
        });
      }
    }

    return alerts.slice(0, 5);
  } catch (error) {
    console.error("[ThresholdAlerts] Error checking thresholds:", error);
    return alerts;
  }
}

export async function sendThresholdAlerts(
  userId: string,
  alerts: ThresholdAlert[]
): Promise<{ sent: number; results: any[] }> {
  if (alerts.length === 0) {
    return { sent: 0, results: [] };
  }

  const prefs = await storage.getNotificationPreferences(userId);
  if (!prefs) {
    return { sent: 0, results: [] };
  }

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const warningAlerts = alerts.filter(a => a.severity === "warning");
  
  const minSeverityOrder: Record<string, number> = { info: 0, warning: 1, critical: 2 };
  const userMinSeverity = minSeverityOrder[prefs.minSeverity || "warning"] || 1;
  
  const alertsToSend = alerts.filter(a => minSeverityOrder[a.severity] >= userMinSeverity);
  
  if (alertsToSend.length === 0) {
    return { sent: 0, results: [] };
  }

  const results: any[] = [];
  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

  for (const alert of criticalAlerts) {
    if (prefs.emailEnabled) {
      const user = await storage.getUser(userId);
      if (user?.email) {
        try {
          const { sendEmailNotification } = await import("./email");
          results.push(await sendEmailNotification(user.email, {
            title: alert.title,
            body: alert.message,
            severity: alert.severity,
            actionUrl: `${baseUrl}/app`,
          }));
        } catch (e) {
          console.error("[ThresholdAlerts] Email send failed:", e);
        }
      }
    }

    if (prefs.slackEnabled && prefs.slackWebhookUrl) {
      try {
        const { sendSlackNotification } = await import("./slack");
        results.push(await sendSlackNotification(prefs.slackWebhookUrl, {
          title: alert.title,
          body: alert.message,
          severity: alert.severity,
          actionUrl: `${baseUrl}/app`,
        }));
      } catch (e) {
        console.error("[ThresholdAlerts] Slack send failed:", e);
      }
    }

    if (prefs.smsEnabled && prefs.smsPhoneNumber) {
      try {
        const { sendSMSNotification } = await import("./sms");
        results.push(await sendSMSNotification(prefs.smsPhoneNumber, {
          title: alert.title,
          body: alert.message,
          severity: alert.severity,
        }));
      } catch (e) {
        console.error("[ThresholdAlerts] SMS send failed:", e);
      }
    }
  }

  for (const alert of warningAlerts) {
    if (prefs.slackEnabled && prefs.slackWebhookUrl) {
      try {
        const { sendSlackNotification } = await import("./slack");
        results.push(await sendSlackNotification(prefs.slackWebhookUrl, {
          title: alert.title,
          body: alert.message,
          severity: alert.severity,
          actionUrl: `${baseUrl}/app`,
        }));
      } catch (e) {
        console.error("[ThresholdAlerts] Slack send failed:", e);
      }
    }
  }

  const successCount = results.filter(r => r.success).length;
  return { sent: successCount, results };
}
