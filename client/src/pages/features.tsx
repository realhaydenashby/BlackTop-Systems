import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, TrendingUp, Target, Users, Clock, AlertTriangle, BarChart3, Info } from "lucide-react";
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
  const features = [
    {
      icon: BarChart3,
      title: "Product A",
      description: "Track spending across software, marketing, operations, and more."
    },
    {
      icon: Users,
      title: "Product B",
      description: "See which teams are spending what—and where to optimize."
    },
    {
      icon: Clock,
      title: "Product C",
      description: "Identify monthly commitments draining your runway."
    },
    {
      icon: TrendingUp,
      title: "Services",
      description: "Catch forgotten SaaS tools costing you thousands."
    },
    {
      icon: Target,
      title: "Product A",
      description: "Spot when campaigns exceed budget before it's too late."
    },
    {
      icon: Users,
      title: "Product B",
      description: "Monitor unexpected spikes in labor costs."
    },
    {
      icon: AlertTriangle,
      title: "Product C",
      description: "AI flags suspicious charges and duplicate invoices."
    },
    {
      icon: LineChart,
      title: "Services",
      description: "Detect unusual spending patterns before they become problems."
    },
    {
      icon: BarChart3,
      title: "Product A",
      description: "Compare QoQ performance with detailed period analysis."
    },
    {
      icon: Info,
      title: "Product B",
      description: "AI explains every variance with context and recommendations."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-6">Analytics that actually matter</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Stop guessing. Start knowing. Our AI diagnoses your spend and shows you what changed and why.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {features.map((feature, index) => (
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
    </div>
  );
}
