import type { IntegrationProvider, FinancialAccount, RawTransaction } from "../types";

export class QuickBooksProvider implements IntegrationProvider {
  name = "qb";

  async connect(userId: string): Promise<{ url?: string; token?: string }> {
    throw new Error("QuickBooks integration not yet implemented");
  }

  async fetchAccounts(userId: string): Promise<FinancialAccount[]> {
    throw new Error("QuickBooks integration not yet implemented");
  }

  async fetchTransactions(
    userId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<RawTransaction[]> {
    throw new Error("QuickBooks integration not yet implemented");
  }
}

export const quickBooksProvider = new QuickBooksProvider();
