import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Shield, Zap, AlertCircle, Clock, FileQuestion, TrendingDown, FlaskConical, Target, Users, LineChart, AlertTriangle, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAppMode } from "@/contexts/AppModeContext";

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

export default function Home() {
  const { setMode } = useAppMode();
  const [, setLocation] = useLocation();

  const handleExploreDemo = () => {
    setMode("demo");
    setLocation("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section - Dark */}
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
            AI-powered insights that transform financials into actionable intelligence.
          </motion.p>
          <motion.div 
            className="flex gap-4 justify-center flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Link href="/waitlist">
              <Button size="lg" className="group" data-testid="button-request-access">
                Request Early Access
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleExploreDemo}
              data-testid="button-explore-demo"
            >
              <FlaskConical className="mr-2 w-4 h-4" />
              Explore Demo
            </Button>
          </motion.div>
          <motion.p
            className="text-sm text-muted-foreground mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            Already have access?{" "}
            <a href="/api/login" className="text-primary hover:underline" data-testid="link-login">
              Log in here
            </a>
          </motion.p>
        </div>
      </section>

      {/* Why BlackTop - Transitions into Blue */}
      <section className="px-6 py-24 transition-into-blue">
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
                title: "No CFO Required",
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
                <Card className="hover-elevate">
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

      {/* Analytics Features - BLUE SECTION with geometric gradient */}
      <section className="px-6 py-24 section-blue-cta">
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.h2 
            className="text-4xl font-bold text-center mb-4 section-blue-text"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Analytics that actually matter
          </motion.h2>
          <motion.p
            className="text-center section-blue-text-muted mb-16 max-w-2xl mx-auto"
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
                icon: Target,
                title: "Subscription Creep",
                description: "Catch forgotten SaaS tools costing you thousands."
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
              }
            ].map((feature) => (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
              >
                <Card className="h-full card-on-blue transition-all duration-300">
                  <CardHeader>
                    <feature.icon className="w-10 h-10 icon-on-blue mb-3" />
                    <CardTitle className="section-blue-text">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base section-blue-text-muted">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pain Points - Between two blue sections */}
      <section className="px-6 py-24 transition-between-blue">
        <div className="max-w-6xl mx-auto relative z-10 pt-16">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-6">The Financial Chaos Founders Face</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Early-stage startups and small businesses struggle daily with financial uncertainty. You're not alone.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: FileQuestion,
                title: "Drowning in Documents",
                description: "Bank statements, invoices, receipts, and subscriptions scattered across email, drives, and folders. No single source of truth."
              },
              {
                icon: Clock,
                title: "No Time for Manual Work",
                description: "You're building a company, not maintaining spreadsheets. Every hour spent on bookkeeping is an hour away from growth."
              },
              {
                icon: AlertCircle,
                title: "Flying Blind on Cash",
                description: "When will you run out of money? Where is cash actually going? These questions keep you up at night without clear answers."
              },
              {
                icon: TrendingDown,
                title: "Reactive, Not Proactive",
                description: "You only notice problems after they've already happened. By the time you see the burn rate spike, it's too late to course-correct."
              }
            ].map((painPoint, index) => (
              <motion.div
                key={painPoint.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="hover-elevate">
                  <CardHeader>
                    <painPoint.icon className="w-12 h-12 text-destructive mb-4" />
                    <CardTitle className="text-xl">{painPoint.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {painPoint.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold mb-4">Founders Love the Simplicity</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Zero learning curve. Zero overhead. Just connect and go.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-2 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                quote: "Connected our bank in 2 minutes. Now I see our runway forecast without touching a spreadsheet.",
                author: "Sarah M.",
                role: "Founder",
                company: "Seed-stage SaaS"
              },
              {
                quote: "No training, no setup calls, no CFO fees. Just connected Plaid and instantly had our burn rate and 12-month forecast.",
                author: "James K.",
                role: "CEO",
                company: "Series A Startup"
              },
              {
                quote: "I used to spend 4 hours a month updating our financial model. BlackTop does it automatically.",
                author: "Maria L.",
                role: "Co-founder",
                company: "B2B Platform"
              },
              {
                quote: "Finally, forecasting that updates itself. Zero overhead, zero learning curve.",
                author: "Alex T.",
                role: "Founder",
                company: "Developer Tools"
              }
            ].map((testimonial, idx) => (
              <motion.div key={idx} variants={fadeInUp}>
                <Card className="h-full" data-testid={`card-testimonial-${idx}`}>
                  <CardContent className="pt-6">
                    <p className="text-lg mb-6 leading-relaxed">"{testimonial.quote}"</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                        {testimonial.author.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold">{testimonial.author}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.role}, {testimonial.company}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section - Blue with geometric gradient and fade-out */}
      <section className="px-6 py-24 section-blue-cta-fade-out">
        <motion.div 
          className="max-w-4xl mx-auto text-center relative z-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold mb-6 section-blue-text">Start today</h2>
          <p className="text-lg section-blue-text-muted mb-10">
            Join founders who've stopped guessing and started knowing.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/waitlist">
              <Button size="lg" className="group btn-on-blue" data-testid="button-cta-access">
                Request Early Access
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleExploreDemo}
              className="btn-outline-on-blue"
              data-testid="button-cta-demo"
            >
              <FlaskConical className="mr-2 w-4 h-4" />
              Explore Demo
            </Button>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
