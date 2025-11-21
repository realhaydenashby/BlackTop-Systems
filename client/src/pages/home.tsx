import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Shield, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-32">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h1 
            className="text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
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
            className="flex gap-4 justify-center flex-wrap"
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
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-6">Why BlackTop Systems?</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Built for founders and finance teams who need answers fast, not more spreadsheets.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "Instant Analysis",
                description: "Upload any financial document and get actionable insights in seconds. No manual data entry."
              },
              {
                icon: BarChart3,
                title: "Smart Diagnostics",
                description: "AI that actually understands your spending patterns and tells you what changed and why."
              },
              {
                icon: Shield,
                title: "Built for SMBs",
                description: "Pre-accounting intelligence layer designed for startups without a dedicated CFO."
              }
            ].map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <benefit.icon className="w-12 h-12 text-primary mb-4" />
                    <CardTitle className="text-xl">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {benefit.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
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
            Join founders who've stopped guessing and started knowing.
          </p>
          <a href="/api/login">
            <Button size="lg" className="group" data-testid="button-cta-get-started">
              Get Started Free
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </a>
        </motion.div>
      </section>
    </div>
  );
}
