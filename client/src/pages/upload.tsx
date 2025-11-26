import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppMode } from "@/contexts/AppModeContext";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

export default function UploadPage() {
  const { toast } = useToast();
  const { isDemo } = useAppMode();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseCSV = useCallback((text: string): ParsedTransaction[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("CSV must have a header row and at least one data row");
    }

    const header = lines[0].toLowerCase();
    const hasDate = header.includes("date");
    const hasDescription = header.includes("description") || header.includes("memo") || header.includes("name");
    const hasAmount = header.includes("amount") || header.includes("debit") || header.includes("credit");

    if (!hasDate || !hasAmount) {
      throw new Error("CSV must have 'date' and 'amount' (or 'debit'/'credit') columns");
    }

    const headerCols = lines[0].split(",").map(h => h.trim().toLowerCase());
    const dateIdx = headerCols.findIndex(h => h.includes("date"));
    const descIdx = headerCols.findIndex(h => h.includes("description") || h.includes("memo") || h.includes("name"));
    const amountIdx = headerCols.findIndex(h => h === "amount");
    const debitIdx = headerCols.findIndex(h => h === "debit");
    const creditIdx = headerCols.findIndex(h => h === "credit");

    const transactions: ParsedTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 2) continue;

      const dateStr = cols[dateIdx] || "";
      const description = descIdx >= 0 ? cols[descIdx] : "";
      
      let amount = 0;
      let type: "debit" | "credit" = "debit";

      if (amountIdx >= 0) {
        amount = Math.abs(parseFloat(cols[amountIdx].replace(/[^0-9.-]/g, "")) || 0);
        type = parseFloat(cols[amountIdx]) < 0 ? "debit" : "credit";
      } else {
        const debit = parseFloat(cols[debitIdx]?.replace(/[^0-9.-]/g, "") || "0") || 0;
        const credit = parseFloat(cols[creditIdx]?.replace(/[^0-9.-]/g, "") || "0") || 0;
        if (debit > 0) {
          amount = debit;
          type = "debit";
        } else {
          amount = credit;
          type = "credit";
        }
      }

      if (dateStr && amount > 0) {
        transactions.push({
          date: dateStr,
          description,
          amount,
          type,
        });
      }
    }

    return transactions;
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        setParsedData(parsed);
        toast({
          title: "File parsed successfully",
          description: `Found ${parsed.length} transactions`,
        });
      } catch (err: any) {
        setParseError(err.message);
        setParsedData([]);
      }
    };
    reader.readAsText(selectedFile);
  }, [parseCSV, toast]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (isDemo) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { count: parsedData.length };
      }

      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      }

      const response = await fetch("/api/transactions/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: "Upload complete",
        description: `Successfully imported ${data.count} transactions`,
      });
      setFile(null);
      setParsedData([]);
    },
    onError: () => {
      toast({
        title: "Upload failed",
        description: "There was an error importing your transactions",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Transactions</h1>
        <p className="text-muted-foreground">Upload a CSV file to import transactions</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload CSV
            </CardTitle>
            <CardDescription>
              Upload a CSV file with your bank transactions. The file should include columns for date, description, and amount.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV File</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                data-testid="input-csv-file"
              />
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Parse Error</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            {parsedData.length > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Ready to import</AlertTitle>
                <AlertDescription>
                  {parsedData.length} transactions parsed and ready to import
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={parsedData.length === 0 || uploadMutation.isPending}
              className="w-full"
              data-testid="button-import"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Import {parsedData.length} Transactions
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CSV Format Guide</CardTitle>
            <CardDescription>Your CSV should have these columns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium">Required columns:</p>
                <ul className="list-disc list-inside text-muted-foreground mt-1">
                  <li><code>date</code> - Transaction date (any format)</li>
                  <li><code>amount</code> - Transaction amount (or separate debit/credit columns)</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">Optional columns:</p>
                <ul className="list-disc list-inside text-muted-foreground mt-1">
                  <li><code>description</code> or <code>memo</code> - Transaction description</li>
                  <li><code>category</code> - Pre-assigned category</li>
                </ul>
              </div>
              <div className="bg-muted p-3 rounded-md font-mono text-xs">
                date,description,amount<br/>
                2024-01-15,AWS Payment,-5000<br/>
                2024-01-14,Customer Payment,12500
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {parsedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>First 10 transactions from your file</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.slice(0, 10).map((txn, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{txn.date}</TableCell>
                    <TableCell className="max-w-xs truncate">{txn.description}</TableCell>
                    <TableCell>
                      <Badge variant={txn.type === "credit" ? "default" : "secondary"}>
                        {txn.type}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right ${txn.type === "credit" ? "text-emerald-500" : ""}`}>
                      {txn.type === "credit" ? "+" : "-"}${txn.amount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsedData.length > 10 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                ...and {parsedData.length - 10} more transactions
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
