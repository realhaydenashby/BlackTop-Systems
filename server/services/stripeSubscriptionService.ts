import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface MRRBreakdown {
  newMRR: number;
  expansionMRR: number;
  contractionMRR: number;
  churnedMRR: number;
  netMRR: number;
}

export interface ChurnMetrics {
  customerChurnRate: number;
  revenueChurnRate: number;
  churningCustomers: number;
  totalCustomers: number;
  periodStartCustomers: number;
}

export interface SaaSMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  activeSubscriptions: number;
  activeCustomers: number;
  newCustomersInPeriod: number;
  churnMetrics: ChurnMetrics;
  mrrBreakdown?: MRRBreakdown;
  trialSubscriptions: number;
  computedAt: Date;
  currency: string;
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  currency: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  created: number;
  items: any;
  _raw_data?: any;
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  status: string;
  total: number;
  amount_paid: number;
  amount_refunded?: number;
  currency: string;
  created: number;
  billing_reason: string;
  period_start: number;
  period_end: number;
}

export class StripeSubscriptionService {
  
  async getActiveSubscriptions(): Promise<StripeSubscription[]> {
    const result = await db.execute(sql`
      SELECT id, customer, status, currency, current_period_start, current_period_end,
             cancel_at_period_end, canceled_at, created, items, _raw_data
      FROM stripe.subscriptions 
      WHERE status IN ('active', 'past_due')
    `);
    return result.rows as StripeSubscription[];
  }

  async getTrialSubscriptions(): Promise<StripeSubscription[]> {
    const result = await db.execute(sql`
      SELECT id, customer, status, currency, current_period_start, current_period_end,
             cancel_at_period_end, canceled_at, created, items, _raw_data
      FROM stripe.subscriptions 
      WHERE status = 'trialing'
    `);
    return result.rows as StripeSubscription[];
  }

  async getCanceledSubscriptionsInPeriod(startDate: Date, endDate: Date): Promise<StripeSubscription[]> {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    const result = await db.execute(sql`
      SELECT id, customer, status, currency, current_period_start, current_period_end,
             cancel_at_period_end, canceled_at, created, items, _raw_data
      FROM stripe.subscriptions 
      WHERE status = 'canceled' 
        AND canceled_at >= ${startTimestamp}
        AND canceled_at <= ${endTimestamp}
    `);
    return result.rows as StripeSubscription[];
  }

  async getNewSubscriptionsInPeriod(startDate: Date, endDate: Date): Promise<StripeSubscription[]> {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    const result = await db.execute(sql`
      SELECT id, customer, status, currency, current_period_start, current_period_end,
             cancel_at_period_end, canceled_at, created, items, _raw_data
      FROM stripe.subscriptions 
      WHERE created >= ${startTimestamp}
        AND created <= ${endTimestamp}
        AND status IN ('active', 'past_due', 'trialing')
    `);
    return result.rows as StripeSubscription[];
  }

  async getInvoicesInPeriod(startDate: Date, endDate: Date): Promise<StripeInvoice[]> {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    const result = await db.execute(sql`
      SELECT id, customer, subscription, status, total, amount_paid, currency, 
             created, billing_reason, period_start, period_end
      FROM stripe.invoices 
      WHERE created >= ${startTimestamp}
        AND created <= ${endTimestamp}
        AND status IN ('paid', 'open')
    `);
    return result.rows as StripeInvoice[];
  }

  async getActiveCustomerCount(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT customer) as count
      FROM stripe.subscriptions 
      WHERE status IN ('active', 'past_due')
    `);
    return Number(result.rows[0]?.count || 0);
  }

  async getNewCustomersInPeriod(startDate: Date, endDate: Date): Promise<number> {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT customer) as count
      FROM stripe.subscriptions 
      WHERE created >= ${startTimestamp}
        AND created <= ${endTimestamp}
        AND status IN ('active', 'past_due')
    `);
    return Number(result.rows[0]?.count || 0);
  }

  private extractMonthlyAmount(subscription: StripeSubscription): number {
    let totalMonthly = 0;
    
    let items: any[] = [];
    if (subscription.items?.data) {
      items = subscription.items.data;
    } else if (subscription._raw_data?.items?.data) {
      items = subscription._raw_data.items.data;
    }
    
    for (const item of items) {
      const price = item.price;
      if (!price) continue;
      
      const unitAmountCents = price.unit_amount || 0;
      const quantity = item.quantity || 1;
      const totalCents = unitAmountCents * quantity;
      
      const interval = price.recurring?.interval || 'month';
      const intervalCount = price.recurring?.interval_count || 1;
      
      let billingPeriodMonths = 1;
      switch (interval) {
        case 'day':
          billingPeriodMonths = (intervalCount * 1) / 30.44;
          break;
        case 'week':
          billingPeriodMonths = (intervalCount * 7) / 30.44;
          break;
        case 'month':
          billingPeriodMonths = intervalCount;
          break;
        case 'year':
          billingPeriodMonths = intervalCount * 12;
          break;
        default:
          billingPeriodMonths = 1;
      }
      
      const monthlyAmountCents = totalCents / billingPeriodMonths;
      totalMonthly += monthlyAmountCents / 100;
    }
    
    return totalMonthly;
  }

  async computeMRR(): Promise<{ mrr: number; currency: string; subscriptionCount: number }> {
    const activeSubscriptions = await this.getActiveSubscriptions();
    
    let totalMRR = 0;
    let currency = 'usd';
    
    for (const sub of activeSubscriptions) {
      const monthlyAmount = this.extractMonthlyAmount(sub);
      totalMRR += monthlyAmount;
      if (sub.currency) {
        currency = sub.currency;
      }
    }
    
    return {
      mrr: Math.round(totalMRR * 100) / 100,
      currency,
      subscriptionCount: activeSubscriptions.length,
    };
  }

  async computeARR(): Promise<number> {
    const { mrr } = await this.computeMRR();
    return Math.round(mrr * 12 * 100) / 100;
  }

  async computeARPU(): Promise<number> {
    const { mrr } = await this.computeMRR();
    const customerCount = await this.getActiveCustomerCount();
    
    if (customerCount === 0) return 0;
    return Math.round((mrr / customerCount) * 100) / 100;
  }

  async computeChurnRate(periodDays: number = 30): Promise<ChurnMetrics> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    const canceledSubs = await this.getCanceledSubscriptionsInPeriod(startDate, endDate);
    const activeCustomers = await this.getActiveCustomerCount();
    
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const periodStartResult = await db.execute(sql`
      SELECT COUNT(DISTINCT customer) as count
      FROM stripe.subscriptions 
      WHERE created < ${startTimestamp}
        AND (status IN ('active', 'past_due') OR 
             (status = 'canceled' AND canceled_at >= ${startTimestamp}))
    `);
    const periodStartCustomers = Number(periodStartResult.rows[0]?.count || 0);
    
    const churningCustomers = new Set(canceledSubs.map(s => s.customer)).size;
    
    let customerChurnRate = 0;
    if (periodStartCustomers > 0) {
      customerChurnRate = (churningCustomers / periodStartCustomers) * 100;
    }
    
    let churnedMRR = 0;
    for (const sub of canceledSubs) {
      churnedMRR += this.extractMonthlyAmount(sub);
    }
    
    const { mrr } = await this.computeMRR();
    const totalMRRAtStart = mrr + churnedMRR;
    
    let revenueChurnRate = 0;
    if (totalMRRAtStart > 0) {
      revenueChurnRate = (churnedMRR / totalMRRAtStart) * 100;
    }
    
    return {
      customerChurnRate: Math.round(customerChurnRate * 100) / 100,
      revenueChurnRate: Math.round(revenueChurnRate * 100) / 100,
      churningCustomers,
      totalCustomers: activeCustomers + churningCustomers,
      periodStartCustomers,
    };
  }

  async computeMRRBreakdown(periodDays: number = 30): Promise<MRRBreakdown> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    const newSubs = await this.getNewSubscriptionsInPeriod(startDate, endDate);
    let newMRR = 0;
    for (const sub of newSubs) {
      if (sub.status !== 'trialing') {
        newMRR += this.extractMonthlyAmount(sub);
      }
    }
    
    const canceledSubs = await this.getCanceledSubscriptionsInPeriod(startDate, endDate);
    let churnedMRR = 0;
    for (const sub of canceledSubs) {
      churnedMRR += this.extractMonthlyAmount(sub);
    }
    
    const expansionMRR = 0;
    const contractionMRR = 0;
    
    const netMRR = newMRR + expansionMRR - contractionMRR - churnedMRR;
    
    return {
      newMRR: Math.round(newMRR * 100) / 100,
      expansionMRR: Math.round(expansionMRR * 100) / 100,
      contractionMRR: Math.round(contractionMRR * 100) / 100,
      churnedMRR: Math.round(churnedMRR * 100) / 100,
      netMRR: Math.round(netMRR * 100) / 100,
    };
  }

  async computeAllMetrics(periodDays: number = 30): Promise<SaaSMetrics> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    const [
      mrrData,
      activeCustomers,
      newCustomers,
      churnMetrics,
      mrrBreakdown,
      trialSubs,
    ] = await Promise.all([
      this.computeMRR(),
      this.getActiveCustomerCount(),
      this.getNewCustomersInPeriod(startDate, endDate),
      this.computeChurnRate(periodDays),
      this.computeMRRBreakdown(periodDays),
      this.getTrialSubscriptions(),
    ]);
    
    const arr = mrrData.mrr * 12;
    const arpu = activeCustomers > 0 ? mrrData.mrr / activeCustomers : 0;
    
    return {
      mrr: Math.round(mrrData.mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      arpu: Math.round(arpu * 100) / 100,
      activeSubscriptions: mrrData.subscriptionCount,
      activeCustomers,
      newCustomersInPeriod: newCustomers,
      churnMetrics,
      mrrBreakdown,
      trialSubscriptions: trialSubs.length,
      computedAt: new Date(),
      currency: mrrData.currency,
    };
  }

  async hasStripeData(): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM stripe.subscriptions LIMIT 1
    `);
    return Number(result.rows[0]?.count || 0) > 0;
  }
}

export const stripeSubscriptionService = new StripeSubscriptionService();
