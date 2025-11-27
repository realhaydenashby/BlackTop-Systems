import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
  Plus,
  Info
} from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

function generateInitialData(): MonthRow[] {
  const now = new Date();
  const rows: MonthRow[] = [];
  
  const historicalMonths = 3;
  const projectedMonths = 9;
  
  let runningCash = 850000;
  
  for (let i = historicalMonths - 1; i >= 0; i--) {
    const month = subMonths(now, i + 1);
    const revenue = 45000 + Math.floor(Math.random() * 10000);
    const cogs = Math.floor(revenue * 0.25);
    const grossMargin = revenue - cogs;
    const opexSoftware = 8500 + Math.floor(Math.random() * 1000);
    const opexPayroll = 52000 + Math.floor(Math.random() * 3000);
    const opexMarketing = 6000 + Math.floor(Math.random() * 2000);
    const opexOther = 4500 + Math.floor(Math.random() * 1000);
    const totalOpex = opexSoftware + opexPayroll + opexMarketing + opexOther;
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
      opexOther,
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
  const [rows, setRows] = useState<MonthRow[]>(generateInitialData);

  const recalculateDerived = useCallback((updatedRows: MonthRow[]): MonthRow[] => {
    let runningCash = 850000;
    
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
  }, []);

  const updateCell = useCallback((rowIndex: number, field: keyof MonthRow, value: number) => {
    setRows((prevRows) => {
      const newRows = [...prevRows];
      newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
      return recalculateDerived(newRows);
    });
  }, [recalculateDerived]);

  const resetToDefaults = useCallback(() => {
    setRows(generateInitialData());
  }, []);

  const historicalRows = rows.filter((r) => r.isActual);
  const projectedRows = rows.filter((r) => !r.isActual);
  
  const totalProjectedRevenue = projectedRows.reduce((sum, r) => sum + r.revenue, 0);
  const totalProjectedBurn = projectedRows.reduce((sum, r) => sum + r.totalOpex - r.grossMargin, 0);
  const averageRunway = projectedRows[0]?.runway;

  return (
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Starting Cash</p>
                <p className="text-2xl font-bold">{formatCurrency(850000)}</p>
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
                In future versions, you'll be able to save multiple scenarios, add planned hires, and compare outcomes side-by-side.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
