import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ArrowRight, LogOut, UserPlus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function WaitlistPending() {
  const { data: waitlistStatus, isLoading } = useQuery<{ isOnWaitlist: boolean }>({
    queryKey: ["/api/auth/waitlist-status"],
  });

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!waitlistStatus?.isOnWaitlist) {
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
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </nav>

        <main className="flex items-center justify-center px-4 py-24">
          <motion.div 
            className="w-full max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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
                    <UserPlus className="w-8 h-8 text-primary" />
                  </div>
                </motion.div>
                <CardTitle className="text-2xl font-bold" data-testid="text-join-title">
                  Join the Waitlist
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  You're signed in, but you'll need to request access to use BlackTop's live features.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Link href="/waitlist">
                  <Button className="w-full group" size="lg" data-testid="button-join-waitlist">
                    Request Early Access
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" className="w-full" size="lg" data-testid="button-explore-demo">
                    Explore the Demo First
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

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
          <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </nav>

      <main className="flex items-center justify-center px-4 py-24">
        <motion.div 
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-amber-500" />
                </div>
              </motion.div>
              <CardTitle className="text-2xl font-bold" data-testid="text-pending-title">
                You're on the Waitlist
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Thanks for signing up! We're carefully reviewing applications and will notify you when your access is ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 text-left">
                <h4 className="font-medium mb-2">While you wait</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    Explore the demo to see what BlackTop can do
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    We prioritize founders who share their pain points
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    Check your email for updates on your access
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
