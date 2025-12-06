import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, CreditCard, Landmark, Check, ArrowRight, Sparkles, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const companyInfoSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyIndustry: z.string().min(1, "Industry is required"),
  companyStage: z.string().min(1, "Company stage is required"),
  companyRevenueRange: z.string().min(1, "Revenue range is required"),
});

type CompanyInfoForm = z.infer<typeof companyInfoSchema>;

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  hasCompletedOnboarding: boolean;
  hasSelectedPlan: boolean;
  hasCompanyInfo: boolean;
  hasConnectedBank: boolean;
  companyName: string | null;
  companyIndustry: string | null;
  companyStage: string | null;
  companyRevenueRange: string | null;
}

type OnboardingStep = "welcome" | "plan" | "company" | "bank" | "complete";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    if (user) {
      if (user.hasCompletedOnboarding) {
        setLocation("/app");
      } else if (user.hasConnectedBank) {
        setCurrentStep("complete");
      } else if (user.hasCompanyInfo) {
        setCurrentStep("bank");
      } else if (user.hasSelectedPlan) {
        setCurrentStep("company");
      } else {
        setCurrentStep("welcome");
      }
    }
  }, [user, setLocation]);

  const form = useForm<CompanyInfoForm>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: {
      companyName: user?.companyName || "",
      companyIndustry: user?.companyIndustry || "",
      companyStage: user?.companyStage || "",
      companyRevenueRange: user?.companyRevenueRange || "",
    },
  });

  const updateOnboardingMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      return await apiRequest("POST", "/api/onboarding/update", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveCompanyInfoMutation = useMutation({
    mutationFn: async (data: CompanyInfoForm) => {
      return await apiRequest("POST", "/api/onboarding/company-info", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Company info saved",
        description: "Now let's connect your bank account.",
      });
      setCurrentStep("bank");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/onboarding/complete", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome to BlackTop!",
        description: "Your account is ready. Redirecting to dashboard...",
      });
      setTimeout(() => {
        setLocation("/app");
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectPlanMutation = useMutation({
    mutationFn: async (tier: string) => {
      return await apiRequest("POST", "/api/user/subscription", { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
      toast({
        title: "Plan selected",
        description: "Now let's set up your company info.",
      });
      setCurrentStep("company");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectPlan = (tier: string) => {
    selectPlanMutation.mutate(tier);
  };

  const handleConnectBank = () => {
    setLocation("/app/connect?onboarding=true");
  };

  const onSubmitCompanyInfo = (data: CompanyInfoForm) => {
    saveCompanyInfoMutation.mutate(data);
  };

  const getStepProgress = () => {
    switch (currentStep) {
      case "welcome": return 0;
      case "plan": return 25;
      case "company": return 50;
      case "bank": return 75;
      case "complete": return 100;
      default: return 0;
    }
  };

  const stepLabels = ["Welcome", "Plan", "Company", "Connect", "Ready"];
  const currentStepIndex = ["welcome", "plan", "company", "bank", "complete"].indexOf(currentStep);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex justify-center mb-8">
          <img 
            src="/logo.png" 
            alt="BlackTop Systems" 
            className="h-8 object-contain" 
          />
        </div>

        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {stepLabels.map((label, index) => (
              <span 
                key={label}
                className={`text-xs font-medium ${
                  index <= currentStepIndex ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          <Progress value={getStepProgress()} className="h-2" />
        </div>

        {currentStep === "welcome" && (
          <Card className="border-2 border-primary/20">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-welcome-title">
                Welcome to BlackTop, {user?.firstName || "there"}!
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Your financial autopilot is ready for setup. In the next few steps, we'll get you connected and running.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-primary/10">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Choose your plan</h4>
                    <p className="text-sm text-muted-foreground">Pick the tier that fits your needs</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Tell us about your company</h4>
                    <p className="text-sm text-muted-foreground">So we can tailor your experience</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Landmark className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Connect your accounts</h4>
                    <p className="text-sm text-muted-foreground">Bank, QuickBooks, or Stripe</p>
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={() => setCurrentStep("plan")}
                data-testid="button-get-started"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {currentStep === "plan" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                <CreditCard className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-plan-title">
                Start Your 7-Day Free Trial
              </CardTitle>
              <CardDescription className="text-base">
                Try any plan free for 7 days. No credit card required. Upgrade anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div 
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/20 hover-elevate cursor-pointer"
                  onClick={() => handleSelectPlan("lite")}
                  data-testid="card-plan-lite-onboarding"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Blacktop Lite</h4>
                      <Badge variant="secondary">$99/mo</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Dashboard, charts, AI insights — see your money clearly
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                
                <div 
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-primary hover-elevate cursor-pointer relative"
                  onClick={() => handleSelectPlan("core")}
                  data-testid="card-plan-core-onboarding"
                >
                  <Badge className="absolute -top-3 left-4 bg-primary text-primary-foreground">
                    Recommended
                  </Badge>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Blacktop Core</h4>
                      <Badge variant="secondary">$199/mo</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      AI Copilot, scenario modeling, raise planning, board packets
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>

                <div 
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/20 hover-elevate cursor-pointer"
                  onClick={() => window.location.href = "mailto:sales@blacktop.systems?subject=Blacktop Growth Inquiry"}
                  data-testid="card-plan-growth-onboarding"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Blacktop Growth</h4>
                      <Badge variant="outline">Contact Sales</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unlimited seats, custom KPIs, API access, dedicated support
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => handleSelectPlan("lite")}
                data-testid="button-start-trial"
              >
                Start with Lite (7-day free trial)
              </Button>
            </CardContent>
          </Card>
        )}

        {currentStep === "company" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-company-title">
                About Your Company
              </CardTitle>
              <CardDescription className="text-base">
                This helps us personalize your experience and insights.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCompanyInfo)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Acme Inc." data-testid="input-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyIndustry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-industry">
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="saas">SaaS / Software</SelectItem>
                            <SelectItem value="fintech">Fintech</SelectItem>
                            <SelectItem value="ecommerce">E-commerce</SelectItem>
                            <SelectItem value="healthcare">Healthcare</SelectItem>
                            <SelectItem value="marketplace">Marketplace</SelectItem>
                            <SelectItem value="consumer">Consumer</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyStage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stage</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-stage">
                              <SelectValue placeholder="Select stage" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pre-seed">Pre-Seed</SelectItem>
                            <SelectItem value="seed">Seed</SelectItem>
                            <SelectItem value="series-a">Series A</SelectItem>
                            <SelectItem value="series-b">Series B</SelectItem>
                            <SelectItem value="growth">Growth</SelectItem>
                            <SelectItem value="profitable">Profitable / Bootstrapped</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyRevenueRange"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Revenue</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-revenue">
                              <SelectValue placeholder="Select range" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pre-revenue">Pre-revenue</SelectItem>
                            <SelectItem value="0-100k">$0 - $100K</SelectItem>
                            <SelectItem value="100k-1m">$100K - $1M</SelectItem>
                            <SelectItem value="1m-10m">$1M - $10M</SelectItem>
                            <SelectItem value="10m+">$10M+</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={saveCompanyInfoMutation.isPending}
                    data-testid="button-save-company"
                  >
                    {saveCompanyInfoMutation.isPending ? "Saving..." : "Continue"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {currentStep === "bank" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                <Landmark className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-bank-title">
                Connect Your Accounts
              </CardTitle>
              <CardDescription className="text-base">
                Securely link your bank, QuickBooks, or Stripe to get real-time insights.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div 
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/20 hover-elevate cursor-pointer"
                  onClick={handleConnectBank}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-primary/10">
                      <Landmark className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Bank Account</h4>
                      <p className="text-sm text-muted-foreground">
                        Connect via Plaid for instant transaction sync
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={handleConnectBank}
                data-testid="button-connect-bank"
              >
                Connect Bank Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setCurrentStep("complete")}
                data-testid="button-skip-bank"
              >
                Skip for now
              </Button>
            </CardContent>
          </Card>
        )}

        {currentStep === "complete" && (
          <Card className="border-2 border-green-500/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-green-500/10 w-fit">
                <Check className="h-10 w-10 text-green-500" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-complete-title">
                You're All Set!
              </CardTitle>
              <CardDescription className="text-base">
                Your BlackTop dashboard is ready. Let's take a look at your financials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <Check className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">Account created</h4>
                    <p className="text-sm text-muted-foreground">Your profile is ready</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <Target className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">Personalized for you</h4>
                    <p className="text-sm text-muted-foreground">Insights tailored to your company</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">Ready for insights</h4>
                    <p className="text-sm text-muted-foreground">Connect data sources anytime</p>
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={() => completeOnboardingMutation.mutate()}
                disabled={completeOnboardingMutation.isPending}
                data-testid="button-go-to-dashboard"
              >
                {completeOnboardingMutation.isPending ? "Setting up..." : "Go to Dashboard"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
