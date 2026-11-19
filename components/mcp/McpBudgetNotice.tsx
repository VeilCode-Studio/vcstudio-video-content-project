import type { McpBudgetNotice as BudgetNotice } from "@studio/contracts/mcp-budget";
import { Alert } from "@/components/ui/Alert";
import { AlertTitle } from "@/components/ui/AlertTitle";
import { AlertDescription } from "@/components/ui/AlertDescription";
import { InfoIcon } from "lucide-react";

export function McpBudgetNotice({ notice }: { notice?: BudgetNotice }) {
  if (!notice) return null;
  return (
    <Alert className="border-amber-500/30 bg-amber-500/10">
      <InfoIcon />
      <AlertTitle>Budget notice</AlertTitle>
      <AlertDescription>
        <p>
          Estimated cost: ${(notice.estimatedCostCents / 100).toFixed(2)}.
          Budgets are advisory for MCP actions; usage is still recorded.
        </p>
        {notice.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
        <p>{notice.execution}</p>
      </AlertDescription>
    </Alert>
  );
}
