import type { FinancialAccount, RawTransaction } from "./types";
import { integrationRegistry } from "./registry";

export async function connectProvider(
  providerName: string,
  userId: string
): Promise<{ url?: string; token?: string }> {
  const provider = integrationRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Unknown integration provider: ${providerName}`);
  }
  return provider.connect(userId);
}

export async function fetchAccounts(
  providerName: string,
  userId: string
): Promise<FinancialAccount[]> {
  const provider = integrationRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Unknown integration provider: ${providerName}`);
  }
  return provider.fetchAccounts(userId);
}

export async function fetchTransactions(
  providerName: string,
  userId: string,
  accountId: string,
  fromDate: Date,
  toDate: Date
): Promise<RawTransaction[]> {
  const provider = integrationRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Unknown integration provider: ${providerName}`);
  }
  return provider.fetchTransactions(userId, accountId, fromDate, toDate);
}

export async function fetchAllTransactions(
  providerName: string,
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<RawTransaction[]> {
  const accounts = await fetchAccounts(providerName, userId);
  const allTransactions: RawTransaction[] = [];

  for (const account of accounts) {
    const transactions = await fetchTransactions(
      providerName,
      userId,
      account.externalId,
      fromDate,
      toDate
    );
    allTransactions.push(...transactions);
  }

  return allTransactions;
}

export function listProviders(): string[] {
  return integrationRegistry.list();
}
