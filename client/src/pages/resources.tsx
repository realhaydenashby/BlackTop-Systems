import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, ArrowRight, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type Guide = {
  id: number;
  title: string;
  description: string;
  category: string;
  readTime: string;
  tags: string[];
  content: string;
};

const guides: Guide[] = [
  {
    id: 1,
    title: "How to Make Finance Meetings Not Suck — A 20-Minute Monthly Routine",
    description: "Finance meetings often feel tedious. Learn a simple 20-minute routine that keeps teams aligned without wasting time.",
    category: "Operations",
    readTime: "4 min",
    tags: ["Meetings", "Process", "Planning"],
    content: `Finance meetings often feel tedious, overly detailed, or disconnected from the work teams actually do. SMBs don't need long discussions — they need short, clear check-ins that keep everyone aligned.

Start the meeting with a quick review of actual spending versus expectations. This sets the stage without overwhelming anyone with detail. Surprises should be acknowledged but not debated yet.

Next, identify what changed during the month. New vendors, canceled tools, price increases, overtime, and unexpected purchases reveal the real story behind the numbers. These changes offer insight into team habits, operational bottlenecks, and emerging risks.

The most valuable part of the meeting is the action plan. This should include a few practical steps such as canceling unused subscriptions, renegotiating a vendor, tightening ad spend, or adjusting staffing. Limiting actions keeps the meeting focused and increases follow-through.

Close by setting expectations for the next month. Confirm department ranges, plan for any large purchases, and adjust for seasonality or strategic initiatives. This keeps the organization proactive rather than reactive.

A good finance meeting is short, predictable, and clarifying. With a simple routine, teams stay aligned and financially disciplined without wasting time.`,
  },
  {
    id: 2,
    title: "Simple Startup Budget Templates You Can Actually Use",
    description: "Traditional budget templates overcomplicate early-stage planning. Learn simple, practical structures that match your growth stage.",
    category: "Templates",
    readTime: "3 min",
    tags: ["Templates", "Budget", "Planning"],
    content: `Traditional budget templates often overcomplicate early-stage financial planning. Real startups need simple, practical structures that reflect their stage of growth.

Solo founders should focus on minimizing burn. Limiting recurring expenses, using only essential tools, and reviewing weekly spending helps preserve runway during the riskiest stage.

Small teams face new complexities such as payroll, collaborative tools, and customer acquisition. Creating broad spending categories and giving each a flexible range helps maintain balance between productivity and discipline. Monthly vendor checks and brief weekly budget reviews prevent drift.

As startups scale, more structure becomes necessary. Departments form, recurring expenses grow, and spending must align with revenue goals. Quarterly budgeting and regular vendor audits help maintain clarity. At this stage, procurement processes and SaaS seat management become important.

Budgets must evolve alongside the company. A flexible, stage-appropriate template supports healthy growth without unnecessary complexity.`,
  },
  {
    id: 3,
    title: "Understanding Gross Margin — The Only Profit Metric That Actually Matters",
    description: "Revenue alone doesn't determine business health. Learn why gross margin reveals whether your core business model works.",
    category: "Finance",
    readTime: "4 min",
    tags: ["Metrics", "Profitability", "Pricing"],
    content: `Revenue alone doesn't determine business health, and net profit often hides underlying issues. Gross margin, however, reveals whether the core business model works by showing how much value remains after delivering your product or service.

Gross margin is calculated by subtracting direct costs from revenue and dividing by revenue. Direct costs include materials, labor, shipping, hosting, and any other expense tied directly to fulfillment. A strong gross margin means the business can support overhead and fuel growth.

Industries vary widely. SaaS margins often exceed 75 percent, while agencies operate between 40 and 60 percent. E-commerce margins tend to fall between 30 and 50 percent due to product and shipping costs. Falling below your industry range generally indicates underpricing or inefficiencies.

Improving gross margin usually requires adjustments in pricing, cost control, or operational efficiency. Smart price increases tied to value, reduced rework, better scheduling, and vendor renegotiations can all strengthen margin significantly.

A strong gross margin provides breathing room and stability. If it's healthy, almost every other challenge becomes manageable. If it's weak, even high revenue can't sustain growth.

For SMBs, gross margin isn't just another metric — it's the foundation of long-term viability.`,
  },
  {
    id: 4,
    title: "Quickstart: How to Build a Monthly Budget Your Team Will Actually Follow",
    description: "Most SMB budgets fail because they're too rigid or complex. Build a simple, flexible budget grounded in past behavior.",
    category: "Planning",
    readTime: "4 min",
    tags: ["Budget", "Planning", "Team"],
    content: `Most SMB budgets fail because they're too rigid, too complex, or disconnected from daily realities. A functional budget should be simple, flexible, and grounded in past behavior.

Start by reviewing the last three to six months of actual spending. Remove one-time costs to uncover true averages. This baseline reveals how the business truly operates, not how you wish it operated.

Next, layer goals on top of the baseline. Determine whether the company is focused on growth, stability, or discipline. Adjust each category accordingly — small changes like a ten percent increase or decrease create meaningful structure without stressing teams.

Teams adopt budgets more reliably when given spending ranges instead of fixed limits. Ranges offer autonomy while still providing clear boundaries. A simple rule — notifying leadership if a range will be exceeded — prevents surprises and encourages proactive planning.

A weekly ten-minute review keeps the budget alive. Monthly reviews come too late, while short weekly check-ins catch drift early and keep everyone aligned.

Budgets succeed when they support teams rather than constrain them. A simple, flexible structure rooted in real spending creates financial clarity with minimal friction.`,
  },
  {
    id: 5,
    title: "How to Diagnose Spending Anomalies Before They Become Problems",
    description: "Major financial issues rarely appear suddenly. Learn to identify subtle spending shifts before they compound over time.",
    category: "Analytics",
    readTime: "5 min",
    tags: ["Analytics", "Detection", "Monitoring"],
    content: `Major financial issues rarely appear suddenly. Instead, they grow from small anomalies — subtle shifts in spending that compound over time. SMBs that learn to identify these early signals can correct course quickly, avoid overspending, and make better operational decisions.

One early indicator is category drift, where spending in a particular area steadily increases without a strategic reason. Marketing may rise as campaigns expand, or SaaS costs may climb as teams quietly add seats. Comparing the last 90 days to the previous 90 helps highlight changes that don't appear in a single monthly snapshot.

Vendor anomalies are also common. A vendor may raise prices slightly, add new fees, or charge for unused seats. SMBs often miss these gradual movements simply because they happen quietly. A monthly vendor review helps identify increases or duplicated vendors.

Payroll and contractor spending often contain anomalies as well. Overtime may rise unexpectedly, contractors may exceed retainer hours, or teams may allocate more time than a project requires. Because payroll is such a large expense, inefficiencies have an outsized impact.

Chaos spend — unplanned purchases made under pressure — is another warning sign. These may include emergency equipment, rushed shipping, or urgent contractor hires. They signal process weaknesses more than financial problems.

To avoid overreacting, SMBs should ask whether an anomaly was expected, strategic, and likely to repeat. If it was unexpected, unintentional, and recurring, it needs attention.

Spending anomalies are early warnings. Catching them early keeps businesses in control, predictable, and financially healthy.`,
  },
  {
    id: 6,
    title: "The SMB Spend Playbook",
    description: "A comprehensive guide to gaining financial visibility and control. Learn to clean vendor lists, identify drift, and maintain discipline.",
    category: "Guide",
    readTime: "8 min",
    tags: ["Comprehensive", "Vendors", "Control"],
    content: `Most SMBs don't overspend on purpose — they simply lose visibility. Money exits the business through software subscriptions, payroll fluctuations, contractor invoices, marketing campaigns, shipping costs, equipment purchases, and last-minute decisions that feel urgent in the moment. Without a central, organized view, even responsible operators end up making decisions based on incomplete or outdated information. The result is not just wasted cash but a lack of confidence in the financial direction of the business.

The first step toward clarity is cleaning and consolidating your vendor list. It's common for SMBs to carry inactive subscriptions, duplicated tools, or old vendors that continue billing because no one remembered to cancel them. Many operators discover that bank statements show cryptic codes rather than recognizable names. Normalizing vendor names and tagging their categories creates instant transparency and often exposes unexpected savings.

Once vendors are organized, it becomes easier to separate recurring costs from one-off purchases. Recurring costs represent your "true baseline burn," while one-off purchases often distort month-to-month comparisons. Understanding the difference helps teams distinguish between predictable financial commitments and spending that can be reduced or eliminated.

The most important concept to understand is spend drift — the slow, subtle increase in expenses that occurs without any conscious decision. Drift happens everywhere: subscriptions quietly increase in price, teams add new seats without removing old ones, contractors expand their hours, or marketing campaigns gradually scale beyond their original intent. While drift rarely appears alarming in a single month, it compounds quickly.

To bring discipline to the process, review trends rather than static totals. Month-over-month and quarter-over-quarter comparisons reveal meaningful shifts that raw numbers hide. If a category's spending changes dramatically and the team can't clearly explain why, you've uncovered a signal worth acting on.

Finally, one of the simplest yet most powerful techniques is to maintain a running list of your top ten expenses. These few line items often account for the majority of your total spend. Reviewing them frequently makes it easier to renegotiate rates, remove unnecessary tools, and set more realistic budgets.

In the end, financial clarity is not a complex problem. It begins with visibility. When SMBs clearly see where their money is going, better decisions follow naturally — and runway extends almost automatically.`,
  },
];

export default function Resources() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);

  const categories = ["all", ...Array.from(new Set(guides.map(g => g.category)))];
  
  const filteredGuides = guides.filter(guide => {
    const matchesSearch = guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guide.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guide.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || guide.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (selectedGuide) {
    return (
      <div className="p-6 space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => setSelectedGuide(null)}
          data-testid="button-back-to-resources"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Resources
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
              <Badge variant="secondary">{selectedGuide.category}</Badge>
              <span className="text-sm text-muted-foreground">{selectedGuide.readTime}</span>
            </div>
            <CardTitle className="text-3xl mb-4">{selectedGuide.title}</CardTitle>
            <CardDescription className="text-base">{selectedGuide.description}</CardDescription>
            <div className="flex flex-wrap gap-2 mt-4">
              {selectedGuide.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                {selectedGuide.content.split('\n\n').map((paragraph, idx) => (
                  <p key={idx} className="mb-4 text-base leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Resources</h1>
        <p className="text-muted-foreground">Tactical guides to improve your financial operations</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search guides..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-resources"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map((category) => (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  className="cursor-pointer hover-elevate"
                  onClick={() => setSelectedCategory(category)}
                  data-testid={`badge-category-${category.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {category === "all" ? "All" : category}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredGuides.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredGuides.map((guide) => (
            <Card 
              key={guide.id} 
              className="hover-elevate transition-all cursor-pointer group"
              onClick={() => setSelectedGuide(guide)}
              data-testid={`card-guide-${guide.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="secondary">{guide.category}</Badge>
                  <span className="text-xs text-muted-foreground">{guide.readTime}</span>
                </div>
                <CardTitle className="group-hover:text-primary transition-colors">
                  {guide.title}
                </CardTitle>
                <CardDescription>{guide.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  {guide.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="group/btn -ml-2">
                  <span>Read Guide</span>
                  <ArrowRight className="ml-2 w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No guides found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Need a specific guide?</CardTitle>
          <CardDescription>Request a new resource and we'll create it</CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-testid="button-request-guide">Request a Guide</Button>
        </CardContent>
      </Card>
    </div>
  );
}
