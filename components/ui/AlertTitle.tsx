import * as React from "react";
import { cn } from "@/lib/utils";

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="alert-title"
      className={cn("col-start-2 font-semibold tracking-tight", className)}
      {...props}
    />
  );
}
