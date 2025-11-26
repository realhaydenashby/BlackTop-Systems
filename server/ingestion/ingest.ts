import type { UnifiedTransaction, IngestionResult, IngestionOptions } from "./types";
import type { RawTransaction } from "../integrations/types";
import { storage } from "../storage";

const DEFAULT_OPTIONS: IngestionOptions = {
  upsert: true,
  skipDuplicates: true,
  batchSize: 100,
};

export function rawToUnified(
  raw: RawTransaction,
  organizationId: string
): UnifiedTransaction {
  return {
    organizationId,
    externalId: raw.externalId,
    sourceAccountId: raw.sourceAccountId,
    source: raw.source,
    date: raw.date,
    amount: raw.amount,
    description: raw.description,
    type: raw.type,
    currency: raw.currency,
    vendorOriginal: raw.description,
    metadata: raw.metadata,
  };
}

function mapSourceToSchema(source: UnifiedTransaction["source"]): "yodlee" | "csv" | "manual" | "stripe" {
  switch (source) {
    case "yodlee":
      return "yodlee";
    case "stripe":
      return "stripe";
    case "csv":
      return "csv";
    case "plaid":
    case "qb":
    case "xero":
    case "manual":
    default:
      return "manual";
  }
}

export async function ingestTransactions(
  transactions: UnifiedTransaction[],
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: IngestionResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const batches: UnifiedTransaction[][] = [];
  for (let i = 0; i < transactions.length; i += opts.batchSize!) {
    batches.push(transactions.slice(i, i + opts.batchSize!));
  }

  for (const batch of batches) {
    for (const txn of batch) {
      try {
        const existing = await storage.getTransactionByExternalId(
          txn.organizationId,
          txn.source,
          txn.externalId
        );

        if (existing) {
          if (opts.upsert) {
            await storage.updateTransaction(existing.id, {
              amount: txn.amount.toString(),
              description: txn.description,
              vendorOriginal: txn.vendorOriginal,
              metadata: txn.metadata,
            });
            result.updated++;
          } else if (opts.skipDuplicates) {
            result.skipped++;
          }
        } else {
          await storage.createTransaction({
            organizationId: txn.organizationId,
            date: txn.date,
            description: txn.description,
            amount: txn.amount.toString(),
            source: mapSourceToSchema(txn.source),
            yodleeTransactionId: txn.externalId,
            vendorOriginal: txn.vendorOriginal,
            bankAccountId: txn.sourceAccountId || undefined,
            metadata: txn.metadata,
          });
          result.inserted++;
        }
      } catch (error) {
        result.errors.push({
          externalId: txn.externalId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return result;
}

export async function ingestFromProvider(
  providerName: string,
  organizationId: string,
  rawTransactions: RawTransaction[]
): Promise<IngestionResult> {
  const unified = rawTransactions.map((raw) => rawToUnified(raw, organizationId));
  return ingestTransactions(unified);
}
