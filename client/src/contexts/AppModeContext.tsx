import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { demoDataService } from "@/services/demoDataService";
import { liveDataService } from "@/services/liveDataService";

export type AppMode = "demo" | "live";

interface AppModeContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  dataService: typeof demoDataService | typeof liveDataService;
  isDemo: boolean;
  isLive: boolean;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

const MODE_STORAGE_KEY = "blacktop_app_mode";

const DEMO_ROUTES = [
  "/dashboard",
  "/documents",
  "/transactions",
  "/upload",
  "/cash-flow",
  "/analytics",
  "/fundraising",
  "/budgets",
  "/action-plans",
  "/resources",
  "/settings",
  "/integrations"
];

function getModeFromUrl(): AppMode | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (path === "/app" || path.startsWith("/app/")) {
    return "live";
  }
  if (DEMO_ROUTES.some(route => path === route || path.startsWith(route + "/"))) {
    return "demo";
  }
  return null;
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() => {
    const urlMode = getModeFromUrl();
    if (urlMode) return urlMode;

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (stored === "demo" || stored === "live") {
        return stored;
      }
    }
    return "demo";
  });

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    const handleNavigation = () => {
      const urlMode = getModeFromUrl();
      if (urlMode && urlMode !== mode) {
        setModeState(urlMode);
      }
    };

    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, [mode]);

  const setMode = (newMode: AppMode) => {
    setModeState(newMode);
  };

  const dataService = mode === "demo" ? demoDataService : liveDataService;

  const value: AppModeContextType = {
    mode,
    setMode,
    dataService,
    isDemo: mode === "demo",
    isLive: mode === "live",
  };

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (context === undefined) {
    throw new Error("useAppMode must be used within an AppModeProvider");
  }
  return context;
}
