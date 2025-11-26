import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Search, Trash2, Wand2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { demoDataService, type Transaction } from "@/services/demoDataService";

const CATEGORIES = [
  "Payroll",
  "Software",
  "Infrastructure",
  "Marketing",
  "Office",
  "Revenue",
  "Other"
];

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("30");
  const { toast } = useToast();

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["transactions", "demo", { search, category: categoryFilter, days: dateFilter }],
    queryFn: () => demoDataService.getTransactions(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: "Transaction deleted",
        description: "The transaction has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete transaction. Please try again.",
        variant: "destructive",
      });
    },
  });

  const categorizeMutation = useMutation({
    mutationFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { categorized: transactions?.length || 0 };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: "Auto-categorization complete",
        description: `Categorized ${data.categorized} transactions using AI.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to categorize transactions. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredTransactions = transactions?.filter(txn => {
    const matchesSearch = search === "" || 
      txn.vendorNormalized?.toLowerCase().includes(search.toLowerCase()) ||
      txn.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || txn.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">View and manage all transactions</p>
        </div>
        <Button 
          onClick={() => categorizeMutation.mutate()}
          disabled={categorizeMutation.isPending}
          data-testid="button-auto-categorize"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          {categorizeMutation.isPending ? "Categorizing..." : "Auto-categorize"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by vendor or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-transactions"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48" data-testid="select-category-filter">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-48" data-testid="select-date-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTransactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isLive && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((txn) => (
                  <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`}>
                    <TableCell className="font-medium">
                      {format(new Date(txn.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{txn.vendorNormalized}</span>
                        {txn.vendorOriginal !== txn.vendorNormalized && (
                          <span className="text-xs text-muted-foreground">{txn.vendorOriginal}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{txn.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{txn.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{txn.source}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${txn.type === "credit" ? "text-emerald-500" : ""}`}>
                      {txn.type === "credit" ? "+" : "-"}${Math.abs(txn.amount).toLocaleString()}
                    </TableCell>
                    {isLive && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(txn.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${txn.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No transactions found matching your filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
