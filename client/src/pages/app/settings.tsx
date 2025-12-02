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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
          <div className="flex items-center justify-between p-4 bg-glass/30 border border-glass-border/30 rounded-xl">
            <div>
              <p className="font-medium">Current Plan</p>
              <p className="text-sm text-muted-foreground">Free Trial</p>
            </div>
            <Badge>Active</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Your trial includes full access to all features. Upgrade to continue
            after the trial period.
          </p>
          <Button
            onClick={() => (window.location.href = "/pricing")}
            data-testid="button-upgrade"
          >
            View Plans
          </Button>
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
