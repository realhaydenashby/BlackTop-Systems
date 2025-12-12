import { stripeSubscriptionService, SaaSMetrics, ChurnMetrics } from './stripeSubscriptionService';
import { NormalizationService, CACClassification } from '../normalizationService';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface CACBreakdown {
  marketingSpend: number;
  salesSpend: number;
  totalCACSpend: number;
  byCategory: Record<string, number>;
  transactionCount: number;
  lowConfidenceCount: number;
}

export interface LTVMetrics {
  ltv: number;
  ltvToCacRatio: number;
  averageCustomerLifespanMonths: number;
  arpu: number;
  monthlyChurnRate: number;
}

export interface UnitEconomics {
  saasMetrics: SaaSMetrics;
  cac: number;
  cacBreakdown: CACBreakdown;
  ltv: number;
  ltvMetrics: LTVMetrics;
  ltvToCacRatio: number;
  paybackPeriodMonths: number;
  healthScore: 'excellent' | 'good' | 'warning' | 'critical';
  healthReason: string;
  dataQuality: {
    hasStripeData: boolean;
    hasBankData: boolean;
    cacConfidence: number;
    isUsingManualOverrides: boolean;
  };
  computedAt: Date;
}

interface Transaction {
  id: number;
  vendor: string;
  description: string;
  amount: number;
  date: Date;
  category: string;
}

const normalizationService = new NormalizationService();

export class SaaSMetricsService {
  
  async getCACSpendFromTransactions(
    organizationId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{ breakdown: CACBreakdown; classifications: CACClassification[] }> {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const result = await db.execute(sql`
      SELECT id, vendor_name as vendor, description, amount, date, category
      FROM transactions 
      WHERE organization_id = ${organizationId}
        AND date >= ${startDateStr}
        AND date <= ${endDateStr}
    `);
    
    const transactions = result.rows as Transaction[];
    
    let marketingSpend = 0;
    let salesSpend = 0;
    const byCategory: Record<string, number> = {};
    const classifications: CACClassification[] = [];
    let lowConfidenceCount = 0;
    
    for (const tx of transactions) {
      const classification = await normalizationService.classifyCACSpend(
        tx.vendor || '',
        tx.description || '',
        Math.abs(tx.amount)
      );
      
      classifications.push(classification);
      
      if (classification.isCACSpend) {
        // Bank transactions: negative = spend, positive = refund
        // Convert to spend amount: negative becomes positive spend, positive becomes negative (refund reduction)
        const spendAmount = tx.amount < 0 ? Math.abs(tx.amount) : -tx.amount;
        
        // Add to totals - spendAmount is positive for real spend, negative for refunds
        if (classification.category === 'marketing') {
          marketingSpend += spendAmount;
        } else if (classification.category === 'sales') {
          salesSpend += spendAmount;
        }
        
        const key = classification.spendType;
        byCategory[key] = (byCategory[key] || 0) + spendAmount;
        
        if (classification.requiresReview) {
          lowConfidenceCount++;
        }
      }
    }
    
    // Floor at 0 - can't have negative CAC spend (refunds exceeding spend is treated as 0)
    const finalMarketingSpend = Math.max(0, Math.round(marketingSpend * 100) / 100);
    const finalSalesSpend = Math.max(0, Math.round(salesSpend * 100) / 100);
    
    return {
      breakdown: {
        marketingSpend: finalMarketingSpend,
        salesSpend: finalSalesSpend,
        totalCACSpend: finalMarketingSpend + finalSalesSpend,
        byCategory,
        transactionCount: transactions.length,
        lowConfidenceCount,
      },
      classifications,
    };
  }

  async computeCAC(
    organizationId: number,
    periodDays: number = 30
  ): Promise<{ cac: number; breakdown: CACBreakdown; confidence: number }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    const { breakdown } = await this.getCACSpendFromTransactions(organizationId, startDate, endDate);
    
    const newCustomers = await stripeSubscriptionService.getNewCustomersInPeriod(startDate, endDate);
    
    let cac = 0;
    let insufficientCustomerData = false;
    
    if (newCustomers > 0) {
      cac = breakdown.totalCACSpend / newCustomers;
    } else {
      insufficientCustomerData = true;
    }
    
    let confidence = 1.0;
    if (breakdown.transactionCount > 0) {
      const lowConfidenceRatio = breakdown.lowConfidenceCount / breakdown.transactionCount;
      confidence = 1 - (lowConfidenceRatio * 0.5);
    }
    if (insufficientCustomerData) {
      confidence = Math.min(confidence, 0.3);
    }
    if (breakdown.transactionCount === 0) {
      confidence = 0.1;
    }
    
    return {
      cac: Math.round(cac * 100) / 100,
      breakdown,
      confidence: Math.round(confidence * 100) / 100,
      insufficientCustomerData,
    };
  }

  async computeLTV(periodDays: number = 30): Promise<LTVMetrics> {
    const arpu = await stripeSubscriptionService.computeARPU();
    const churnMetrics = await stripeSubscriptionService.computeChurnRate(periodDays);
    
    const monthlyChurnRate = churnMetrics.customerChurnRate / 100;
    
    let averageCustomerLifespanMonths = 0;
    if (monthlyChurnRate > 0) {
      averageCustomerLifespanMonths = 1 / monthlyChurnRate;
    } else {
      averageCustomerLifespanMonths = 60;
    }
    
    const ltv = arpu * averageCustomerLifespanMonths;
    
    return {
      ltv: Math.round(ltv * 100) / 100,
      ltvToCacRatio: 0,
      averageCustomerLifespanMonths: Math.round(averageCustomerLifespanMonths * 10) / 10,
      arpu,
      monthlyChurnRate: Math.round(monthlyChurnRate * 10000) / 100,
    };
  }

  async computeUnitEconomics(
    organizationId: number,
    periodDays: number = 30
  ): Promise<UnitEconomics> {
    const hasStripeData = await stripeSubscriptionService.hasStripeData();
    
    const hasBankDataResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM transactions 
      WHERE organization_id = ${organizationId} LIMIT 1
    `);
    const hasBankData = Number(hasBankDataResult.rows[0]?.count || 0) > 0;
    
    const manualOverridesResult = await db.execute(sql`
      SELECT * FROM user_settings 
      WHERE user_id = ${organizationId} 
        AND setting_key IN ('manual_cac', 'manual_ltv')
    `);
    const hasManualOverrides = (manualOverridesResult.rows?.length || 0) > 0;
    
    let saasMetrics: SaaSMetrics;
    if (hasStripeData) {
      saasMetrics = await stripeSubscriptionService.computeAllMetrics(periodDays);
    } else {
      saasMetrics = this.getEmptySaaSMetrics();
    }
    
    let cac = 0;
    let cacBreakdown: CACBreakdown = this.getEmptyCACBreakdown();
    let cacConfidence = 0;
    
    if (hasBankData) {
      const cacResult = await this.computeCAC(organizationId, periodDays);
      cac = cacResult.cac;
      cacBreakdown = cacResult.breakdown;
      cacConfidence = cacResult.confidence;
    }
    
    const ltvMetrics = await this.computeLTV(periodDays);
    let ltv = ltvMetrics.ltv;
    
    let ltvToCacRatio = 0;
    if (cac > 0) {
      ltvToCacRatio = ltv / cac;
      ltvMetrics.ltvToCacRatio = Math.round(ltvToCacRatio * 100) / 100;
    }
    
    let paybackPeriodMonths = 0;
    if (saasMetrics.arpu > 0 && cac > 0) {
      paybackPeriodMonths = cac / saasMetrics.arpu;
    }
    
    const { healthScore, healthReason } = this.computeHealthScore(ltvToCacRatio, paybackPeriodMonths, saasMetrics.churnMetrics);
    
    return {
      saasMetrics,
      cac,
      cacBreakdown,
      ltv,
      ltvMetrics,
      ltvToCacRatio: Math.round(ltvToCacRatio * 100) / 100,
      paybackPeriodMonths: Math.round(paybackPeriodMonths * 10) / 10,
      healthScore,
      healthReason,
      dataQuality: {
        hasStripeData,
        hasBankData,
        cacConfidence,
        isUsingManualOverrides: hasManualOverrides,
      },
      computedAt: new Date(),
    };
  }

  private computeHealthScore(
    ltvToCacRatio: number,
    paybackPeriodMonths: number,
    churnMetrics: ChurnMetrics
  ): { healthScore: 'excellent' | 'good' | 'warning' | 'critical'; healthReason: string } {
    const issues: string[] = [];
    let score = 100;
    
    if (ltvToCacRatio >= 3) {
    } else if (ltvToCacRatio >= 2) {
      score -= 15;
      issues.push('LTV:CAC ratio is below 3x');
    } else if (ltvToCacRatio >= 1) {
      score -= 35;
      issues.push('LTV:CAC ratio is below 2x - acquisition may not be profitable');
    } else if (ltvToCacRatio > 0) {
      score -= 60;
      issues.push('LTV:CAC ratio is below 1x - you are losing money on each customer');
    }
    
    if (paybackPeriodMonths <= 12) {
    } else if (paybackPeriodMonths <= 18) {
      score -= 10;
      issues.push('Payback period exceeds 12 months');
    } else if (paybackPeriodMonths <= 24) {
      score -= 25;
      issues.push('Payback period exceeds 18 months');
    } else {
      score -= 40;
      issues.push('Payback period exceeds 24 months - high risk');
    }
    
    const monthlyChurn = churnMetrics.customerChurnRate;
    if (monthlyChurn <= 2) {
    } else if (monthlyChurn <= 5) {
      score -= 10;
      issues.push('Monthly churn rate is above 2%');
    } else if (monthlyChurn <= 10) {
      score -= 25;
      issues.push('Monthly churn rate is high (>5%)');
    } else {
      score -= 40;
      issues.push('Monthly churn rate is critical (>10%)');
    }
    
    let healthScore: 'excellent' | 'good' | 'warning' | 'critical';
    if (score >= 80) {
      healthScore = 'excellent';
    } else if (score >= 60) {
      healthScore = 'good';
    } else if (score >= 40) {
      healthScore = 'warning';
    } else {
      healthScore = 'critical';
    }
    
    const healthReason = issues.length > 0 
      ? issues.join('; ') 
      : 'All key metrics are within healthy ranges';
    
    return { healthScore, healthReason };
  }

  private getEmptySaaSMetrics(): SaaSMetrics {
    return {
      mrr: 0,
      arr: 0,
      arpu: 0,
      activeSubscriptions: 0,
      activeCustomers: 0,
      newCustomersInPeriod: 0,
      churnMetrics: {
        customerChurnRate: 0,
        revenueChurnRate: 0,
        churningCustomers: 0,
        totalCustomers: 0,
        periodStartCustomers: 0,
      },
      trialSubscriptions: 0,
      computedAt: new Date(),
      currency: 'usd',
    };
  }

  private getEmptyCACBreakdown(): CACBreakdown {
    return {
      marketingSpend: 0,
      salesSpend: 0,
      totalCACSpend: 0,
      byCategory: {},
      transactionCount: 0,
      lowConfidenceCount: 0,
    };
  }
}

export const saasMetricsService = new SaaSMetricsService();
