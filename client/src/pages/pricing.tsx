import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, Users, Zap, Building2, ArrowRight, Shield, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" }
};

const mainPlans = [
  {
    name: "Blacktop Lite",
    price: "$99",
    period: "month",
    tagline: "See your money clearly. No spreadsheets, no CFO required.",
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
    cta: "Start Free Trial",
    tier: "lite",
  },
  {
    name: "Blacktop Core",
    price: "$199",
    period: "month",
    tagline: "Proactive insights that interrupt you with truth. Your financial co-pilot.",
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
    cta: "Start Free Trial",
    tier: "core",
    popular: true,
  },
  {
    name: "Blacktop Growth",
    price: null,
    period: null,
    tagline: "Scale your finance ops. Unlimited access, dedicated support.",
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
    cta: "Contact Sales",
    tier: "growth",
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="px-6 py-16 md:py-20">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            className="text-center mb-12"
            {...fadeInUp}
          >
            <div className="flex items-center justify-center gap-2 mb-6">
              <Badge variant="outline" className="px-4 py-1.5 text-sm font-medium">
                <Clock className="w-3.5 h-3.5 mr-2 text-primary" />
                3-Minute Setup
              </Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent" data-testid="heading-pricing">
              Simple Pricing. Instant Value.
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From messy financial chaos to investor-ready clarity. No spreadsheets, no CFO fees, no 5-hour onboarding. Just connect and know.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-8 mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
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
                      <span className="text-3xl font-bold text-primary whitespace-nowrap" data-testid={`text-price-${plan.tier}`}>
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
          </motion.div>

          {/* Trial Info */}
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="bg-muted/50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">7-day free trial. No credit card required.</h3>
              <p className="text-sm text-muted-foreground">
                Connect your accounts in minutes and see your burn rate, runway, and AI insights instantly.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="px-6 py-12 bg-muted/30">
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex flex-wrap justify-center gap-8 mb-6">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Bank-Grade Security</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">SOC 2 Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">256-bit Encryption</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Your data is encrypted at rest and in transit. We never store your bank credentials—all connections are handled securely through Plaid.
          </p>
        </motion.div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl font-bold mb-4">Ready to Know Your Numbers?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join founders who spend minutes, not hours, understanding their finances.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/api/login">
              <Button size="lg" className="group w-full sm:w-auto" data-testid="button-start-trial">
                Start Free Trial
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Link href="/demo/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="button-explore-demo">
                Explore Demo First
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

    </div>
  );
}
