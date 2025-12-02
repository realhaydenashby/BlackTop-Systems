import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all duration-fast focus:outline-none focus:ring-2 focus:ring-ring/50" +
  " hover-elevate",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary text-primary-foreground",
        secondary: 
          "border-secondary/50 bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/20 bg-destructive text-destructive-foreground",
        outline: 
          "border-input bg-background text-foreground",
        glass:
          "border-glass-border/30 bg-glass/50 text-glass-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
