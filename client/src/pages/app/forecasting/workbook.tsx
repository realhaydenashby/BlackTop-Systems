import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Calculator, 
  TrendingUp, 
  RotateCcw,
  Download,
  Loader2,
  Info
} from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScenarioComparison } from "@/components/scenario-comparison";
import { ConfidenceIntervalChart } from "@/components/ConfidenceIntervalChart";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { FeatureGate } from "@/components/UpgradePrompt";

interface CompanyState {
  company_name: string;
  current_date: string;
  cash_balance: number;
  monthly_actuals: Array<{
    month: string;
    revenue: number;
    total_expenses: number;
    net_burn: number;
    expenses_by_category: Record<string, number>;
  }>;
  summary: {
    current_runway_months: number | null;
    monthly_burn_rate: number;
    cash_out_date: string | null;
    current_headcount: number;
    planned_headcount: number;
  };
}

interface MonthRow {
  month: Date;
  isActual: boolean;
  revenue: number;
  cogs: number;
  grossMargin: number;
  opexSoftware: number;
  opexPayroll: number;
  opexMarketing: number;
  opexOther: number;
  totalOpex: number;
  netCash: number;
  runway: number | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(date: Date): string {
  return format(date, "MMM yyyy");
}

function generateDataFromCompanyState(companyState: CompanyState | null): MonthRow[] {
  const now = new Date();
  const rows: MonthRow[] = [];
  
  const historicalMonths = 3;
  const projectedMonths = 9;
  
  let runningCash = companyState?.cash_balance || 500000;
  
  const actuals = companyState?.monthly_actuals || [];
  const recentActuals = actuals.slice(-historicalMonths);
  
  for (let i = historicalMonths - 1; i >= 0; i--) {
    const month = subMonths(now, i + 1);
    const actualData = recentActuals[historicalMonths - 1 - i];
    
    const revenue = actualData?.revenue || 45000 + (i * 2000);
    const totalExpenses = actualData?.total_expenses || 71000 + (i * 1000);
    const expensesByCategory = actualData?.expenses_by_category || {};
    
    const cogs = Math.floor(revenue * 0.25);
    const grossMargin = revenue - cogs;
    const opexSoftware = expensesByCategory["Software"] || 8500;
    const opexPayroll = expensesByCategory["Payroll"] || 52000;
    const opexMarketing = expensesByCategory["Marketing"] || 6000;
    const opexOther = totalExpenses - opexSoftware - opexPayroll - opexMarketing - cogs;
    const totalOpex = opexSoftware + opexPayroll + opexMarketing + Math.max(0, opexOther);
    const netChange = grossMargin - totalOpex;
    runningCash += netChange;
    
    const monthlyBurn = totalOpex - grossMargin;
    const runway = monthlyBurn > 0 ? runningCash / monthlyBurn : null;
    
    rows.push({
      month,
      isActual: true,
      revenue,
      cogs,
      grossMargin,
      opexSoftware,
      opexPayroll,
      opexMarketing,
      opexOther: Math.max(0, opexOther),
      totalOpex,
      netCash: runningCash,
      runway,
    });
  }
  
  for (let i = 0; i < projectedMonths; i++) {
    const month = addMonths(now, i);
    const lastRow = rows[rows.length - 1];
    
    const growthRate = 1.05;
    const revenue = Math.floor(lastRow.revenue * growthRate);
    const cogs = Math.floor(revenue * 0.25);
    const grossMargin = revenue - cogs;
    const opexSoftware = lastRow.opexSoftware;
    const opexPayroll = i >= 3 ? Math.floor(lastRow.opexPayroll * 1.1) : lastRow.opexPayroll;
    const opexMarketing = lastRow.opexMarketing;
    const opexOther = lastRow.opexOther;
    const totalOpex = opexSoftware + opexPayroll + opexMarketing + opexOther;
    const netChange = grossMargin - totalOpex;
    runningCash += netChange;
    
    const monthlyBurn = totalOpex - grossMargin;
    const runway = monthlyBurn > 0 ? runningCash / monthlyBurn : null;
    
    rows.push({
      month,
      isActual: false,
      revenue,
      cogs,
      grossMargin,
      opexSoftware,
      opexPayroll,
      opexMarketing,
      opexOther,
      totalOpex,
      netCash: runningCash,
      runway,
    });
  }
  
  return rows;
}

function generateDefaultData(): MonthRow[] {
  return generateDataFromCompanyState(null);
}

function MonteCarloSection({ rows, startingCash }: { rows: MonthRow[], startingCash: number }) {
  const monteCarloData = useMemo(() => {
    const projectedRows = rows.filter(r => !r.isActual);
    if (projectedRows.length === 0) {
      return null;
    }

    const recentActuals = rows.filter(r => r.isActual);
    const revenueVariance = recentActuals.length > 1 
      ? Math.sqrt(recentActuals.map(r => r.revenue).reduce((sum, v, _, arr) => {
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
          return sum + Math.pow(v - mean, 2);
        }, 0) / recentActuals.length) / (recentActuals.reduce((a, r) => a + r.revenue, 0) / recentActuals.length)
      : 0.15;
    
    const expenseVariance = recentActuals.length > 1
      ? Math.sqrt(recentActuals.map(r => r.totalOpex).reduce((sum, v, _, arr) => {
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
          return sum + Math.pow(v - mean, 2);
        }, 0) / recentActuals.length) / (recentActuals.reduce((a, r) => a + r.totalOpex, 0) / recentActuals.length)
      : 0.10;

    const volatilityRev = Math.max(0.05, Math.min(0.30, revenueVariance || 0.15));
    const volatilityExp = Math.max(0.03, Math.min(0.20, expenseVariance || 0.10));
    
    const SIMULATION_COUNT = 1000;
    
    const simulations: number[][] = [];
    for (let sim = 0; sim < SIMULATION_COUNT; sim++) {
      let cash = startingCash;
      const simPath: number[] = [];
      
      for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
        const projRow = projectedRows[Math.min(monthIdx, projectedRows.length - 1)];
        
        const revenueVariation = 1 + (Math.random() - 0.5) * 2 * volatilityRev;
        const expenseVariation = 1 + (Math.random() - 0.5) * 2 * volatilityExp;
        
        const monthlyRevenue = projRow.revenue * revenueVariation;
        const monthlyExpenses = projRow.totalOpex * expenseVariation;
        
        cash += monthlyRevenue - monthlyExpenses;
        simPath.push(Math.max(0, cash));
      }
      simulations.push(simPath);
    }
    
    const projections = Array.from({ length: 12 }, (_, monthIdx) => {
      const monthValues = simulations.map(sim => sim[monthIdx]).sort((a, b) => a - b);
      const p10Idx = Math.floor(SIMULATION_COUNT * 0.1);
      const p50Idx = Math.floor(SIMULATION_COUNT * 0.5);
      const p90Idx = Math.floor(SIMULATION_COUNT * 0.9);
      
      const month = addMonths(new Date(), monthIdx + 1);
      
      return {
        month: format(month, "yyyy-MM-dd"),
        expected: projectedRows[Math.min(monthIdx, projectedRows.length - 1)]?.netCash || startingCash,
        p10: monthValues[p10Idx],
        p50: monthValues[p50Idx],
        p90: monthValues[p90Idx],
      };
    });
    
    const survivalCount = simulations.filter(sim => sim[11] > 0).length;
    const probabilityOfSurvival = survivalCount / SIMULATION_COUNT;
    
    const runwayMonths = simulations.map(sim => {
      const zeroIdx = sim.findIndex(cash => cash <= 0);
      return zeroIdx === -1 ? 12 : zeroIdx + 1;
    }).sort((a, b) => a - b);
    
    const p10Runway = runwayMonths[Math.floor(SIMULATION_COUNT * 0.1)];
    const p50Runway = runwayMonths[Math.floor(SIMULATION_COUNT * 0.5)];
    const p90Runway = runwayMonths[Math.floor(SIMULATION_COUNT * 0.9)];
    
    return {
      projections,
      metrics: {
        expectedRunway: p50Runway,
        probabilityOfSurvival,
        p10Runway,
        p90Runway,
      },
      simulationCount: SIMULATION_COUNT,
    };
  }, [rows, startingCash]);

  if (!monteCarloData) {
    return null;
  }

  return (
    <ConfidenceIntervalChart
      data={monteCarloData}
      startingCash={startingCash}
      title="Runway Projections with Monte Carlo Confidence Intervals"
    />
  );
}

function EditableCell({
  value,
  onChange,
  isEditable,
  type = "currency",
}: {
  value: number;
  onChange: (value: number) => void;
  isEditable: boolean;
  type?: "currency" | "number";
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  const handleBlur = () => {
    setIsEditing(false);
    const numValue = parseFloat(editValue) || 0;
    if (numValue !== value) {
      onChange(numValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    } else if (e.key === "Escape") {
      setEditValue(value.toString());
      setIsEditing(false);
    }
  };

  if (!isEditable) {
    return (
      <span className="text-muted-foreground">
        {type === "currency" ? formatCurrency(value) : value.toFixed(1)}
      </span>
    );
  }

  if (isEditing) {
    return (
      <Input
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-7 w-24 text-right text-sm"
        autoFocus
        data-testid="input-cell-edit"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setEditValue(value.toString());
        setIsEditing(true);
      }}
      className="text-right hover:bg-muted/50 px-2 py-1 rounded cursor-pointer transition-colors"
      data-testid="button-cell-edit"
    >
      {type === "currency" ? formatCurrency(value) : value.toFixed(1)}
    </button>
  );
}

export default function Workbook() {
  const { canAccess } = usePlanAccess();
  const hasWorkbookAccess = canAccess("scenarioModeling");
  
  const { data: companyState, isLoading } = useQuery<CompanyState>({
    queryKey: ["/api/live/company-state"],
  });

  const [rows, setRows] = useState<MonthRow[]>(() => generateDefaultData());
  const [initialCash, setInitialCash] = useState(500000);

  useEffect(() => {
    if (companyState) {
      const newRows = generateDataFromCompanyState(companyState);
      setRows(newRows);
      setInitialCash(companyState.cash_balance || 500000);
    }
  }, [companyState]);

  const recalculateDerived = useCallback((updatedRows: MonthRow[]): MonthRow[] => {
    let runningCash = initialCash;
    
    return updatedRows.map((row, index) => {
      const grossMargin = row.revenue - row.cogs;
      const totalOpex = row.opexSoftware + row.opexPayroll + row.opexMarketing + row.opexOther;
      const netChange = grossMargin - totalOpex;
      
      if (index === 0 && row.isActual) {
        runningCash = row.netCash;
      } else {
        runningCash += netChange;
      }
      
      const monthlyBurn = totalOpex - grossMargin;
      const runway = monthlyBurn > 0 ? runningCash / monthlyBurn : null;
      
      return {
        ...row,
        grossMargin,
        totalOpex,
        netCash: runningCash,
        runway,
      };
    });
  }, [initialCash]);

  const updateCell = useCallback((rowIndex: number, field: keyof MonthRow, value: number) => {
    setRows((prevRows) => {
      const newRows = [...prevRows];
      newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
      return recalculateDerived(newRows);
    });
  }, [recalculateDerived]);

  const resetToDefaults = useCallback(() => {
    if (companyState) {
      setRows(generateDataFromCompanyState(companyState));
    } else {
      setRows(generateDefaultData());
    }
  }, [companyState]);

  const historicalRows = rows.filter((r) => r.isActual);
  const projectedRows = rows.filter((r) => !r.isActual);
  
  const totalProjectedRevenue = projectedRows.reduce((sum, r) => sum + r.revenue, 0);
  const totalProjectedBurn = projectedRows.reduce((sum, r) => sum + r.totalOpex - r.grossMargin, 0);
  const averageRunway = projectedRows[0]?.runway;

  return (
    <FeatureGate feature="scenarioModeling" hasAccess={hasWorkbookAccess}>
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-workbook">
            <Calculator className="h-6 w-6" />
            Modeling Workbook
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Adjust revenue, expenses, and hiring assumptions to see how changes affect your runway and cash projections. 
            Historical months are read-only; future months are editable.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults} data-testid="button-reset">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" size="sm" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading financial data...
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Starting Cash</p>
                <p className="text-2xl font-bold">{formatCurrency(initialCash)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Projected Revenue (9mo)</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalProjectedRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Projected Burn (9mo)</p>
                <p className="text-2xl font-bold text-red-500">{formatCurrency(totalProjectedBurn)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Runway</p>
                <p className="text-2xl font-bold">
                  {averageRunway ? `${averageRunway.toFixed(1)} mo` : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Financial Model
              </CardTitle>
              <CardDescription>
                Click on projected cells to edit. Derived values update automatically.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-muted-foreground/20" />
                <span className="text-muted-foreground">Actuals (read-only)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary/20" />
                <span className="text-muted-foreground">Projections (editable)</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[1200px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px] sticky left-0 bg-background z-10">Month</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          Gross Margin
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>Revenue - COGS (calculated)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-right border-l">Software</TableHead>
                    <TableHead className="text-right">Payroll</TableHead>
                    <TableHead className="text-right">Marketing</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          Total OpEx
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>Sum of all operating expenses (calculated)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-right border-l">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          Net Cash
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>Running cash balance (calculated)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          Runway
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>Months until cash runs out (calculated)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow 
                      key={row.month.toISOString()} 
                      className={row.isActual ? "bg-muted/30" : "bg-primary/5"}
                      data-testid={`row-${formatMonth(row.month).toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <TableCell className="font-medium sticky left-0 bg-inherit z-10">
                        <div className="flex items-center gap-2">
                          {formatMonth(row.month)}
                          {row.isActual ? (
                            <Badge variant="secondary" className="text-xs">Actual</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-primary/10 border-primary/20">Projected</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          value={row.revenue}
                          onChange={(v) => updateCell(index, "revenue", v)}
                          isEditable={!row.isActual}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          value={row.cogs}
                          onChange={(v) => updateCell(index, "cogs", v)}
                          isEditable={!row.isActual}
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(row.grossMargin)}
                      </TableCell>
                      <TableCell className="text-right border-l">
                        <EditableCell
                          value={row.opexSoftware}
                          onChange={(v) => updateCell(index, "opexSoftware", v)}
                          isEditable={!row.isActual}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          value={row.opexPayroll}
                          onChange={(v) => updateCell(index, "opexPayroll", v)}
                          isEditable={!row.isActual}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          value={row.opexMarketing}
                          onChange={(v) => updateCell(index, "opexMarketing", v)}
                          isEditable={!row.isActual}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          value={row.opexOther}
                          onChange={(v) => updateCell(index, "opexOther", v)}
                          isEditable={!row.isActual}
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(row.totalOpex)}
                      </TableCell>
                      <TableCell className="text-right border-l font-medium">
                        <span className={row.netCash < 100000 ? "text-red-500" : ""}>
                          {formatCurrency(row.netCash)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.runway !== null ? (
                          <span className={row.runway < 6 ? "text-red-500 font-medium" : ""}>
                            {row.runway.toFixed(1)} mo
                          </span>
                        ) : (
                          <span className="text-green-600">Profitable</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <ScenarioComparison
        currentCash={companyState?.cash_balance || 500000}
        currentMonthlyBurn={companyState?.summary?.monthly_burn_rate || 65000}
        currentMonthlyRevenue={rows.length > 0 ? rows[rows.length - 1].revenue : 45000}
      />

      <MonteCarloSection 
        rows={rows} 
        startingCash={companyState?.cash_balance || 500000} 
      />

      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <Info className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h4 className="font-medium mb-1">About the Modeling Workbook</h4>
              <p className="text-sm text-muted-foreground">
                This workbook lets you create "what-if" scenarios by adjusting projected revenue and expenses. 
                Changes automatically recalculate derived fields like Gross Margin, Total OpEx, Net Cash, and Runway. 
                Use the Scenario Comparison section above to compare Base, Conservative, and Aggressive growth plans side-by-side.
                The Monte Carlo simulation provides probabilistic runway forecasts with confidence intervals.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </FeatureGate>
  );
}
