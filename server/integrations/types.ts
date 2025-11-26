export interface FinancialAccount {
  externalId: string;
  source: "yodlee" | "plaid" | "qb" | "xero" | "stripe";
  name: string;
  type: "checking" | "savings" | "credit_card" | "investment" | "loan" | "revenue" | "other";
  balance: number;
  currency: string;
  lastSynced: Date;
  metadata?: Record<string, any>;
}

export interface RawTransaction {
  externalId: string;
  sourceAccountId: string;
  source: "yodlee" | "plaid" | "qb" | "xero" | "stripe" | "csv" | "manual";
  date: Date;
  amount: number;
  description: string;
  type: "debit" | "credit";
  currency: string;
  metadata?: Record<string, any>;
}

export interface IntegrationProvider {
  name: string;
  connect(userId: string): Promise<{ url?: string; token?: string }>;
  fetchAccounts(userId: string): Promise<FinancialAccount[]>;
  fetchTransactions(userId: string, accountId: string, fromDate: Date, toDate: Date): Promise<RawTransaction[]>;
  disconnect?(userId: string): Promise<void>;
}

export interface IntegrationRegistry {
  register(provider: IntegrationProvider): void;
  get(name: string): IntegrationProvider | undefined;
  list(): string[];
}
