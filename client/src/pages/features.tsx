import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Database, 
  TrendingUp, 
  Target, 
  Users, 
  Zap, 
  AlertTriangle, 
  BarChart3, 
  Rocket, 
  DollarSign, 
  Bell,
  Brain,
  Clock,
  Shield,
  ArrowRight,
  Calculator,
  Sparkles,
  FileText
} from "lucide-react";
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

export default function Features() {
  const howItWorks = [
    {
      step: "1",
      icon: Zap,
      title: "Connect in 3 Minutes",
      description: "Link your bank accounts via Plaid, connect QuickBooks or Xero, and optionally add Stripe. No spreadsheet uploads, no CSV wrangling, no 'implementation process.'"
    },
    {
      step: "2",
      icon: Calculator,
      title: "The Math Engine Runs First",
      description: "Before any AI touches your data, our system runs deterministic calculations—burn rate, runway, cash flow. These are exact numbers, not guesses. When we say 'your runway dropped by 2.3 months,' that's math, not a hallucination."
    },
    {
      step: "3",
      icon: Brain,
      title: "AI Interprets the Math",
      description: "Only after the math is done does our AI layer kick in. We run a multi-model ensemble—if one model gives a weird answer, the others catch it. The AI's job is to explain what the numbers mean and suggest what to do."
    },
    {
      step: "4",
      icon: Bell,
      title: "Proactive Initiatives, Not Queries",
      description: "Most tools wait for you to ask questions. BlackTop interrupts you with truth: 'Your AWS costs spiked 47%—here's why.' 'At current burn, you have 8.2 months—here's an action plan.'"
    }
  ];

  const coreFeatures = [
    {
      icon: TrendingUp,
      title: "Burn Rate & Runway",
      description: "Real-time burn rate calculations with automatic payroll vs. non-payroll breakdown. See your runway with best-case, worst-case, and scenario-based projections."
    },
    {
      icon: Sparkles,
      title: "AI-Generated Insights",
      description: "3-5 actionable insights generated every sync. Know exactly what changed, why it matters, and what to do about it—specific to your business."
    },
    {
      icon: Target,
      title: "Scenario Modeling",
      description: "Plan hires, model fundraising scenarios, and forecast 12 months ahead. See how decisions impact your runway before you make them."
    },
    {
      icon: AlertTriangle,
      title: "Anomaly Detection",
      description: "Automatic alerts when spending spikes, subscriptions creep up, or cash flow patterns change. Catch problems before they become crises."
    },
    {
      icon: BarChart3,
      title: "Spend Analytics",
      description: "Break down spending by category, department, and vendor. Track month-over-month trends with AI-explained variances."
    },
    {
      icon: Database,
      title: "Auto-Categorization",
      description: "AI categorizes every transaction by vendor, category, and spend type. No manual tagging required."
    }
  ];

  const advancedFeatures = [
    {
      icon: Users,
      title: "Headcount Planning",
      description: "Model hiring impact on runway with fully loaded costs. See exactly how each new hire affects your timeline."
    },
    {
      icon: DollarSign,
      title: "Raise Planning",
      description: "Data-driven recommendations on how much to raise based on your burn, growth plans, and market conditions."
    },
    {
      icon: FileText,
      title: "Board Packets & Reports",
      description: "Auto-generated monthly board meeting documents and investor-ready reports. Share via public link with one click."
    },
    {
      icon: Rocket,
      title: "AI Copilot Chat",
      description: "Ask questions about your finances in plain English. 'What if we hired 3 engineers?' 'Where did we overspend last quarter?'"
    }
  ];

  const differentiators = [
    {
      title: "3-Minute Setup",
      description: "Connect your accounts and see your financial picture instantly. No spreadsheet imports, no implementation process, no 5-hour onboarding."
    },
    {
      title: "Zero Learning Curve",
      description: "We show you what matters. No financial modeling required—we do the work, surface the truth, and give you the action plan."
    },
    {
      title: "Algorithm-First, AI-Augmented",
      description: "Core metrics are always accurate because they're calculated, not generated. AI only interprets and explains—it never makes up numbers."
    },
    {
      title: "Built for Chaos",
      description: "You don't need clean books or a finance team. BlackTop works with messy early-stage financial reality and makes sense of it."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            <Badge variant="outline" className="px-4 py-1.5 text-sm font-medium">
              <Clock className="w-3.5 h-3.5 mr-2 text-primary" />
              3-Minute Setup
            </Badge>
          </motion.div>
          
          <motion.h1 
            className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent leading-tight"
            {...fadeInUp}
            data-testid="text-headline"
          >
            A Financial Co-Pilot That
            <br />
            <span className="text-primary">Actually Flies the Plane</span>
          </motion.h1>
          
          <motion.p 
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            data-testid="text-subheadline"
          >
            Connect your bank in 3 minutes. Get algorithm-powered burn rate analysis, runway forecasts, and proactive insights that interrupt you with truth—without a CFO.
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center"
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
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4" data-testid="heading-how-it-works">How BlackTop Works</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Unlike tools that wait for you to ask questions, BlackTop proactively surfaces what you need to know.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {howItWorks.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="h-full hover-elevate transition-all" data-testid={`card-step-${index}`}>
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-primary font-bold">{step.step}</span>
                      </div>
                      <step.icon className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4" data-testid="heading-features">Core Features</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to understand your finances and make better decisions—without becoming a finance expert.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {coreFeatures.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.05 }}
              >
                <Card className="h-full hover-elevate transition-all" data-testid={`card-feature-${index}`}>
                  <CardHeader>
                    <feature.icon className="w-10 h-10 text-primary mb-3" />
                    <CardTitle>{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Advanced Features */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4" data-testid="heading-advanced">Planning & Reporting</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Model scenarios, plan hires, and generate investor-ready reports—all powered by your real data.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {advancedFeatures.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="h-full hover-elevate transition-all" data-testid={`card-advanced-${index}`}>
                  <CardHeader>
                    <feature.icon className="w-10 h-10 text-primary mb-3" />
                    <CardTitle>{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why BlackTop */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4" data-testid="heading-why">Why BlackTop</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We're not building "FP&A software" that requires you to understand financial modeling. We're building something that does the work for you.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {differentiators.map((item, index) => (
              <motion.div
                key={index}
                className="bg-card border rounded-lg p-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                data-testid={`differentiator-${index}`}
              >
                <h3 className="text-2xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-lg">{item.description}</p>
              </motion.div>
            ))}
          </div>
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
          <h2 className="text-4xl font-bold mb-4">Ready to Know Your Numbers?</h2>
          <p className="text-lg text-muted-foreground mb-10">
            Join founders who spend minutes, not hours, understanding their finances.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/api/login">
              <Button size="lg" className="group w-full sm:w-auto" data-testid="button-start-trial-bottom">
                Start 7-Day Free Trial
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="button-view-pricing">
                View Pricing
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
