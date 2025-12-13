import { db } from "./db";
import { rampTokens, transactions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { addHours, isAfter, subDays } from "date-fns";

const RAMP_BASE_URL = "https://api.ramp.com";
const RAMP_TOKEN_URL = `${RAMP_BASE_URL}/v1/public/customer/token`;
const RAMP_API_URL = `${RAMP_BASE_URL}/developer/v1`;

interface RampTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface RampTransaction {
  id: string;
  amount: number;
  currency_code: string;
  merchant_name: string;
  merchant_descriptor?: string;
  category?: string;
  user_transaction_time: string;
  state: string;
  memo?: string;
  card_id?: string;
  user_id?: string;
  merchant_id?: string;
  merchant_category_code?: string;
}

interface RampBill {
  id: string;
  vendor_id?: string;
  vendor_name?: string;
  amount: number;
  currency: string;
  due_date?: string;
  invoice_number?: string;
  payment_status?: string;
  issued_date?: string;
}

interface RampPaginatedResponse<T> {
  data: T[];
  page?: {
    next?: string;
  };
}

export class RampService {
  async getAccessToken(clientId: string, clientSecret: string, scope: string = "transactions:read receipts:read bills:read"): Promise<RampTokenResponse> {
    const response = await fetch(RAMP_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ramp auth failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async connect(userId: string, organizationId: string, clientId: string, clientSecret: string): Promise<{ success: boolean; message: string }> {
    try {
      const tokenResponse = await this.getAccessToken(clientId, clientSecret);
      
      const now = new Date();
      const accessTokenExpiresAt = addHours(now, 1);

      const existing = await db.query.rampTokens.findFirst({
        where: and(
          eq(rampTokens.userId, userId),
          eq(rampTokens.organizationId, organizationId)
        ),
      });

      if (existing) {
        await db.update(rampTokens)
          .set({
            clientId,
            clientSecret,
            accessToken: tokenResponse.access_token,
            accessTokenExpiresAt,
            status: "active",
            updatedAt: now,
          })
          .where(eq(rampTokens.id, existing.id));
      } else {
        await db.insert(rampTokens).values({
          userId,
          organizationId,
          clientId,
          clientSecret,
          accessToken: tokenResponse.access_token,
          accessTokenExpiresAt,
          status: "active",
        });
      }

      return { success: true, message: "Ramp connected successfully" };
    } catch (error) {
      console.error("Ramp connection error:", error);
      return { success: false, message: error instanceof Error ? error.message : "Failed to connect Ramp" };
    }
  }

  async disconnect(userId: string, organizationId: string): Promise<void> {
    await db.delete(rampTokens)
      .where(and(
        eq(rampTokens.userId, userId),
        eq(rampTokens.organizationId, organizationId)
      ));
  }

  async getConnection(userId: string, organizationId: string) {
    return db.query.rampTokens.findFirst({
      where: and(
        eq(rampTokens.userId, userId),
        eq(rampTokens.organizationId, organizationId)
      ),
    });
  }

  private async ensureValidToken(token: typeof rampTokens.$inferSelect): Promise<string> {
    const now = new Date();
    
    if (token.accessToken && token.accessTokenExpiresAt && isAfter(token.accessTokenExpiresAt, now)) {
      return token.accessToken;
    }

    const tokenResponse = await this.getAccessToken(token.clientId, token.clientSecret, token.scope || undefined);
    
    const accessTokenExpiresAt = addHours(now, 1);
    await db.update(rampTokens)
      .set({
        accessToken: tokenResponse.access_token,
        accessTokenExpiresAt,
        updatedAt: now,
      })
      .where(eq(rampTokens.id, token.id));

    return tokenResponse.access_token;
  }

  async fetchTransactions(token: typeof rampTokens.$inferSelect, fromDate?: Date, toDate?: Date): Promise<RampTransaction[]> {
    const accessToken = await this.ensureValidToken(token);
    
    const allTransactions: RampTransaction[] = [];
    let nextUrl: string | undefined = `${RAMP_API_URL}/transactions`;
    
    const params = new URLSearchParams();
    if (fromDate) params.append("from_date", fromDate.toISOString());
    if (toDate) params.append("to_date", toDate.toISOString());
    params.append("page_size", "100");
    
    while (nextUrl) {
      const url = nextUrl.includes("?") ? nextUrl : `${nextUrl}?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ramp API error: ${response.status} - ${error}`);
      }

      const data: RampPaginatedResponse<RampTransaction> = await response.json();
      allTransactions.push(...data.data);
      
      nextUrl = data.page?.next;
    }

    return allTransactions;
  }

  async fetchBills(token: typeof rampTokens.$inferSelect): Promise<RampBill[]> {
    const accessToken = await this.ensureValidToken(token);
    
    const allBills: RampBill[] = [];
    let nextUrl: string | undefined = `${RAMP_API_URL}/bills`;
    
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ramp API error: ${response.status} - ${error}`);
      }

      const data: RampPaginatedResponse<RampBill> = await response.json();
      allBills.push(...data.data);
      
      nextUrl = data.page?.next;
    }

    return allBills;
  }

  async syncTransactions(userId: string, organizationId: string): Promise<{ synced: number; errors: number }> {
    const token = await this.getConnection(userId, organizationId);
    if (!token) {
      throw new Error("No Ramp connection found");
    }

    const fromDate = subDays(new Date(), 90);
    const rampTransactions = await this.fetchTransactions(token, fromDate);

    let synced = 0;
    let errors = 0;

    for (const tx of rampTransactions) {
      try {
        if (tx.state !== "CLEARED") continue;

        const existingTx = await db.query.transactions.findFirst({
          where: eq(transactions.rampTransactionId, tx.id),
        });

        if (existingTx) continue;

        const amountInDollars = tx.amount / 100;

        await db.insert(transactions).values({
          organizationId,
          rampTransactionId: tx.id,
          date: new Date(tx.user_transaction_time),
          amount: (-Math.abs(amountInDollars)).toString(),
          currency: tx.currency_code || "USD",
          vendorOriginal: tx.merchant_name || tx.merchant_descriptor,
          description: tx.memo || tx.merchant_name,
          source: "ramp",
          metadata: {
            ramp_merchant_id: tx.merchant_id,
            ramp_card_id: tx.card_id,
            ramp_user_id: tx.user_id,
            ramp_mcc: tx.merchant_category_code,
            ramp_category: tx.category,
          },
        });

        synced++;
      } catch (error) {
        console.error("Error syncing Ramp transaction:", tx.id, error);
        errors++;
      }
    }

    await db.update(rampTokens)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(rampTokens.id, token.id));

    // Run normalization pipeline on the newly synced transactions
    if (synced > 0) {
      try {
        const { transformOrganizationTransactions } = await import("./plaidTransformService");
        await transformOrganizationTransactions(organizationId);
        console.log(`[Ramp] Ran normalization pipeline for ${synced} new transactions`);
      } catch (err) {
        console.error("[Ramp] Normalization pipeline error:", err);
      }
    }

    return { synced, errors };
  }
}

export const rampService = new RampService();
