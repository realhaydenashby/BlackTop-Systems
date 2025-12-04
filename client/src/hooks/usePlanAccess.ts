import { useQuery } from "@tanstack/react-query";
import { 
  SubscriptionTier, 
  FeatureKey, 
  hasFeatureAccess, 
  getMinimumTierForFeature,
  getUpgradeTier,
  PLAN_CONFIGS,
  FEATURE_LABELS
} from "@shared/planFeatures";

interface UserPlanData {
  subscriptionTier: SubscriptionTier;
  isAdmin: boolean;
}

export function usePlanAccess() {
  const { data: userData, isLoading } = useQuery<UserPlanData>({
    queryKey: ["/api/user/plan"],
  });

  const tier = userData?.subscriptionTier || null;
  const isAdmin = userData?.isAdmin || false;

  const canAccess = (feature: FeatureKey): boolean => {
    if (isAdmin) return true;
    return hasFeatureAccess(tier, feature);
  };

  const getRequiredTier = (feature: FeatureKey): SubscriptionTier => {
    return getMinimumTierForFeature(feature);
  };

  const getUpgrade = (): SubscriptionTier => {
    return getUpgradeTier(tier);
  };

  const getFeatureLabel = (feature: FeatureKey): string => {
    return FEATURE_LABELS[feature];
  };

  const getPlanConfig = (planTier: Exclude<SubscriptionTier, null>) => {
    return PLAN_CONFIGS[planTier];
  };

  return {
    tier,
    isAdmin,
    isLoading,
    canAccess,
    getRequiredTier,
    getUpgrade,
    getFeatureLabel,
    getPlanConfig,
    hasSubscription: tier !== null,
  };
}

export type { SubscriptionTier, FeatureKey };
