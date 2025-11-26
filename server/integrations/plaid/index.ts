import type { IntegrationProvider, FinancialAccount, RawTransaction } from "../types";

export class PlaidProvider implements IntegrationProvider {
  name = "plaid";

  async connect(userId: string): Promise<{ url?: string; token?: string }> {
    throw new Error("Plaid integration not yet implemented");
  }

  async fetchAccounts(userId: string): Promise<FinancialAccount[]> {
    throw new Error("Plaid integration not yet implemented");
  }

  async fetchTransactions(
    userId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<RawTransaction[]> {
    throw new Error("Plaid integration not yet implemented");
  }
}

export const plaidProvider = new PlaidProvider();
