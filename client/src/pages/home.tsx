import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Rocket, TrendingUp, Target, Clock, DollarSign, Users, BarChart3, AlertTriangle, Banknote, FlaskConical, CheckCircle2, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { useAppMode } from "@/contexts/AppModeContext";

export default function Home() {
  const { setMode } = useAppMode();
  const [, setLocation] = useLocation();

  const handleExploreDemo = () => {
    setMode("demo");
    setLocation("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="px-6 py-24 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="mb-6" data-testid="badge-tagline">
              <Rocket className="w-3 h-3 mr-1" />
              Built for Seed to Series B Startups
            </Badge>
          </motion.div>
          
          <motion.h1 
            className="text-4xl md:text-6xl font-bold mb-6 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Know Your Runway.
            <br />
            <span className="text-primary">Before Investors Ask.</span>
          </motion.h1>
          
          <motion.p 
            className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            The financial command center for founders who'd rather build products than maintain spreadsheets. Real-time burn rate, runway projections, and AI-powered insights.
          </motion.p>
          
          <motion.div 
            className="flex gap-4 justify-center flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <a href="/api/login">
              <Button size="lg" className="group" data-testid="button-login">
                Get Started Free
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleExploreDemo}
              data-testid="button-explore-demo"
            >
              <FlaskConical className="mr-2 w-4 h-4" />
              See Demo Dashboard
            </Button>
          </motion.div>

          {/* Quick stats */}
          <motion.div 
            className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            {[
              { value: "< 5 min", label: "Setup time" },
              { value: "Real-time", label: "Burn tracking" },
              { value: "AI-powered", label: "Categorization" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl md:text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Startup Pain Points */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Sound Familiar?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Every startup founder faces these financial challenges. You're not alone.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: AlertTriangle,
                title: "The Runway Question",
                description: "Your investor asks 'What's your runway?' and you scramble to open three spreadsheets to piece together an answer.",
              },
              {
                icon: Clock,
                title: "Month-End Panic",
                description: "You realize burn spiked 40% last month but only notice it 3 weeks later when reconciling bank statements.",
              },
              {
                icon: DollarSign,
                title: "Subscription Creep",
                description: "That $49/month tool you forgot about is now $149/month, multiplied by a dozen other tools you've lost track of.",
              },
              {
                icon: Users,
                title: "Hiring Without Clarity",
                description: "You want to make your next hire but can't confidently say how it impacts your runway without a CFO.",
              },
            ].map((pain, index) => (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <div className="shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                          <pain.icon className="w-5 h-5 text-destructive" />
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-2">{pain.title}</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">{pain.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What You Get */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Your Financial Co-Pilot</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to understand your finances without hiring a CFO.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Banknote,
                title: "Burn & Runway",
                description: "Always know exactly how much you're spending and how long your cash will last. Updated in real-time.",
                features: ["Gross vs net burn", "Runway projections", "Trend alerts"],
              },
              {
                icon: BarChart3,
                title: "Spend Intelligence",
                description: "AI categorizes every transaction and spots patterns you'd miss. See where your money actually goes.",
                features: ["Auto-categorization", "Vendor tracking", "Recurring detection"],
              },
              {
                icon: Target,
                title: "Actionable Insights",
                description: "Get 3-5 things to do each week based on your actual numbers. No more guessing what to focus on.",
                features: ["Weekly digest", "Anomaly alerts", "Optimization tips"],
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm mb-4">{feature.description}</p>
                    <ul className="space-y-2">
                      {feature.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Up and Running in Minutes</h2>
            <p className="text-muted-foreground">No accountant required. No complex setup.</p>
          </motion.div>

          <div className="space-y-8">
            {[
              {
                step: "1",
                title: "Connect Your Bank",
                description: "Securely link your bank accounts. We use bank-level encryption and never store credentials.",
                icon: Zap,
              },
              {
                step: "2",
                title: "AI Does the Work",
                description: "Our AI categorizes transactions, normalizes vendor names, and identifies recurring expenses automatically.",
                icon: TrendingUp,
              },
              {
                step: "3",
                title: "Get Clarity",
                description: "See your burn rate, runway, and actionable insights on a clean dashboard. Updated every day.",
                icon: Target,
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                className="flex gap-6 items-start"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
              >
                <div className="shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                  {item.step}
                </div>
                <div className="pt-2">
                  <h3 className="font-semibold text-lg mb-1">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for Startups */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built by Founders, for Founders</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We've been in your shoes. That's why we built what we wished existed.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: "Pre-Seed to Series B",
                description: "Whether you just raised your first check or you're scaling fast, we grow with you.",
              },
              {
                title: "Investor-Ready Reports",
                description: "Generate clean financials for board meetings and due diligence in one click.",
              },
              {
                title: "No Finance Degree Needed",
                description: "Plain English insights. We translate the numbers into what they actually mean.",
              },
              {
                title: "Bank-Grade Security",
                description: "SOC 2 compliant, encrypted connections, read-only access. Your data stays yours.",
              },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex gap-4 items-start"
              >
                <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20 bg-muted/30">
        <motion.div 
          className="max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Stop Guessing. Start Knowing.
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Join hundreds of startup founders who finally have clarity on their finances.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="/api/login">
              <Button size="lg" className="group" data-testid="button-cta-login">
                Get Started Free
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleExploreDemo}
              data-testid="button-cta-demo"
            >
              <FlaskConical className="mr-2 w-4 h-4" />
              See Demo Dashboard
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Free for startups under $1M ARR. No credit card required.
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <Rocket className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">BlackTop Systems</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Financial clarity for startups.
          </p>
        </div>
      </footer>
    </div>
  );
}
