import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp, Shield, Zap, BarChart3, Clock, Target, Users, LineChart, AlertTriangle } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useAppMode } from "@/contexts/AppModeContext";
import { useRef } from "react";

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    }
  }
};

const staggerItem = {
  initial: { opacity: 0, y: 24 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  }
};

export default function Home() {
  const { setMode } = useAppMode();
  const [, setLocation] = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 50]);

  const handleExploreDemo = () => {
    setMode("demo");
    setLocation("/dashboard");
  };

  const features = [
    { icon: BarChart3, title: "Category Spend", desc: "Track spending across all categories" },
    { icon: Users, title: "Department Analysis", desc: "See which teams are spending what" },
    { icon: Clock, title: "Recurring Burns", desc: "Identify monthly commitments" },
    { icon: Target, title: "Subscription Creep", desc: "Catch forgotten SaaS tools" },
    { icon: AlertTriangle, title: "Vendor Alerts", desc: "Flag suspicious charges" },
    { icon: LineChart, title: "Trend Detection", desc: "Spot unusual patterns early" },
  ];

  const benefits = [
    { icon: Zap, title: "Instant Analysis", desc: "Upload any document, get insights in seconds" },
    { icon: BarChart3, title: "Smart Diagnostics", desc: "AI that understands your spending patterns" },
    { icon: Shield, title: "Built for SMBs", desc: "Intelligence layer without a dedicated CFO" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <motion.section 
        ref={heroRef}
        className="relative min-h-[90vh] flex items-center justify-center px-6"
        style={{ opacity: heroOpacity }}
      >
        <motion.div 
          className="max-w-4xl mx-auto text-center relative z-10"
          style={{ scale: heroScale, y: heroY }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-muted/30 backdrop-blur-sm mb-8"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">AI-Powered Financial Intelligence</span>
          </motion.div>
          
          <motion.h1 
            className="text-5xl md:text-7xl font-semibold tracking-tight mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
              Financial Clarity.
            </span>
            <br />
            <span className="bg-gradient-to-b from-foreground/80 to-foreground/40 bg-clip-text text-transparent">
              Instantly.
            </span>
          </motion.h1>
          
          <motion.p 
            className="text-lg md:text-xl text-muted-foreground mb-12 max-w-xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Transform your financials into actionable intelligence. 
            No spreadsheets. No guessing.
          </motion.p>
          
          <motion.div 
            className="flex gap-4 justify-center flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <a href="/api/login">
              <Button size="lg" className="h-12 px-8 text-base group" data-testid="button-login">
                Get Started
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </Button>
            </a>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleExploreDemo}
              className="h-12 px-8 text-base"
              data-testid="button-explore-demo"
            >
              View Demo
            </Button>
          </motion.div>
        </motion.div>
        
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
        </div>
      </motion.section>

      <section className="px-6 py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
              Why BlackTop Systems?
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Built for founders who need answers fast, not more spreadsheets.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
          >
            {benefits.map((item) => (
              <motion.div
                key={item.title}
                variants={staggerItem}
                className="group relative p-8 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm hover:border-border transition-all duration-500 hover:bg-card/50"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/15 transition-colors duration-300">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-primary/[0.06] to-primary/[0.03]" />
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
              Analytics that matter
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Stop guessing. Start knowing.
            </p>
          </motion.div>

          <motion.div 
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
          >
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={staggerItem}
                className="group p-6 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm hover:border-primary/30 hover:bg-background/80 transition-all duration-300"
              >
                <feature.icon className="w-8 h-8 text-primary/70 mb-4 group-hover:text-primary transition-colors duration-300" />
                <h3 className="font-medium mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-32">
        <motion.div 
          className="max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-6">
            Ready to take control?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Join founders who've stopped guessing and started knowing.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="/api/login">
              <Button size="lg" className="h-12 px-8 text-base group" data-testid="button-cta-login">
                Get Started Free
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </Button>
            </a>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleExploreDemo}
              className="h-12 px-8 text-base"
              data-testid="button-cta-demo"
            >
              Explore Demo
            </Button>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
