import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  X,
  AlertTriangle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Bot,
  User,
  FileText,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CanonicalAccount {
  id: string;
  code: string;
  name: string;
  description: string;
  accountGroup: string;
  displayOrder: number;
}

interface AccountMapping {
  id: string;
  organizationId: string;
  canonicalAccountId: string;
  sourceAccountName: string;
  sourceSystem: string;
  confidence: "high" | "medium" | "low" | "manual";
  confidenceScore: string;
  source: "rule" | "ai" | "user" | "imported" | "default";
  usageCount: number;
  lastUsedAt: string;
  canonicalAccount: CanonicalAccount | null;
}

interface MappingStats {
  totalMappings: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  manualMappings: number;
  needsReview: number;
}

function ConfidenceBadge({ confidence, score }: { confidence: string; score: string }) {
  const numScore = parseFloat(score) * 100;
  
  if (confidence === "manual" || confidence === "high") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
        <Check className="w-3 h-3 mr-1" />
        {numScore.toFixed(0)}%
      </Badge>
    );
  }
  
  if (confidence === "medium") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
        <AlertTriangle className="w-3 h-3 mr-1" />
        {numScore.toFixed(0)}%
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
      <X className="w-3 h-3 mr-1" />
      {numScore.toFixed(0)}%
    </Badge>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "ai") {
    return (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
        <Bot className="w-3 h-3 mr-1" />
        AI
      </Badge>
    );
  }
  
  if (source === "user") {
    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
        <User className="w-3 h-3 mr-1" />
        Manual
      </Badge>
    );
  }
  
  if (source === "rule") {
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30">
        <FileText className="w-3 h-3 mr-1" />
        Rule
      </Badge>
    );
  }
  
  return (
    <Badge variant="secondary">
      {source}
    </Badge>
  );
}

function MappingRow({ 
  mapping, 
  canonicalAccounts,
  onApprove,
  onCorrect,
  isApproving,
  isCorrecting,
}: {
  mapping: AccountMapping;
  canonicalAccounts: CanonicalAccount[];
  onApprove: (mappingId: string) => void;
  onCorrect: (mappingId: string, newAccountId: string) => void;
  isApproving: boolean;
  isCorrecting: boolean;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showCorrection, setShowCorrection] = useState(false);

  const groupedAccounts = canonicalAccounts.reduce((acc, account) => {
    const group = account.accountGroup;
    if (!acc[group]) acc[group] = [];
    acc[group].push(account);
    return acc;
  }, {} as Record<string, CanonicalAccount[]>);

  const handleCorrect = () => {
    if (selectedAccountId && selectedAccountId !== mapping.canonicalAccountId) {
      onCorrect(mapping.id, selectedAccountId);
      setShowCorrection(false);
      setSelectedAccountId("");
    }
  };

  return (
    <TableRow data-testid={`row-mapping-${mapping.id}`}>
      <TableCell className="font-medium max-w-[200px] truncate" title={mapping.sourceAccountName}>
        {mapping.sourceAccountName}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-xs">
          {mapping.sourceSystem}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium text-sm">{mapping.canonicalAccount?.name || "Unknown"}</span>
            <span className="text-xs text-muted-foreground">{mapping.canonicalAccount?.code}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <ConfidenceBadge confidence={mapping.confidence} score={mapping.confidenceScore} />
      </TableCell>
      <TableCell>
        <SourceBadge source={mapping.source} />
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">{mapping.usageCount}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {showCorrection ? (
            <div className="flex items-center gap-2">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-[200px]" data-testid={`select-account-${mapping.id}`}>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedAccounts).map(([group, accounts]) => (
                    <div key={group}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                        {group.replace("_", " ")}
                      </div>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                size="sm" 
                onClick={handleCorrect}
                disabled={!selectedAccountId || selectedAccountId === mapping.canonicalAccountId || isCorrecting}
                data-testid={`button-save-correction-${mapping.id}`}
              >
                {isCorrecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setShowCorrection(false)}
                data-testid={`button-cancel-correction-${mapping.id}`}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onApprove(mapping.id)}
                disabled={isApproving || mapping.confidence === "high" || mapping.confidence === "manual"}
                data-testid={`button-approve-${mapping.id}`}
              >
                {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setShowCorrection(true)}
                data-testid={`button-correct-${mapping.id}`}
              >
                Correct
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function AccountMappings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("needs-review");

  const { data: stats, isLoading: statsLoading } = useQuery<MappingStats>({
    queryKey: ["/api/coa/stats"],
  });

  const { data: lowConfidenceMappings = [], isLoading: lowConfLoading } = useQuery<AccountMapping[]>({
    queryKey: ["/api/coa/low-confidence-mappings"],
  });

  const { data: allMappingsData, isLoading: allMappingsLoading } = useQuery<{ mappings: AccountMapping[]; total: number }>({
    queryKey: ["/api/coa/mappings"],
  });

  const { data: canonicalAccounts = [] } = useQuery<CanonicalAccount[]>({
    queryKey: ["/api/coa/canonical-accounts"],
  });

  const approveMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const res = await apiRequest("POST", "/api/coa/approve-mapping", { mappingId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coa/low-confidence-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coa/mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coa/stats"] });
      toast({
        title: "Mapping Approved",
        description: "The account mapping has been confirmed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve mapping",
        variant: "destructive",
      });
    },
  });

  const correctMutation = useMutation({
    mutationFn: async ({ mappingId, canonicalAccountId }: { mappingId: string; canonicalAccountId: string }) => {
      const res = await apiRequest("POST", "/api/coa/correct-mapping", { mappingId, canonicalAccountId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coa/low-confidence-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coa/mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coa/stats"] });
      toast({
        title: "Mapping Corrected",
        description: "The account mapping has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to correct mapping",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (mappingId: string) => {
    approveMutation.mutate(mappingId);
  };

  const handleCorrect = (mappingId: string, newAccountId: string) => {
    correctMutation.mutate({ mappingId, canonicalAccountId: newAccountId });
  };

  const allMappings = allMappingsData?.mappings || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Account Mappings</h1>
          <p className="text-muted-foreground">
            Review and correct how your accounts are categorized for analytics
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/coa/low-confidence-mappings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/coa/mappings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/coa/stats"] });
          }}
          data-testid="button-refresh"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Mappings</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-total-mappings">
              {statsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.totalMappings || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High Confidence</CardDescription>
            <CardTitle className="text-2xl text-emerald-400" data-testid="text-high-confidence">
              {statsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.highConfidence || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs Review</CardDescription>
            <CardTitle className="text-2xl text-amber-400" data-testid="text-needs-review">
              {statsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.needsReview || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Manual Corrections</CardDescription>
            <CardTitle className="text-2xl text-blue-400" data-testid="text-manual-corrections">
              {statsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.manualMappings || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Account Classification
          </CardTitle>
          <CardDescription>
            Review account mappings to improve analytics accuracy. Low-confidence mappings need your attention.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="needs-review" data-testid="tab-needs-review">
                Needs Review
                {lowConfidenceMappings.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {lowConfidenceMappings.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all-mappings">
                All Mappings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="needs-review" className="mt-4">
              {lowConfLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : lowConfidenceMappings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Check className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
                  <p className="font-medium">All mappings are reviewed</p>
                  <p className="text-sm">No low-confidence mappings need attention</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source Account</TableHead>
                        <TableHead>System</TableHead>
                        <TableHead>Mapped To</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowConfidenceMappings.map((mapping) => (
                        <MappingRow
                          key={mapping.id}
                          mapping={mapping}
                          canonicalAccounts={canonicalAccounts}
                          onApprove={handleApprove}
                          onCorrect={handleCorrect}
                          isApproving={approveMutation.isPending}
                          isCorrecting={correctMutation.isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              {allMappingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : allMappings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4" />
                  <p className="font-medium">No account mappings yet</p>
                  <p className="text-sm">Connect a financial data source to start mapping accounts</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source Account</TableHead>
                        <TableHead>System</TableHead>
                        <TableHead>Mapped To</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allMappings.map((mapping) => (
                        <MappingRow
                          key={mapping.id}
                          mapping={mapping}
                          canonicalAccounts={canonicalAccounts}
                          onApprove={handleApprove}
                          onCorrect={handleCorrect}
                          isApproving={approveMutation.isPending}
                          isCorrecting={correctMutation.isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
