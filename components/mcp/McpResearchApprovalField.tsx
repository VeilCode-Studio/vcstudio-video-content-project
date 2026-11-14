import type { ResearchAnalysisApprovalMode } from "@studio/contracts/mcp-research";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
export function McpResearchApprovalField({
  id,
  value,
  onChange,
  owner,
  disabled,
}: {
  id: string;
  value: ResearchAnalysisApprovalMode;
  onChange: (mode: ResearchAnalysisApprovalMode) => void;
  owner: boolean;
  disabled: boolean;
}) {
  return (
    <div className="app-section rounded-xl border bg-muted/25 p-4">
      <div className="app-heading">
        <Label htmlFor={id}>Research analysis approval</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Let a trusted assistant inspect actual competitor images, carousel
          slides and accessible videos with audio. Each analysis requires an
          explicit maximum cost and must fit workspace budgets. Generation and
          publishing approvals are separate.
        </p>
      </div>
      <FormSelect
        id={id}
        name="researchAnalysisApprovalMode"
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === "manual" || next === "autonomous") onChange(next);
        }}
      >
        <SelectItem value="manual">Require my approval</SelectItem>
        <SelectItem value="autonomous" disabled={!owner}>
          Autonomous research analysis
        </SelectItem>
      </FormSelect>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Only an owner with Read, Media and Generate permissions can enable
        autonomy. New connections require approval by default. Media is
        temporary; findings are saved. Saving starts no work.
      </p>
    </div>
  );
}
