import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const plans = [
  {
    name: "Starter",
    price: "$49",
    period: "month",
    title: "Founder clarity fast",
    description: "PDF & invoice ingestion with core spend diagnostics",
    features: [
      "PDF & invoice ingestion",
      "Core spend diagnostics",
      "Basic budget builder",
      "3 action insights",
      "Founder clarity fast",
    ],
    detailedFeatures: {
      included: [
        "Upload and process PDF invoices and bank statements",
        "Core spending pattern diagnostics to identify trends",
        "Build basic monthly budgets with category tracking",
        "Receive 3 AI-powered action insights each month",
        "Fast clarity dashboard for solo founders",
        "Email support",
      ],
      notIncluded: [
        "Team collaboration (3+ users)",
        "Vendor benchmarking",
        "Payroll analysis",
        "Scenario planning",
        "Forecasting module",
      ],
    },
    cta: "Start Free Trial",
    tier: "starter",
  },
  {
    name: "Team Pro",
    price: "$129",
    period: "month",
    title: "Full diagnostics suite",
    description: "3 team seats with vendor checks and unlimited action plans",
    features: [
      "Everything in Starter, plus:",
      "Full diagnostics suite",
      "Vendor & payroll checks",
      "Scenario budgets + runway",
      "Unlimited action plans",
      "3 team seats",
    ],
    detailedFeatures: {
      included: [
        "Everything in Starter, plus:",
        "Full financial diagnostics with advanced analytics",
        "Vendor spending analysis and duplicate detection",
        "Payroll expense tracking and optimization",
        "Build multiple scenario budgets (best/worst/expected case)",
        "Runway calculations and burn rate tracking",
        "Unlimited AI-powered action plans and insights",
        "3 collaborative team seats (founder, ops, accountant)",
        "Priority email support",
      ],
      notIncluded: [
        "More than 3 user seats",
        "Multi-department budgets",
        "Advanced 12-month forecasting",
        "Vendor benchmarking against industry peers",
      ],
    },
    cta: "Start Free Trial",
    tier: "team-pro",
    popular: true,
  },
  {
    name: "SMB Intelligence",
    price: "$249",
    period: "month",
    title: "Full forecasting module",
    description: "10 seats with multi-department budgets and benchmarking",
    features: [
      "Everything in Team Pro, plus:",
      "Full forecasting module",
      "Multi-department budgets",
      "Vendor benchmarking",
      "Advanced action plans",
      "10 user seats",
    ],
    detailedFeatures: {
      included: [
        "Everything in Team Pro, plus:",
        "Complete financial forecasting with 12-month projections",
        "Multi-department budget allocation and tracking",
        "Vendor spend benchmarking against industry averages",
        "Advanced action plans with priority scoring and dependencies",
        "10 collaborative user seats across your organization",
        "Department-level cost center tracking",
        "Custom financial dashboards",
        "Dedicated account manager",
        "Phone & Slack support",
      ],
      notIncluded: [],
    },
    cta: "Start Free Trial",
    tier: "smb-intelligence",
  },
];

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 py-5 backdrop-blur-md bg-background/90">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <img 
              src="/logo.png" 
              alt="BlackTop Systems" 
              className="h-8 object-contain hover:scale-105 transition-transform cursor-pointer" 
            />
          </Link>
          <div className="flex items-center gap-4">
            <a href="/api/login">
              <Button data-testid="button-login">Sign In</Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
            <p className="text-lg text-muted-foreground">
              Choose the plan that fits your business needs. Click any plan to learn more.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <Card 
                key={plan.tier} 
                className="hover-elevate transition-all cursor-pointer"
                onClick={() => setSelectedPlan(plan)}
                data-testid={`card-plan-${plan.tier}`}
              >
                {plan.popular && (
                  <div className="px-6 pt-4">
                    <Badge className="mb-2" data-testid={`badge-popular-${plan.tier}`}>Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-4 border-t">
                    <Button 
                      variant="ghost" 
                      className="w-full text-sm"
                      data-testid={`button-learn-more-${plan.tier}`}
                    >
                      Click to see full details →
                    </Button>
                  </div>
                </CardContent>
                <CardFooter>
                  <a href="/api/login" className="w-full" onClick={(e) => e.stopPropagation()}>
                    <Button
                      className="w-full"
                      variant="default"
                      data-testid={`button-select-${plan.tier}`}
                    >
                      {plan.cta}
                    </Button>
                  </a>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Dialog open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-plan-details">
          {selectedPlan && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between mb-2">
                  <DialogTitle className="text-3xl">{selectedPlan.name}</DialogTitle>
                  {selectedPlan.popular && <Badge>Most Popular</Badge>}
                </div>
                <div className="flex items-baseline gap-2 my-4">
                  <span className="text-5xl font-bold">{selectedPlan.price}</span>
                  <span className="text-xl text-muted-foreground">/{selectedPlan.period}</span>
                </div>
                <DialogDescription className="text-base">
                  {selectedPlan.title}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">What's included:</h3>
                  <ul className="space-y-3">
                    {selectedPlan.detailedFeatures.included.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-base">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Not included:</h3>
                  <ul className="space-y-3">
                    {selectedPlan.detailedFeatures.notIncluded.length > 0 ? (
                      selectedPlan.detailedFeatures.notIncluded.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <X className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-base text-muted-foreground">{feature}</span>
                        </li>
                      ))
                    ) : (
                      <li className="flex items-start gap-3">
                        <X className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="text-base text-muted-foreground">
                          This is our most comprehensive plan. Contact sales for custom add-ons or enterprise needs.
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="pt-4 border-t">
                  <a href="/api/login" className="block">
                    <Button 
                      className="w-full" 
                      size="lg" 
                      data-testid="button-select-plan-dialog"
                    >
                      {selectedPlan.cta}
                    </Button>
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <footer className="border-t px-6 py-12">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2025 BlackTop Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
