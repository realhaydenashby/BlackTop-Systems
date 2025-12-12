import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, X, Users, Zap, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mainPlans = [
  {
    name: "Blacktop Lite",
    price: "$99",
    period: "month",
    tagline: "See your money clearly. Know your burn and runway at a glance.",
    seats: "1 seat",
    icon: Zap,
    features: [
      "Connect bank, QuickBooks & Stripe",
      "Auto-categorized transactions",
      "Spend trends & revenue charts",
      "AI-generated insights (3-5 per sync)",
      "Subscription detection",
      "Email support",
    ],
    omitted: [],
    cta: "Start Free Trial",
    tier: "lite",
  },
  {
    name: "Blacktop Core",
    price: "$199",
    period: "month",
    tagline: "Plan, model, and show up prepared for investors. Your financial copilot.",
    seats: "2-3 seats",
    icon: Users,
    features: [
      "Everything in Lite, plus:",
      "SaaS Metrics Dashboard (CAC, LTV, MRR)",
      "Spend Classification Review Queue",
      "Manual CAC/LTV metric overrides",
      "Scenario modeling workbook",
      "Fundraising suite",
      "Anomaly detection & alerts",
      "Department budgets",
      "Priority support",
    ],
    omitted: [],
    cta: "Start Free Trial",
    tier: "core",
    popular: true,
  },
  {
    name: "Blacktop Growth",
    price: null,
    period: null,
    tagline: "Scale your finance ops with unlimited access and dedicated support.",
    seats: "Unlimited seats",
    icon: Building2,
    features: [
      "Everything in Core, plus:",
      "AI Copilot chat interface",
      "Investor-ready board packets",
      "Hiring ROI Projections (CAC/LTV impact)",
      "Unlimited team members",
      "Automated monthly board packets",
      "Priority Slack support",
      "AI-drafted investor updates",
      "Dedicated onboarding session",
    ],
    omitted: [],
    cta: "Contact Sales",
    tier: "growth",
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4" data-testid="heading-pricing">
              Simple, Transparent Pricing
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From visibility to full financial command. Choose the plan that fits your stage.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {mainPlans.map((plan) => (
              <Card 
                key={plan.tier} 
                className={`hover-elevate transition-all flex flex-col relative ${
                  plan.popular ? "border-primary shadow-lg scale-105" : ""
                }`}
                data-testid={`card-plan-${plan.tier}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="px-4 py-1 bg-primary text-primary-foreground" data-testid="badge-most-popular">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <plan.icon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-2xl" data-testid={`text-plan-name-${plan.tier}`}>
                      {plan.name}
                    </CardTitle>
                  </div>
                  <div className="mt-4 mb-2">
                    {plan.price ? (
                      <>
                        <span className="text-4xl font-bold" data-testid={`text-price-${plan.tier}`}>
                          {plan.price}
                        </span>
                        <span className="text-muted-foreground text-lg">/{plan.period}</span>
                      </>
                    ) : (
                      <span className="text-3xl font-bold text-primary" data-testid={`text-price-${plan.tier}`}>
                        Contact Sales
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                    <Users className="w-4 h-4" />
                    <span>{plan.seats}</span>
                  </div>
                  <CardDescription className="text-base" data-testid={`text-tagline-${plan.tier}`}>
                    {plan.tagline}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pb-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2" data-testid={`feature-${plan.tier}-${idx}`}>
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.omitted && plan.omitted.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Not included:</p>
                      <ul className="space-y-2">
                        {plan.omitted.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-muted-foreground">
                            <X className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-50" />
                            <span className="text-xs">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  {plan.tier === "growth" ? (
                    <a href="mailto:sales@blacktop.systems" className="w-full">
                      <Button
                        className="w-full"
                        variant="outline"
                        data-testid={`button-cta-${plan.tier}`}
                      >
                        {plan.cta}
                      </Button>
                    </a>
                  ) : (
                    <a href="/api/login" className="w-full">
                      <Button
                        className="w-full"
                        variant={plan.popular ? "default" : "outline"}
                        data-testid={`button-cta-${plan.tier}`}
                      >
                        {plan.cta}
                      </Button>
                    </a>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-muted/50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">All plans include a 14-day free trial</h3>
              <p className="text-sm text-muted-foreground">
                No credit card required. Connect your accounts and see your financial health in minutes.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
