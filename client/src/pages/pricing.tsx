import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mainPlans = [
  {
    name: "Founder Lite",
    price: "$39",
    period: "month",
    tagline: "Early-stage financial clarity without the complexity.",
    label: "For solo founders and tiny teams",
    features: [
      "PDF & invoice ingestion",
      "Automatic transaction normalization",
      "Core spend diagnostics (burn, vendors, subscriptions)",
      "Basic budget builder (single scenario)",
      "3 monthly AI-generated action insights",
    ],
    cta: "Start Free Trial",
    tier: "founder-lite",
  },
  {
    name: "Startup Clarity",
    price: "$119",
    period: "month",
    tagline: "Everything you need to see burn, runway, and where to cut or invest.",
    label: "",
    features: [
      "Everything in Founder Lite, plus:",
      "Full diagnostics suite (categories, vendors, trends)",
      "Vendor & payroll checks",
      "Multi-scenario budgets (lean, baseline, growth)",
      "Runway calculations",
      "Unlimited AI-generated action plans",
      "Up to 3 team seats (founder, ops, finance helper)",
    ],
    cta: "Start Free Trial",
    tier: "startup-clarity",
    popular: true,
  },
  {
    name: "SMB Intelligence",
    price: "$289",
    period: "month",
    tagline: "Pre-CFO financial intelligence for growing teams.",
    label: "",
    features: [
      "Everything in Startup Clarity, plus:",
      "90-day cash flow forecasting module",
      "Multi-department budgets & tracking",
      "Project / client profitability views",
      "Vendor benchmarking and high-cost alerts",
      "Up to 10 user seats",
    ],
    cta: "Talk to Sales",
    tier: "smb-intelligence",
  },
];

const addon = {
  name: "Fundraise-Ready Add-On",
  priceOptions: [
    { amount: "$49", type: "one-time" },
    { amount: "$19", type: "month" },
  ],
  tagline: "Turn your numbers into an investor-ready story.",
  note: "Can be added to any plan.",
  features: [
    "Investor metrics dashboard (burn, runway, raise needs)",
    '"How much should we raise?" scenario model',
    "AI-generated investor prep packet (summary + charts)",
    "Basic pitch review using your financials",
  ],
  cta: "Add to Plan",
  tier: "fundraise-addon",
};

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
              Know your burn and runway. See where money is going. Decide what to cut or double down on. 
              Show up prepared for investors.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {mainPlans.map((plan) => (
              <Card 
                key={plan.tier} 
                className={`hover-elevate transition-all flex flex-col relative ${
                  plan.popular ? "border-primary shadow-lg" : ""
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

          <div className="max-w-3xl mx-auto">
            <Card className="hover-elevate transition-all border-accent" data-testid="card-addon-fundraise">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Rocket className="h-6 w-6 text-accent" />
                  <Badge variant="outline" className="border-accent text-accent" data-testid="badge-addon">
                    Add-On
                  </Badge>
                </div>
                <CardTitle className="text-2xl" data-testid="text-addon-name">
                  {addon.name}
                </CardTitle>
                <div className="mt-4 mb-2 flex items-baseline gap-3">
                  <div>
                    <span className="text-3xl font-bold" data-testid="text-addon-price-onetime">
                      {addon.priceOptions[0].amount}
                    </span>
                    <span className="text-muted-foreground"> {addon.priceOptions[0].type}</span>
                  </div>
                  <span className="text-muted-foreground">or</span>
                  <div>
                    <span className="text-3xl font-bold" data-testid="text-addon-price-monthly">
                      {addon.priceOptions[1].amount}
                    </span>
                    <span className="text-muted-foreground">/{addon.priceOptions[1].type}</span>
                  </div>
                </div>
                <CardDescription className="text-base" data-testid="text-addon-tagline">
                  {addon.tagline}
                </CardDescription>
                <p className="text-xs text-muted-foreground mt-2" data-testid="text-addon-note">
                  {addon.note}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {addon.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2" data-testid={`feature-addon-${idx}`}>
                      <Check className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <a href="/api/login" className="w-full">
                  <Button
                    className="w-full"
                    variant="outline"
                    data-testid="button-cta-addon"
                  >
                    {addon.cta}
                  </Button>
                </a>
              </CardFooter>
            </Card>
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
