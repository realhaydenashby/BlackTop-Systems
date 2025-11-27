import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  GitBranch, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  Users,
  Clock
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScenarioConfig {
  name: string;
  revenueGrowthRate: number;
  burnGrowthRate: number;
  newHires: number;
  avgHireSalary: number;
  additionalExpenses: number;
  color: string;
}

interface ScenarioResult {
  name: string;
  color: string;
  monthlyBurn: number;
  runway: number | null;
  cashOutDate: string | null;
  burnChange: number;
  runwayChange: number;
}

interface ScenarioComparisonProps {
  currentCash: number;
  currentMonthlyBurn: number;
  currentMonthlyRevenue: number;
}

const defaultScenarios: ScenarioConfig[] = [
  {
    name: "Conservative",
    revenueGrowthRate: 3,
    burnGrowthRate: 0,
    newHires: 0,
    avgHireSalary: 0,
    additionalExpenses: 0,
    color: "bg-blue-500",
  },
  {
    name: "Base Case",
    revenueGrowthRate: 5,
    burnGrowthRate: 5,
    newHires: 1,
    avgHireSalary: 90000,
    additionalExpenses: 0,
    color: "bg-gray-500",
  },
  {
    name: "Aggressive",
    revenueGrowthRate: 10,
    burnGrowthRate: 10,
    newHires: 3,
    avgHireSalary: 95000,
    additionalExpenses: 5000,
    color: "bg-orange-500",
  },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function calculateScenario(
  config: ScenarioConfig,
  currentCash: number,
  currentMonthlyBurn: number,
  currentMonthlyRevenue: number
): ScenarioResult {
  const hireMonthlyCost = (config.newHires * config.avgHireSalary * 1.3) / 12;
  const burnGrowthFactor = 1 + config.burnGrowthRate / 100;
  const revenueGrowthFactor = 1 + config.revenueGrowthRate / 100;
  
  const newMonthlyBurn = currentMonthlyBurn * burnGrowthFactor + hireMonthlyCost + config.additionalExpenses;
  const newMonthlyRevenue = currentMonthlyRevenue * revenueGrowthFactor;
  const netBurn = newMonthlyBurn - newMonthlyRevenue;
  
  const originalNetBurn = currentMonthlyBurn - currentMonthlyRevenue;
  const originalRunway = originalNetBurn > 0 ? currentCash / originalNetBurn : null;
  const newRunway = netBurn > 0 ? currentCash / netBurn : null;
  
  let cashOutDate: string | null = null;
  if (newRunway !== null && newRunway > 0) {
    const cashOut = new Date();
    cashOut.setMonth(cashOut.getMonth() + Math.floor(newRunway));
    cashOutDate = cashOut.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  
  return {
    name: config.name,
    color: config.color,
    monthlyBurn: newMonthlyBurn,
    runway: newRunway,
    cashOutDate,
    burnChange: ((newMonthlyBurn - currentMonthlyBurn) / currentMonthlyBurn) * 100,
    runwayChange: originalRunway && newRunway 
      ? newRunway - originalRunway
      : 0,
  };
}

export function ScenarioComparison({
  currentCash,
  currentMonthlyBurn,
  currentMonthlyRevenue,
}: ScenarioComparisonProps) {
  const [scenarios, setScenarios] = useState<ScenarioConfig[]>(defaultScenarios);
  const [isOpen, setIsOpen] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const results = useMemo(() => {
    return scenarios.map(s => calculateScenario(s, currentCash, currentMonthlyBurn, currentMonthlyRevenue));
  }, [scenarios, currentCash, currentMonthlyBurn, currentMonthlyRevenue]);
  
  const updateScenario = (index: number, field: keyof ScenarioConfig, value: any) => {
    setScenarios(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };
  
  const bestRunway = Math.max(...results.filter(r => r.runway !== null).map(r => r.runway as number));
  const worstRunway = Math.min(...results.filter(r => r.runway !== null).map(r => r.runway as number));
  
  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Scenario Comparison
                </CardTitle>
                <CardDescription>
                  Compare different growth scenarios side-by-side
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" data-testid="button-toggle-scenario-comparison">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {results.map((result, index) => (
                <Card 
                  key={result.name} 
                  className={`relative overflow-hidden ${editingIndex === index ? "ring-2 ring-primary" : ""}`}
                  data-testid={`card-scenario-${result.name.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${result.color}`} />
                  
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${result.color}`} />
                        <CardTitle className="text-base">{result.name}</CardTitle>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                        data-testid={`button-edit-scenario-${index}`}
                      >
                        {editingIndex === index ? "Done" : "Edit"}
                      </Button>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {editingIndex === index ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Revenue Growth (%/mo)</Label>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[scenarios[index].revenueGrowthRate]}
                              onValueChange={([v]) => updateScenario(index, "revenueGrowthRate", v)}
                              min={0}
                              max={20}
                              step={1}
                              className="flex-1"
                            />
                            <span className="text-sm font-medium w-10 text-right">
                              {scenarios[index].revenueGrowthRate}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs">Burn Growth (%/mo)</Label>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[scenarios[index].burnGrowthRate]}
                              onValueChange={([v]) => updateScenario(index, "burnGrowthRate", v)}
                              min={0}
                              max={20}
                              step={1}
                              className="flex-1"
                            />
                            <span className="text-sm font-medium w-10 text-right">
                              {scenarios[index].burnGrowthRate}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs">New Hires</Label>
                          <Input
                            type="number"
                            value={scenarios[index].newHires}
                            onChange={(e) => updateScenario(index, "newHires", parseInt(e.target.value) || 0)}
                            min={0}
                            max={20}
                            data-testid={`input-new-hires-${index}`}
                          />
                        </div>
                        
                        {scenarios[index].newHires > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs">Avg Salary per Hire ($)</Label>
                            <Input
                              type="number"
                              value={scenarios[index].avgHireSalary}
                              onChange={(e) => updateScenario(index, "avgHireSalary", parseInt(e.target.value) || 0)}
                              min={0}
                              step={5000}
                              data-testid={`input-avg-salary-${index}`}
                            />
                          </div>
                        )}
                        
                        <div className="space-y-2">
                          <Label className="text-xs">Additional Monthly Expenses ($)</Label>
                          <Input
                            type="number"
                            value={scenarios[index].additionalExpenses}
                            onChange={(e) => updateScenario(index, "additionalExpenses", parseInt(e.target.value) || 0)}
                            min={0}
                            step={500}
                            data-testid={`input-additional-expenses-${index}`}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <TrendingUp className="h-3 w-3" />
                            <span>Rev +{scenarios[index].revenueGrowthRate}%/mo</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <TrendingDown className="h-3 w-3" />
                            <span>Burn +{scenarios[index].burnGrowthRate}%/mo</span>
                          </div>
                          {scenarios[index].newHires > 0 && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground col-span-2">
                              <Users className="h-3 w-3" />
                              <span>{scenarios[index].newHires} new hire{scenarios[index].newHires > 1 ? "s" : ""} @ {formatCurrency(scenarios[index].avgHireSalary)}</span>
                            </div>
                          )}
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              Monthly Burn
                            </span>
                            <div className="text-right">
                              <span className="font-semibold">{formatCurrency(result.monthlyBurn)}</span>
                              {result.burnChange !== 0 && (
                                <span className={`text-xs ml-1 ${result.burnChange > 0 ? "text-red-500" : "text-green-500"}`}>
                                  ({result.burnChange > 0 ? "+" : ""}{result.burnChange.toFixed(0)}%)
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Runway
                            </span>
                            <div className="text-right">
                              {result.runway !== null ? (
                                <div className="flex items-center gap-1">
                                  {result.runway === worstRunway && result.runway < 12 && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Shortest runway of all scenarios</TooltipContent>
                                    </Tooltip>
                                  )}
                                  <span className={`font-semibold ${result.runway < 6 ? "text-red-500" : result.runway < 12 ? "text-yellow-500" : ""}`}>
                                    {result.runway.toFixed(1)} months
                                  </span>
                                  {result.runwayChange !== 0 && (
                                    <span className={`text-xs ${result.runwayChange > 0 ? "text-green-500" : "text-red-500"}`}>
                                      ({result.runwayChange > 0 ? "+" : ""}{result.runwayChange.toFixed(1)}mo)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="font-semibold text-green-600">Profitable</span>
                              )}
                            </div>
                          </div>
                          
                          {result.cashOutDate && (
                            <div className="text-center pt-2 border-t">
                              <span className="text-xs text-muted-foreground">
                                Cash out: <span className="font-medium">{result.cashOutDate}</span>
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {result.runway === bestRunway && result.runway !== null && (
                          <Badge variant="secondary" className="absolute top-3 right-3 text-xs bg-green-500/10 text-green-600">
                            Best
                          </Badge>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="mt-6 p-4 rounded-lg bg-muted/50">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">How scenarios are calculated</p>
                  <p>
                    Each scenario applies growth rates to your current burn and revenue, adds fully-loaded 
                    hiring costs (salary × 1.3 for benefits/taxes), and projects runway based on your current 
                    cash position. Click "Edit" to customize any scenario's assumptions.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
