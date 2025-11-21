import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Pricing from "@/pages/pricing";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Documents from "@/pages/documents";
import Transactions from "@/pages/transactions";
import Analytics from "@/pages/analytics";
import CashFlow from "@/pages/cash-flow";
import Budgets from "@/pages/budgets";
import ActionPlans from "@/pages/action-plans";
import Resources from "@/pages/resources";
import Integrations from "@/pages/integrations";
import Settings from "@/pages/settings";

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
    return <Redirect to="/api/login" />;
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

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/pricing" component={Pricing} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ProtectedRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/onboarding" component={() => <ProtectedRoute component={Onboarding} />} />
        <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
        <Route path="/documents" component={() => <ProtectedRoute component={Documents} />} />
        <Route path="/transactions" component={() => <ProtectedRoute component={Transactions} />} />
        <Route path="/cash-flow" component={() => <ProtectedRoute component={CashFlow} />} />
        <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
        <Route path="/analytics/:section" component={() => <ProtectedRoute component={Analytics} />} />
        <Route path="/budgets" component={() => <ProtectedRoute component={Budgets} />} />
        <Route path="/action-plans" component={() => <ProtectedRoute component={ActionPlans} />} />
        <Route path="/resources" component={() => <ProtectedRoute component={Resources} />} />
        <Route path="/integrations" component={() => <ProtectedRoute component={Integrations} />} />
        <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
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

  return user ? <ProtectedRouter /> : <PublicRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
