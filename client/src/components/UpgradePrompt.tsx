import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { FeatureKey, FEATURE_LABELS, getMinimumTierForFeature, PLAN_CONFIGS } from "@shared/planFeatures";

interface UpgradePromptProps {
  feature: FeatureKey;
  title?: string;
  description?: string;
  compact?: boolean;
}

export function UpgradePrompt({ feature, title, description, compact = false }: UpgradePromptProps) {
  const [, setLocation] = useLocation();
  const requiredTier = getMinimumTierForFeature(feature);
  const tierConfig = requiredTier ? PLAN_CONFIGS[requiredTier] : null;
  const featureLabel = FEATURE_LABELS[feature];

  const handleUpgrade = () => {
    setLocation("/pricing");
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{title || featureLabel}</p>
            <p className="text-xs text-muted-foreground">
              Available on {tierConfig?.displayName || "higher plans"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleUpgrade} data-testid={`button-upgrade-${feature}`}>
          Upgrade
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-2 border-primary/20" data-testid={`card-upgrade-prompt-${feature}`}>
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-xl">
          {title || `Unlock ${featureLabel}`}
        </CardTitle>
        <CardDescription className="text-base">
          {description || `This feature is available on ${tierConfig?.displayName || "higher plans"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tierConfig && (
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{tierConfig.displayName}</span>
              {tierConfig.price && (
                <span className="text-lg font-bold">${tierConfig.price}/mo</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {requiredTier === "core" 
                ? "AI Copilot, scenario modeling, raise planning, and more."
                : requiredTier === "growth"
                ? "Everything in Core plus unlimited seats, custom dashboards, and API access."
                : "Dashboard, charts, and AI insights to see your money clearly."}
            </p>
          </div>
        )}
        <Button 
          className="w-full" 
          onClick={handleUpgrade}
          data-testid={`button-view-plans-${feature}`}
        >
          View Plans
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

interface FeatureGateProps {
  feature: FeatureKey;
  hasAccess: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, hasAccess, children, fallback }: FeatureGateProps) {
  if (hasAccess) {
    return <>{children}</>;
  }
  
  return fallback || <UpgradePrompt feature={feature} />;
}
