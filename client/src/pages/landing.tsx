import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  Zap, 
  Brain, 
  BarChart3, 
  FileText, 
  Shield, 
  Clock, 
  TrendingUp,
  Users,
  Building2,
  Check,
  Sparkles,
  Target,
  Bell,
  Calendar,
  DollarSign,
  PieChart
} from "lucide-react";
import { SiPlaid, SiQuickbooks, SiStripe, SiXero } from "react-icons/si";
import { motion } from "framer-motion";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const integrations = [
  { icon: SiPlaid, name: "Plaid", color: "text-emerald-500" },
  { icon: SiQuickbooks, name: "QuickBooks", color: "text-green-600" },
  { icon: SiStripe, name: "Stripe", color: "text-purple-500" },
  { icon: SiXero, name: "Xero", color: "text-sky-500" },
];

const coreFeatures = [
  {
    icon: Zap,
    title: "60-Second Setup",
    description: "Connect your bank via Plaid or QuickBooks. Your financial picture loads instantly—no spreadsheets, no manual entry.",
    highlight: "Instant"
  },
  {
    icon: Brain,
    title: "AI-Powered Insights",
    description: "Our AI analyzes every transaction, spots anomalies, and generates 3-5 actionable insights every sync. Know your burn, runway, and risks automatically.",
    highlight: "Smart"
  },
  {
    icon: BarChart3,
    title: "Scenario Modeling",
    description: "Plan hires, model fundraising scenarios, and forecast 12 months ahead. See how decisions impact your runway before you make them.",
    highlight: "Plan"
  },
  {
    icon: FileText,
    title: "Investor-Ready Reports",
    description: "Generate board packets and investor updates in one click. AI drafts the narrative—you just review and send.",
    highlight: "Share"
  },
];

const detailedFeatures = [
  {
    category: "Financial Visibility",
    items: [
      { icon: DollarSign, title: "Burn & Runway Dashboard", description: "Real-time view of your cash position and months of runway" },
      { icon: PieChart, title: "Spend Analytics", description: "Category and department breakdowns with trend analysis" },
      { icon: TrendingUp, title: "Revenue Tracking", description: "Track MRR, growth rates, and customer cohorts" },
      { icon: Clock, title: "Subscription Detection", description: "Automatically identify recurring vendors and commitments" },
    ]
  },
  {
    category: "AI & Planning",
    items: [
      { icon: Sparkles, title: "AI Copilot Chat", description: "Ask questions about your finances in plain English" },
      { icon: Target, title: "Scenario Workbook", description: "Model conservative, base, and aggressive forecasts" },
      { icon: Users, title: "Hiring Planner", description: "See runway impact before making offers" },
      { icon: Bell, title: "Proactive Alerts", description: "Get notified before runway gets critical" },
    ]
  },
  {
    category: "Reporting & Sharing",
    items: [
      { icon: FileText, title: "Board Packets", description: "Auto-generated monthly board meeting documents" },
      { icon: Calendar, title: "Investor Updates", description: "AI-drafted monthly updates with editable sections" },
      { icon: BarChart3, title: "Shareable Reports", description: "Public links for investors and advisors" },
      { icon: Shield, title: "Audit-Ready", description: "Complete transaction history with source tracking" },
    ]
  }
];

const plans = [
  {
    name: "Lite",
    price: "$99",
    period: "/mo",
    description: "See your money clearly",
    icon: Zap,
    features: [
      "Bank, QuickBooks & Stripe sync",
      "Auto-categorized transactions",
      "Burn & runway dashboard",
      "AI insights (3-5 per sync)",
      "Email support"
    ],
    cta: "Start Free Trial",
    tier: "lite"
  },
  {
    name: "Core",
    price: "$199",
    period: "/mo",
    description: "Plan and model with confidence",
    icon: Users,
    popular: true,
    features: [
      "Everything in Lite, plus:",
      "AI Copilot chat",
      "Scenario modeling workbook",
      "Hiring & raise planning",
      "Board packets",
      "Anomaly detection & alerts",
      "Priority support"
    ],
    cta: "Start Free Trial",
    tier: "core"
  },
  {
    name: "Growth",
    price: "Contact",
    period: null,
    description: "Scale your finance ops",
    icon: Building2,
    features: [
      "Everything in Core, plus:",
      "Unlimited team seats",
      "AI-drafted investor updates",
      "Automated monthly board packets",
      "Custom KPIs & dashboards",
      "API access",
      "Dedicated onboarding"
    ],
    cta: "Contact Sales",
    tier: "growth"
  }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <motion.nav 
        className="border-b backdrop-blur-md bg-background/90 sticky top-0 z-50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between w-full px-4 py-5 max-w-7xl mx-auto">
          <Link href="/">
            <div className="flex items-center gap-2 group cursor-pointer">
              <img 
                src="/logo.png" 
                alt="BlackTop Systems" 
                className="h-6 object-contain transition-transform group-hover:scale-105" 
              />
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/demo/dashboard">
              <Button variant="ghost" data-testid="link-demo">Try Demo</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" data-testid="link-pricing">Pricing</Button>
            </Link>
            <a href="/api/login">
              <Button data-testid="button-login">Sign In</Button>
            </a>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            <Badge variant="outline" className="px-4 py-1.5 text-sm font-medium">
              <Sparkles className="w-3.5 h-3.5 mr-2 text-primary" />
              Your AI Financial Co-Pilot
            </Badge>
          </motion.div>
          
          <motion.h1 
            className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent leading-tight"
            {...fadeInUp}
          >
            Financial Clarity for Startups.
            <br />
            <span className="text-primary">Instantly.</span>
          </motion.h1>
          
          <motion.p 
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Connect your bank in 60 seconds. Get AI-powered burn rate analysis, runway forecasts, and investor-ready reports—without a CFO.
          </motion.p>
          
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a href="/api/login">
              <Button size="lg" className="group w-full sm:w-auto" data-testid="button-get-started">
                Start Free Trial
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Link href="/demo/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="button-try-demo">
                Explore Demo
              </Button>
            </Link>
          </motion.div>

          {/* Integrations */}
          <motion.div 
            className="flex flex-wrap items-center justify-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <span className="text-sm text-muted-foreground">Connect with:</span>
            {integrations.map((integration) => (
              <div key={integration.name} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                <integration.icon className={`w-5 h-5 ${integration.color}`} />
                <span className="text-sm font-medium">{integration.name}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="px-6 py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-bold mb-4">You're Building a Company, Not Spreadsheets</h2>
            <p className="text-lg text-muted-foreground">
              Founders waste hours every month cobbling together burn rates, runway calculations, and investor updates. 
              BlackTop automates all of it—so you can focus on building.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Know Your Numbers</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From instant bank sync to AI-drafted board packets—built for founders who want clarity without complexity.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-2 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {coreFeatures.map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <Card className="h-full hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <feature.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="text-xs">{feature.highlight}</Badge>
                        </div>
                        <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                        <CardDescription className="text-base">{feature.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Detailed Features by Category */}
      <section className="px-6 py-24 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4">Full Feature Suite</h2>
            <p className="text-lg text-muted-foreground">
              Everything startup finance teams need—from day-to-day visibility to board-level reporting.
            </p>
          </motion.div>

          <div className="grid gap-12">
            {detailedFeatures.map((category) => (
              <motion.div 
                key={category.category}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h3 className="text-xl font-semibold mb-6 text-center">{category.category}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {category.items.map((item) => (
                    <Card key={item.title} className="hover-elevate transition-all">
                      <CardContent className="pt-6">
                        <item.icon className="w-8 h-8 text-primary mb-3" />
                        <h4 className="font-semibold mb-1">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-6 py-24" id="pricing">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg text-muted-foreground">
              From visibility to full financial command. All plans include a 14-day free trial.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {plans.map((plan) => (
              <motion.div key={plan.tier} variants={fadeInUp}>
                <Card 
                  className={`h-full flex flex-col relative hover-elevate transition-all ${
                    plan.popular ? "border-primary shadow-lg" : ""
                  }`}
                  data-testid={`card-plan-${plan.tier}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="px-4 py-1">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <plan.icon className="w-5 h-5 text-primary" />
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                    </div>
                    <div className="mt-4 mb-2">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <div className="p-6 pt-0">
                    {plan.tier === "growth" ? (
                      <a href="mailto:sales@blacktop.systems" className="w-full block">
                        <Button className="w-full" variant="outline" data-testid={`button-cta-${plan.tier}`}>
                          {plan.cta}
                        </Button>
                      </a>
                    ) : (
                      <a href="/api/login" className="w-full block">
                        <Button 
                          className="w-full" 
                          variant={plan.popular ? "default" : "outline"}
                          data-testid={`button-cta-${plan.tier}`}
                        >
                          {plan.cta}
                        </Button>
                      </a>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="px-6 py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex flex-wrap justify-center gap-8 mb-8">
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
              Your data is encrypted at rest and in transit. We never store your bank credentials—
              all connections are handled securely through Plaid.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold mb-6">Ready to Know Your Numbers?</h2>
          <p className="text-lg text-muted-foreground mb-10">
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
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Explore Demo First
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="border-t px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-6">
              <img src="/logo.png" alt="BlackTop Systems" className="h-5 object-contain" />
              <p className="text-sm text-muted-foreground">
                &copy; 2025 BlackTop Systems. All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/company/security">
                <span className="hover:text-foreground transition-colors cursor-pointer">Security</span>
              </Link>
              <Link href="/company/about">
                <span className="hover:text-foreground transition-colors cursor-pointer">About</span>
              </Link>
              <Link href="/company/contact">
                <span className="hover:text-foreground transition-colors cursor-pointer">Contact</span>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
