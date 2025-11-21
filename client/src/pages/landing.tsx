import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, TrendingUp, Target, Zap, Shield, Users, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import logoUrl from "@assets/generated_images/minimalist_blacktop_systems_logo.png";

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

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <motion.nav 
        className="border-b px-6 py-4 backdrop-blur-sm bg-background/80 sticky top-0 z-50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="BlackTop Systems" className="w-10 h-10" />
            <span className="text-xl font-semibold">BlackTop Systems</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pricing">
              <Button variant="ghost" data-testid="link-pricing">Pricing</Button>
            </Link>
            <a href="/api/login">
              <Button data-testid="button-login">Sign In</Button>
            </a>
          </div>
        </div>
      </motion.nav>

      <section className="px-6 py-32">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h1 
            className="text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
            {...fadeInUp}
          >
            Financial Clarity. Instantly.
          </motion.h1>
          <motion.p 
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            AI-powered insights that transform messy documents into actionable intelligence.
          </motion.p>
          <motion.div 
            className="flex gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a href="/api/login">
              <Button size="lg" className="group" data-testid="button-get-started">
                Get Started 
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Link href="/pricing">
              <Button size="lg" variant="outline" data-testid="link-view-pricing">View Pricing</Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-24 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.h2 
            className="text-4xl font-bold text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Everything you need
          </motion.h2>
          <motion.div 
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                icon: Zap,
                title: "AI Extraction",
                description: "Upload documents. Get transactions. Automatically."
              },
              {
                icon: TrendingUp,
                title: "Spend Analytics",
                description: "Visualize patterns. Understand spending. Make decisions."
              },
              {
                icon: Target,
                title: "Smart Budgets",
                description: "AI suggestions based on your data and benchmarks."
              },
              {
                icon: Shield,
                title: "Financial Insights",
                description: "Detect drift, anomalies, and overspending instantly."
              },
              {
                icon: Users,
                title: "Team Workspaces",
                description: "Collaborate with role-based permissions."
              },
              {
                icon: LineChart,
                title: "Action Plans",
                description: "Prioritized tasks to optimize operations."
              }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
              >
                <Card className="h-full hover-elevate transition-all">
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
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-24">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold mb-6">Start today</h2>
          <p className="text-lg text-muted-foreground mb-10">
            Join companies making smarter financial decisions.
          </p>
          <a href="/api/login">
            <Button size="lg" className="group" data-testid="button-start-now">
              Start Free Trial 
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </a>
        </motion.div>
      </section>

      <footer className="border-t px-6 py-12">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2025 BlackTop Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
