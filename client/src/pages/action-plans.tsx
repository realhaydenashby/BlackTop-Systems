import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, Circle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ActionPlans() {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const { data: actionPlans, isLoading } = useQuery<any>({
    queryKey: ["/api/action-plans"],
  });

  const generateActionPlanMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/action-plans/generate", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/action-plans"] });
      toast({
        title: "Action plan generated",
        description: "AI has created a prioritized action plan based on your insights.",
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

  const updateActionItemMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return await apiRequest(`/api/action-items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/action-plans"] });
      toast({
        title: "Status updated",
        description: "Action item status has been updated.",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-blue-500" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, any> = {
      high: "destructive",
      medium: "default",
      low: "secondary",
    };
    return <Badge variant={variants[priority] || "secondary"}>{priority}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Action Plans</h1>
          <p className="text-muted-foreground">AI-generated recommendations and tasks</p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button data-testid="button-generate-action-plan">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Action Plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Action Plan</DialogTitle>
              <DialogDescription>
                AI will analyze your insights, budgets, and spending patterns to create a prioritized action plan
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Button
                onClick={() => generateActionPlanMutation.mutate()}
                disabled={generateActionPlanMutation.isPending}
                className="w-full"
                data-testid="button-confirm-generate-plan"
              >
                {generateActionPlanMutation.isPending ? "Generating..." : "Generate Plan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading action plans...</div>
      ) : actionPlans?.length > 0 ? (
        <div className="space-y-6">
          {actionPlans.map((plan: any) => (
            <Card key={plan.id} data-testid={`card-action-plan-${plan.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {format(new Date(plan.periodStart), "MMM yyyy")} Action Plan
                    </CardTitle>
                    <CardDescription>
                      {format(new Date(plan.periodStart), "MMM d")} - {format(new Date(plan.periodEnd), "MMM d, yyyy")}
                    </CardDescription>
                  </div>
                  <Badge variant={plan.status === "active" ? "default" : "secondary"}>
                    {plan.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {plan.generatedSummary && (
                  <div className="mb-6 p-4 bg-muted rounded-md">
                    <p className="text-sm">{plan.generatedSummary}</p>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="font-semibold">Action Items</h4>
                  {plan.items?.map((item: any) => (
                    <Card key={item.id} data-testid={`card-action-item-${item.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => {
                              const nextStatus = item.status === "open" ? "in_progress" : item.status === "in_progress" ? "done" : "open";
                              updateActionItemMutation.mutate({ itemId: item.id, status: nextStatus });
                            }}
                            data-testid={`button-toggle-status-${item.id}`}
                          >
                            {getStatusIcon(item.status)}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-medium">{item.description}</p>
                              {getPriorityBadge(item.priority)}
                            </div>
                            {item.impactEstimate && (
                              <p className="text-sm text-muted-foreground">
                                Estimated impact: ${parseFloat(item.impactEstimate).toLocaleString()}/mo
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No action plans yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Generate your first AI-powered action plan</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
