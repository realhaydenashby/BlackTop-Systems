import type { IntegrationProvider, FinancialAccount, RawTransaction } from "../types";

export class StripeProvider implements IntegrationProvider {
  name = "stripe";

  async connect(userId: string): Promise<{ url?: string; token?: string }> {
    throw new Error("Stripe integration not yet implemented");
  }

  async fetchAccounts(userId: string): Promise<FinancialAccount[]> {
    throw new Error("Stripe integration not yet implemented");
  }

  async fetchTransactions(
    userId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<RawTransaction[]> {
    throw new Error("Stripe integration not yet implemented");
  }
}

export const stripeProvider = new StripeProvider();
