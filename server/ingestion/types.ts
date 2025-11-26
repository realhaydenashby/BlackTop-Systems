export interface UnifiedTransaction {
  id?: string;
  organizationId: string;
  externalId: string;
  sourceAccountId: string;
  source: "yodlee" | "plaid" | "qb" | "xero" | "stripe" | "csv" | "manual";
  date: Date;
  amount: number;
  description: string;
  type: "debit" | "credit";
  currency: string;
  vendorOriginal?: string;
  vendorNormalized?: string;
  categoryId?: string;
  isRecurring?: boolean;
  isPayroll?: boolean;
  classificationConfidence?: number;
  metadata?: Record<string, any>;
}

export interface IngestionResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ externalId: string; error: string }>;
}

export interface IngestionOptions {
  upsert?: boolean;
  skipDuplicates?: boolean;
  batchSize?: number;
}
