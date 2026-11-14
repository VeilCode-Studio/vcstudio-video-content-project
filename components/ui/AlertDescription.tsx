import * as React from "react";
import { cn } from "@/lib/utils";

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 space-y-3 text-sm leading-relaxed", className)}
      {...props}
    />
  );
}
