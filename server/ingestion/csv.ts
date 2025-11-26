import Papa from "papaparse";
import type { UnifiedTransaction, IngestionResult } from "./types";
import { ingestTransactions } from "./ingest";

interface CSVRow {
  date?: string;
  description?: string;
  amount?: string;
  type?: string;
  vendor?: string;
  category?: string;
  [key: string]: string | undefined;
}

interface CSVParseOptions {
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  typeColumn?: string;
  vendorColumn?: string;
}

const DEFAULT_COLUMN_MAPPINGS: Record<string, string[]> = {
  date: ["date", "transaction_date", "trans_date", "posted_date", "Date", "Transaction Date"],
  description: ["description", "desc", "memo", "narrative", "Description", "Memo"],
  amount: ["amount", "value", "sum", "total", "Amount", "Value"],
  type: ["type", "transaction_type", "debit_credit", "Type", "Transaction Type"],
  vendor: ["vendor", "merchant", "payee", "Vendor", "Merchant", "Payee"],
};

function findColumn(row: CSVRow, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) {
      return row[candidate];
    }
  }
  return undefined;
}

function parseAmount(value: string): { amount: number; type: "debit" | "credit" } {
  const cleaned = value.replace(/[$,\s]/g, "");
  const amount = parseFloat(cleaned);
  
  if (isNaN(amount)) {
    return { amount: 0, type: "debit" };
  }
  
  return {
    amount: Math.abs(amount),
    type: amount < 0 ? "debit" : "credit",
  };
}

function parseDate(value: string): Date {
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

export async function parseCSV(
  content: string,
  organizationId: string,
  options: CSVParseOptions = {}
): Promise<UnifiedTransaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CSVRow>(content, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions: UnifiedTransaction[] = [];
        let rowIndex = 0;

        for (const row of results.data) {
          rowIndex++;
          
          const dateValue = options.dateColumn
            ? row[options.dateColumn]
            : findColumn(row, DEFAULT_COLUMN_MAPPINGS.date);
          
          const descValue = options.descriptionColumn
            ? row[options.descriptionColumn]
            : findColumn(row, DEFAULT_COLUMN_MAPPINGS.description);
          
          const amountValue = options.amountColumn
            ? row[options.amountColumn]
            : findColumn(row, DEFAULT_COLUMN_MAPPINGS.amount);

          if (!dateValue || !amountValue) continue;

          const { amount, type } = parseAmount(amountValue);

          const vendorValue = options.vendorColumn
            ? row[options.vendorColumn]
            : findColumn(row, DEFAULT_COLUMN_MAPPINGS.vendor);

          transactions.push({
            organizationId,
            externalId: `csv-${organizationId}-${rowIndex}-${Date.now()}`,
            sourceAccountId: "csv",
            source: "csv",
            date: parseDate(dateValue),
            amount,
            description: descValue || "",
            type,
            currency: "USD",
            vendorOriginal: vendorValue || descValue,
            metadata: { originalRow: row },
          });
        }

        resolve(transactions);
      },
      error: (error: Error) => reject(error),
    });
  });
}

export async function ingestCSV(
  content: string,
  organizationId: string,
  options: CSVParseOptions = {}
): Promise<IngestionResult> {
  const transactions = await parseCSV(content, organizationId, options);
  return ingestTransactions(transactions, { upsert: false, skipDuplicates: false });
}
