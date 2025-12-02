import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode, LinkTokenCreateRequest } from "plaid";
import { db } from "./db";
import { plaidItems, bankAccounts, transactions, organizationMembers } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

class PlaidService {
  private client: PlaidApi | null = null;

  private getClient(): PlaidApi {
    if (!this.client) {
      if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
        throw new Error("Plaid credentials not configured. Please add PLAID_CLIENT_ID and PLAID_SECRET.");
      }

      const configuration = new Configuration({
        basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
            "PLAID-SECRET": PLAID_SECRET,
          },
        },
      });

      this.client = new PlaidApi(configuration);
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!(PLAID_CLIENT_ID && PLAID_SECRET);
  }

  async createLinkToken(userId: string): Promise<string> {
    const client = this.getClient();

    console.log("[Plaid] Creating link token for user:", userId);
    console.log("[Plaid] PLAID_CLIENT_ID exists:", !!process.env.PLAID_CLIENT_ID);
    console.log("[Plaid] PLAID_SECRET exists:", !!process.env.PLAID_SECRET);
    console.log("[Plaid] PLAID_ENV:", process.env.PLAID_ENV || "sandbox");

    const request: LinkTokenCreateRequest = {
      user: { client_user_id: userId },
      client_name: "BlackTop Systems",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    };
    
    console.log("[Plaid] Link token request:", JSON.stringify(request, null, 2));
    
    const response = await client.linkTokenCreate(request);

    console.log("[Plaid] Link token created successfully");
    return response.data.link_token;
  }

  async exchangePublicToken(userId: string, publicToken: string): Promise<{ itemId: string; accounts: any[] }> {
    const client = this.getClient();

    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const plaidItemId = exchangeResponse.data.item_id;

    const itemResponse = await client.itemGet({ access_token: accessToken });
    const institutionId = itemResponse.data.item.institution_id;
    
    let institutionName = "Unknown Bank";
    if (institutionId) {
      try {
        const instResponse = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = instResponse.data.institution.name;
      } catch (e) {
        console.warn("Could not fetch institution name:", e);
      }
    }

    const [savedItem] = await db
      .insert(plaidItems)
      .values({
        userId,
        plaidItemId,
        accessToken,
        institutionId,
        institutionName,
      })
      .onConflictDoUpdate({
        target: plaidItems.plaidItemId,
        set: {
          accessToken,
          institutionName,
          updatedAt: new Date(),
        },
      })
      .returning();

    const accountsResponse = await client.accountsGet({ access_token: accessToken });
    const accounts = accountsResponse.data.accounts;

    for (const account of accounts) {
      const accountType = this.mapAccountType(account.type);
      const mask = account.mask || "";

      await db
        .insert(bankAccounts)
        .values({
          userId,
          provider: "plaid",
          plaidAccountId: account.account_id,
          plaidItemId: savedItem.id,
          bankName: institutionName,
          accountName: account.name,
          accountNumberMasked: mask ? `****${mask}` : undefined,
          accountType,
          currentBalance: account.balances.current?.toString(),
          availableBalance: account.balances.available?.toString(),
          currency: account.balances.iso_currency_code || "USD",
          status: "active",
          lastSyncedAt: new Date(),
        })
        .onConflictDoNothing();
    }

    return { itemId: savedItem.id, accounts };
  }

  async syncTransactions(userId: string, bankAccountId?: string): Promise<number> {
    const orgMember = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .limit(1);

    if (orgMember.length === 0) {
      console.warn("[Plaid] Cannot sync transactions: user has no organization membership");
      return 0;
    }

    const organizationId = orgMember[0].organizationId;

    let items = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId));

    if (bankAccountId) {
      const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, bankAccountId)).limit(1);
      if (account.length > 0 && account[0].plaidItemId) {
        items = items.filter((item) => item.id === account[0].plaidItemId);
      }
    }

    let totalSynced = 0;
    const client = this.getClient();

    for (const item of items) {
      try {
        let cursor = item.cursor || undefined;
        let hasMore = true;

        while (hasMore) {
          const response = await client.transactionsSync({
            access_token: item.accessToken,
            cursor,
          });

          const { added, modified, removed, next_cursor, has_more } = response.data;

          for (const txn of added) {
            const bankAccount = await db
              .select()
              .from(bankAccounts)
              .where(
                and(
                  eq(bankAccounts.plaidItemId, item.id),
                  eq(bankAccounts.plaidAccountId, txn.account_id)
                )
              )
              .limit(1);

            if (bankAccount.length === 0) continue;

            const existingTxn = await db
              .select()
              .from(transactions)
              .where(eq(transactions.plaidTransactionId, txn.transaction_id))
              .limit(1);

            if (existingTxn.length > 0) continue;

            const amount = -txn.amount;

            await db.insert(transactions).values({
              organizationId,
              bankAccountId: bankAccount[0].id,
              plaidTransactionId: txn.transaction_id,
              date: new Date(txn.date),
              amount: amount.toString(),
              currency: txn.iso_currency_code || "USD",
              vendorOriginal: txn.merchant_name || txn.name,
              vendorNormalized: txn.merchant_name || txn.name,
              description: txn.name,
              source: "plaid",
              metadata: {
                category: txn.category,
                pending: txn.pending,
                paymentChannel: txn.payment_channel,
              },
            });

            totalSynced++;
          }

          for (const txn of modified) {
            await db
              .update(transactions)
              .set({
                amount: (-txn.amount).toString(),
                vendorOriginal: txn.merchant_name || txn.name,
                vendorNormalized: txn.merchant_name || txn.name,
                description: txn.name,
                updatedAt: new Date(),
              })
              .where(eq(transactions.plaidTransactionId, txn.transaction_id));
          }

          for (const removedTxn of removed) {
            await db
              .delete(transactions)
              .where(eq(transactions.plaidTransactionId, removedTxn.transaction_id));
          }

          cursor = next_cursor;
          hasMore = has_more;
        }

        await db
          .update(plaidItems)
          .set({ cursor, updatedAt: new Date() })
          .where(eq(plaidItems.id, item.id));

        const accountsResponse = await client.accountsGet({ access_token: item.accessToken });
        for (const account of accountsResponse.data.accounts) {
          await db
            .update(bankAccounts)
            .set({
              currentBalance: account.balances.current?.toString(),
              availableBalance: account.balances.available?.toString(),
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(bankAccounts.plaidItemId, item.id),
                eq(bankAccounts.plaidAccountId, account.account_id)
              )
            );
        }
      } catch (error: any) {
        console.error("Error syncing Plaid transactions for item:", item.id, error.response?.data || error.message);
        
        if (error.response?.data?.error_code === "ITEM_LOGIN_REQUIRED") {
          await db
            .update(bankAccounts)
            .set({ status: "disconnected", updatedAt: new Date() })
            .where(eq(bankAccounts.plaidItemId, item.id));
        }
      }
    }

    return totalSynced;
  }

  async getAccounts(userId: string): Promise<any[]> {
    return db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.provider, "plaid")));
  }

  async deleteItem(userId: string, itemId: string): Promise<void> {
    const item = await db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.id, itemId), eq(plaidItems.userId, userId)))
      .limit(1);

    if (item.length === 0) {
      throw new Error("Item not found");
    }

    try {
      const client = this.getClient();
      await client.itemRemove({ access_token: item[0].accessToken });
    } catch (e) {
      console.warn("Could not remove item from Plaid (may already be removed):", e);
    }

    await db.delete(bankAccounts).where(eq(bankAccounts.plaidItemId, itemId));
    await db.delete(plaidItems).where(eq(plaidItems.id, itemId));
  }

  async disconnectAndResetAll(userId: string, organizationId: string): Promise<{ itemsDeleted: number; accountsDeleted: number; transactionsDeleted: number }> {
    console.log(`[Plaid] Disconnecting all items for user ${userId}, org ${organizationId || 'none'}`);
    
    // Get all Plaid items for this user
    const items = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId));
    
    // Remove each item from Plaid API
    for (const item of items) {
      try {
        const client = this.getClient();
        await client.itemRemove({ access_token: item.accessToken });
      } catch (e) {
        console.warn("Could not remove item from Plaid (may already be removed):", e);
      }
    }

    // Delete all transactions for this organization (only if org exists)
    let transactionsDeleted = 0;
    if (organizationId) {
      const transactionResult = await db.delete(transactions).where(eq(transactions.organizationId, organizationId)).returning();
      transactionsDeleted = transactionResult.length;
    }

    // Delete all bank accounts for this user
    const accountResult = await db.delete(bankAccounts).where(eq(bankAccounts.userId, userId)).returning();
    const accountsDeleted = accountResult.length;

    // Delete all Plaid items for this user
    const itemResult = await db.delete(plaidItems).where(eq(plaidItems.userId, userId)).returning();
    const itemsDeleted = itemResult.length;

    console.log(`[Plaid] Disconnected: ${itemsDeleted} items, ${accountsDeleted} accounts, ${transactionsDeleted} transactions`);
    
    return { itemsDeleted, accountsDeleted, transactionsDeleted };
  }

  private mapAccountType(plaidType: string): "checking" | "savings" | "credit_card" | "investment" | "loan" | "other" {
    switch (plaidType.toLowerCase()) {
      case "depository":
        return "checking";
      case "credit":
        return "credit_card";
      case "investment":
        return "investment";
      case "loan":
        return "loan";
      default:
        return "other";
    }
  }
}

export const plaidService = new PlaidService();
