import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  CreditCard, 
  Landmark, 
  Wallet, 
  TrendingUp, 
  Loader2,
  ExternalLink,
  FileSpreadsheet,
  Link as LinkIcon,
  Unlink
} from "lucide-react";
import { SiQuickbooks } from "react-icons/si";
import type { BankAccount } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { format, subMonths } from "date-fns";

declare global {
  interface Window {
    Plaid?: {
      create: (config: any) => { open: () => void; exit: () => void; destroy: () => void };
    };
  }
}

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
  if (amount === null) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(num);
}

interface QBStatus {
  connected: boolean;
  companyName?: string;
  lastSynced?: string;
  status?: string;
}

export default function Connect() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showFastLink, setShowFastLink] = useState(false);
  const [fastLinkUrl, setFastLinkUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [plaidReady, setPlaidReady] = useState(false);
  const plaidHandlerRef = useRef<any>(null);

  // Load Plaid Link script
  useEffect(() => {
    if (document.getElementById("plaid-link-script")) {
      setPlaidReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "plaid-link-script";
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => setPlaidReady(true);
    document.body.appendChild(script);

    return () => {
      if (plaidHandlerRef.current) {
        plaidHandlerRef.current.destroy();
      }
    };
  }, []);

  // Check URL params for success/error messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "quickbooks") {
      toast({
        title: "QuickBooks Connected",
        description: "Your QuickBooks account has been successfully connected.",
      });
      // Clear params
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("error")) {
      toast({
        title: "Connection Failed",
        description: "Unable to connect to QuickBooks. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Fetch QuickBooks connection status
  const { data: qbStatus, isLoading: qbLoading } = useQuery<QBStatus>({
    queryKey: ["/api/quickbooks/status"],
  });

  // Fetch connected bank accounts
  const { data: bankAccounts = [], isLoading: bankLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/live/bank-accounts"],
  });

  // Connect to QuickBooks
  const connectQBMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/quickbooks/auth-url");
      return res.json();
    },
    onSuccess: (data) => {
      // QuickBooks OAuth pages block iframe embedding (X-Frame-Options: DENY)
      // Must open in new tab or break out of iframe context
      if (window.self !== window.top) {
        // Running inside iframe (Replit preview) - open in new tab
        window.open(data.authUrl, "_blank", "noopener");
        toast({
          title: "QuickBooks Authorization",
          description: "A new tab opened for QuickBooks login. Complete authorization there and return here.",
        });
      } else {
        // Running in top-level window - redirect normally
        window.location.href = data.authUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to connect to QuickBooks.",
        variant: "destructive",
      });
    },
  });

  // Sync QuickBooks data
  const syncQBMutation = useMutation({
    mutationFn: async () => {
      const endDate = format(new Date(), "yyyy-MM-dd");
      const startDate = format(subMonths(new Date(), 6), "yyyy-MM-dd");
      const res = await apiRequest("POST", "/api/quickbooks/sync", { startDate, endDate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      toast({
        title: "Sync Complete",
        description: `Imported ${data.imported} transactions (${data.errors} errors).`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Unable to sync QuickBooks data.",
        variant: "destructive",
      });
    },
  });

  // Disconnect QuickBooks
  const disconnectQBMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/quickbooks/disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      toast({
        title: "Disconnected",
        description: "QuickBooks has been disconnected.",
      });
    },
  });

  // Generate FastLink URL for Yodlee
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
        description: error.message || "Unable to start bank connection.",
        variant: "destructive",
      });
    },
  });

  // Sync accounts after FastLink success
  const [, navigate] = useLocation();
  const syncAccountsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live/yodlee/sync-accounts");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/live/bank-accounts"] });
      toast({
        title: "Bank Connected",
        description: `${data.accounts?.length || 0} account(s) connected. Redirecting to dashboard...`,
      });
      setShowFastLink(false);
      setFastLinkUrl(null);
      // Streamlined onboarding: redirect to dashboard after successful connection
      setTimeout(() => navigate("/app"), 1500);
    },
  });

  // Sync transactions for a bank account
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

  // Delete bank account
  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await apiRequest("DELETE", `/api/live/bank-accounts/${accountId}`);
    },
    onSuccess: () => {
      // Invalidate all relevant queries to reset dashboard state
      queryClient.invalidateQueries({ queryKey: ["/api/live/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/analytics/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/company-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/weekly-changes"] });
      toast({
        title: "Account Removed",
        description: "Bank account has been disconnected. Dashboard has been reset.",
      });
    },
  });

  // Check Plaid configuration status
  const { data: plaidStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/live/plaid/status"],
  });

  // Create Plaid Link token
  const createPlaidLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live/plaid/link-token");
      return res.json();
    },
    onSuccess: (data) => {
      if (window.Plaid && data.linkToken) {
        const handler = window.Plaid.create({
          token: data.linkToken,
          onSuccess: (publicToken: string, metadata: any) => {
            exchangePlaidTokenMutation.mutate(publicToken);
          },
          onExit: (err: any) => {
            if (err) {
              console.error("Plaid Link exit error:", err);
              toast({
                title: "Connection Cancelled",
                description: "Bank connection was not completed.",
                variant: "destructive",
              });
            }
          },
          onEvent: (eventName: string) => {
            console.log("Plaid event:", eventName);
          },
        });
        plaidHandlerRef.current = handler;
        handler.open();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to start bank connection.",
        variant: "destructive",
      });
    },
  });

  // Exchange Plaid public token
  const exchangePlaidTokenMutation = useMutation({
    mutationFn: async (publicToken: string) => {
      const res = await apiRequest("POST", "/api/live/plaid/exchange-token", { publicToken });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/live/bank-accounts"] });
      toast({
        title: "Bank Connected",
        description: `${data.accountCount} account(s) connected successfully.`,
      });
      // Sync transactions immediately
      syncPlaidMutation.mutate();
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to connect bank account.",
        variant: "destructive",
      });
    },
  });

  // Sync Plaid transactions
  const syncPlaidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live/plaid/sync");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.synced > 0) {
        toast({
          title: "Transactions Synced",
          description: `${data.synced} transaction(s) imported.`,
        });
      }
      // Redirect to dashboard after successful sync
      setTimeout(() => navigate("/app"), 1500);
    },
  });

  // Connect bank handler - uses Plaid if configured, otherwise falls back to Yodlee
  const handleConnectBank = useCallback(() => {
    if (plaidStatus?.configured) {
      createPlaidLinkMutation.mutate();
    } else {
      generateFastLinkMutation.mutate();
    }
  }, [plaidStatus, createPlaidLinkMutation, generateFastLinkMutation]);

  const isConnectingBank = createPlaidLinkMutation.isPending || 
    exchangePlaidTokenMutation.isPending || 
    generateFastLinkMutation.isPending;

  // Handle FastLink postMessage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const allowedOrigins = [
        "https://sandbox.api.yodlee.com",
        "https://production.api.yodlee.com",
        "https://node.yodlee.com",
        "https://fastlink.yodlee.com",
      ];
      
      if (!allowedOrigins.some(origin => event.origin.includes(origin.replace("https://", "")))) {
        return;
      }
      
      if (event.data?.type === "FASTLINK_DONE" || event.data?.fnToCall === "close") {
        syncAccountsMutation.mutate();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const isLoading = qbLoading || bankLoading;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Connect Your Accounts</h1>
        <p className="text-muted-foreground mt-1">
          Link your financial accounts to automatically sync your data
        </p>
      </div>

      {/* QuickBooks Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Accounting Software</h2>
        </div>

        <Card data-testid="card-quickbooks" className="hover:shadow-glow transition-all duration-base">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-[#2CA01C]/10 border border-[#2CA01C]/20 p-3">
                <SiQuickbooks className="h-6 w-6 text-[#2CA01C]" />
              </div>
              <div>
                <CardTitle className="text-base">QuickBooks</CardTitle>
                <CardDescription>
                  {qbStatus?.connected 
                    ? `Connected to ${qbStatus.companyName || "your company"}`
                    : "Sync your revenue, expenses, and vendors"}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {qbLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : qbStatus?.connected ? (
                <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Not Connected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {qbStatus?.connected ? (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {qbStatus.lastSynced && (
                    <span>Last synced: {new Date(qbStatus.lastSynced).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncQBMutation.mutate()}
                    disabled={syncQBMutation.isPending}
                    data-testid="button-sync-quickbooks"
                  >
                    {syncQBMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectQBMutation.mutate()}
                    disabled={disconnectQBMutation.isPending}
                    data-testid="button-disconnect-quickbooks"
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => connectQBMutation.mutate()}
                disabled={connectQBMutation.isPending}
                className="bg-[#2CA01C] hover:bg-[#248517]"
                data-testid="button-connect-quickbooks"
              >
                {connectQBMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4 mr-2" />
                )}
                Connect QuickBooks
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bank Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">Bank Accounts</h2>
          </div>
          {bankAccounts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnectBank}
              disabled={isConnectingBank || !plaidReady}
              data-testid="button-add-bank"
            >
              {isConnectingBank ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Bank
            </Button>
          )}
        </div>

        {/* Empty State */}
        {!bankLoading && bankAccounts.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-2xl bg-muted border border-border p-5 mb-6">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Bank Accounts Connected</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Connect your business bank accounts to automatically import transactions.
              </p>
              <Button
                onClick={handleConnectBank}
                disabled={isConnectingBank || !plaidReady}
                className="shadow-glow"
                data-testid="button-connect-first-bank"
              >
                {isConnectingBank ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Connect Bank Account
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Connected Accounts Grid */}
        {!bankLoading && bankAccounts.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((account) => (
              <Card key={account.id} data-testid={`card-account-${account.id}`} className="hover:shadow-glow transition-all duration-base">
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5">
                      {getAccountIcon(account.accountType)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{account.accountName || "Account"}</CardTitle>
                      <CardDescription className="text-xs">
                        {account.bankName} {account.accountNumberMasked}
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
                      <p className="text-sm text-muted-foreground">Balance</p>
                      <p className="text-xl font-semibold" data-testid={`text-balance-${account.id}`}>
                        {formatCurrency(account.currentBalance, account.currency || "USD")}
                      </p>
                    </div>
                    {account.lastSyncedAt && (
                      <p className="text-xs text-muted-foreground">
                        Synced: {new Date(account.lastSyncedAt).toLocaleDateString()}
                      </p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if ((account as any).provider === "plaid") {
                            syncPlaidMutation.mutate();
                          } else {
                            syncTransactionsMutation.mutate(account.id);
                          }
                        }}
                        disabled={syncTransactionsMutation.isPending || syncPlaidMutation.isPending}
                        data-testid={`button-sync-${account.id}`}
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${syncTransactionsMutation.isPending || syncPlaidMutation.isPending ? "animate-spin" : ""}`} />
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
          </div>
        )}
      </div>

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
              Securely link your bank account. Your credentials are never stored.
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

      {/* Security Info */}
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
                  256-bit encryption. We never store your credentials.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <RefreshCw className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h4 className="font-medium">Auto-Sync</h4>
                <p className="text-sm text-muted-foreground">
                  Transactions automatically imported and categorized.
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
                  Connect virtually any US financial institution.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
