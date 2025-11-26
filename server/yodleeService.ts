// Yodlee banking integration service
import axios, { AxiosInstance } from "axios";

const YODLEE_BASE_URL = "https://sandbox.api.yodlee.com/ysl";

interface YodleeAuthResponse {
  token: {
    accessToken: string;
    issuedAt: string;
    expiresIn: number;
  };
}

interface YodleeAccount {
  id: number;
  accountName: string;
  accountNumber: string;
  accountType: string;
  balance: {
    amount: number;
    currency: string;
  };
  providerAccountId: number;
}

interface YodleeTransaction {
  id: number;
  amount: {
    amount: number;
    currency: string;
  };
  baseType: "DEBIT" | "CREDIT";
  categoryType: string;
  categoryId: number;
  category: string;
  date: string;
  description: {
    original: string;
    simple?: string;
  };
  merchantType?: string;
  accountId: number;
  status: string;
}

class YodleeService {
  private client: AxiosInstance;
  private cobrandToken: string | null = null;
  private cobrandTokenExpiry: number | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: YODLEE_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "Api-Version": "1.1",
      },
    });
  }

  /**
   * Get cobrand session token (required for all Yodlee API calls)
   */
  private async getCobrandToken(): Promise<string> {
    // Check if we have a valid token
    if (this.cobrandToken && this.cobrandTokenExpiry && Date.now() < this.cobrandTokenExpiry) {
      return this.cobrandToken;
    }

    try {
      const response = await this.client.post("/cobrand/login", {
        cobrand: {
          cobrandLogin: process.env.YODLEE_CLIENTID,
          cobrandPassword: process.env.YODLEE_SECRET,
          locale: "en_US",
        },
      });

      const sessionToken = response.data.session.cobSession;
      this.cobrandToken = sessionToken;
      this.cobrandTokenExpiry = Date.now() + 25 * 60 * 1000; // 25 minutes (tokens expire in 30)

      return sessionToken;
    } catch (error: any) {
      console.error("Yodlee cobrand auth error:", error.response?.data || error.message);
      throw new Error("Failed to authenticate with Yodlee");
    }
  }

  /**
   * Get authenticated headers with cobrand session
   */
  private async getCobrandHeaders(): Promise<Record<string, string>> {
    const cobSession = await this.getCobrandToken();
    return {
      "Content-Type": "application/json",
      "Api-Version": "1.1",
      Authorization: `cobSession=${cobSession}`,
    };
  }

  /**
   * Get authenticated headers with both cobrand and user session
   */
  private getUserHeaders(userSession: string, cobSession: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Api-Version": "1.1",
      Authorization: `cobSession=${cobSession},userSession=${userSession}`,
    };
  }

  /**
   * Register or login a Yodlee user and return their session token
   */
  private async getOrCreateYodleeUser(userId: string): Promise<string> {
    const cobSession = await this.getCobrandToken();
    const headers = await this.getCobrandHeaders();
    
    const loginName = `user_${userId}`;
    const password = `pwd_${userId}_${process.env.YODLEE_SECRET?.substring(0, 8)}`;

    try {
      // Try to login first
      const loginResponse = await this.client.post(
        "/user/login",
        {
          user: {
            loginName,
            password,
          },
        },
        { headers }
      );

      return loginResponse.data.user.session.userSession;
    } catch (loginError: any) {
      // If login fails, try to register
      if (loginError.response?.status === 401 || loginError.response?.status === 404) {
        try {
          const registerResponse = await this.client.post(
            "/user/register",
            {
              user: {
                loginName,
                password,
                email: `${loginName}@blacktopsystems.app`,
              },
            },
            { headers }
          );

          return registerResponse.data.user.session.userSession;
        } catch (registerError: any) {
          // Handle duplicate user (409)
          if (registerError.response?.status === 409) {
            // User exists but wrong password - try login again
            const retryLogin = await this.client.post(
              "/user/login",
              {
                user: {
                  loginName,
                  password,
                },
              },
              { headers }
            );
            return retryLogin.data.user.session.userSession;
          }
          throw registerError;
        }
      }
      throw loginError;
    }
  }

  // Cache user sessions to avoid re-authenticating on every call
  private userSessionCache: Map<string, { session: string; expiry: number }> = new Map();

  /**
   * Get or create a Yodlee user session with caching
   * This is the primary method for obtaining a reusable user session
   */
  async getUserSession(userId: string): Promise<string> {
    // Check cache first
    const cached = this.userSessionCache.get(userId);
    if (cached && Date.now() < cached.expiry) {
      return cached.session;
    }

    // Get fresh session
    const session = await this.getOrCreateYodleeUser(userId);
    
    // Cache for 25 minutes (sessions typically last 30 minutes)
    this.userSessionCache.set(userId, {
      session,
      expiry: Date.now() + 25 * 60 * 1000,
    });

    return session;
  }

  /**
   * Generate FastLink URL for user to connect their bank accounts
   */
  async generateFastLink(userId: string): Promise<{ userSession: string; fastLinkUrl: string }> {
    try {
      const cobSession = await this.getCobrandToken();
      const userSession = await this.getUserSession(userId);

      // Generate FastLink URL
      const fastLinkUrl = `${YODLEE_BASE_URL}/fastlink/v4?channelAppName=blacktopsystems&cobSession=${cobSession}&userSession=${userSession}`;

      return {
        userSession,
        fastLinkUrl,
      };
    } catch (error: any) {
      console.error("FastLink generation error:", error.response?.data || error.message);
      throw new Error("Failed to generate FastLink");
    }
  }

  /**
   * Get all connected accounts for a user
   */
  async getAccounts(userSession: string): Promise<YodleeAccount[]> {
    try {
      const cobSession = await this.getCobrandToken();
      const response = await this.client.get("/accounts", {
        headers: this.getUserHeaders(userSession, cobSession),
      });

      return response.data.account || [];
    } catch (error: any) {
      console.error("Get accounts error:", error.response?.data || error.message);
      throw new Error("Failed to fetch accounts");
    }
  }

  /**
   * Get transactions for a user's accounts
   * @param userSession - User's Yodlee session token
   * @param fromDate - Start date (YYYY-MM-DD)
   * @param toDate - End date (YYYY-MM-DD)
   */
  async getTransactions(
    userSession: string,
    fromDate: string,
    toDate: string
  ): Promise<YodleeTransaction[]> {
    try {
      const cobSession = await this.getCobrandToken();
      const response = await this.client.get("/transactions", {
        headers: this.getUserHeaders(userSession, cobSession),
        params: {
          fromDate,
          toDate,
        },
      });

      return response.data.transaction || [];
    } catch (error: any) {
      console.error("Get transactions error:", error.response?.data || error.message);
      throw new Error("Failed to fetch transactions");
    }
  }

  /**
   * Sync transactions and normalize them into our schema
   * Returns transactions with vendor/category names - caller needs to resolve to IDs
   */
  async syncTransactions(
    organizationId: string,
    userSession: string,
    days: number = 90
  ): Promise<any[]> {
    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const transactions = await this.getTransactions(userSession, fromDate, toDate);

    // Normalize into our transaction schema
    // Note: vendorName and categoryName will be resolved to IDs by the caller
    return transactions.map((txn) => ({
      organizationId,
      date: new Date(txn.date),
      amount: Math.abs(txn.amount.amount).toString(),
      currency: txn.amount.currency || "USD",
      description: txn.description.simple || txn.description.original,
      vendorName: this.extractVendor(txn.description.simple || txn.description.original),
      categoryName: txn.category || "Uncategorized",
      isRecurring: false, // Will be detected later
      tags: [txn.baseType === "DEBIT" ? "expense" : "income"],
      metadata: {
        source: "yodlee",
        sourceId: txn.id.toString(),
        categoryType: txn.categoryType,
        yodleeCategoryId: txn.categoryId,
        merchantType: txn.merchantType,
        accountId: txn.accountId,
        status: txn.status,
      },
    }));
  }

  /**
   * Extract vendor name from transaction description
   */
  private extractVendor(description: string): string {
    // Remove common prefixes and clean up
    let vendor = description
      .replace(/^(DEBIT CARD PURCHASE|ACH DEBIT|PAYPAL|VENMO|SQUARE|STRIPE)\s*/i, "")
      .replace(/\s+\d{4}$/, "") // Remove trailing card numbers
      .replace(/\s+[A-Z]{2}$/, "") // Remove trailing state codes
      .trim();

    // Take first part before location/date info
    const parts = vendor.split(/\s{2,}|\s+#/);
    return parts[0] || description;
  }
}

export const yodleeService = new YodleeService();
