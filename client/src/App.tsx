import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LiveSidebar } from "@/components/live-sidebar";
import { TopBar } from "@/components/top-bar";
import { MarketingLayout } from "@/layouts/MarketingLayout";
import { useAuth } from "@/hooks/useAuth";
import { AppModeProvider } from "@/contexts/AppModeContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Features from "@/pages/features";
import Pricing from "@/pages/pricing";
import ResourcesPublic from "@/pages/resources-public";
import About from "@/pages/company/about";
import Security from "@/pages/company/security";
import Contact from "@/pages/company/contact";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Documents from "@/pages/documents";
import Transactions from "@/pages/transactions";
import Analytics from "@/pages/analytics";
import Fundraising from "@/pages/fundraising";
import CashFlow from "@/pages/cash-flow";
import Budgets from "@/pages/budgets";
import ActionPlans from "@/pages/action-plans";
import Resources from "@/pages/resources";
import Integrations from "@/pages/integrations";
import Settings from "@/pages/settings";
// Live Mode Pages
import Connect from "@/pages/app/connect";
import AppDashboard from "@/pages/app/dashboard";
import AppTransactions from "@/pages/app/transactions";
import AppSettings from "@/pages/app/settings";
import UploadPage from "@/pages/upload";
import Workbook from "@/pages/app/forecasting/workbook";
import Copilot from "@/pages/app/copilot";
import LiveAnalytics from "@/pages/app/analytics";
import LiveFundraising from "@/pages/app/fundraising";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
        </div>
      </div>
    );
  }

  if (!user) {
    // Use full page navigation for server-side login endpoint
    window.location.href = "/api/login";
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <Component />;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <TopBar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function LiveAppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <LiveSidebar />
        <div className="flex flex-col flex-1">
          <TopBar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function PublicRouter() {
  return (
    <MarketingLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/features" component={Features} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/resources" component={ResourcesPublic} />
        <Route path="/company/about" component={About} />
        <Route path="/company/security" component={Security} />
        <Route path="/company/contact" component={Contact} />
        <Route component={NotFound} />
      </Switch>
    </MarketingLayout>
  );
}

function DemoRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/documents" component={Documents} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/upload" component={UploadPage} />
        <Route path="/cash-flow" component={CashFlow} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/analytics/:section" component={Analytics} />
        <Route path="/fundraising" component={Fundraising} />
        <Route path="/fundraising/:section" component={Fundraising} />
        <Route path="/budgets" component={Budgets} />
        <Route path="/action-plans" component={ActionPlans} />
        <Route path="/resources" component={Resources} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function ProtectedRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/onboarding" component={() => <ProtectedRoute component={Onboarding} />} />
        <Route path="/app/resources" component={() => <ProtectedRoute component={Resources} />} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function LiveModeRouter() {
  return (
    <LiveAppLayout>
      <Switch>
        <Route path="/app" component={() => <ProtectedRoute component={AppDashboard} />} />
        <Route path="/app/transactions" component={() => <ProtectedRoute component={AppTransactions} />} />
        <Route path="/app/upload" component={() => <ProtectedRoute component={UploadPage} />} />
        <Route path="/app/connect" component={() => <ProtectedRoute component={Connect} />} />
        <Route path="/app/analytics" component={() => <ProtectedRoute component={LiveAnalytics} />} />
        <Route path="/app/analytics/:section" component={() => <ProtectedRoute component={LiveAnalytics} />} />
        <Route path="/app/fundraising" component={() => <ProtectedRoute component={LiveFundraising} />} />
        <Route path="/app/fundraising/:section" component={() => <ProtectedRoute component={LiveFundraising} />} />
        <Route path="/app/forecasting/workbook" component={() => <ProtectedRoute component={Workbook} />} />
        <Route path="/app/copilot" component={() => <ProtectedRoute component={Copilot} />} />
        <Route path="/app/settings" component={() => <ProtectedRoute component={AppSettings} />} />
        <Route component={NotFound} />
      </Switch>
    </LiveAppLayout>
  );
}

function RouterInner() {
  const { isLoading } = useAuth();
  const [location] = useLocation();

  const cleanLocation = location.split('?')[0].split('#')[0];

  const marketingRoutes = [
    "/",
    "/features",
    "/pricing",
    "/resources",
    "/company/about",
    "/company/security",
    "/company/contact"
  ];

  const demoRoutes = [
    "/dashboard",
    "/documents",
    "/transactions",
    "/upload",
    "/cash-flow",
    "/analytics",
    "/fundraising",
    "/budgets",
    "/action-plans",
    "/settings",
    "/integrations"
  ];

  const isMarketingRoute = marketingRoutes.some(route => 
    cleanLocation === route || cleanLocation.startsWith(route + "/")
  );

  const isDemoRoute = demoRoutes.some(route =>
    cleanLocation === route || cleanLocation.startsWith(route + "/")
  );

  const isLiveModeRoute = cleanLocation === "/app" || cleanLocation.startsWith("/app/");

  const isProtectedRoute = cleanLocation === "/onboarding";

  if (isLoading && (isLiveModeRoute || isProtectedRoute)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
        </div>
      </div>
    );
  }

  if (isMarketingRoute) {
    return <PublicRouter />;
  }

  if (isDemoRoute) {
    return <DemoRouter />;
  }

  if (isLiveModeRoute) {
    return <LiveModeRouter />;
  }

  if (isProtectedRoute) {
    return <ProtectedRouter />;
  }

  return <PublicRouter />;
}

function Router() {
  return (
    <WouterRouter>
      <RouterInner />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppModeProvider>
          <Toaster />
          <Router />
        </AppModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
