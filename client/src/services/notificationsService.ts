export interface AlertConfig {
  burnThreshold?: number;
  runwayThreshold?: number;
  vendorSpikeThreshold?: number;
}

const defaultConfig: AlertConfig = {
  burnThreshold: 100000,
  runwayThreshold: 6,
  vendorSpikeThreshold: 0.20,
};

export const notificationsService = {
  config: { ...defaultConfig },

  setConfig: (config: Partial<AlertConfig>) => {
    notificationsService.config = { ...notificationsService.config, ...config };
  },

  sendSlackAlert: async (message: string): Promise<void> => {
    console.log("[NotificationService] Slack alert:", message);
  },

  sendSmsAlert: async (message: string): Promise<void> => {
    console.log("[NotificationService] SMS alert:", message);
  },

  sendEmailAlert: async (to: string, subject: string, body: string): Promise<void> => {
    console.log("[NotificationService] Email alert:", { to, subject, body });
  },

  checkBurnThreshold: async (currentBurn: number): Promise<boolean> => {
    const { burnThreshold } = notificationsService.config;
    if (burnThreshold && currentBurn > burnThreshold) {
      await notificationsService.sendSlackAlert(
        `Burn rate alert: Current burn of $${currentBurn.toLocaleString()}/mo exceeds threshold of $${burnThreshold.toLocaleString()}/mo`
      );
      return true;
    }
    return false;
  },

  checkRunwayThreshold: async (runwayMonths: number): Promise<boolean> => {
    const { runwayThreshold } = notificationsService.config;
    if (runwayThreshold && runwayMonths < runwayThreshold) {
      await notificationsService.sendSlackAlert(
        `Runway alert: Current runway of ${runwayMonths.toFixed(1)} months is below ${runwayThreshold} month threshold`
      );
      await notificationsService.sendSmsAlert(
        `URGENT: Runway is ${runwayMonths.toFixed(1)} months. Review cash position.`
      );
      return true;
    }
    return false;
  },

  checkVendorSpike: async (vendorName: string, percentChange: number): Promise<boolean> => {
    const { vendorSpikeThreshold } = notificationsService.config;
    if (vendorSpikeThreshold && percentChange > vendorSpikeThreshold) {
      await notificationsService.sendSlackAlert(
        `Vendor spike: ${vendorName} costs increased ${(percentChange * 100).toFixed(0)}%`
      );
      return true;
    }
    return false;
  },
};
