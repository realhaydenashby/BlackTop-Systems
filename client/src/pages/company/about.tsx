import { Card, CardContent } from "@/components/ui/card";
import { Target, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-6">About BlackTop Systems</h1>
            <p className="text-xl text-muted-foreground">
              We built BlackTop Systems because founders and finance teams waste too much time fighting messy data.
            </p>
          </motion.div>

          <motion.div
            className="prose prose-lg dark:prose-invert max-w-none mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-lg text-muted-foreground mb-6">
              Upload your bank statements, invoices, receipts, or CSVs—our AI instantly extracts transactions, 
              spots problems, and tells you exactly what to do next.
            </p>
            <p className="text-lg text-muted-foreground mb-6">
              We're building the pre-accounting intelligence layer for SMBs and startups—financial diagnostics 
              without requiring a dedicated CFO or finance team.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              {
                icon: Target,
                title: "Our Mission",
                description: "Give every founder the financial clarity they need to make better decisions, faster."
              },
              {
                icon: Zap,
                title: "Our Approach",
                description: "AI-powered analysis that transforms messy documents into actionable insights in seconds."
              },
              {
                icon: Users,
                title: "Who We Serve",
                description: "Founders, ops managers, and fractional CFOs managing SMB and startup finances."
              }
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
              >
                <Card>
                  <CardContent className="pt-6">
                    <item.icon className="w-10 h-10 text-primary mb-4" />
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
