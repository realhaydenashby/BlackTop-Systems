import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Budgets() {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const { data: budgets, isLoading } = useQuery<any>({
    queryKey: ["/api/budgets"],
  });

  const generateBudgetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/budgets/generate", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({
        title: "Budget generated",
        description: "AI has created a suggested budget based on your spending patterns.",
      });
      setIsCreating(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const calculateProgress = (spent: number, budgeted: number) => {
    return Math.min((spent / budgeted) * 100, 100);
  };

  const getProgressColor = (progress: number) => {
    if (progress > 90) return "text-destructive";
    if (progress > 75) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Budgets</h1>
          <p className="text-muted-foreground">Manage budget allocations and track spending</p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-budget">
              <Plus className="mr-2 h-4 w-4" />
              Create Budget
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Budget</DialogTitle>
              <DialogDescription>
                Let AI suggest a budget based on your historical spending patterns
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Button
                onClick={() => generateBudgetMutation.mutate()}
                disabled={generateBudgetMutation.isPending}
                className="w-full"
                data-testid="button-generate-ai-budget"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generateBudgetMutation.isPending ? "Generating..." : "Generate AI Budget"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading budgets...</div>
      ) : budgets?.length > 0 ? (
        <div className="grid gap-6">
          {budgets.map((budget: any) => (
            <Card key={budget.id} data-testid={`card-budget-${budget.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {format(new Date(budget.periodStart), "MMM yyyy")} Budget
                    </CardTitle>
                    <CardDescription>
                      {format(new Date(budget.periodStart), "MMM d")} - {format(new Date(budget.periodEnd), "MMM d, yyyy")}
                    </CardDescription>
                  </div>
                  <Badge variant={budget.status === "active" ? "default" : "secondary"}>
                    {budget.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Total Budget</span>
                      <span className="text-2xl font-bold">
                        ${parseFloat(budget.totalBudgetAmount).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {budget.breakdown && Object.keys(budget.breakdown).length > 0 && (
                    <div className="space-y-4">
                      <h4 className="font-semibold">Category Breakdown</h4>
                      {Object.entries(budget.breakdown).map(([category, amount]: [string, any]) => {
                        const spent = budget.spent?.[category] || 0;
                        const progress = calculateProgress(spent, amount);
                        return (
                          <div key={category} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{category}</span>
                              <span className={getProgressColor(progress)}>
                                ${spent.toLocaleString()} / ${amount.toLocaleString()}
                              </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No budgets yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first AI-powered budget</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
