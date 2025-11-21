import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, TrendingUp, Target, Zap, Shield, Users, ArrowRight } from "lucide-react";
import logoUrl from "@assets/generated_images/blacktop_systems_company_logo.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="BlackTop Systems" className="w-10 h-10" />
            <span className="text-xl font-semibold">BlackTop Systems</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pricing">
              <Button variant="ghost" data-testid="link-pricing">Pricing</Button>
            </Link>
            <a href="/api/login">
              <Button data-testid="button-login">Sign In</Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">
            Turn Financial Chaos into Clean Spend Intelligence
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            AI-powered financial diagnostics for startups and SMBs. Upload documents, extract transactions, get insights, build budgets, and execute action plans — all in one place.
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/api/login">
              <Button size="lg" data-testid="button-get-started">
                Get Started <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </a>
            <Link href="/pricing">
              <Button size="lg" variant="outline" data-testid="link-view-pricing">View Pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <Zap className="w-10 h-10 text-primary mb-2" />
                <CardTitle>AI Document Extraction</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Upload PDFs, CSVs, images, or bank statements. Our AI automatically extracts transactions with high confidence scores.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="w-10 h-10 text-primary mb-2" />
                <CardTitle>Spend Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Visualize spending patterns by category, department, and vendor with interactive charts and KPIs.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Target className="w-10 h-10 text-primary mb-2" />
                <CardTitle>Smart Budgets</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  AI-suggested budget allocations based on historical spend and industry benchmarks.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="w-10 h-10 text-primary mb-2" />
                <CardTitle>Financial Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Detect spend drift, subscription creep, anomalies, and overspending with AI-powered diagnostics.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="w-10 h-10 text-primary mb-2" />
                <CardTitle>Multi-Tenant Workspaces</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Invite team members with role-based permissions (Founder, Ops, Accountant, CFO).
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <LineChart className="w-10 h-10 text-primary mb-2" />
                <CardTitle>Action Plans</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  AI-generated prioritized recommendations and tasks to optimize your financial operations.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 bg-card">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join startups and SMBs using BlackTop Systems to make smarter financial decisions.
          </p>
          <a href="/api/login">
            <Button size="lg" data-testid="button-start-now">
              Start Free Trial <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t px-6 py-8">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2025 BlackTop Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
