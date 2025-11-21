import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import logoUrl from "@assets/generated_images/minimalist_blacktop_systems_logo.png";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "month",
    description: "Perfect for solo founders and small teams",
    features: [
      "Up to 100 transactions/month",
      "Basic document upload (PDF, CSV)",
      "AI-powered transaction extraction",
      "Basic spend analytics",
      "1 user",
    ],
    cta: "Get Started",
    tier: "free",
  },
  {
    name: "Professional",
    price: "$49",
    period: "month",
    description: "For growing businesses that need deeper insights",
    features: [
      "Unlimited transactions",
      "All document types (PDF, CSV, Images)",
      "Advanced AI diagnostics",
      "Budget builder with AI suggestions",
      "Financial insights & action plans",
      "Up to 5 users",
      "Stripe subscription tracking",
    ],
    cta: "Start Free Trial",
    tier: "professional",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "$199",
    period: "month",
    description: "For established companies with complex needs",
    features: [
      "Everything in Professional",
      "Unlimited users",
      "Bank integrations (Plaid)",
      "Accounting software sync (QuickBooks, Xero)",
      "Custom vendor benchmarking",
      "Priority support",
      "Multi-currency support",
    ],
    cta: "Contact Sales",
    tier: "enterprise",
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 py-5 backdrop-blur-md bg-background/90">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="relative w-9 h-9 flex items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 p-1.5 ring-1 ring-primary/20">
                <img 
                  src={logoUrl} 
                  alt="BlackTop Systems" 
                  className="w-full h-full object-contain transition-transform group-hover:scale-110" 
                />
              </div>
              <span className="text-xl font-semibold tracking-tight">BlackTop Systems</span>
            </div>
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
              Choose the plan that fits your business needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <Card key={plan.tier} className={plan.popular ? "border-primary" : ""}>
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
                </CardContent>
                <CardFooter>
                  <a href="/api/login" className="w-full">
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
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

      <footer className="border-t px-6 py-12">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2025 BlackTop Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
