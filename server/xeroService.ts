import { XeroClient } from "xero-node";
import { db } from "./db";
import { xeroTokens, organizations, transactions, vendors, categories, organizationMembers } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { addMinutes, addDays, isAfter } from "date-fns";

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const XERO_REDIRECT_URI = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/xero/callback`
  : "http://localhost:5000/api/xero/callback";

const XERO_SCOPES = [
  "openid",
  "profile", 
  "email",
  "accounting.transactions.read",
  "accounting.settings.read",
  "accounting.contacts.read",
  "accounting.reports.read",
  "offline_access"
];

interface XeroTokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

export class XeroService {
  private xeroClient: XeroClient | null = null;

  private isConfigured(): boolean {
    return !!(XERO_CLIENT_ID && XERO_CLIENT_SECRET);
  }

  private getClient(): XeroClient {
    if (!this.isConfigured()) {
      throw new Error("Xero credentials not configured");
    }

    if (!this.xeroClient) {
      this.xeroClient = new XeroClient({
        clientId: XERO_CLIENT_ID!,
        clientSecret: XERO_CLIENT_SECRET!,
        redirectUris: [XERO_REDIRECT_URI],
        scopes: XERO_SCOPES,
      });
    }

    return this.xeroClient;
  }

  async getAuthUrl(userId: string): Promise<string> {
    const client = this.getClient();
    
    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    
    const consentUrl = await client.buildConsentUrl();
    
    const url = new URL(consentUrl);
    url.searchParams.set("state", state);
    
    return url.toString();
  }

  async handleCallback(url: string, userId: string): Promise<void> {
    const client = this.getClient();
    
    const tokenSet = await client.apiCallback(url);
    
    await client.updateTenants();
    const tenants = client.tenants;
    
    if (!tenants || tenants.length === 0) {
      throw new Error("No Xero organizations found for this account");
    }

    const tenant = tenants[0] as XeroTenant;
    
    let organization = await db.query.organizations.findFirst({
      where: eq(organizations.name, tenant.tenantName),
    });
    
    if (!organization) {
      const [newOrg] = await db.insert(organizations).values({
        name: tenant.tenantName,
        status: "active",
      }).returning();
      organization = newOrg;
      
      await db.insert(organizationMembers).values({
        userId,
        organizationId: organization.id,
        role: "founder",
      });
    } else {
      const existingMember = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organization.id)
        ),
      });
      
      if (!existingMember) {
        await db.insert(organizationMembers).values({
          userId,
          organizationId: organization.id,
          role: "ops",
        });
      }
    }

    const now = new Date();
    const accessTokenExpiresAt = addMinutes(now, 30);
    const refreshTokenExpiresAt = addDays(now, 60);

    const existingToken = await db.query.xeroTokens.findFirst({
      where: and(
        eq(xeroTokens.userId, userId),
        eq(xeroTokens.tenantId, tenant.tenantId)
      ),
    });

    const tokenData = {
      accessToken: tokenSet.access_token!,
      refreshToken: tokenSet.refresh_token!,
      idToken: tokenSet.id_token || null,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      tenantName: tenant.tenantName,
      tenantType: tenant.tenantType,
      organizationId: organization.id,
      scope: XERO_SCOPES.join(" "),
      status: "active",
      updatedAt: now,
    };

    if (existingToken) {
      await db.update(xeroTokens)
        .set(tokenData)
        .where(eq(xeroTokens.id, existingToken.id));
    } else {
      await db.insert(xeroTokens).values({
        userId,
        tenantId: tenant.tenantId,
        ...tokenData,
      });
    }
  }

  private async refreshTokens(token: typeof xeroTokens.$inferSelect, retryCount = 0): Promise<string> {
    const client = this.getClient();
    
    client.setTokenSet({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      id_token: token.idToken || undefined,
      token_type: "Bearer",
      scope: token.scope || XERO_SCOPES.join(" "),
    });

    try {
      const newTokenSet = await client.refreshToken();
      
      const now = new Date();
      
      await client.updateTenants();
      const tenants = client.tenants;
      const tenant = tenants?.[0] as XeroTenant | undefined;
      
      await db.update(xeroTokens)
        .set({
          accessToken: newTokenSet.access_token!,
          refreshToken: newTokenSet.refresh_token!,
          idToken: newTokenSet.id_token || null,
          accessTokenExpiresAt: addMinutes(now, 30),
          refreshTokenExpiresAt: addDays(now, 60),
          tenantName: tenant?.tenantName || token.tenantName,
          status: "active",
          updatedAt: now,
        })
        .where(eq(xeroTokens.id, token.id));

      return newTokenSet.access_token!;
    } catch (error: any) {
      console.error("Xero token refresh failed:", error);
      
      const statusCode = error?.response?.status || error?.statusCode;
      
      if ((statusCode === 401 || statusCode === 410) && retryCount < 1) {
        console.log("Retrying Xero token refresh...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.refreshTokens(token, retryCount + 1);
      }
      
      await db.update(xeroTokens)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(xeroTokens.id, token.id));
      
      throw new Error("Token refresh failed - please reconnect Xero");
    }
  }

  async getValidAccessToken(userId: string): Promise<{ 
    accessToken: string; 
    tenantId: string; 
    organizationId: string | null;
    client: XeroClient;
  }> {
    const token = await db.query.xeroTokens.findFirst({
      where: and(
        eq(xeroTokens.userId, userId),
        eq(xeroTokens.status, "active")
      ),
      orderBy: [desc(xeroTokens.updatedAt)],
    });

    if (!token) {
      throw new Error("No active Xero connection found");
    }

    const client = this.getClient();
    
    if (isAfter(new Date(), token.accessTokenExpiresAt)) {
      if (isAfter(new Date(), token.refreshTokenExpiresAt)) {
        await db.update(xeroTokens)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(xeroTokens.id, token.id));
        throw new Error("Xero session expired - please reconnect");
      }

      const newAccessToken = await this.refreshTokens(token);
      
      client.setTokenSet({
        access_token: newAccessToken,
        refresh_token: token.refreshToken,
        token_type: "Bearer",
        scope: token.scope || XERO_SCOPES.join(" "),
      });
      
      return { 
        accessToken: newAccessToken, 
        tenantId: token.tenantId, 
        organizationId: token.organizationId,
        client
      };
    }

    client.setTokenSet({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      token_type: "Bearer",
      scope: token.scope || XERO_SCOPES.join(" "),
    });

    return { 
      accessToken: token.accessToken, 
      tenantId: token.tenantId, 
      organizationId: token.organizationId,
      client
    };
  }

  async getOrganisationInfo(userId: string): Promise<any> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const response = await client.accountingApi.getOrganisations(tenantId);
    return response.body.organisations?.[0];
  }

  async getAccounts(userId: string): Promise<any[]> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const response = await client.accountingApi.getAccounts(tenantId);
    return response.body.accounts || [];
  }

  async getBankAccounts(userId: string): Promise<any[]> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const response = await client.accountingApi.getAccounts(
      tenantId,
      undefined,
      'Type=="BANK"'
    );
    
    return response.body.accounts || [];
  }

  async getTransactions(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const response = await client.accountingApi.getBankTransactions(
      tenantId,
      undefined,
      `Date >= DateTime(${startDate.getFullYear()}, ${startDate.getMonth() + 1}, ${startDate.getDate()}) && Date <= DateTime(${endDate.getFullYear()}, ${endDate.getMonth() + 1}, ${endDate.getDate()})`,
      undefined,
      1
    );
    
    return response.body.bankTransactions || [];
  }

  async getInvoices(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const dateFilter = `Date >= DateTime(${startDate.getFullYear()}, ${startDate.getMonth() + 1}, ${startDate.getDate()}) && Date <= DateTime(${endDate.getFullYear()}, ${endDate.getMonth() + 1}, ${endDate.getDate()})`;
    
    const response = await client.accountingApi.getInvoices(
      tenantId,
      undefined,
      dateFilter
    );
    
    return response.body.invoices || [];
  }

  async getBills(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const dateFilter = `Date >= DateTime(${startDate.getFullYear()}, ${startDate.getMonth() + 1}, ${startDate.getDate()}) && Date <= DateTime(${endDate.getFullYear()}, ${endDate.getMonth() + 1}, ${endDate.getDate()})`;
    
    const response = await client.accountingApi.getInvoices(
      tenantId,
      undefined,
      `${dateFilter} && Type=="ACCPAY"`
    );
    
    return response.body.invoices || [];
  }

  async getProfitAndLoss(userId: string, fromDate: string, toDate: string): Promise<any> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const response = await client.accountingApi.getReportProfitAndLoss(
      tenantId,
      fromDate,
      toDate
    );
    
    return response.body.reports?.[0];
  }

  async getBalanceSheet(userId: string, date: string): Promise<any> {
    const { client, tenantId } = await this.getValidAccessToken(userId);
    
    const response = await client.accountingApi.getReportBalanceSheet(
      tenantId,
      date
    );
    
    return response.body.reports?.[0];
  }

  async syncTransactions(userId: string, startDate: Date, endDate: Date): Promise<{ imported: number; errors: number }> {
    const { organizationId, client, tenantId } = await this.getValidAccessToken(userId);
    
    if (!organizationId) {
      throw new Error("No organization linked to Xero connection");
    }

    let imported = 0;
    let errors = 0;

    try {
      const bankTransactions = await this.getTransactions(userId, startDate, endDate);
      
      for (const txn of bankTransactions) {
        try {
          const contactName = txn.contact?.name || "Unknown";
          const amount = txn.type === "SPEND" ? -txn.total : txn.total;
          const categoryName = txn.lineItems?.[0]?.accountCode || "Operations & Misc";
          
          let vendor = await db.query.vendors.findFirst({
            where: and(
              eq(vendors.organizationId, organizationId),
              eq(vendors.name, contactName)
            ),
          });
          
          if (!vendor) {
            const [newVendor] = await db.insert(vendors).values({
              organizationId,
              name: contactName,
              normalizedName: contactName,
            }).returning();
            vendor = newVendor;
          }

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
              type: amount < 0 ? "expense" : "revenue",
            }).returning();
            category = newCategory;
          }

          const existing = await db.query.transactions.findFirst({
            where: and(
              eq(transactions.organizationId, organizationId),
              eq(transactions.yodleeTransactionId, `xero-bank-${txn.bankTransactionID}`)
            ),
          });

          if (!existing) {
            await db.insert(transactions).values({
              organizationId,
              date: new Date(txn.date),
              amount: amount.toString(),
              currency: txn.currencyCode || "USD",
              vendorId: vendor.id,
              vendorOriginal: contactName,
              vendorNormalized: contactName,
              categoryId: category.id,
              description: txn.reference || `Xero ${txn.type}`,
              source: "manual",
              yodleeTransactionId: `xero-bank-${txn.bankTransactionID}`,
              metadata: { xeroType: "BankTransaction", xeroId: txn.bankTransactionID },
            });
            imported++;
          }
        } catch (e) {
          console.error("Error importing Xero transaction:", e);
          errors++;
        }
      }
    } catch (e) {
      console.error("Error fetching Xero transactions:", e);
    }

    try {
      const invoices = await this.getInvoices(userId, startDate, endDate);
      
      for (const invoice of invoices) {
        try {
          if (invoice.type === "ACCREC" && invoice.status === "PAID") {
            const contactName = invoice.contact?.name || "Customer";
            
            let revenueCategory = await db.query.categories.findFirst({
              where: and(
                eq(categories.organizationId, organizationId),
                eq(categories.name, "Revenue")
              ),
            });
            
            if (!revenueCategory) {
              const [newCategory] = await db.insert(categories).values({
                organizationId,
                name: "Revenue",
                type: "revenue",
              }).returning();
              revenueCategory = newCategory;
            }

            const existing = await db.query.transactions.findFirst({
              where: and(
                eq(transactions.organizationId, organizationId),
                eq(transactions.yodleeTransactionId, `xero-invoice-${invoice.invoiceID}`)
              ),
            });

            if (!existing) {
              await db.insert(transactions).values({
                organizationId,
                date: new Date(invoice.date),
                amount: invoice.total.toString(),
                currency: invoice.currencyCode || "USD",
                vendorOriginal: contactName,
                vendorNormalized: contactName,
                categoryId: revenueCategory.id,
                description: `Invoice ${invoice.invoiceNumber || invoice.invoiceID}`,
                source: "manual",
                yodleeTransactionId: `xero-invoice-${invoice.invoiceID}`,
                metadata: { xeroType: "Invoice", xeroId: invoice.invoiceID },
              });
              imported++;
            }
          }
        } catch (e) {
          console.error("Error importing Xero invoice:", e);
          errors++;
        }
      }
    } catch (e) {
      console.error("Error fetching Xero invoices:", e);
    }

    const token = await db.query.xeroTokens.findFirst({
      where: and(
        eq(xeroTokens.userId, userId),
        eq(xeroTokens.status, "active")
      ),
    });

    if (token) {
      await db.update(xeroTokens)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(xeroTokens.id, token.id));
    }

    return { imported, errors };
  }

  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    tenantName?: string;
    lastSynced?: Date;
    status?: string;
  }> {
    const token = await db.query.xeroTokens.findFirst({
      where: eq(xeroTokens.userId, userId),
      orderBy: [desc(xeroTokens.updatedAt)],
    });

    if (!token) {
      return { connected: false };
    }

    return {
      connected: token.status === "active",
      tenantName: token.tenantName || undefined,
      lastSynced: token.lastSyncedAt || undefined,
      status: token.status || undefined,
    };
  }

  async disconnect(userId: string): Promise<void> {
    await db.update(xeroTokens)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(xeroTokens.userId, userId));
  }
}

export const xeroService = new XeroService();
