import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function WaitlistSuccess() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b backdrop-blur-md bg-background/90 sticky top-0 z-50">
        <div className="flex items-center justify-between w-full px-4 py-5">
          <Link href="/">
            <div className="flex items-center gap-2 group cursor-pointer">
              <img 
                src="/logo.png" 
                alt="BlackTop Systems" 
                className="h-6 object-contain transition-transform group-hover:scale-105" 
              />
            </div>
          </Link>
        </div>
      </nav>

      <main className="flex items-center justify-center px-4 py-24">
        <motion.div 
          className="w-full max-w-md"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-border/50 text-center">
            <CardHeader className="pb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto mb-4"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-primary" />
                </div>
              </motion.div>
              <CardTitle className="text-2xl font-bold" data-testid="text-success-title">
                You're on the list!
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Thanks for your interest in BlackTop. We'll reach out when your spot opens up.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 text-left">
                <h4 className="font-medium mb-2">What happens next?</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-medium">1.</span>
                    We review every application personally
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-medium">2.</span>
                    We'll email you when your access is ready
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-medium">3.</span>
                    Connect your accounts and get instant clarity
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <Link href="/dashboard">
                  <Button className="w-full group" size="lg" data-testid="button-explore-demo">
                    Explore the Demo
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="w-full" size="lg" data-testid="button-back-home">
                    Back to Home
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
