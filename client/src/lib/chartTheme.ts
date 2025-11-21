// Shared chart theme for consistent styling across all analytics

export const chartColors = {
  primary: 'hsl(var(--chart-1))',     // Deep muted blue
  secondary: 'hsl(var(--chart-2))',   // Muted teal
  tertiary: 'hsl(var(--chart-3))',    // Dark gray
  quaternary: 'hsl(var(--chart-4))',  // Muted violet
  quinary: 'hsl(var(--chart-5))',     // Soft cyan
};

export const CHART_COLORS = [
  chartColors.primary,
  chartColors.secondary,
  chartColors.tertiary,
  chartColors.quaternary,
  chartColors.quinary,
];

// Common Recharts style props
export const chartStyles = {
  cartesianGrid: {
    strokeDasharray: '3 3',
    stroke: 'hsl(var(--border))',
    opacity: 0.3,
  },
  xAxis: {
    stroke: 'hsl(var(--muted-foreground))',
    fontSize: 12,
    tickLine: false,
  },
  yAxis: {
    stroke: 'hsl(var(--muted-foreground))',
    fontSize: 12,
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      backgroundColor: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--popover-border))',
      borderRadius: 'var(--radius)',
      color: 'hsl(var(--popover-foreground))',
    },
    cursor: {
      fill: 'hsl(var(--muted))',
      opacity: 0.2,
    },
  },
  legend: {
    wrapperStyle: {
      color: 'hsl(var(--foreground))',
      fontSize: 12,
    },
  },
};

// Line chart specific styles
export const lineStyles = {
  strokeWidth: 2,
  dot: { r: 3 },
  activeDot: { r: 5 },
};

// Area chart specific styles
export const areaStyles = {
  strokeWidth: 2,
  fillOpacity: 0.2,
};

// Bar chart specific styles
export const barStyles = {
  radius: [4, 4, 0, 0] as [number, number, number, number],
};
