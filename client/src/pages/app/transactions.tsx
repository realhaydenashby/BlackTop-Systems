import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Download,
  Filter,
  ArrowUpDown,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Transaction {
  id: string;
  date: string;
  description: string;
  vendorOriginal: string;
  vendorNormalized?: string;
  category?: string;
  amount: number;
  type: "debit" | "credit";
  isRecurring: boolean;
  source: string;
  classificationConfidence?: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AppTransactions() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: transactions, isLoading, refetch } = useQuery<Transaction[]>({
    queryKey: ["/api/live/transactions"],
    enabled: !!user,
  });

  const mockTransactions: Transaction[] = [
    {
      id: "1",
      date: "2024-01-15",
      description: "AMZN WEB SERVICES",
      vendorOriginal: "AMZN WEB SERVICES",
      vendorNormalized: "AWS",
      category: "Infrastructure",
      amount: 5964,
      type: "debit",
      isRecurring: true,
      source: "yodlee",
      classificationConfidence: 0.95,
    },
    {
      id: "2",
      date: "2024-01-14",
      description: "GUSTO PAYROLL",
      vendorOriginal: "GUSTO PAYROLL 45000",
      vendorNormalized: "Gusto",
      category: "Payroll",
      amount: 45000,
      type: "debit",
      isRecurring: true,
      source: "yodlee",
      classificationConfidence: 0.99,
    },
    {
      id: "3",
      date: "2024-01-12",
      description: "Stripe Transfer",
      vendorOriginal: "STRIPE TRANSFER",
      vendorNormalized: "Stripe",
      category: "Revenue",
      amount: 12500,
      type: "credit",
      isRecurring: false,
      source: "stripe",
      classificationConfidence: 1.0,
    },
    {
      id: "4",
      date: "2024-01-10",
      description: "SLACK TECHNOLOGIES",
      vendorOriginal: "SLACK TECHNOLOGIES",
      vendorNormalized: "Slack",
      category: "Software",
      amount: 850,
      type: "debit",
      isRecurring: true,
      source: "yodlee",
      classificationConfidence: 0.92,
    },
    {
      id: "5",
      date: "2024-01-08",
      description: "FIGMA INC",
      vendorOriginal: "FIGMA INC",
      vendorNormalized: "Figma",
      category: "Software",
      amount: 450,
      type: "debit",
      isRecurring: true,
      source: "yodlee",
      classificationConfidence: 0.88,
    },
    {
      id: "6",
      date: "2024-01-05",
      description: "GOOGLE CLOUD",
      vendorOriginal: "GOOGLE *CLOUD",
      vendorNormalized: "Google Cloud",
      category: "Infrastructure",
      amount: 2340,
      type: "debit",
      isRecurring: true,
      source: "yodlee",
      classificationConfidence: 0.94,
    },
    {
      id: "7",
      date: "2024-01-03",
      description: "Customer Payment",
      vendorOriginal: "ACH DEPOSIT - ACME CORP",
      vendorNormalized: "Acme Corp",
      category: "Revenue",
      amount: 8500,
      type: "credit",
      isRecurring: false,
      source: "yodlee",
      classificationConfidence: 0.75,
    },
  ];

  const displayTransactions = transactions || mockTransactions;

  const filteredTransactions = displayTransactions.filter((txn) => {
    const matchesSearch =
      search === "" ||
      txn.description.toLowerCase().includes(search.toLowerCase()) ||
      txn.vendorNormalized?.toLowerCase().includes(search.toLowerCase()) ||
      txn.vendorOriginal.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || txn.category === categoryFilter;

    const matchesType = typeFilter === "all" || txn.type === typeFilter;

    return matchesSearch && matchesCategory && matchesType;
  });

  const categories = Array.from(
    new Set(displayTransactions.map((t) => t.category).filter(Boolean))
  );

  const totalInflows = filteredTransactions
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflows = filteredTransactions
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + t.amount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-transactions">
            Transactions
          </h1>
          <p className="text-muted-foreground">
            All financial transactions from connected accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync
          </Button>
          <Button variant="outline" size="sm" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Inflows</p>
            <p className="text-xl font-bold text-green-500">
              {formatCurrency(totalInflows)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Outflows</p>
            <p className="text-xl font-bold text-red-500">
              {formatCurrency(totalOutflows)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Net Flow</p>
            <p
              className={`text-xl font-bold ${
                totalInflows - totalOutflows >= 0
                  ? "text-green-500"
                  : "text-red-500"
              }`}
            >
              {formatCurrency(totalInflows - totalOutflows)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat!}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="debit">Expenses</SelectItem>
                <SelectItem value="credit">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[80px]">Source</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <p className="text-muted-foreground">
                        No transactions found
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((txn) => (
                    <TableRow
                      key={txn.id}
                      className="hover-elevate"
                      data-testid={`row-transaction-${txn.id}`}
                    >
                      <TableCell className="font-medium">
                        {formatDate(txn.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {txn.vendorNormalized || txn.vendorOriginal}
                          </span>
                          {txn.isRecurring && (
                            <Badge variant="outline" className="text-xs">
                              Recurring
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {txn.vendorOriginal}
                      </TableCell>
                      <TableCell>
                        {txn.category ? (
                          <Badge variant="secondary">{txn.category}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Uncategorized
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          txn.type === "credit" ? "text-green-500" : ""
                        }`}
                      >
                        {txn.type === "credit" ? "+" : "-"}
                        {formatCurrency(txn.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {txn.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-more-${txn.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredTransactions.length} of {displayTransactions.length} transactions
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
