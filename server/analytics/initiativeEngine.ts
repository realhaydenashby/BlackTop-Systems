import { storage } from "../storage";

export interface FinancialDelta {
  type: "runway_change" | "burn_spike" | "revenue_change" | "cash_change" | "vendor_spike" | "recurring_creep";
  severity: "critical" | "warning" | "info";
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  changeAbsolute: number;
  message: string;
  actionLabel: string;
  actionLink: string;
  discoveredAt: Date;
  priority: number;
}

export interface SnapshotComparison {
  organizationId: string;
  previousSnapshot: Date | null;
  currentSnapshot: Date;
  deltas: FinancialDelta[];
  hasSignificantChange: boolean;
}

interface MetricPoint {
  value: number;
  date: Date;
}

export class InitiativeEngine {
  private readonly RUNWAY_WARNING_MONTHS = 6;
  private readonly RUNWAY_CRITICAL_MONTHS = 3;
  private readonly BURN_SPIKE_THRESHOLD = 15;
  private readonly REVENUE_CHANGE_THRESHOLD = 10;
  private readonly CASH_CHANGE_THRESHOLD = 10;
  private readonly VENDOR_SPIKE_THRESHOLD = 25;

  async detectChanges(
    organizationId: string,
    currentMetrics: {
      runway: number;
      burnRate: number;
      revenue: number;
      currentCash: number;
      previousCash?: number;
    },
    previousMetrics?: {
      runway: number;
      burnRate: number;
      revenue: number;
      currentCash: number;
    }
  ): Promise<SnapshotComparison> {
    const deltas: FinancialDelta[] = [];
    const now = new Date();

    if (!previousMetrics) {
      return {
        organizationId,
        previousSnapshot: null,
        currentSnapshot: now,
        deltas: [],
        hasSignificantChange: false,
      };
    }

    if (previousMetrics.runway > 0 && currentMetrics.runway > 0 && previousMetrics.runway !== Infinity) {
      const runwayChange = currentMetrics.runway - previousMetrics.runway;
      const runwayChangePercent = (runwayChange / previousMetrics.runway) * 100;
      
      if (runwayChange < -1) {
        const severity = currentMetrics.runway < this.RUNWAY_CRITICAL_MONTHS ? "critical" : 
                        currentMetrics.runway < this.RUNWAY_WARNING_MONTHS ? "warning" : "info";
        
        deltas.push({
          type: "runway_change",
          severity,
          metric: "runway",
          previousValue: previousMetrics.runway,
          currentValue: currentMetrics.runway,
          changePercent: runwayChangePercent,
          changeAbsolute: runwayChange,
          message: `Runway dropped ${Math.abs(runwayChange).toFixed(1)} months (${previousMetrics.runway.toFixed(1)} → ${currentMetrics.runway.toFixed(1)} months)`,
          actionLabel: "Review Burn",
          actionLink: "/app/analytics?section=burn",
          discoveredAt: now,
          priority: severity === "critical" ? 1 : severity === "warning" ? 2 : 4,
        });
      } else if (runwayChange > 2) {
        deltas.push({
          type: "runway_change",
          severity: "info",
          metric: "runway",
          previousValue: previousMetrics.runway,
          currentValue: currentMetrics.runway,
          changePercent: runwayChangePercent,
          changeAbsolute: runwayChange,
          message: `Runway improved ${runwayChange.toFixed(1)} months (${previousMetrics.runway.toFixed(1)} → ${currentMetrics.runway.toFixed(1)} months)`,
          actionLabel: "View Details",
          actionLink: "/app/analytics?section=runway",
          discoveredAt: now,
          priority: 5,
        });
      }
    }

    if (previousMetrics.burnRate > 0 && currentMetrics.burnRate > 0) {
      const burnChange = currentMetrics.burnRate - previousMetrics.burnRate;
      const burnChangePercent = (burnChange / previousMetrics.burnRate) * 100;
      
      if (burnChangePercent > this.BURN_SPIKE_THRESHOLD) {
        deltas.push({
          type: "burn_spike",
          severity: burnChangePercent > 30 ? "warning" : "info",
          metric: "burn_rate",
          previousValue: previousMetrics.burnRate,
          currentValue: currentMetrics.burnRate,
          changePercent: burnChangePercent,
          changeAbsolute: burnChange,
          message: `Burn rate increased ${burnChangePercent.toFixed(0)}% ($${previousMetrics.burnRate.toLocaleString()} → $${currentMetrics.burnRate.toLocaleString()})`,
          actionLabel: "Review Expenses",
          actionLink: "/app/transactions?type=expense",
          discoveredAt: now,
          priority: burnChangePercent > 30 ? 2 : 3,
        });
      } else if (burnChangePercent < -this.BURN_SPIKE_THRESHOLD) {
        deltas.push({
          type: "burn_spike",
          severity: "info",
          metric: "burn_rate",
          previousValue: previousMetrics.burnRate,
          currentValue: currentMetrics.burnRate,
          changePercent: burnChangePercent,
          changeAbsolute: burnChange,
          message: `Burn rate decreased ${Math.abs(burnChangePercent).toFixed(0)}% ($${previousMetrics.burnRate.toLocaleString()} → $${currentMetrics.burnRate.toLocaleString()})`,
          actionLabel: "View Details",
          actionLink: "/app/analytics?section=burn",
          discoveredAt: now,
          priority: 5,
        });
      }
    }

    if (previousMetrics.revenue > 100 || currentMetrics.revenue > 100) {
      const revenueChange = currentMetrics.revenue - previousMetrics.revenue;
      const revenueChangePercent = previousMetrics.revenue > 0 
        ? (revenueChange / previousMetrics.revenue) * 100 
        : (currentMetrics.revenue > 0 ? 100 : 0);
      
      if (Math.abs(revenueChangePercent) > this.REVENUE_CHANGE_THRESHOLD) {
        const isGrowth = revenueChange > 0;
        deltas.push({
          type: "revenue_change",
          severity: isGrowth ? "info" : "warning",
          metric: "revenue",
          previousValue: previousMetrics.revenue,
          currentValue: currentMetrics.revenue,
          changePercent: revenueChangePercent,
          changeAbsolute: revenueChange,
          message: isGrowth 
            ? `Revenue grew ${revenueChangePercent.toFixed(0)}% ($${previousMetrics.revenue.toLocaleString()} → $${currentMetrics.revenue.toLocaleString()})`
            : `Revenue dropped ${Math.abs(revenueChangePercent).toFixed(0)}% ($${previousMetrics.revenue.toLocaleString()} → $${currentMetrics.revenue.toLocaleString()})`,
          actionLabel: isGrowth ? "View Growth" : "Investigate",
          actionLink: "/app/analytics?section=revenue",
          discoveredAt: now,
          priority: isGrowth ? 5 : 2,
        });
      }
    }

    if (previousMetrics.currentCash > 0 && currentMetrics.currentCash > 0) {
      const cashChange = currentMetrics.currentCash - previousMetrics.currentCash;
      const cashChangePercent = (cashChange / previousMetrics.currentCash) * 100;
      
      if (cashChangePercent < -this.CASH_CHANGE_THRESHOLD) {
        deltas.push({
          type: "cash_change",
          severity: "warning",
          metric: "cash",
          previousValue: previousMetrics.currentCash,
          currentValue: currentMetrics.currentCash,
          changePercent: cashChangePercent,
          changeAbsolute: cashChange,
          message: `Cash dropped ${Math.abs(cashChangePercent).toFixed(0)}% ($${Math.abs(cashChange).toLocaleString()} decrease)`,
          actionLabel: "Review Cash Flow",
          actionLink: "/app/analytics?section=cashflow",
          discoveredAt: now,
          priority: 3,
        });
      }
    }

    deltas.sort((a, b) => a.priority - b.priority);

    return {
      organizationId,
      previousSnapshot: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      currentSnapshot: now,
      deltas,
      hasSignificantChange: deltas.some(d => d.severity === "critical" || d.severity === "warning"),
    };
  }

  getTopDelta(comparison: SnapshotComparison): FinancialDelta | null {
    if (comparison.deltas.length === 0) return null;
    return comparison.deltas[0];
  }

  async storeSnapshot(
    organizationId: string,
    metricType: string,
    value: number,
    previousValue: number | null,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    const changePercent = previousValue !== null && previousValue !== 0
      ? ((value - previousValue) / Math.abs(previousValue)) * 100
      : null;

    await storage.createMetricSnapshot({
      organizationId,
      metricType: metricType as any,
      value: value.toString(),
      previousValue: previousValue?.toString() || null,
      changePercent: changePercent?.toString() || null,
      periodStart,
      periodEnd,
      periodType: "weekly",
      confidence: "0.95",
    });
  }

  async getHistoricalMetrics(
    organizationId: string,
    metricType: string,
    months: number = 3
  ): Promise<MetricPoint[]> {
    const snapshots = await storage.getMetricSnapshots(organizationId, metricType, months);
    return snapshots.map(s => ({
      value: parseFloat(s.value) || 0,
      date: new Date(s.periodEnd),
    }));
  }
}

export const initiativeEngine = new InitiativeEngine();
