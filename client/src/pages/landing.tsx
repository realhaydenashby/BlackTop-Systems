import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, TrendingUp, Target, Zap, Shield, Users, ArrowRight, BarChart3, Clock, AlertTriangle, DollarSign, FileText, BookOpen, Info } from "lucide-react";
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
        className="border-b px-6 py-5 backdrop-blur-md bg-background/90 sticky top-0 z-50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
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
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4">About BlackTop Systems</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              We built BlackTop Systems because founders and finance teams waste too much time fighting messy data. 
              Upload your bank statements, invoices, receipts, or CSVs—our AI instantly extracts transactions, 
              spots problems, and tells you exactly what to do next.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.h2 
            className="text-4xl font-bold text-center mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Analytics that actually matter
          </motion.h2>
          <motion.p
            className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Stop guessing. Start knowing. Our AI diagnoses your spend and shows you what changed and why.
          </motion.p>
          <motion.div 
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                icon: BarChart3,
                title: "Category Spend",
                description: "Track spending across software, marketing, operations, and more."
              },
              {
                icon: Users,
                title: "Department Spend",
                description: "See which teams are spending what—and where to optimize."
              },
              {
                icon: Clock,
                title: "Recurring Vendor Burn",
                description: "Identify monthly commitments draining your runway."
              },
              {
                icon: TrendingUp,
                title: "Subscription Creep",
                description: "Catch forgotten SaaS tools costing you thousands."
              },
              {
                icon: Target,
                title: "Marketing Drift",
                description: "Spot when campaigns exceed budget before it's too late."
              },
              {
                icon: Users,
                title: "Payroll Overtime Drift",
                description: "Monitor unexpected spikes in labor costs."
              },
              {
                icon: AlertTriangle,
                title: "Vendor Overbilling",
                description: "AI flags suspicious charges and duplicate invoices."
              },
              {
                icon: LineChart,
                title: "Trend Anomalies",
                description: "Detect unusual spending patterns before they become problems."
              },
              {
                icon: BarChart3,
                title: "Quarter-over-Quarter",
                description: "Compare QoQ performance with detailed period analysis."
              },
              {
                icon: Info,
                title: "What Changed & Why",
                description: "AI explains every variance with context and recommendations."
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

      <section className="px-6 py-24 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.h2 
            className="text-4xl font-bold text-center mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Resources
          </motion.h2>
          <motion.p
            className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Tactical guides to help you take action today.
          </motion.p>
          <motion.div 
            className="grid md:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                icon: DollarSign,
                title: "Reduce Software Burn",
                description: "How to cut SaaS costs without breaking team workflows.",
                tag: "5 min read"
              },
              {
                icon: Target,
                title: "Marketing Budget Structure",
                description: "How to build a real marketing budget as a pre-seed startup.",
                tag: "7 min read"
              },
              {
                icon: FileText,
                title: "Quarterly Vendor Audit",
                description: "Run a complete vendor audit in 30 minutes or less.",
                tag: "4 min read"
              }
            ].map((resource, index) => (
              <motion.div
                key={resource.title}
                variants={fadeInUp}
              >
                <Card 
                  className="h-full hover-elevate transition-all cursor-pointer group" 
                  data-testid={`card-resource-${resource.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <resource.icon className="w-10 h-10 text-accent" />
                      <span 
                        className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md"
                        data-testid={`badge-read-time-${resource.title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {resource.tag}
                      </span>
                    </div>
                    <CardTitle className="group-hover:text-primary transition-colors">
                      {resource.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {resource.description}
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
