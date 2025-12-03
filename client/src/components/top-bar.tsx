import { Bell, MessagesSquare, ChevronDown, FlaskConical, Zap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useAppMode } from "@/contexts/AppModeContext";
import { useLocation } from "wouter";

const routeMapping: Record<string, Record<string, string>> = {
  demoToLive: {
    "/dashboard": "/app",
    "/transactions": "/app/transactions",
    "/upload": "/app/upload",
    "/settings": "/app/settings",
    "/documents": "/app",
    "/cash-flow": "/app",
    "/analytics": "/app",
    "/fundraising": "/app",
    "/budgets": "/app",
    "/action-plans": "/app",
    "/resources": "/app",
    "/integrations": "/app",
  },
  liveToDemo: {
    "/app": "/dashboard",
    "/app/transactions": "/transactions",
    "/app/upload": "/upload",
    "/app/settings": "/settings",
    "/app/connect": "/integrations",
  }
};

export function TopBar() {
  const { user } = useAuth();
  const { mode, setMode, isDemo } = useAppMode();
  const [location, navigate] = useLocation();

  const handleModeSwitch = (newMode: 'demo' | 'live') => {
    if (newMode === mode) return;
    setMode(newMode);

    const cleanLocation = location.split('?')[0].split('#')[0];
    
    if (newMode === 'live') {
      const mapping = routeMapping.demoToLive;
      let targetPath = '/app';
      for (const [demoPath, livePath] of Object.entries(mapping)) {
        if (cleanLocation === demoPath || cleanLocation.startsWith(demoPath + '/')) {
          targetPath = livePath;
          break;
        }
      }
      navigate(targetPath);
    } else {
      const mapping = routeMapping.liveToDemo;
      let targetPath = '/dashboard';
      for (const [livePath, demoPath] of Object.entries(mapping)) {
        if (cleanLocation === livePath || cleanLocation.startsWith(livePath + '/')) {
          targetPath = demoPath;
          break;
        }
      }
      navigate(targetPath);
    }
  };

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className={`gap-2 ${isDemo ? 'border-amber-500/50 text-amber-500' : 'border-emerald-500/50 text-emerald-500'}`}
              data-testid="button-mode-switcher"
            >
              {isDemo ? <FlaskConical className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              <span className="hidden sm:inline">{isDemo ? 'Demo workspace' : 'Live workspace'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Switch Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => handleModeSwitch('demo')}
              className={mode === 'demo' ? 'bg-accent' : ''}
              data-testid="menu-item-demo-mode"
            >
              <FlaskConical className="w-4 h-4 mr-2 text-amber-500" />
              <span>Demo workspace</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleModeSwitch('live')}
              className={mode === 'live' ? 'bg-accent' : ''}
              data-testid="menu-item-live-mode"
            >
              <Zap className="w-4 h-4 mr-2 text-emerald-500" />
              <span>Live workspace</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="gap-2" 
              data-testid="button-org-switcher"
            >
              <span className="font-semibold">My Organization</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-item-current-org">
              <div className="flex flex-col">
                <span className="font-medium">My Organization</span>
                <span className="text-xs text-muted-foreground">Current workspace</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-item-create-org">
              Create new organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative" 
          data-testid="button-chatbot"
        >
          <MessagesSquare className="w-5 h-5" />
          <span className="sr-only">AI Assistant</span>
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className="relative" 
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            3
          </Badge>
          <span className="sr-only">Notifications</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="gap-2 pl-2" 
              data-testid="button-user-profile"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email}
                </span>
                <span className="text-xs text-muted-foreground">Founder</span>
              </div>
              <ChevronDown className="w-4 h-4 hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild className="cursor-pointer">
              <a href="/api/logout" className="flex items-center gap-2" data-testid="menu-item-logout">
                <LogOut className="w-4 h-4" />
                Log out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
