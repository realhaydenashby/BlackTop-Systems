import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database, TrendingUp, Target, Users, FileText, Zap, AlertTriangle, BarChart3, Rocket, DollarSign, Calendar, CheckCircle } from "lucide-react";
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
  const ingestFeatures = [
    {
      icon: Database,
      title: "Bank, Card & Document Ingestion",
      description: "Connect bank feeds or upload statements, CSVs, invoices, and receipts in one place."
    },
    {
      icon: Target,
      title: "Automatic Classification",
      description: "AI categorizes every transaction by vendor, category, department, and spend type."
    },
    {
      icon: Zap,
      title: "Subscription & Duplicate Detection",
      description: "Identify recurring charges and catch duplicate invoices before they drain cash."
    }
  ];

  const startupFeatures = [
    {
      icon: TrendingUp,
      title: "Burn Rate Analytics",
      description: "Track payroll vs non-payroll spend with month-over-month drift analysis."
    },
    {
      icon: Rocket,
      title: "Runway Estimator",
      description: "See current runway plus best-case, worst-case, and scenario-based projections."
    },
    {
      icon: DollarSign,
      title: "Raise Planning",
      description: "Get data-driven recommendations on how much to raise based on your burn and growth plans."
    },
    {
      icon: Users,
      title: "Headcount Planning",
      description: "Model hiring impact on runway with fully loaded costs and payroll projections."
    }
  ];

  const smbFeatures = [
    {
      icon: BarChart3,
      title: "Spend by Category & Department",
      description: "Break down spending across software, marketing, operations, and every team."
    },
    {
      icon: AlertTriangle,
      title: "Subscription Creep & Overbilling",
      description: "Spot forgotten tools and vendor charges that exceed contracts."
    },
    {
      icon: Calendar,
      title: "Period Comparisons",
      description: "Track month-over-month and quarter-over-quarter trends with AI-explained variances."
    },
    {
      icon: TrendingUp,
      title: "Cash Flow Trends",
      description: "Early runway warnings and cash flow forecasts to prevent surprises."
    }
  ];

  const actionFeatures = [
    {
      icon: Target,
      title: "AI-Generated Budgets",
      description: "Create budgets based on actual historical spend with department-level allocations and vendor caps."
    },
    {
      icon: CheckCircle,
      title: "Monthly Action Plans",
      description: "Get specific recommendations: which subscriptions to cut, what campaigns to cap, and which vendors to renegotiate."
    },
    {
      icon: Rocket,
      title: "Runway Impact Modeling",
      description: "See exactly how each budget decision extends or shortens your runway."
    }
  ];

  const outcomes = [
    {
      title: "Know your real burn & runway in minutes",
      description: "Stop guessing. Upload your data and get instant visibility into where you stand."
    },
    {
      title: "Show up to investors with clean, defensible numbers",
      description: "Present accurate burn, runway, and growth metrics that stand up to due diligence."
    },
    {
      title: "Extend runway without guessing where to cut",
      description: "AI tells you exactly what to optimize, how much to save, and what it means for your timeline."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-6" data-testid="text-headline">
              BlackTop Systems: The AI Finance Copilot for Startups & SMBs
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto" data-testid="text-subheadline">
              Ingest your financial chaos, see your real burn and runway, and get a budget + action plan you can actually execute.
            </p>
          </motion.div>

          <motion.div 
            className="space-y-24"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <motion.div variants={fadeInUp}>
              <div className="mb-12">
                <h2 className="text-4xl font-bold mb-4" data-testid="heading-ingest">Ingest & Normalize</h2>
                <p className="text-lg text-muted-foreground max-w-3xl">
                  Connect to bank and card feeds, or upload PDFs, CSVs, invoices, receipts, and subscription emails. 
                  BlackTop normalizes everything into clean transactions with vendor, category, department, and tags.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {ingestFeatures.map((feature, index) => (
                  <Card key={index} className="h-full hover-elevate transition-all" data-testid={`card-ingest-${index}`}>
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
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <div className="mb-12">
                <h2 className="text-4xl font-bold mb-4" data-testid="heading-diagnose">Diagnose What's Really Happening</h2>
                <p className="text-lg text-muted-foreground max-w-3xl mb-8">
                  This is decision-support analytics, not just pretty charts. BlackTop shows you what matters based on your business stage.
                </p>
              </div>

              <div className="space-y-12">
                <div>
                  <h3 className="text-2xl font-semibold mb-6" data-testid="heading-startups">For Startups Preparing to Fundraise</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    {startupFeatures.map((feature, index) => (
                      <Card key={index} className="h-full hover-elevate transition-all" data-testid={`card-startup-${index}`}>
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
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-2xl font-semibold mb-6" data-testid="heading-smbs">For SMBs</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    {smbFeatures.map((feature, index) => (
                      <Card key={index} className="h-full hover-elevate transition-all" data-testid={`card-smb-${index}`}>
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
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <div className="mb-12">
                <h2 className="text-4xl font-bold mb-4" data-testid="heading-plan">Plan & Act</h2>
                <p className="text-lg text-muted-foreground max-w-3xl">
                  Get AI-generated budgets and monthly action plans that extend your runway and drive better financial decisions.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {actionFeatures.map((feature, index) => (
                  <Card key={index} className="h-full hover-elevate transition-all" data-testid={`card-action-${index}`}>
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
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeInUp} className="bg-card/50 rounded-lg p-12 border">
              <h2 className="text-3xl font-bold text-center mb-12" data-testid="heading-outcomes">Why Teams Use BlackTop</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {outcomes.map((outcome, index) => (
                  <div key={index} className="text-center" data-testid={`outcome-${index}`}>
                    <h3 className="text-xl font-semibold mb-3">{outcome.title}</h3>
                    <p className="text-muted-foreground">{outcome.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
