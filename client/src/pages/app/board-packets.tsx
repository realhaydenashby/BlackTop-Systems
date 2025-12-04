import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { FeatureGate } from "@/components/UpgradePrompt";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  FileText,
  Download,
  Sparkles,
  RefreshCw,
  Calendar,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  BarChart3,
  Briefcase,
} from "lucide-react";

interface BoardPacketData {
  companyName: string;
  generatedAt: string;
  period: string;
  boardMeetingDate?: string;
  executiveSummary: string;
  financials: {
    currentCash: number;
    monthlyBurn: number;
    monthlyRevenue: number;
    netBurn: number;
    runwayMonths: number | null;
    grossMargin: number | null;
    burnTrend: { month: string; burn: number; revenue: number }[];
  };
  keyMetrics: {
    label: string;
    value: string;
    change: number | null;
    status: "green" | "yellow" | "red";
  }[];
  headcount: {
    current: number;
    planned: number;
    byDepartment: { department: string; count: number; monthlyCost: number }[];
  };
  highlights: string[];
  challenges: string[];
  risksAndMitigations: { risk: string; mitigation: string; severity: "high" | "medium" | "low" }[];
  strategicUpdates: string[];
  keyDecisions: string[];
  appendix: {
    topVendors: { name: string; amount: number }[];
    spendByCategory: { name: string; amount: number; percentage: number }[];
  };
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function StatusBadge({ status }: { status: "green" | "yellow" | "red" }) {
  const colors = {
    green: "bg-green-500/10 text-green-600 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    red: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  const icons = {
    green: <CheckCircle className="h-3 w-3" />,
    yellow: <AlertTriangle className="h-3 w-3" />,
    red: <AlertTriangle className="h-3 w-3" />,
  };
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${colors[status]}`}>
      {icons[status]}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-red-500 text-white",
    medium: "bg-yellow-500 text-white",
    low: "bg-green-500 text-white",
  };
  return (
    <Badge className={`${colors[severity]} uppercase text-[10px]`}>
      {severity}
    </Badge>
  );
}

export default function BoardPackets() {
  const { canAccess, isLoading: planLoading } = usePlanAccess();
  const { toast } = useToast();
  const [meetingDate, setMeetingDate] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const hasAccess = canAccess("automatedBoardPackets");

  const { data: packetData, isLoading, refetch, isFetching } = useQuery<BoardPacketData>({
    queryKey: ["/api/live/reports/board-packet"],
    enabled: hasAccess,
  });

  const generateMutation = useMutation({
    mutationFn: async (boardMeetingDate?: string) => {
      const res = await apiRequest("POST", "/api/live/reports/board-packet/generate", {
        boardMeetingDate,
      });
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setScheduleDialogOpen(false);
      toast({
        title: "Board packet generated",
        description: "Your board packet has been created with the latest data.",
      });
    },
    onError: () => {
      toast({
        title: "Generation failed",
        description: "Failed to generate the board packet. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDownloadHTML = async () => {
    try {
      const res = await apiRequest("GET", "/api/live/reports/board-packet/html");
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `board-packet-${packetData?.period?.replace(/\s+/g, "-").toLowerCase() || "latest"}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Download started",
        description: "Your board packet is downloading.",
      });
    } catch {
      toast({
        title: "Download failed",
        description: "Failed to download the board packet.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    window.open("/api/live/reports/board-packet/html", "_blank");
  };

  if (planLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maxBurn = packetData ? Math.max(...packetData.financials.burnTrend.map(t => Math.max(t.burn, t.revenue))) : 0;

  return (
    <FeatureGate feature="automatedBoardPackets" hasAccess={hasAccess}>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="border-b bg-background px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-board-packets">
                <Briefcase className="h-6 w-6" />
                Board Packets
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Automated monthly reports for your board meetings
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-schedule">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Meeting
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Board Packet</DialogTitle>
                    <DialogDescription>
                      Optionally set your board meeting date to include in the packet.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="meeting-date">Board Meeting Date (optional)</Label>
                      <Input
                        id="meeting-date"
                        type="date"
                        value={meetingDate}
                        onChange={(e) => setMeetingDate(e.target.value)}
                        data-testid="input-meeting-date"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => generateMutation.mutate(meetingDate || undefined)}
                      disabled={generateMutation.isPending}
                      data-testid="button-generate-scheduled"
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Generate Packet
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || isFetching}
                data-testid="button-regenerate"
              >
                {generateMutation.isPending || isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={!packetData}
                data-testid="button-print"
              >
                <FileText className="h-4 w-4 mr-2" />
                Print / PDF
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadHTML}
                disabled={!packetData}
                data-testid="button-download"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-5xl mx-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 flex items-center justify-center mb-6">
                  <Sparkles className="h-7 w-7 text-primary animate-pulse" />
                </div>
                <p className="text-muted-foreground">Generating your board packet...</p>
              </div>
            ) : packetData ? (
              <div className="space-y-8">
                <Card className="border-2">
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-3xl">{packetData.companyName}</CardTitle>
                    <CardDescription className="text-lg">
                      Board Packet • {packetData.period}
                      {packetData.boardMeetingDate && (
                        <span className="block mt-1">Board Meeting: {packetData.boardMeetingDate}</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Executive Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg leading-relaxed bg-muted p-4 rounded-lg border-l-4 border-primary" data-testid="exec-summary">
                      {packetData.executiveSummary}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Key Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                      {packetData.keyMetrics.map((metric, i) => (
                        <div key={i} className="p-4 bg-muted rounded-lg border" data-testid={`key-metric-${i}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">{metric.label}</span>
                            <StatusBadge status={metric.status} />
                          </div>
                          <div className="text-xl font-semibold">{metric.value}</div>
                          {metric.change !== null && (
                            <div className={`text-xs mt-1 ${metric.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {metric.change >= 0 ? "+" : ""}{metric.change.toFixed(1)}% MoM
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="bg-muted p-4 rounded-lg">
                      <h4 className="text-sm font-medium mb-4">Burn vs Revenue Trend</h4>
                      <div className="flex items-end gap-3 h-40">
                        {packetData.financials.burnTrend.map((t, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="flex gap-1 items-end h-32">
                              <div
                                className="w-4 bg-foreground rounded-t"
                                style={{ height: `${(t.burn / maxBurn) * 100}%` }}
                                title={`Burn: ${formatCurrency(t.burn)}`}
                              />
                              <div
                                className="w-4 bg-green-500 rounded-t"
                                style={{ height: `${(t.revenue / maxBurn) * 100}%` }}
                                title={`Revenue: ${formatCurrency(t.revenue)}`}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{t.month.split(" ")[0]}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 bg-foreground rounded" />
                          <span>Burn</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 bg-green-500 rounded" />
                          <span>Revenue</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-green-600">
                        <TrendingUp className="h-5 w-5" />
                        Highlights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {packetData.highlights.map((h, i) => (
                          <li key={i} className="flex gap-2" data-testid={`highlight-${i}`}>
                            <ChevronRight className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-yellow-600">
                        <TrendingDown className="h-5 w-5" />
                        Challenges
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {packetData.challenges.map((c, i) => (
                          <li key={i} className="flex gap-2" data-testid={`challenge-${i}`}>
                            <ChevronRight className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Risks & Mitigations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {packetData.risksAndMitigations.map((r, i) => (
                        <div key={i} className="p-4 bg-muted rounded-lg" data-testid={`risk-${i}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{r.risk}</span>
                            <SeverityBadge severity={r.severity} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            <strong>Mitigation:</strong> {r.mitigation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Team & Headcount
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <div className="text-3xl font-bold" data-testid="current-headcount">
                          {packetData.headcount.current}
                        </div>
                        <div className="text-sm text-muted-foreground">Current Team</div>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <div className="text-3xl font-bold text-yellow-500" data-testid="planned-hires">
                          {packetData.headcount.planned}
                        </div>
                        <div className="text-sm text-muted-foreground">Planned Hires</div>
                      </div>
                    </div>
                    {packetData.headcount.byDepartment.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                              <th className="pb-2">Department</th>
                              <th className="pb-2">Headcount</th>
                              <th className="pb-2">Monthly Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {packetData.headcount.byDepartment.map((d, i) => (
                              <tr key={i} className="border-t">
                                <td className="py-2">{d.department}</td>
                                <td className="py-2">{d.count}</td>
                                <td className="py-2">{formatCurrency(d.monthlyCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Strategic Updates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {packetData.strategicUpdates.map((s, i) => (
                          <li key={i} className="flex gap-2 text-sm" data-testid={`strategic-${i}`}>
                            <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Key Decisions Needed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {packetData.keyDecisions.map((d, i) => (
                          <li key={i} className="flex gap-2 text-sm" data-testid={`decision-${i}`}>
                            <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Appendix</CardTitle>
                    <CardDescription>Additional financial details</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium mb-3">Top Vendors</h4>
                        <div className="space-y-2">
                          {packetData.appendix.topVendors.slice(0, 5).map((v, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{v.name}</span>
                              <span className="font-medium">{formatCurrency(v.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-3">Spend by Category</h4>
                        <div className="space-y-2">
                          {packetData.appendix.spendByCategory.slice(0, 5).map((c, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-muted-foreground">{c.name}</span>
                                <span className="font-medium">{formatCurrency(c.amount)}</span>
                              </div>
                              <Progress value={c.percentage} className="h-1" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="text-center text-sm text-muted-foreground py-4">
                  <p>Generated by BlackTop Systems • {new Date(packetData.generatedAt).toLocaleDateString()}</p>
                  <p>Confidential - For Board Members Only</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-20">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No board packet generated yet</h3>
                <p className="text-muted-foreground mb-4">
                  Generate your first comprehensive board packet.
                </p>
                <Button onClick={() => generateMutation.mutate()} data-testid="button-generate-first">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Board Packet
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </FeatureGate>
  );
}
