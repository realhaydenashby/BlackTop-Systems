import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { FeatureGate } from "@/components/UpgradePrompt";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  Mail,
  FileText,
  Copy,
  Download,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Clock,
  Edit3,
  Eye,
  Save,
} from "lucide-react";

interface InvestorUpdateData {
  id?: string;
  companyName: string;
  generatedAt: string;
  period: string;
  metrics: {
    currentCash: number;
    previousCash: number;
    cashChange: number;
    monthlyBurn: number;
    previousBurn: number;
    burnChange: number;
    monthlyRevenue: number;
    previousRevenue: number;
    revenueChange: number;
    runwayMonths: number | null;
    headcount: number;
  };
  highlights: string[];
  challenges: string[];
  keyMetricsNarrative: string;
  outlook: string;
  asks: string[];
  fullUpdateText: string;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function ChangeIndicator({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const isPositive = inverse ? value < 0 : value >= 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
      {value >= 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export default function InvestorUpdates() {
  const { canAccess, isLoading: planLoading } = usePlanAccess();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");
  const [editedHighlights, setEditedHighlights] = useState<string[]>([]);
  const [editedChallenges, setEditedChallenges] = useState<string[]>([]);
  const [editedNarrative, setEditedNarrative] = useState("");
  const [editedOutlook, setEditedOutlook] = useState("");
  const [editedAsks, setEditedAsks] = useState<string[]>([]);
  const [hasEdited, setHasEdited] = useState(false);

  const hasAccess = canAccess("aiInvestorUpdates");

  const { data: updateData, isLoading, refetch, isFetching } = useQuery<InvestorUpdateData>({
    queryKey: ["/api/live/reports/investor-update"],
    enabled: hasAccess,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live/reports/investor-update/generate");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setHasEdited(false);
      toast({
        title: "Update regenerated",
        description: "Your investor update has been refreshed with the latest data.",
      });
    },
    onError: () => {
      toast({
        title: "Generation failed",
        description: "Failed to regenerate the update. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (editedData: InvestorUpdateData) => {
      if (!updateData?.id) {
        throw new Error("No update ID available");
      }
      const res = await apiRequest("PUT", `/api/live/reports/investor-update/${updateData.id}`, {
        updateData: editedData,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Changes saved",
        description: "Your edits have been saved and will persist.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Failed to save your changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveEdits = () => {
    if (!updateData || !hasEdited) return;
    
    const editedData: InvestorUpdateData = {
      ...updateData,
      highlights: editedHighlights,
      challenges: editedChallenges,
      keyMetricsNarrative: editedNarrative,
      outlook: editedOutlook,
      asks: editedAsks,
      fullUpdateText: generateFullText(),
    };
    
    saveMutation.mutate(editedData);
  };

  const initializeEdits = () => {
    if (updateData && !hasEdited) {
      setEditedHighlights([...updateData.highlights]);
      setEditedChallenges([...updateData.challenges]);
      setEditedNarrative(updateData.keyMetricsNarrative);
      setEditedOutlook(updateData.outlook);
      setEditedAsks([...updateData.asks]);
    }
  };

  const handleCopyToClipboard = async () => {
    const text = hasEdited ? generateFullText() : updateData?.fullUpdateText || "";
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "The investor update has been copied. Paste it into your email.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const getEditedUpdateData = (): InvestorUpdateData | null => {
    if (!updateData) return null;
    return {
      ...updateData,
      highlights: hasEdited ? editedHighlights : updateData.highlights,
      challenges: hasEdited ? editedChallenges : updateData.challenges,
      keyMetricsNarrative: hasEdited ? editedNarrative : updateData.keyMetricsNarrative,
      outlook: hasEdited ? editedOutlook : updateData.outlook,
      asks: hasEdited ? editedAsks : updateData.asks,
      fullUpdateText: hasEdited ? generateFullText() : updateData.fullUpdateText,
    };
  };

  const handleDownloadHTML = async () => {
    try {
      let html: string;
      
      if (hasEdited) {
        const editedData = getEditedUpdateData();
        const res = await apiRequest("POST", "/api/live/reports/investor-update/html", {
          updateData: editedData,
        });
        html = await res.text();
      } else {
        const res = await apiRequest("GET", "/api/live/reports/investor-update/html");
        html = await res.text();
      }
      
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `investor-update-${updateData?.period?.replace(/\s+/g, "-").toLowerCase() || "latest"}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Download started",
        description: hasEdited 
          ? "Your edited investor update HTML file is downloading."
          : "Your investor update HTML file is downloading.",
      });
    } catch {
      toast({
        title: "Download failed",
        description: "Failed to download the HTML file.",
        variant: "destructive",
      });
    }
  };

  const generateFullText = () => {
    if (!updateData) return "";
    return `
# ${updateData.companyName} - Investor Update
## ${updateData.period}

Dear Investors,

I hope this update finds you well. Here's our monthly report on ${updateData.companyName}'s progress.

## Highlights

${editedHighlights.map(h => `- ${h}`).join('\n')}

## Key Metrics

${editedNarrative}

| Metric | Current | Change |
|--------|---------|--------|
| Cash Position | ${formatCurrency(updateData.metrics.currentCash)} | ${updateData.metrics.cashChange >= 0 ? '+' : ''}${updateData.metrics.cashChange.toFixed(1)}% |
| Monthly Revenue | ${formatCurrency(updateData.metrics.monthlyRevenue)} | ${updateData.metrics.revenueChange >= 0 ? '+' : ''}${updateData.metrics.revenueChange.toFixed(1)}% |
| Monthly Burn | ${formatCurrency(updateData.metrics.monthlyBurn)} | ${updateData.metrics.burnChange >= 0 ? '+' : ''}${updateData.metrics.burnChange.toFixed(1)}% |
| Runway | ${updateData.metrics.runwayMonths ? `${updateData.metrics.runwayMonths.toFixed(1)} months` : 'Profitable'} | - |
| Team Size | ${updateData.metrics.headcount} | - |

## Challenges & Focus Areas

${editedChallenges.map(c => `- ${c}`).join('\n')}

## Outlook

${editedOutlook}

## Asks

${editedAsks.map(a => `- ${a}`).join('\n')}

---

Thank you for your continued support.

Best regards,
${updateData.companyName} Team
`.trim();
  };

  if (planLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <FeatureGate feature="aiInvestorUpdates" hasAccess={hasAccess}>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="border-b bg-background px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-investor-updates">
                <Mail className="h-6 w-6" />
                Investor Updates
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                AI-drafted monthly updates for your investors
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending || isFetching}
                data-testid="button-regenerate"
              >
                {regenerateMutation.isPending || isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Regenerate
              </Button>
              {hasEdited && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveEdits}
                  disabled={saveMutation.isPending}
                  data-testid="button-save"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Edits
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadHTML}
                disabled={!updateData}
                data-testid="button-download-html"
              >
                <Download className="h-4 w-4 mr-2" />
                Download HTML
              </Button>
              <Button
                size="sm"
                onClick={handleCopyToClipboard}
                disabled={!updateData}
                data-testid="button-copy"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 flex items-center justify-center mb-6">
                  <Sparkles className="h-7 w-7 text-primary animate-pulse" />
                </div>
                <p className="text-muted-foreground">Generating your investor update...</p>
              </div>
            ) : updateData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-xs">Cash</span>
                      </div>
                      <div className="text-xl font-semibold" data-testid="metric-cash">
                        {formatCurrency(updateData.metrics.currentCash)}
                      </div>
                      <ChangeIndicator value={updateData.metrics.cashChange} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">Revenue</span>
                      </div>
                      <div className="text-xl font-semibold" data-testid="metric-revenue">
                        {formatCurrency(updateData.metrics.monthlyRevenue)}
                      </div>
                      <ChangeIndicator value={updateData.metrics.revenueChange} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-xs">Burn</span>
                      </div>
                      <div className="text-xl font-semibold" data-testid="metric-burn">
                        {formatCurrency(updateData.metrics.monthlyBurn)}
                      </div>
                      <ChangeIndicator value={updateData.metrics.burnChange} inverse />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Runway</span>
                      </div>
                      <div className="text-xl font-semibold" data-testid="metric-runway">
                        {updateData.metrics.runwayMonths
                          ? `${updateData.metrics.runwayMonths.toFixed(1)}mo`
                          : "∞"}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {updateData.metrics.headcount} team
                      </span>
                    </CardContent>
                  </Card>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => {
                  setActiveTab(v as "preview" | "edit");
                  if (v === "edit") initializeEdits();
                }}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="preview" data-testid="tab-preview">
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </TabsTrigger>
                    <TabsTrigger value="edit" data-testid="tab-edit">
                      <Edit3 className="h-4 w-4 mr-2" />
                      Edit
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{updateData.companyName}</CardTitle>
                            <CardDescription>Investor Update • {updateData.period}</CardDescription>
                          </div>
                          {hasEdited && (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Edited
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                        <p>Dear Investors,</p>
                        <p>
                          I hope this update finds you well. Here's our monthly report on{" "}
                          {updateData.companyName}'s progress.
                        </p>

                        <h3>Highlights</h3>
                        <ul>
                          {(hasEdited ? editedHighlights : updateData.highlights).map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>

                        <h3>Key Metrics</h3>
                        <p className="bg-muted p-4 rounded-lg border-l-4 border-primary italic">
                          {hasEdited ? editedNarrative : updateData.keyMetricsNarrative}
                        </p>

                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr>
                                <th className="text-left">Metric</th>
                                <th className="text-left">Current</th>
                                <th className="text-left">Change</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>Cash Position</td>
                                <td>{formatCurrency(updateData.metrics.currentCash)}</td>
                                <td><ChangeIndicator value={updateData.metrics.cashChange} /></td>
                              </tr>
                              <tr>
                                <td>Monthly Revenue</td>
                                <td>{formatCurrency(updateData.metrics.monthlyRevenue)}</td>
                                <td><ChangeIndicator value={updateData.metrics.revenueChange} /></td>
                              </tr>
                              <tr>
                                <td>Monthly Burn</td>
                                <td>{formatCurrency(updateData.metrics.monthlyBurn)}</td>
                                <td><ChangeIndicator value={updateData.metrics.burnChange} inverse /></td>
                              </tr>
                              <tr>
                                <td>Runway</td>
                                <td>
                                  {updateData.metrics.runwayMonths
                                    ? `${updateData.metrics.runwayMonths.toFixed(1)} months`
                                    : "Profitable"}
                                </td>
                                <td>-</td>
                              </tr>
                              <tr>
                                <td>Team Size</td>
                                <td>{updateData.metrics.headcount}</td>
                                <td>-</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <h3>Challenges & Focus Areas</h3>
                        <ul>
                          {(hasEdited ? editedChallenges : updateData.challenges).map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>

                        <h3>Outlook</h3>
                        <p>{hasEdited ? editedOutlook : updateData.outlook}</p>

                        <h3>Asks</h3>
                        <ul>
                          {(hasEdited ? editedAsks : updateData.asks).map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>

                        <Separator className="my-6" />

                        <p>Thank you for your continued support.</p>
                        <p>
                          Best regards,
                          <br />
                          <strong>{updateData.companyName} Team</strong>
                        </p>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="edit">
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Highlights</CardTitle>
                          <CardDescription>Key wins to share with investors</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {editedHighlights.map((h, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-muted-foreground mt-2">•</span>
                              <Textarea
                                value={h}
                                onChange={(e) => {
                                  const updated = [...editedHighlights];
                                  updated[i] = e.target.value;
                                  setEditedHighlights(updated);
                                  setHasEdited(true);
                                }}
                                className="min-h-[60px]"
                                data-testid={`input-highlight-${i}`}
                              />
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditedHighlights([...editedHighlights, ""]);
                              setHasEdited(true);
                            }}
                            data-testid="button-add-highlight"
                          >
                            Add Highlight
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Key Metrics Narrative</CardTitle>
                          <CardDescription>Summary of financial performance</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Textarea
                            value={editedNarrative}
                            onChange={(e) => {
                              setEditedNarrative(e.target.value);
                              setHasEdited(true);
                            }}
                            className="min-h-[100px]"
                            data-testid="input-narrative"
                          />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Challenges</CardTitle>
                          <CardDescription>Areas needing attention</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {editedChallenges.map((c, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-muted-foreground mt-2">•</span>
                              <Textarea
                                value={c}
                                onChange={(e) => {
                                  const updated = [...editedChallenges];
                                  updated[i] = e.target.value;
                                  setEditedChallenges(updated);
                                  setHasEdited(true);
                                }}
                                className="min-h-[60px]"
                                data-testid={`input-challenge-${i}`}
                              />
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditedChallenges([...editedChallenges, ""]);
                              setHasEdited(true);
                            }}
                            data-testid="button-add-challenge"
                          >
                            Add Challenge
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Outlook</CardTitle>
                          <CardDescription>Forward-looking statement</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Textarea
                            value={editedOutlook}
                            onChange={(e) => {
                              setEditedOutlook(e.target.value);
                              setHasEdited(true);
                            }}
                            className="min-h-[100px]"
                            data-testid="input-outlook"
                          />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Asks</CardTitle>
                          <CardDescription>Requests from your investors</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {editedAsks.map((a, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-muted-foreground mt-2">•</span>
                              <Textarea
                                value={a}
                                onChange={(e) => {
                                  const updated = [...editedAsks];
                                  updated[i] = e.target.value;
                                  setEditedAsks(updated);
                                  setHasEdited(true);
                                }}
                                className="min-h-[60px]"
                                data-testid={`input-ask-${i}`}
                              />
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditedAsks([...editedAsks, ""]);
                              setHasEdited(true);
                            }}
                            data-testid="button-add-ask"
                          >
                            Add Ask
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="text-center py-20">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No update generated yet</h3>
                <p className="text-muted-foreground mb-4">
                  Click "Regenerate" to create your first investor update.
                </p>
                <Button onClick={() => regenerateMutation.mutate()} data-testid="button-generate-first">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Update
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </FeatureGate>
  );
}
