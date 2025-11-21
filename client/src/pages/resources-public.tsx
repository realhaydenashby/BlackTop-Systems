import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, Target, FileText, BookOpen, TrendingUp, Users } from "lucide-react";
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

export default function ResourcesPublic() {
  const resources = [
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
    },
    {
      icon: TrendingUp,
      title: "Cash Flow Forecasting 101",
      description: "Learn to predict your cash position 90 days out.",
      tag: "6 min read"
    },
    {
      icon: BookOpen,
      title: "Understanding Gross Margin",
      description: "Calculate and improve your profitability metrics.",
      tag: "5 min read"
    },
    {
      icon: Users,
      title: "Startup Budget Templates",
      description: "Download proven templates for different startup stages.",
      tag: "3 min read"
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
            <h1 className="text-5xl font-bold mb-6">Resources</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Tactical guides to help you take action today.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {resources.map((resource, index) => (
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
    </div>
  );
}
