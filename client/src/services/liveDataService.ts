import type {
  DashboardStats,
  Transaction,
  Insight,
  AnalyticsData,
  ActionItem,
} from "./demoDataService";

const apiRequest = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
};

export const liveDataService = {
  getDashboardStats: async (): Promise<DashboardStats> => {
    return apiRequest<DashboardStats>("/api/dashboard/stats");
  },

  getTransactions: async (filters?: {
    search?: string;
    category?: string;
    days?: number;
  }): Promise<Transaction[]> => {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.days) params.set("days", filters.days.toString());

    const url = `/api/transactions${params.toString() ? `?${params}` : ""}`;
    return apiRequest<Transaction[]>(url);
  },

  getInsights: async (): Promise<Insight[]> => {
    return apiRequest<Insight[]>("/api/insights");
  },

  getAnalytics: async (days: number = 30): Promise<AnalyticsData> => {
    return apiRequest<AnalyticsData>(`/api/analytics?days=${days}`);
  },

  getFundraisingData: async () => {
    return apiRequest<any>("/api/analytics");
  },

  uploadTransactions: async (file: File): Promise<{ count: number; transactions: Transaction[] }> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/transactions/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  },

  categorizeTransactions: async (transactionIds?: string[]): Promise<{ categorized: number }> => {
    return apiRequest<{ categorized: number }>("/api/transactions/categorize", {
      method: "POST",
      body: JSON.stringify({ transactionIds }),
    });
  },

  getBankAccounts: async () => {
    return apiRequest<any[]>("/api/bank-accounts");
  },

  syncBankTransactions: async (accountId: string) => {
    return apiRequest<{ synced: number }>(`/api/bank-accounts/${accountId}/sync`, {
      method: "POST",
    });
  },
};
