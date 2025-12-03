import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const plans = [
  {
    name: "Lite",
    price: "$99",
    period: "month",
    tagline: "Know your burn, see your runway",
    label: "Perfect for pre-revenue founders",
    features: [
      "Bank + QuickBooks + Stripe sync",
      "Auto-transaction categorization",
      "Basic burn rate tracking",
      "Basic runway calculation",
      "Subscription detection",
      "One scenario model",
      "3 AI insights per month",
      "Email support",
    ],
    omitted: ["Hiring planning", "Raise planning", "Scenario modeling", "Board packets"],
    cta: "Start Free Trial",
    tier: "lite",
  },
  {
    name: "Core",
    price: "$199",
    period: "month",
    tagline: "Everything to raise and run like a pro",
    features: [
      "Everything in Lite, plus:",
      "Full financial forecasting",
      "Hiring plan modeling",
      "Raise planning",
      "Multi-scenario engine",
      "Department budgets",
      "Investor-ready board packet",
      "Unlimited AI insights",
      "3-5 team seats",
      "Priority support",
    ],
    omitted: [],
    cta: "Start Free Trial",
    tier: "core",
    popular: true,
  },
  {
    name: "Growth",
    price: "$399",
    period: "month",
    tagline: "Custom insights and automation",
    features: [
      "Everything in Core, plus:",
      "10 team seats",
      "Custom KPIs & metrics",
      "Custom dashboards",
      "Multi-entity consolidation",
      "Automated board packets",
      "API access",
      "Priority Slack support",
      "Dedicated onboarding",
    ],
    omitted: [],
    cta: "Talk to Sales",
    tier: "growth",
  },
];

const comparisonRows = [
  { feature: "Bank/QuickBooks/Stripe sync", lite: true, core: true, growth: true },
  { feature: "Auto-categorization", lite: true, core: true, growth: true },
  { feature: "Burn & Runway", lite: "Basic", core: "Full", growth: "Full" },
  { feature: "Scenarios", lite: "1", core: "Unlimited", growth: "Unlimited" },
  { feature: "AI Insights", lite: "3/mo", core: "Unlimited", growth: "Unlimited" },
  { feature: "Hiring Planning", lite: false, core: true, growth: true },
  { feature: "Raise Planning", lite: false, core: true, growth: true },
  { feature: "Board Packets", lite: false, core: true, growth: "Automated" },
  { feature: "Team Seats", lite: "1", core: "3-5", growth: "10" },
  { feature: "Custom Dashboards", lite: false, core: false, growth: true },
  { feature: "API Access", lite: false, core: false, growth: true },
  { feature: "Support", lite: "Email", core: "Priority", growth: "Slack" },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4" data-testid="heading-pricing">
              Simple Pricing
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Know your burn and runway. No CFO required.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-6 mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {plans.map((plan, index) => (
              <motion.div
                key={plan.tier}
                className={`relative flex flex-col p-8 rounded-2xl border transition-all duration-300 ${
                  plan.popular 
                    ? "border-primary/50 bg-primary/[0.02]" 
                    : "border-border/50 bg-card/30 hover:border-border hover:bg-card/50"
                }`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
                data-testid={`card-plan-${plan.tier}`}
              >
                {plan.popular && (
                  <Badge 
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1"
                    data-testid="badge-most-popular"
                  >
                    Most Popular
                  </Badge>
                )}
                
                <div className="mb-6">
                  <h2 className="text-xl font-medium mb-1" data-testid={`text-plan-name-${plan.tier}`}>
                    {plan.name}
                  </h2>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-semibold" data-testid={`text-price-${plan.tier}`}>
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid={`text-tagline-${plan.tier}`}>
                    {plan.tagline}
                  </p>
                  {plan.label && (
                    <p className="text-xs text-muted-foreground/70 mt-1">{plan.label}</p>
                  )}
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm" data-testid={`feature-${plan.tier}-${idx}`}>
                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.omitted.length > 0 && (
                  <div className="mb-8 pt-4 border-t border-border/30">
                    <p className="text-xs text-muted-foreground/70 mb-2 uppercase tracking-wide">Not included</p>
                    <ul className="space-y-2">
                      {plan.omitted.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground/60">
                          <X className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <a href="/api/login" className="mt-auto">
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    data-testid={`button-cta-${plan.tier}`}
                  >
                    {plan.cta}
                  </Button>
                </a>
              </motion.div>
            ))}
          </motion.div>

          <motion.div 
            className="max-w-2xl mx-auto text-center mb-24"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="p-6 rounded-xl border border-border/30 bg-muted/30">
              <p className="font-medium mb-1">14-day free trial on all plans</p>
              <p className="text-sm text-muted-foreground">
                No credit card required. See your financial health in minutes.
              </p>
            </div>
          </motion.div>

          <motion.section
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold text-center mb-8">Compare Plans</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-4 px-4 font-medium">Feature</th>
                    <th className="text-center py-4 px-4 font-medium w-28">Lite</th>
                    <th className="text-center py-4 px-4 font-medium w-28 bg-primary/5 rounded-t-lg">Core</th>
                    <th className="text-center py-4 px-4 font-medium w-28">Growth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {comparisonRows.map((row, index) => (
                    <tr key={index} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground">{row.feature}</td>
                      <td className="text-center py-3 px-4">
                        {row.lite === true ? <Check className="w-4 h-4 text-primary mx-auto" /> :
                         row.lite === false ? <X className="w-4 h-4 text-muted-foreground/30 mx-auto" /> :
                         <span className="text-muted-foreground">{row.lite}</span>}
                      </td>
                      <td className="text-center py-3 px-4 bg-primary/5">
                        {row.core === true ? <Check className="w-4 h-4 text-primary mx-auto" /> :
                         row.core === false ? <X className="w-4 h-4 text-muted-foreground/30 mx-auto" /> :
                         <span>{row.core}</span>}
                      </td>
                      <td className="text-center py-3 px-4">
                        {row.growth === true ? <Check className="w-4 h-4 text-primary mx-auto" /> :
                         row.growth === false ? <X className="w-4 h-4 text-muted-foreground/30 mx-auto" /> :
                         <span className="text-muted-foreground">{row.growth}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        </div>
      </section>
    </div>
  );
}
