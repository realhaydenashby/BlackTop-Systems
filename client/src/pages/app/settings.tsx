import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Building,
  Bell,
  CreditCard,
  Link2,
  Shield,
  LogOut,
  ExternalLink,
  Loader2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  subscriptionTier: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialStartDate: string | null;
  trialEndsAt: string | null;
}

export default function AppSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [notifications, setNotifications] = useState({
    email: true,
    slack: false,
    sms: false,
    runwayAlerts: true,
    burnSpikes: true,
    weeklyDigest: true,
  });

  const { data: userData } = useQuery<UserData>({
    queryKey: ["/api/auth/user"],
  });

  const { data: subscriptionData } = useQuery<{
    subscription: any;
    status: string;
  }>({
    queryKey: ["/api/stripe/subscription"],
  });

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
  const hasActiveSubscription = subscriptionData?.subscription != null && subscriptionData?.status === "active";

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/portal", {});
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "";
      const isNoSubscription = errorMessage.includes("No subscription") || errorMessage.includes("400");
      toast({
        title: "Billing Portal Unavailable",
        description: isNoSubscription 
          ? "Please subscribe to a plan first to access the billing portal."
          : "Unable to open billing portal. Please try again.",
        variant: "destructive",
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout Error",
        description: error.message || "Unable to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const hasSubscription = subscriptionData?.subscription != null;
  const subscriptionStatus = subscriptionData?.status || "inactive";
  const planName = hasActiveSubscription 
    ? (subscriptionData?.subscription?.items?.data?.[0]?.price?.product?.name || "Pro Plan")
    : (trialInfo.isOnTrial ? `${userData?.subscriptionTier || "Core"} Trial` : "No Plan");

  // Get the plan tier for display
  const tierDisplay = userData?.subscriptionTier 
    ? userData.subscriptionTier.charAt(0).toUpperCase() + userData.subscriptionTier.slice(1)
    : "Core";

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-settings">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <Card className="hover:shadow-glow transition-all duration-base">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            Profile
          </CardTitle>
          <CardDescription>Your personal account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input
                value={user?.firstName || ""}
                disabled
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input
                value={user?.lastName || ""}
                disabled
                data-testid="input-last-name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={user?.email || ""}
              disabled
              data-testid="input-email"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Profile information is managed through your Replit account.
          </p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-glow transition-all duration-base">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Building className="h-4 w-4 text-primary" />
            </div>
            Company
          </CardTitle>
          <CardDescription>Your company settings and details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input
              placeholder="Enter your company name"
              data-testid="input-company-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Industry</Label>
            <Select>
              <SelectTrigger data-testid="select-industry">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="fintech">Fintech</SelectItem>
                <SelectItem value="healthtech">Healthtech</SelectItem>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Current Cash Balance</Label>
            <Input
              type="number"
              placeholder="Enter current cash on hand"
              data-testid="input-cash-balance"
            />
            <p className="text-xs text-muted-foreground">
              Used for runway calculations when bank sync is incomplete
            </p>
          </div>
          <Button data-testid="button-save-company">Save Changes</Button>
        </CardContent>
      </Card>

      <Card className="hover:shadow-glow transition-all duration-base">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            Notifications
          </CardTitle>
          <CardDescription>Configure how you receive alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Channels</h4>
            <div className="flex items-center justify-between">
              <div>
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive alerts via email
                </p>
              </div>
              <Switch
                checked={notifications.email}
                onCheckedChange={(checked) =>
                  setNotifications((n) => ({ ...n, email: checked }))
                }
                data-testid="switch-email"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Slack Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive alerts in Slack
                </p>
              </div>
              <Switch
                checked={notifications.slack}
                onCheckedChange={(checked) =>
                  setNotifications((n) => ({ ...n, slack: checked }))
                }
                data-testid="switch-slack"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>SMS Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive critical alerts via SMS
                </p>
              </div>
              <Switch
                checked={notifications.sms}
                onCheckedChange={(checked) =>
                  setNotifications((n) => ({ ...n, sms: checked }))
                }
                data-testid="switch-sms"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-medium">Alert Types</h4>
            <div className="flex items-center justify-between">
              <div>
                <Label>Runway Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Alert when runway drops below threshold
                </p>
              </div>
              <Switch
                checked={notifications.runwayAlerts}
                onCheckedChange={(checked) =>
                  setNotifications((n) => ({ ...n, runwayAlerts: checked }))
                }
                data-testid="switch-runway-alerts"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Burn Spike Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Alert when burn increases significantly
                </p>
              </div>
              <Switch
                checked={notifications.burnSpikes}
                onCheckedChange={(checked) =>
                  setNotifications((n) => ({ ...n, burnSpikes: checked }))
                }
                data-testid="switch-burn-alerts"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Weekly Digest</Label>
                <p className="text-sm text-muted-foreground">
                  Summary of financial health every Monday
                </p>
              </div>
              <Switch
                checked={notifications.weeklyDigest}
                onCheckedChange={(checked) =>
                  setNotifications((n) => ({ ...n, weeklyDigest: checked }))
                }
                data-testid="switch-weekly-digest"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-glow transition-all duration-base">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            Connected Accounts
          </CardTitle>
          <CardDescription>Manage your financial data sources</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-glass-border/30 rounded-xl bg-glass/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Bank Account</p>
                <p className="text-sm text-muted-foreground">
                  Via Yodlee/Plaid
                </p>
              </div>
            </div>
            <Badge variant="outline">Not Connected</Badge>
          </div>
          <div className="flex items-center justify-between p-4 border border-glass-border/30 rounded-xl bg-glass/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Stripe</p>
                <p className="text-sm text-muted-foreground">Revenue data</p>
              </div>
            </div>
            <Badge variant="glass">Not Connected</Badge>
          </div>
          <div className="flex items-center justify-between p-4 border border-glass-border/30 rounded-xl bg-glass/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">QuickBooks</p>
                <p className="text-sm text-muted-foreground">Accounting data</p>
              </div>
            </div>
            <Badge variant="glass">Not Connected</Badge>
          </div>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => (window.location.href = "/app/connect")}
            data-testid="button-manage-connections"
          >
            Manage Connections
          </Button>
        </CardContent>
      </Card>

      <Card className="hover:shadow-glow transition-all duration-base">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            Subscription
          </CardTitle>
          <CardDescription>Your plan and billing details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Plan */}
          <div className="flex items-center justify-between p-4 bg-glass/30 border border-glass-border/30 rounded-xl">
            <div>
              <p className="font-medium">Current Plan</p>
              <p className="text-sm text-muted-foreground">
                {hasActiveSubscription ? planName : `${tierDisplay} Plan`}
              </p>
            </div>
            <Badge variant={hasActiveSubscription ? "default" : trialInfo.isOnTrial ? "secondary" : "destructive"}>
              {hasActiveSubscription ? "Active" : 
               trialInfo.isOnTrial ? "Trial" : 
               trialInfo.isExpired ? "Expired" : "Inactive"}
            </Badge>
          </div>

          {/* Trial Status */}
          {!hasActiveSubscription && trialInfo.isOnTrial && (
            <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <Clock className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium" data-testid="text-trial-status">
                  {trialInfo.daysRemaining} day{trialInfo.daysRemaining !== 1 ? "s" : ""} left in your trial
                </p>
                <p className="text-sm text-muted-foreground">
                  Upgrade anytime to keep full access to all features.
                </p>
              </div>
            </div>
          )}

          {/* Trial Expired Warning */}
          {!hasActiveSubscription && trialInfo.isExpired && (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="font-medium text-destructive" data-testid="text-trial-expired">
                  Your trial has expired
                </p>
                <p className="text-sm text-muted-foreground">
                  Upgrade now to continue using BlackTop.
                </p>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {hasActiveSubscription 
              ? "Manage your subscription and billing details below."
              : "Your trial includes full access to all features. Upgrade to continue after the trial period."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => (window.location.href = "/pricing")}
              data-testid="button-upgrade"
            >
              {hasActiveSubscription ? "Change Plan" : "Upgrade Now"}
            </Button>
            {hasActiveSubscription && (
              <Button
                variant="outline"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="button-billing-portal"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Billing Portal
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Shield className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sign Out</p>
              <p className="text-sm text-muted-foreground">
                Sign out of your account
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
