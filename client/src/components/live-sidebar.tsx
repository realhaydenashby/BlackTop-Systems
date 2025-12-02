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
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";

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
  { title: "Forecasting", url: "/app/analytics/forecasting" },
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

export function LiveSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { hasActiveConnection } = useConnectionStatus();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [fundraisingOpen, setFundraisingOpen] = useState(false);

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
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">BlackTop</span>
            </div>
            <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
              Live
            </Badge>
          </div>
          
          <SidebarGroupLabel className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
            Financial Engine
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
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

                <Collapsible open={fundraisingOpen} onOpenChange={setFundraisingOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton data-testid="nav-fundraising-prep">
                        <Rocket className="w-4 h-4" />
                        <span>Fundraising Prep</span>
                        <ChevronRight className={`ml-auto w-4 h-4 transition-transform ${fundraisingOpen ? 'rotate-90' : ''}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
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
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            Forecasting
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {forecastingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
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
