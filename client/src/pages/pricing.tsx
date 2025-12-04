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
      "Dashboard with burn & runway",
      "Spend trends & revenue charts",
      "AI-generated insights (3-5 per sync)",
      "Subscription detection",
      "Email support",
    ],
    omitted: [
      "AI Copilot chat",
      "Scenario modeling",
      "Hiring & raise planning",
      "Board packets",
      "Team access",
    ],
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
      "AI Copilot chat interface",
      "Scenario modeling workbook",
      "Hiring planning with runway impact",
      "Raise planning & recommendations",
      "Investor-ready board packets",
      "Shareable financial reports",
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
      "Unlimited team members",
      "Custom KPIs & dashboards",
      "Multi-entity consolidation",
      "Automated monthly board packets",
      "API access",
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
                  <td className="py-3 px-4 font-medium" colSpan={4}>Data Connections</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Bank / QuickBooks / Stripe sync</td>
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
                  <td className="py-3 px-4 font-medium" colSpan={4}>Dashboard & Insights</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Burn & Runway Dashboard</td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Spend & Revenue Charts</td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">AI Insights</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">3-5 per sync</td>
                  <td className="text-center py-3 px-4 bg-primary/5">Unlimited</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium" colSpan={4}>AI & Planning</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">AI Copilot Chat</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Scenario Modeling</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
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
                  <td className="py-3 px-4">Anomaly Detection & Alerts</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium" colSpan={4}>Reporting & Collaboration</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Investor Board Packets</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4">Automated</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Shareable Reports</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Team Seats</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">1</td>
                  <td className="text-center py-3 px-4 bg-primary/5">2-3</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium" colSpan={4}>Growth Features</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Custom KPIs & Dashboards</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Multi-Entity Consolidation</td>
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
                  <td className="py-3 px-4">AI Investor Update Drafts</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium" colSpan={4}>Support</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Support Level</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">Email</td>
                  <td className="text-center py-3 px-4 bg-primary/5">Priority</td>
                  <td className="text-center py-3 px-4">Priority Slack</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Dedicated Onboarding</td>
                  <td className="text-center py-3 px-4"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4 bg-primary/5"><X className="w-5 h-5 text-muted-foreground/50 mx-auto" /></td>
                  <td className="text-center py-3 px-4"><Check className="w-5 h-5 text-primary mx-auto" /></td>
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
