import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Plus, RefreshCw, CheckCircle2, AlertCircle, Trash2, CreditCard, Landmark, Wallet, TrendingUp, Loader2, Upload } from "lucide-react";
import type { BankAccount } from "@shared/schema";
import { Link } from "wouter";

function getAccountIcon(accountType: string | null) {
  switch (accountType) {
    case "checking":
    case "savings":
      return <Landmark className="h-5 w-5" />;
    case "credit_card":
      return <CreditCard className="h-5 w-5" />;
    case "investment":
      return <TrendingUp className="h-5 w-5" />;
    default:
      return <Wallet className="h-5 w-5" />;
  }
}

function formatCurrency(amount: number | string | null, currency = "USD") {
  if (amount === null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(num);
}

export default function BankConnect() {
  const { toast } = useToast();
  const [showFastLink, setShowFastLink] = useState(false);
  const [fastLinkUrl, setFastLinkUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch connected bank accounts
  const { data: bankAccounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/live/bank-accounts"],
  });

  // Generate FastLink URL
  const generateFastLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live/yodlee/fastlink");
      return res.json();
    },
    onSuccess: (data) => {
      setFastLinkUrl(data.fastLinkUrl);
      setShowFastLink(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to start bank connection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Sync accounts after FastLink success
  const syncAccountsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live/yodlee/sync-accounts");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/live/bank-accounts"] });
      toast({
        title: "Accounts Synced",
        description: `${data.accounts?.length || 0} account(s) synchronized successfully.`,
      });
      setShowFastLink(false);
      setFastLinkUrl(null);
    },
  });

  // Sync transactions
  const syncTransactionsMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/live/yodlee/sync-transactions/${accountId}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Transactions Synced",
        description: `${data.count || 0} transaction(s) imported.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Unable to sync transactions.",
        variant: "destructive",
      });
    },
  });

  // Delete account
  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await apiRequest("DELETE", `/api/live/bank-accounts/${accountId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live/bank-accounts"] });
      toast({
        title: "Account Removed",
        description: "Bank account has been disconnected.",
      });
    },
  });

  // Handle FastLink postMessage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: Only accept messages from Yodlee FastLink domains
      const allowedOrigins = [
        "https://sandbox.api.yodlee.com",
        "https://production.api.yodlee.com",
        "https://node.yodlee.com",
        "https://fastlink.yodlee.com",
      ];
      
      // Validate origin before processing
      if (!allowedOrigins.some(origin => event.origin.includes(origin.replace("https://", "")))) {
        return; // Ignore messages from untrusted origins
      }
      
      // Check if message is from Yodlee indicating completion
      if (event.data?.type === "FASTLINK_DONE" || event.data?.fnToCall === "close") {
        // User completed or closed FastLink
        syncAccountsMutation.mutate();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const hasConnectedAccounts = bankAccounts.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Connect Your Bank</h1>
          <p className="text-muted-foreground mt-1">
            Link your bank accounts to automatically import transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/transactions">
            <Button variant="outline" disabled={!hasConnectedAccounts} data-testid="button-view-transactions">
              View Transactions
            </Button>
          </Link>
          <Button
            onClick={() => generateFastLinkMutation.mutate()}
            disabled={generateFastLinkMutation.isPending}
            data-testid="button-connect-bank"
          >
            {generateFastLinkMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Connect Bank
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && bankAccounts.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Bank Accounts Connected</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Connect your business bank accounts to automatically import and categorize your transactions.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => generateFastLinkMutation.mutate()}
                disabled={generateFastLinkMutation.isPending}
                data-testid="button-connect-first-bank"
              >
                {generateFastLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Connect Bank Account
              </Button>
              <Link href="/app/upload">
                <Button variant="outline" data-testid="button-upload-csv">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV Instead
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Accounts */}
      {!isLoading && bankAccounts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bankAccounts.map((account) => (
            <Card key={account.id} data-testid={`card-account-${account.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    {getAccountIcon(account.accountType)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{account.accountName || "Account"}</CardTitle>
                    <CardDescription className="text-xs">
                      {account.bankName} • {account.accountNumberMasked}
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant={account.status === "active" ? "default" : "destructive"}
                  className="shrink-0"
                >
                  {account.status === "active" ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  )}
                  {account.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Balance</p>
                    <p className="text-2xl font-semibold" data-testid={`text-balance-${account.id}`}>
                      {formatCurrency(account.currentBalance, account.currency || "USD")}
                    </p>
                  </div>
                  {account.lastSyncedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(account.lastSyncedAt).toLocaleDateString()}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncTransactionsMutation.mutate(account.id)}
                      disabled={syncTransactionsMutation.isPending}
                      data-testid={`button-sync-${account.id}`}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${syncTransactionsMutation.isPending ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteAccountMutation.mutate(account.id)}
                      disabled={deleteAccountMutation.isPending}
                      data-testid={`button-delete-${account.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Add Another Account Card */}
          <Card className="border-dashed flex items-center justify-center min-h-[200px]">
            <CardContent className="flex flex-col items-center py-6">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => generateFastLinkMutation.mutate()}
                disabled={generateFastLinkMutation.isPending}
                className="h-auto py-4 px-6 flex-col gap-2"
                data-testid="button-add-another"
              >
                <Plus className="h-8 w-8" />
                <span>Add Another Account</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* FastLink Modal */}
      <Dialog open={showFastLink} onOpenChange={(open) => {
        if (!open) {
          setShowFastLink(false);
          setFastLinkUrl(null);
          syncAccountsMutation.mutate();
        }
      }}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Connect Your Bank</DialogTitle>
            <DialogDescription>
              Securely link your bank account using our banking partner. Your credentials are never stored.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {fastLinkUrl ? (
              <iframe
                ref={iframeRef}
                src={fastLinkUrl}
                className="w-full h-full border-0 rounded-lg"
                title="Connect Bank Account"
                data-testid="iframe-fastlink"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Section */}
      <Card>
        <CardContent className="py-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h4 className="font-medium">Bank-Level Security</h4>
                <p className="text-sm text-muted-foreground">
                  256-bit encryption protects your data. We never store your bank credentials.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <RefreshCw className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h4 className="font-medium">Auto-Sync Daily</h4>
                <p className="text-sm text-muted-foreground">
                  Transactions are automatically imported and categorized every day.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <Building2 className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h4 className="font-medium">10,000+ Banks</h4>
                <p className="text-sm text-muted-foreground">
                  Connect accounts from virtually any US financial institution.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
