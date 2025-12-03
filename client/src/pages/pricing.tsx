import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mainPlans = [
  {
    name: "Blacktop Lite",
    price: "$99",
    period: "month",
    tagline: "Get the basics right. Know your burn, see your runway.",
    label: "Perfect for pre-revenue founders",
    features: [
      "Bank + QuickBooks + Stripe sync",
      "Auto-transaction categorization",
      "Basic burn rate tracking",
      "Basic runway calculation",
      "Subscription detection",
      "One scenario: \"When do I run out?\"",
      "One-page founder snapshot",
      "3 AI action items per month",
      "Email support",
    ],
    omitted: [
      "Hiring planning",
      "Raise planning",
      "Scenario modeling",
      "Board packets",
      "Multi-user access",
    ],
    cta: "Start Free Trial",
    tier: "blacktop-lite",
  },
  {
    name: "Blacktop Core",
    price: "$199",
    period: "month",
    tagline: "Everything you need to raise money and run your finances like a pro.",
    label: "",
    features: [
      "Everything in Lite, plus:",
      "Full financial forecasting",
      "Hiring plan modeling",
      "Raise planning & recommendations",
      "Multi-scenario engine",
      "Department budgets",
      "Investor-ready board packet",
      "Unlimited AI insights",
      "Deep anomaly detection",
      "\"What changed and why\" analysis",
      "Monthly founder health report",
      "3-5 team seats",
      "Priority support",
    ],
    omitted: [],
    cta: "Start Free Trial",
    tier: "blacktop-core",
    popular: true,
  },
  {
    name: "Blacktop Growth",
    price: "$399",
    period: "month",
    tagline: "For scaling teams that need custom insights and automation.",
    label: "",
    features: [
      "Everything in Core, plus:",
      "10 team seats",
      "Custom KPIs & metrics",
      "Custom dashboards",
      "Multi-entity consolidation",
      "Automated monthly board packets",
      "API access",
      "Priority Slack support",
      "AI-drafted investor update narratives",
      "Dedicated onboarding session",
    ],
    omitted: [],
    cta: "Talk to Sales",
    tier: "blacktop-growth",
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
              Know your burn and runway. See where money is going. Show up prepared for investors.
              No CFO required.
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
                  <CardTitle className="text-2xl" data-testid={`text-plan-name-${plan.tier}`}>
                    {plan.name}
                  </CardTitle>
                  <div className="mt-4 mb-2">
                    <span className="text-4xl font-bold" data-testid={`text-price-${plan.tier}`}>
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground text-lg">/{plan.period}</span>
                  </div>
                  <CardDescription className="text-base" data-testid={`text-tagline-${plan.tier}`}>
                    {plan.tagline}
                  </CardDescription>
                  {plan.label && (
                    <p className="text-xs text-muted-foreground mt-2" data-testid={`text-label-${plan.tier}`}>
                      {plan.label}
                    </p>
                  )}
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
                  <a href="/api/login" className="w-full">
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                      data-testid={`button-cta-${plan.tier}`}
                    >
                      {plan.cta}
                    </Button>
                  </a>
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

      <section className="px-6 py-16 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Compare Plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-medium">Feature</th>
                  <th className="text-center py-4 px-4 font-medium">Lite</th>
                  <th className="text-center py-4 px-4 font-medium bg-primary/5">Core</th>
                  <th className="text-center py-4 px-4 font-medium">Growth</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-3 px-4">Bank/QuickBooks/Stripe sync</td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Auto-categorization</td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Burn & Runway</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">Basic</td>
                  <td className="text-center py-3 px-4 bg-primary/5">Full</td>
                  <td className="text-center py-3 px-4">Full</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Scenarios</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">1</td>
                  <td className="text-center py-3 px-4 bg-primary/5">Unlimited</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">AI Insights</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">3/month</td>
                  <td className="text-center py-3 px-4 bg-primary/5">Unlimited</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Hiring Planning</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Raise Planning</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Board Packets</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4">Automated</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Team Seats</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">1</td>
                  <td className="text-center py-3 px-4 bg-primary/5">3-5</td>
                  <td className="text-center py-3 px-4">10</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Custom Dashboards</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">API Access</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Support</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">Email</td>
                  <td className="text-center py-3 px-4 bg-primary/5">Priority</td>
                  <td className="text-center py-3 px-4">Priority Slack</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="border-t px-6 py-12">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2025 BlackTop Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
