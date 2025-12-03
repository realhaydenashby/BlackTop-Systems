import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RefreshCw,
  CreditCard,
  DollarSign,
  Link2,
  TrendingUp,
  Shield,
  Ban,
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

interface AdminMetrics {
  totalUsers: number;
  approvedUsers: number;
  pendingWaitlist: number;
  activeSubscriptions: number;
  usersWithConnections: number;
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isApproved: boolean | null;
  isAdmin: boolean | null;
  createdAt: string | null;
  connectionCount: number;
}

interface Subscription {
  id: string;
  customerEmail: string | null;
  customerName: string | null;
  status: string;
  productName: string;
  amount: number;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string | null;
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
  mrr: number;
  totalActive: number;
  totalCanceled: number;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");
  const [waitlistSearch, setWaitlistSearch] = useState("");

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<AdminMetrics>({
    queryKey: ["/api/admin/metrics"],
  });

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
  });

  const { data: waitlistData, isLoading: waitlistLoading, refetch: refetchWaitlist } = useQuery<WaitlistResponse>({
    queryKey: ["/api/admin/waitlist"],
  });

  const { data: subscriptionsData, isLoading: subscriptionsLoading, refetch: refetchSubscriptions } = useQuery<SubscriptionsResponse>({
    queryKey: ["/api/admin/subscriptions"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/waitlist/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User approved", description: "They can now access the live workspace." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/waitlist/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      toast({ title: "User rejected" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/users/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      toast({ title: "User approved", description: "They can now access the live workspace." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const revokeUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/users/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      toast({ title: "Access revoked" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleExport = () => {
    window.open("/api/admin/waitlist/export", "_blank");
  };

  const filteredWaitlist = waitlistData?.entries?.filter(entry => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (waitlistSearch) {
      const query = waitlistSearch.toLowerCase();
      return (
        entry.email.toLowerCase().includes(query) ||
        entry.name.toLowerCase().includes(query) ||
        entry.company?.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const filteredUsers = usersData?.users?.filter(user => {
    if (userSearch) {
      const query = userSearch.toLowerCase();
      return (
        user.email?.toLowerCase().includes(query) ||
        user.firstName?.toLowerCase().includes(query) ||
        user.lastName?.toLowerCase().includes(query)
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
      case "active":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case "rejected":
      case "canceled":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">{status === "canceled" ? "Canceled" : "Rejected"}</Badge>;
      case "trialing":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Trial</Badge>;
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
            <Badge variant="secondary">
              <Shield className="w-3 h-3 mr-1" />
              Admin
            </Badge>
            <Link href="/app">
              <Button variant="ghost" size="sm" data-testid="link-back-app">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to App
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage users, waitlist, and subscriptions</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="waitlist" data-testid="tab-waitlist">Waitlist</TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-total-users">
                    {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metrics?.totalUsers || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Registered accounts</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Approved</CardTitle>
                  <UserCheck className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500" data-testid="metric-approved">
                    {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metrics?.approvedUsers || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">With live access</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-500" data-testid="metric-pending">
                    {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metrics?.pendingWaitlist || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Awaiting approval</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
                  <CreditCard className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary" data-testid="metric-subscriptions">
                    {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metrics?.activeSubscriptions || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Active paying</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Connected</CardTitle>
                  <Link2 className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-500" data-testid="metric-connected">
                    {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metrics?.usersWithConnections || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Bank linked</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Waitlist</CardTitle>
                  <CardDescription>Latest signup requests</CardDescription>
                </CardHeader>
                <CardContent>
                  {waitlistLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : waitlistData?.entries?.slice(0, 5).length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No waitlist entries yet</p>
                  ) : (
                    <div className="space-y-3">
                      {waitlistData?.entries?.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                          <div>
                            <p className="font-medium text-sm">{entry.name}</p>
                            <p className="text-xs text-muted-foreground">{entry.email}</p>
                          </div>
                          {getStatusBadge(entry.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">MRR Overview</CardTitle>
                  <CardDescription>Monthly recurring revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  {subscriptionsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                        <div className="p-3 rounded-full bg-green-500/10">
                          <DollarSign className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                          <p className="text-3xl font-bold">${subscriptionsData?.mrr?.toFixed(2) || "0.00"}</p>
                          <p className="text-sm text-muted-foreground">Monthly Recurring Revenue</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/30 text-center">
                          <p className="text-xl font-bold text-green-500">{subscriptionsData?.totalActive || 0}</p>
                          <p className="text-xs text-muted-foreground">Active</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30 text-center">
                          <p className="text-xl font-bold text-red-500">{subscriptionsData?.totalCanceled || 0}</p>
                          <p className="text-xs text-muted-foreground">Canceled</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>
                      {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="pl-9 w-[200px]"
                        data-testid="input-user-search"
                      />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => refetchUsers()} data-testid="button-refresh-users">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No users found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Connections</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {user.firstName || user.lastName 
                                    ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                                    : "Unknown"}
                                  {user.isAdmin && (
                                    <Badge variant="secondary" className="ml-2 text-xs">Admin</Badge>
                                  )}
                                </p>
                                <p className="text-sm text-muted-foreground">{user.email || "No email"}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {user.isApproved ? (
                                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                  Approved
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                  Not Approved
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Link2 className="h-3 w-3 text-muted-foreground" />
                                <span>{user.connectionCount}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {!user.isAdmin && (
                                <div className="flex items-center justify-end gap-2">
                                  {!user.isApproved ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                      onClick={() => approveUserMutation.mutate(user.id)}
                                      disabled={approveUserMutation.isPending}
                                      data-testid={`button-approve-user-${user.id}`}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                      onClick={() => revokeUserMutation.mutate(user.id)}
                                      disabled={revokeUserMutation.isPending}
                                      data-testid={`button-revoke-user-${user.id}`}
                                    >
                                      <Ban className="h-4 w-4 mr-1" />
                                      Revoke
                                    </Button>
                                  )}
                                </div>
                              )}
                              {user.isAdmin && (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="waitlist" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle>Waitlist Entries</CardTitle>
                    <CardDescription>
                      {filteredWaitlist.length} {filteredWaitlist.length === 1 ? "entry" : "entries"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={waitlistSearch}
                        onChange={(e) => setWaitlistSearch(e.target.value)}
                        className="pl-9 w-[200px]"
                        data-testid="input-waitlist-search"
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
                    <Button variant="outline" size="icon" onClick={() => refetchWaitlist()} data-testid="button-refresh-waitlist">
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
                {waitlistLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredWaitlist.length === 0 ? (
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
                        {filteredWaitlist.map((entry) => (
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">MRR</CardTitle>
                  <DollarSign className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500" data-testid="subscription-mrr">
                    ${subscriptionsData?.mrr?.toFixed(2) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">Monthly recurring</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="subscription-active">
                    {subscriptionsData?.totalActive || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Paying customers</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Canceled</CardTitle>
                  <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-500" data-testid="subscription-canceled">
                    {subscriptionsData?.totalCanceled || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Churned</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle>All Subscriptions</CardTitle>
                    <CardDescription>
                      {subscriptionsData?.subscriptions?.length || 0} total subscriptions
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => refetchSubscriptions()} data-testid="button-refresh-subscriptions">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {subscriptionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !subscriptionsData?.subscriptions?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No subscriptions yet
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Period End</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptionsData.subscriptions.map((sub) => (
                          <TableRow key={sub.id} data-testid={`row-subscription-${sub.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sub.customerName || "Unknown"}</p>
                                <p className="text-sm text-muted-foreground">{sub.customerEmail || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell>{sub.productName}</TableCell>
                            <TableCell className="font-medium">
                              ${sub.amount.toFixed(2)}/{sub.currency.toUpperCase()}
                            </TableCell>
                            <TableCell>{getStatusBadge(sub.status)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {sub.currentPeriodEnd 
                                ? format(new Date(sub.currentPeriodEnd), "MMM d, yyyy") 
                                : "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {sub.createdAt 
                                ? format(new Date(sub.createdAt), "MMM d, yyyy") 
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
