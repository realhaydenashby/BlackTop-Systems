import { Database, TrendingUp, Target, Users, FileText, Zap, AlertTriangle, BarChart3, Rocket, DollarSign, Calendar, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    }
  }
};

const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  }
};

export default function Features() {
  const ingestFeatures = [
    { icon: Database, title: "Multi-Source Ingestion", desc: "Connect banks, cards, or upload PDFs, CSVs, and receipts" },
    { icon: Target, title: "Auto-Classification", desc: "AI categorizes by vendor, department, and spend type" },
    { icon: Zap, title: "Duplicate Detection", desc: "Identify recurring charges and catch duplicate invoices" }
  ];

  const startupFeatures = [
    { icon: TrendingUp, title: "Burn Analytics", desc: "Track payroll vs non-payroll with drift analysis" },
    { icon: Rocket, title: "Runway Estimator", desc: "Best/worst case projections with scenario modeling" },
    { icon: DollarSign, title: "Raise Planning", desc: "Data-driven recommendations based on your burn" },
    { icon: Users, title: "Headcount Planning", desc: "Model hiring impact with fully loaded costs" }
  ];

  const smbFeatures = [
    { icon: BarChart3, title: "Category Breakdown", desc: "Spending across software, marketing, and ops" },
    { icon: AlertTriangle, title: "Overbilling Alerts", desc: "Spot forgotten tools and excess charges" },
    { icon: Calendar, title: "Period Comparisons", desc: "MoM and QoQ trends with AI explanations" },
    { icon: TrendingUp, title: "Cash Flow Trends", desc: "Early warnings and forecasts" }
  ];

  const actionFeatures = [
    { icon: Target, title: "AI Budgets", desc: "Based on historical spend with department allocations" },
    { icon: CheckCircle, title: "Action Plans", desc: "What to cut, cap, and renegotiate" },
    { icon: Rocket, title: "Impact Modeling", desc: "See how each decision affects runway" }
  ];

  const outcomes = [
    { title: "Know your real burn & runway", desc: "Instant visibility into where you stand" },
    { title: "Investor-ready numbers", desc: "Metrics that survive due diligence" },
    { title: "Extend runway strategically", desc: "AI tells you exactly what to optimize" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-24"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6" data-testid="text-headline">
              AI Finance Copilot for
              <br />
              <span className="text-muted-foreground">Startups & SMBs</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-subheadline">
              Ingest your financial chaos, see your real burn and runway, 
              and get actionable plans you can execute.
            </p>
          </motion.div>

          <div className="space-y-32">
            <motion.section
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-12">
                <h2 className="text-2xl font-semibold mb-3" data-testid="heading-ingest">Ingest & Normalize</h2>
                <p className="text-muted-foreground max-w-2xl">
                  Connect to bank feeds or upload documents. Everything normalized into clean transactions.
                </p>
              </div>
              <motion.div 
                className="grid md:grid-cols-3 gap-6"
                variants={staggerContainer}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, margin: "-100px" }}
              >
                {ingestFeatures.map((feature, index) => (
                  <motion.div 
                    key={index} 
                    variants={staggerItem}
                    className="group p-6 rounded-xl border border-border/50 bg-card/30 hover:border-border hover:bg-card/50 transition-all duration-300"
                    data-testid={`card-ingest-${index}`}
                  >
                    <feature.icon className="w-8 h-8 text-primary/70 mb-4 group-hover:text-primary transition-colors" />
                    <h3 className="font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-12">
                <h2 className="text-2xl font-semibold mb-3" data-testid="heading-diagnose">Diagnose What Matters</h2>
                <p className="text-muted-foreground max-w-2xl">
                  Decision-support analytics based on your business stage.
                </p>
              </div>

              <div className="space-y-16">
                <div>
                  <h3 className="text-lg font-medium mb-6 text-muted-foreground" data-testid="heading-startups">For Fundraising Startups</h3>
                  <motion.div 
                    className="grid md:grid-cols-2 gap-6"
                    variants={staggerContainer}
                    initial="initial"
                    whileInView="animate"
                    viewport={{ once: true, margin: "-100px" }}
                  >
                    {startupFeatures.map((feature, index) => (
                      <motion.div 
                        key={index} 
                        variants={staggerItem}
                        className="group p-6 rounded-xl border border-border/50 bg-card/30 hover:border-border hover:bg-card/50 transition-all duration-300"
                        data-testid={`card-startup-${index}`}
                      >
                        <feature.icon className="w-8 h-8 text-primary/70 mb-4 group-hover:text-primary transition-colors" />
                        <h4 className="font-medium mb-2">{feature.title}</h4>
                        <p className="text-sm text-muted-foreground">{feature.desc}</p>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-6 text-muted-foreground" data-testid="heading-smbs">For SMBs</h3>
                  <motion.div 
                    className="grid md:grid-cols-2 gap-6"
                    variants={staggerContainer}
                    initial="initial"
                    whileInView="animate"
                    viewport={{ once: true, margin: "-100px" }}
                  >
                    {smbFeatures.map((feature, index) => (
                      <motion.div 
                        key={index} 
                        variants={staggerItem}
                        className="group p-6 rounded-xl border border-border/50 bg-card/30 hover:border-border hover:bg-card/50 transition-all duration-300"
                        data-testid={`card-smb-${index}`}
                      >
                        <feature.icon className="w-8 h-8 text-primary/70 mb-4 group-hover:text-primary transition-colors" />
                        <h4 className="font-medium mb-2">{feature.title}</h4>
                        <p className="text-sm text-muted-foreground">{feature.desc}</p>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-12">
                <h2 className="text-2xl font-semibold mb-3" data-testid="heading-plan">Plan & Act</h2>
                <p className="text-muted-foreground max-w-2xl">
                  AI-generated budgets and action plans that extend your runway.
                </p>
              </div>
              <motion.div 
                className="grid md:grid-cols-3 gap-6"
                variants={staggerContainer}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, margin: "-100px" }}
              >
                {actionFeatures.map((feature, index) => (
                  <motion.div 
                    key={index} 
                    variants={staggerItem}
                    className="group p-6 rounded-xl border border-border/50 bg-card/30 hover:border-border hover:bg-card/50 transition-all duration-300"
                    data-testid={`card-action-${index}`}
                  >
                    <feature.icon className="w-8 h-8 text-primary/70 mb-4 group-hover:text-primary transition-colors" />
                    <h3 className="font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </motion.section>

            <motion.section
              className="relative"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-primary/[0.05] to-transparent rounded-3xl" />
              <div className="relative p-12 rounded-3xl border border-border/30">
                <h2 className="text-2xl font-semibold text-center mb-12" data-testid="heading-outcomes">Why Teams Use BlackTop</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  {outcomes.map((outcome, index) => (
                    <motion.div 
                      key={index} 
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      data-testid={`outcome-${index}`}
                    >
                      <h3 className="font-medium mb-2">{outcome.title}</h3>
                      <p className="text-sm text-muted-foreground">{outcome.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </section>
    </div>
  );
}
