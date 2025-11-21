import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, ArrowRight } from "lucide-react";
import { useState } from "react";

const guides = [
  {
    id: 1,
    title: "Reduce Software Burn",
    description: "How to cut SaaS costs without breaking team workflows. Identify unused licenses, consolidate tools, and negotiate better terms.",
    category: "Cost Optimization",
    readTime: "5 min",
    tags: ["SaaS", "Cost Reduction", "Tools"],
  },
  {
    id: 2,
    title: "Structure a Marketing Budget",
    description: "How to build a real marketing budget as a pre-seed startup. Allocate across channels, set KPIs, and track ROI effectively.",
    category: "Planning",
    readTime: "7 min",
    tags: ["Marketing", "Budget", "Growth"],
  },
  {
    id: 3,
    title: "Quarterly Vendor Audit",
    description: "Run a complete vendor audit in 30 minutes or less. Review contracts, identify duplicates, and renegotiate terms.",
    category: "Operations",
    readTime: "4 min",
    tags: ["Vendors", "Audit", "Process"],
  },
  {
    id: 4,
    title: "Cash Flow Forecasting Basics",
    description: "Learn to predict your cash position 90 days out using historical data and growth assumptions.",
    category: "Finance",
    readTime: "6 min",
    tags: ["Cash Flow", "Forecasting", "Planning"],
  },
  {
    id: 5,
    title: "Understanding Gross Margin",
    description: "Calculate and improve your gross margin. Understand COGS, pricing strategy, and profitability metrics.",
    category: "Finance",
    readTime: "5 min",
    tags: ["Metrics", "Profitability", "Pricing"],
  },
  {
    id: 6,
    title: "Startup Budget Templates",
    description: "Download proven budget templates for different startup stages. Pre-seed, seed, and Series A examples.",
    category: "Templates",
    readTime: "3 min",
    tags: ["Templates", "Budget", "Planning"],
  },
];

export default function Resources() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = ["all", ...Array.from(new Set(guides.map(g => g.category)))];
  
  const filteredGuides = guides.filter(guide => {
    const matchesSearch = guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guide.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guide.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || guide.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
