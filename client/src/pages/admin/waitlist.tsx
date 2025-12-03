import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  Download, 
  Users, 
  Clock, 
  UserCheck, 
  UserX,
  Search,
  Loader2,
  RefreshCw
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  role: string;
  company: string | null;
  painPoint: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  approvedAt: string | null;
}

interface WaitlistStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
  stats: WaitlistStats;
}

export default function AdminWaitlist() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, refetch } = useQuery<WaitlistResponse>({
    queryKey: ["/api/admin/waitlist", statusFilter !== "all" ? statusFilter : undefined],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/waitlist/${id}/approve`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
      toast({ title: "User approved", description: "They can now access the live workspace." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/waitlist/${id}/reject`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
      toast({ title: "User rejected" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleExport = () => {
    window.open("/api/admin/waitlist/export", "_blank");
  };

  const filteredEntries = data?.entries?.filter(entry => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        entry.email.toLowerCase().includes(query) ||
        entry.name.toLowerCase().includes(query) ||
        entry.company?.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const getRoleBadge = (role: string) => {
    const variants: Record<string, string> = {
      founder: "bg-primary/10 text-primary",
      cfo: "bg-blue-500/10 text-blue-500",
      ops: "bg-green-500/10 text-green-500",
      investor: "bg-purple-500/10 text-purple-500",
      other: "bg-muted text-muted-foreground",
    };
    return variants[role] || variants.other;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b backdrop-blur-md bg-background/90 sticky top-0 z-50">
        <div className="flex items-center justify-between w-full px-4 py-5">
          <Link href="/">
            <div className="flex items-center gap-2 group cursor-pointer">
              <img 
                src="/logo.png" 
                alt="BlackTop Systems" 
                className="h-6 object-contain transition-transform group-hover:scale-105" 
              />
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Admin</Badge>
            <Link href="/app">
              <Button variant="ghost" size="sm" data-testid="link-back-app">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to App
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Waitlist Management</h1>
          <p className="text-muted-foreground mt-1">Review and approve early access requests</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Signups</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">{data?.stats?.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500" data-testid="text-stat-pending">{data?.stats?.pending || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <UserCheck className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500" data-testid="text-stat-approved">{data?.stats?.approved || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <UserX className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500" data-testid="text-stat-rejected">{data?.stats?.rejected || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Waitlist Entries</CardTitle>
                <CardDescription>
                  {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-[200px]"
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-filter">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={handleExport} data-testid="button-export">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No waitlist entries found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Signed Up</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-waitlist-${entry.id}`}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getRoleBadge(entry.role)}>
                            {entry.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.company || "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.createdAt ? format(new Date(entry.createdAt), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.status === "pending" && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                onClick={() => approveMutation.mutate(entry.id)}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-${entry.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => rejectMutation.mutate(entry.id)}
                                disabled={rejectMutation.isPending}
                                data-testid={`button-reject-${entry.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                          {entry.status !== "pending" && (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredEntries.some(e => e.painPoint) && (
              <div className="mt-8 border-t pt-6">
                <h3 className="font-medium mb-4">Pain Points (for outreach)</h3>
                <div className="space-y-3">
                  {filteredEntries
                    .filter(e => e.painPoint)
                    .map(entry => (
                      <div key={entry.id} className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{entry.name}</span>
                          <Badge variant="secondary" className="text-xs">{entry.role}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.painPoint}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
