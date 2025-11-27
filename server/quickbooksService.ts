import { db } from "./db";
import { quickbooksTokens, organizations, transactions, vendors, categories } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { addHours, addDays, isAfter } from "date-fns";

const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENTID;
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;
const QB_REDIRECT_URI = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/quickbooks/callback`
  : "http://localhost:5000/api/quickbooks/callback";
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || "sandbox"; // sandbox or production
const QB_BASE_URL = QB_ENVIRONMENT === "production" 
  ? "https://quickbooks.api.intuit.com" 
  : "https://sandbox-quickbooks.api.intuit.com";
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

interface QBTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  x_refresh_token_expires_in: number; // seconds
  token_type: string;
}

interface QBCompanyInfo {
  CompanyName: string;
  CompanyAddr?: {
    City?: string;
    Country?: string;
  };
}

interface QBAccount {
  Id: string;
  Name: string;
  AccountType: string;
  CurrentBalance?: number;
  Classification?: string;
}

interface QBPurchase {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  DocNumber?: string;
  EntityRef?: { name: string; value: string };
  AccountRef?: { name: string; value: string };
  Line?: Array<{
    Amount: number;
    Description?: string;
    AccountBasedExpenseLineDetail?: {
      AccountRef?: { name: string };
    };
  }>;
}

interface QBInvoice {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  DocNumber?: string;
  CustomerRef?: { name: string; value: string };
  Balance?: number;
}

interface QBPayment {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  CustomerRef?: { name: string; value: string };
}

export class QuickBooksService {
  private isConfigured(): boolean {
    return !!(QB_CLIENT_ID && QB_CLIENT_SECRET);
  }

  getAuthUrl(userId: string): string {
    if (!this.isConfigured()) {
      throw new Error("QuickBooks credentials not configured");
    }

    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    const scopes = "com.intuit.quickbooks.accounting openid profile email";
    
    const params = new URLSearchParams({
      client_id: QB_CLIENT_ID!,
      response_type: "code",
      scope: scopes,
      redirect_uri: QB_REDIRECT_URI,
      state,
    });

    return `${QB_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, realmId: string, userId: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("QuickBooks credentials not configured");
    }

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(code);
    
    // Get company info
    const companyInfo = await this.getCompanyInfo(realmId, tokenResponse.access_token);
    
    // Find or create organization for this user
    let organization = await db.query.organizations.findFirst({
      where: eq(organizations.name, companyInfo.CompanyName),
    });
    
    if (!organization) {
      const [newOrg] = await db.insert(organizations).values({
        name: companyInfo.CompanyName,
        status: "active",
      }).returning();
      organization = newOrg;
    }

    // Calculate token expiration times
    const now = new Date();
    const accessTokenExpiresAt = addHours(now, 1); // QB access tokens expire in 1 hour
    const refreshTokenExpiresAt = addDays(now, 100); // QB refresh tokens expire in 100 days

    // Store tokens
    const existingToken = await db.query.quickbooksTokens.findFirst({
      where: and(
        eq(quickbooksTokens.userId, userId),
        eq(quickbooksTokens.realmId, realmId)
      ),
    });

    if (existingToken) {
      await db.update(quickbooksTokens)
        .set({
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
          companyName: companyInfo.CompanyName,
          organizationId: organization.id,
          status: "active",
          updatedAt: now,
        })
        .where(eq(quickbooksTokens.id, existingToken.id));
    } else {
      await db.insert(quickbooksTokens).values({
        userId,
        organizationId: organization.id,
        realmId,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        companyName: companyInfo.CompanyName,
        status: "active",
      });
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<QBTokenResponse> {
    const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
    
    const response = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: QB_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("QuickBooks token exchange failed:", error);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
    }

    return response.json();
  }

  private async refreshTokens(token: typeof quickbooksTokens.$inferSelect): Promise<string> {
    const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
    
    const response = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("QuickBooks token refresh failed:", error);
      
      // Mark token as expired
      await db.update(quickbooksTokens)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(quickbooksTokens.id, token.id));
      
      throw new Error("Token refresh failed - please reconnect QuickBooks");
    }

    const tokenResponse: QBTokenResponse = await response.json();
    
    // Update stored tokens
    const now = new Date();
    await db.update(quickbooksTokens)
      .set({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        accessTokenExpiresAt: addHours(now, 1),
        refreshTokenExpiresAt: addDays(now, 100),
        updatedAt: now,
      })
      .where(eq(quickbooksTokens.id, token.id));

    return tokenResponse.access_token;
  }

  async getValidAccessToken(userId: string): Promise<{ accessToken: string; realmId: string; organizationId: string | null }> {
    const token = await db.query.quickbooksTokens.findFirst({
      where: and(
        eq(quickbooksTokens.userId, userId),
        eq(quickbooksTokens.status, "active")
      ),
      orderBy: [desc(quickbooksTokens.updatedAt)],
    });

    if (!token) {
      throw new Error("No active QuickBooks connection found");
    }

    // Check if access token is expired
    if (isAfter(new Date(), token.accessTokenExpiresAt)) {
      // Check if refresh token is also expired
      if (isAfter(new Date(), token.refreshTokenExpiresAt)) {
        await db.update(quickbooksTokens)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(quickbooksTokens.id, token.id));
        throw new Error("QuickBooks session expired - please reconnect");
      }

      const newAccessToken = await this.refreshTokens(token);
      return { accessToken: newAccessToken, realmId: token.realmId, organizationId: token.organizationId };
    }

    return { accessToken: token.accessToken, realmId: token.realmId, organizationId: token.organizationId };
  }

  private async makeApiRequest<T>(endpoint: string, accessToken: string, realmId: string): Promise<T> {
    const url = `${QB_BASE_URL}/v3/company/${realmId}/${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`QuickBooks API error (${endpoint}):`, error);
      throw new Error(`QuickBooks API error: ${response.status}`);
    }

    return response.json();
  }

  async getCompanyInfo(realmId: string, accessToken: string): Promise<QBCompanyInfo> {
    const response = await this.makeApiRequest<{ CompanyInfo: QBCompanyInfo }>(
      "companyinfo/" + realmId,
      accessToken,
      realmId
    );
    return response.CompanyInfo;
  }

  async getAccounts(userId: string): Promise<QBAccount[]> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const query = "SELECT * FROM Account WHERE Active = true MAXRESULTS 1000";
    const response = await this.makeApiRequest<{ QueryResponse: { Account?: QBAccount[] } }>(
      `query?query=${encodeURIComponent(query)}`,
      accessToken,
      realmId
    );
    
    return response.QueryResponse.Account || [];
  }

  async getProfitAndLoss(userId: string, startDate: string, endDate: string): Promise<any> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const response = await this.makeApiRequest<any>(
      `reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`,
      accessToken,
      realmId
    );
    
    return response;
  }

  async getBalanceSheet(userId: string, asOfDate: string): Promise<any> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const response = await this.makeApiRequest<any>(
      `reports/BalanceSheet?as_of_date=${asOfDate}`,
      accessToken,
      realmId
    );
    
    return response;
  }

  async getCashFlow(userId: string, startDate: string, endDate: string): Promise<any> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const response = await this.makeApiRequest<any>(
      `reports/CashFlow?start_date=${startDate}&end_date=${endDate}`,
      accessToken,
      realmId
    );
    
    return response;
  }

  async getPurchases(userId: string, startDate: string, endDate: string): Promise<QBPurchase[]> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const query = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 1000`;
    const response = await this.makeApiRequest<{ QueryResponse: { Purchase?: QBPurchase[] } }>(
      `query?query=${encodeURIComponent(query)}`,
      accessToken,
      realmId
    );
    
    return response.QueryResponse.Purchase || [];
  }

  async getInvoices(userId: string, startDate: string, endDate: string): Promise<QBInvoice[]> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const query = `SELECT * FROM Invoice WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 1000`;
    const response = await this.makeApiRequest<{ QueryResponse: { Invoice?: QBInvoice[] } }>(
      `query?query=${encodeURIComponent(query)}`,
      accessToken,
      realmId
    );
    
    return response.QueryResponse.Invoice || [];
  }

  async getPayments(userId: string, startDate: string, endDate: string): Promise<QBPayment[]> {
    const { accessToken, realmId } = await this.getValidAccessToken(userId);
    
    const query = `SELECT * FROM Payment WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 1000`;
    const response = await this.makeApiRequest<{ QueryResponse: { Payment?: QBPayment[] } }>(
      `query?query=${encodeURIComponent(query)}`,
      accessToken,
      realmId
    );
    
    return response.QueryResponse.Payment || [];
  }

  async syncTransactions(userId: string, startDate: string, endDate: string): Promise<{ imported: number; errors: number }> {
    const { organizationId } = await this.getValidAccessToken(userId);
    
    if (!organizationId) {
      throw new Error("No organization linked to QuickBooks connection");
    }

    let imported = 0;
    let errors = 0;

    // Sync purchases (expenses)
    try {
      const purchases = await this.getPurchases(userId, startDate, endDate);
      for (const purchase of purchases) {
        try {
          // Find or create vendor
          const vendorName = purchase.EntityRef?.name || "Unknown Vendor";
          let vendor = await db.query.vendors.findFirst({
            where: and(
              eq(vendors.organizationId, organizationId),
              eq(vendors.name, vendorName)
            ),
          });
          
          if (!vendor) {
            const [newVendor] = await db.insert(vendors).values({
              organizationId,
              name: vendorName,
              normalizedName: vendorName,
            }).returning();
            vendor = newVendor;
          }

          // Find or create category
          const categoryName = purchase.AccountRef?.name || "Operations & Misc";
          let category = await db.query.categories.findFirst({
            where: and(
              eq(categories.organizationId, organizationId),
              eq(categories.name, categoryName)
            ),
          });
          
          if (!category) {
            const [newCategory] = await db.insert(categories).values({
              organizationId,
              name: categoryName,
            }).returning();
            category = newCategory;
          }

          // Check for duplicate
          const existing = await db.query.transactions.findFirst({
            where: and(
              eq(transactions.organizationId, organizationId),
              eq(transactions.yodleeTransactionId, `qb-purchase-${purchase.Id}`)
            ),
          });

          if (!existing) {
            await db.insert(transactions).values({
              organizationId,
              date: new Date(purchase.TxnDate),
              amount: (-purchase.TotalAmt).toString(), // Expenses are negative
              currency: "USD",
              vendorId: vendor.id,
              vendorOriginal: vendorName,
              vendorNormalized: vendorName,
              categoryId: category.id,
              description: purchase.DocNumber ? `Purchase #${purchase.DocNumber}` : "QuickBooks Purchase",
              source: "manual",
              yodleeTransactionId: `qb-purchase-${purchase.Id}`,
              metadata: { qbType: "Purchase", qbId: purchase.Id },
            });
            imported++;
          }
        } catch (e) {
          console.error("Error importing purchase:", e);
          errors++;
        }
      }
    } catch (e) {
      console.error("Error fetching purchases:", e);
    }

    // Sync payments (revenue)
    try {
      const payments = await this.getPayments(userId, startDate, endDate);
      for (const payment of payments) {
        try {
          const customerName = payment.CustomerRef?.name || "Customer Payment";
          
          // Find or create revenue category
          let category = await db.query.categories.findFirst({
            where: and(
              eq(categories.organizationId, organizationId),
              eq(categories.name, "Revenue")
            ),
          });
          
          if (!category) {
            const [newCategory] = await db.insert(categories).values({
              organizationId,
              name: "Revenue",
            }).returning();
            category = newCategory;
          }

          // Check for duplicate
          const existing = await db.query.transactions.findFirst({
            where: and(
              eq(transactions.organizationId, organizationId),
              eq(transactions.yodleeTransactionId, `qb-payment-${payment.Id}`)
            ),
          });

          if (!existing) {
            await db.insert(transactions).values({
              organizationId,
              date: new Date(payment.TxnDate),
              amount: payment.TotalAmt.toString(), // Revenue is positive
              currency: "USD",
              vendorOriginal: customerName,
              vendorNormalized: customerName,
              categoryId: category.id,
              description: `Payment from ${customerName}`,
              source: "manual",
              yodleeTransactionId: `qb-payment-${payment.Id}`,
              metadata: { qbType: "Payment", qbId: payment.Id },
            });
            imported++;
          }
        } catch (e) {
          console.error("Error importing payment:", e);
          errors++;
        }
      }
    } catch (e) {
      console.error("Error fetching payments:", e);
    }

    // Update last synced timestamp
    const token = await db.query.quickbooksTokens.findFirst({
      where: and(
        eq(quickbooksTokens.userId, userId),
        eq(quickbooksTokens.status, "active")
      ),
    });

    if (token) {
      await db.update(quickbooksTokens)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(quickbooksTokens.id, token.id));
    }

    return { imported, errors };
  }

  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    companyName?: string;
    lastSynced?: Date;
    status?: string;
  }> {
    const token = await db.query.quickbooksTokens.findFirst({
      where: eq(quickbooksTokens.userId, userId),
      orderBy: [desc(quickbooksTokens.updatedAt)],
    });

    if (!token) {
      return { connected: false };
    }

    return {
      connected: token.status === "active",
      companyName: token.companyName || undefined,
      lastSynced: token.lastSyncedAt || undefined,
      status: token.status || undefined,
    };
  }

  async disconnect(userId: string): Promise<void> {
    await db.update(quickbooksTokens)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(quickbooksTokens.userId, userId));
  }
}

export const quickBooksService = new QuickBooksService();
