import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Lock, Eye, FileCheck } from "lucide-react";
import { motion } from "framer-motion";

export default function Security() {
  const securityFeatures = [
    {
      icon: Shield,
      title: "Enterprise-Grade Encryption",
      description: "All data encrypted at rest and in transit using industry-standard AES-256 encryption."
    },
    {
      icon: Lock,
      title: "Secure Authentication",
      description: "OAuth 2.0 and OIDC-based authentication powered by Replit Auth for secure access control."
    },
    {
      icon: Eye,
      title: "Data Privacy",
      description: "Your financial data is yours. We never share or sell your information to third parties."
    },
    {
      icon: FileCheck,
      title: "Compliance Ready",
      description: "Built with SOC 2 and GDPR compliance principles from day one."
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
            <h1 className="text-5xl font-bold mb-6">Security & Privacy</h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Your financial data is sensitive. We take security and privacy seriously.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {securityFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card>
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
          </div>

          <motion.div
            className="bg-muted/30 rounded-lg p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h2 className="text-2xl font-bold mb-4">Our Commitment</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                BlackTop Systems is built on a foundation of trust. We use Neon serverless PostgreSQL 
                for secure data storage, Google Cloud Storage for document management, and implement 
                role-based access control for multi-tenant organization workspaces.
              </p>
              <p>
                Every transaction, document, and insight is encrypted and isolated to your organization. 
                Our infrastructure is designed to protect your sensitive financial information at every layer.
              </p>
              <p>
                Have security questions? Contact our team at security@blacktop.systems
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
