import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation } from "wouter";
import {
  Building2,
  Receipt,
  LayoutDashboard,
  LogOut,
  Settings,
  Calculator,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Rocket,
  Shield,
  Users,
  Lock,
  Crown,
  FileText,
  Mail,
  Briefcase,
  Clock,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { useQuery } from "@tanstack/react-query";

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/app",
    icon: LayoutDashboard,
  },
  {
    title: "Copilot",
    url: "/app/copilot",
    icon: Sparkles,
  },
  {
    title: "Transactions",
    url: "/app/transactions",
    icon: Receipt,
  },
  {
    title: "Connect",
    url: "/app/connect",
    icon: Building2,
  },
];

const forecastingItems = [
  {
    title: "Modeling Workbook",
    url: "/app/forecasting/workbook",
    icon: Calculator,
  },
];

const analyticsItems = [
  { title: "Spend", url: "/app/analytics" },
  { title: "Revenue", url: "/app/analytics/revenue" },
  { title: "Profitability", url: "/app/analytics/profitability" },
];

const fundraisingItems = [
  { title: "Burn", url: "/app/fundraising" },
  { title: "Runway", url: "/app/fundraising/runway" },
  { title: "Raise", url: "/app/fundraising/raise" },
  { title: "Hiring", url: "/app/fundraising/hiring" },
];

const utilityItems = [
  {
    title: "Settings",
    url: "/app/settings",
    icon: Settings,
  },
];

interface ApprovalStatus {
  isApproved: boolean;
  isAdmin: boolean;
  email: string;
}

interface UserData {
  id: string;
  email: string;
  subscriptionTier: string | null;
  stripeSubscriptionId: string | null;
  trialStartDate: string | null;
  trialEndsAt: string | null;
}

export function LiveSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { hasActiveConnection } = useConnectionStatus();
  const { canAccess, tier } = usePlanAccess();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [fundraisingOpen, setFundraisingOpen] = useState(false);

  const { data: approvalStatus } = useQuery<ApprovalStatus>({
    queryKey: ["/api/auth/approval-status"],
    enabled: !!user,
    staleTime: 60000,
  });

  const { data: userData } = useQuery<UserData>({
    queryKey: ["/api/auth/user"],
    enabled: !!user,
    staleTime: 30000,
  });

  const isAdmin = approvalStatus?.isAdmin || false;

  // Calculate trial status
  const getTrialInfo = () => {
    if (!userData?.trialEndsAt) {
      return { isOnTrial: false, daysRemaining: 0, isExpired: false };
    }
    const now = new Date();
    const trialEnd = new Date(userData.trialEndsAt);
    const diffMs = trialEnd.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      isOnTrial: daysRemaining > 0,
      daysRemaining: Math.max(0, daysRemaining),
      isExpired: daysRemaining <= 0,
    };
  };

  const trialInfo = getTrialInfo();
  const hasActiveSubscription = !!userData?.stripeSubscriptionId;
  
  const canAccessCopilot = canAccess("aiCopilot");
  const canAccessForecasting = canAccess("scenarioModeling");
  const canAccessFundraising = canAccess("hiringPlanning");
  const canAccessInvestorUpdates = canAccess("aiInvestorUpdates");
  const canAccessBoardPackets = canAccess("automatedBoardPackets");
  const [reportsOpen, setReportsOpen] = useState(false);

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  const isActive = (url: string) => {
    if (url === "/app") {
      return location === "/app" || location === "/app/";
    }
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between gap-2 pl-0 pr-2 py-6 border-b border-sidebar-border">
            <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg p-1" data-testid="link-home-logo">
              <span className="font-bold text-lg">BlackTop</span>
            </Link>
            <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
              Live
            </Badge>
          </div>
          
          <SidebarGroupLabel className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
            Financial Engine
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                const isCopilot = item.title === "Copilot";
                const isLocked = isCopilot && !canAccessCopilot;
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild={!isLocked}
                      isActive={isActive(item.url)}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      className={isLocked ? "opacity-60 cursor-not-allowed" : ""}
                    >
                      {isLocked ? (
                        <div className="flex items-center gap-2 w-full">
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                          <Lock className="w-3 h-3 ml-auto text-muted-foreground" />
                        </div>
                      ) : (
                        <Link href={item.url}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {hasActiveConnection && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Insights
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton data-testid="nav-analytics">
                        <TrendingUp className="w-4 h-4" />
                        <span>Analytics</span>
                        <ChevronRight className={`ml-auto w-4 h-4 transition-transform ${analyticsOpen ? 'rotate-90' : ''}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {analyticsItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === item.url}
                              data-testid={`nav-analytics-${item.title.toLowerCase()}`}
                            >
                              <Link href={item.url}>
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                <Collapsible open={fundraisingOpen} onOpenChange={canAccessFundraising ? setFundraisingOpen : undefined}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild disabled={!canAccessFundraising}>
                      <SidebarMenuButton 
                        data-testid="nav-fundraising-prep"
                        className={!canAccessFundraising ? "opacity-60" : ""}
                      >
                        <Rocket className="w-4 h-4" />
                        <span>Fundraising Prep</span>
                        {canAccessFundraising ? (
                          <ChevronRight className={`ml-auto w-4 h-4 transition-transform ${fundraisingOpen ? 'rotate-90' : ''}`} />
                        ) : (
                          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">Core</Badge>
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {canAccessFundraising && (
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {fundraisingItems.map((item) => (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location === item.url}
                                data-testid={`nav-fundraising-${item.title.toLowerCase()}`}
                              >
                                <Link href={item.url}>
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Forecasting
            {!canAccessForecasting && <Lock className="w-3 h-3 text-muted-foreground" />}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {forecastingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild={canAccessForecasting}
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    className={!canAccessForecasting ? "opacity-60 cursor-not-allowed" : ""}
                  >
                    {canAccessForecasting ? (
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 w-full">
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">Core</Badge>
                      </div>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(canAccessInvestorUpdates || canAccessBoardPackets) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Reports
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={reportsOpen} onOpenChange={setReportsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton data-testid="nav-reports">
                        <FileText className="w-4 h-4" />
                        <span>Reports</span>
                        <ChevronRight className={`ml-auto w-4 h-4 transition-transform ${reportsOpen ? 'rotate-90' : ''}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {canAccessInvestorUpdates && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === "/app/investor-updates"}
                              data-testid="nav-investor-updates"
                            >
                              <Link href="/app/investor-updates">
                                <Mail className="w-3 h-3 mr-1" />
                                <span>Investor Updates</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {canAccessBoardPackets && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === "/app/board-packets"}
                              data-testid="nav-board-packets"
                            >
                              <Link href="/app/board-packets">
                                <Briefcase className="w-3 h-3 mr-1" />
                                <span>Board Packets</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {utilityItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/admin/waitlist")}
                    data-testid="nav-admin-waitlist"
                  >
                    <Link href="/admin/waitlist">
                      <Users className="w-4 h-4" />
                      <span>Waitlist</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-testid="nav-switch-demo"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Switch to Demo</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* Trial Status Indicator */}
          {!hasActiveSubscription && trialInfo.isOnTrial && (
            <SidebarMenuItem>
              <Link href="/app/settings">
                <div className="flex items-center gap-2 px-2 py-2 mb-1 bg-primary/10 border border-primary/20 rounded-lg hover-elevate">
                  <Clock className="w-4 h-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-primary" data-testid="text-trial-days">
                      {trialInfo.daysRemaining} day{trialInfo.daysRemaining !== 1 ? "s" : ""} left
                    </p>
                    <p className="text-[10px] text-muted-foreground">Upgrade anytime</p>
                  </div>
                </div>
              </Link>
            </SidebarMenuItem>
          )}
          
          {/* Trial Expired Warning */}
          {!hasActiveSubscription && trialInfo.isExpired && (
            <SidebarMenuItem>
              <Link href="/app/settings">
                <div className="flex items-center gap-2 px-2 py-2 mb-1 bg-destructive/10 border border-destructive/30 rounded-lg hover-elevate">
                  <Clock className="w-4 h-4 text-destructive" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-destructive" data-testid="text-trial-expired-sidebar">
                      Trial expired
                    </p>
                    <p className="text-[10px] text-muted-foreground">Upgrade to continue</p>
                  </div>
                </div>
              </Link>
            </SidebarMenuItem>
          )}

          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-user-name">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email}
                </p>
                {tier && (
                  <Badge 
                    variant={tier === "core" ? "default" : tier === "growth" ? "default" : "secondary"} 
                    className="text-[10px] px-1.5 py-0 mt-0.5"
                    data-testid="badge-user-tier"
                  >
                    {tier === "lite" ? "Lite" : tier === "core" ? "Core" : "Growth"}
                  </Badge>
                )}
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/api/logout" data-testid="link-logout">
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
