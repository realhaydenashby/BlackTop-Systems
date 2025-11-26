import type { IntegrationProvider, FinancialAccount, RawTransaction } from "../types";
import { yodleeService } from "../../yodleeService";

export class YodleeProvider implements IntegrationProvider {
  name = "yodlee";

  async connect(userId: string): Promise<{ url?: string; token?: string }> {
    const result = await yodleeService.generateFastLink(userId);
    return { url: result.fastLinkUrl, token: result.userSession };
  }

  async fetchAccounts(userId: string): Promise<FinancialAccount[]> {
    const userSession = await yodleeService.getUserSession(userId);
    const accounts = await yodleeService.getAccounts(userSession);

    return accounts.map((acc) => {
      let type: FinancialAccount["type"] = "other";
      const accType = acc.accountType?.toLowerCase() || "";
      if (accType.includes("checking")) type = "checking";
      else if (accType.includes("savings")) type = "savings";
      else if (accType.includes("credit")) type = "credit_card";
      else if (accType.includes("investment") || accType.includes("brokerage")) type = "investment";
      else if (accType.includes("loan") || accType.includes("mortgage")) type = "loan";

      return {
        externalId: acc.id.toString(),
        source: "yodlee" as const,
        name: acc.accountName || "Account",
        type,
        balance: acc.balance?.amount || 0,
        currency: acc.balance?.currency || "USD",
        lastSynced: new Date(),
        metadata: { providerAccountId: acc.providerAccountId },
      };
    });
  }

  async fetchTransactions(
    userId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<RawTransaction[]> {
    const userSession = await yodleeService.getUserSession(userId);
    const from = fromDate.toISOString().split("T")[0];
    const to = toDate.toISOString().split("T")[0];

    const transactions = await yodleeService.getTransactions(userSession, from, to);

    return transactions
      .filter((txn) => txn.accountId.toString() === accountId)
      .map((txn) => ({
        externalId: txn.id.toString(),
        sourceAccountId: txn.accountId.toString(),
        source: "yodlee" as const,
        date: new Date(txn.date),
        amount: Math.abs(txn.amount.amount),
        description: txn.description.simple || txn.description.original,
        type: txn.baseType === "DEBIT" ? ("debit" as const) : ("credit" as const),
        currency: txn.amount.currency || "USD",
        metadata: {
          categoryType: txn.categoryType,
          categoryId: txn.categoryId,
          category: txn.category,
          merchantType: txn.merchantType,
          status: txn.status,
        },
      }));
  }
}

export const yodleeProvider = new YodleeProvider();
