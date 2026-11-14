import "server-only";
import { runs } from "@trigger.dev/sdk";
import {
  findMcpOperation,
  updateMcpOperation,
  type McpOperation,
} from "@/db/repositories/mcp.repository";
import { listResearchAnalysisRecovery } from "@/db/repositories/research-analysis.repository";
import { settleMcpGeneration } from "@/db/commands/mcp-generation-commands";
export async function failStoppedResearchAnalysis(
  workspaceId: string,
  operationId: string,
) {
  const op = await findMcpOperation({ workspaceId, operationId });
  if (!op || op.kind !== "research_analysis") return op;
  const submitted = op.result?.providerSubmitted === true;
  const quote = op.input.preview;
  const estimate =
    typeof quote === "object" &&
    quote !== null &&
    "estimatedCostCents" in quote &&
    typeof quote.estimatedCostCents === "number"
      ? quote.estimatedCostCents
      : typeof op.result?.estimatedCostCents === "number"
        ? op.result.estimatedCostCents
        : 0;
  const cost =
    typeof op.result?.actualCostCents === "number"
      ? op.result.actualCostCents
      : submitted
        ? estimate
        : 0;
  const failed = await updateMcpOperation({
    workspaceId,
    operationId,
    from: ["approved", "queued", "running"],
    values: {
      status: "failed",
      error: submitted
        ? "The analysis worker stopped after provider submission. The recorded or quoted cost was retained; no automatic paid retry was made."
        : "The analysis worker stopped before provider submission. Its reservation was released. Prepare a fresh request if needed.",
      result: {
        ...op.result,
        providerSubmitted: submitted,
        actualCostCents: cost,
      },
    },
  });
  await settleMcpGeneration(workspaceId, operationId, cost);
  return failed ?? op;
}
export async function reconcileResearchAnalysis(op: McpOperation) {
  if (
    !op.triggerRunId ||
    !["queued", "running"].includes(op.status) ||
    Date.now() - op.updatedAt.getTime() < 10000
  )
    return op;
  const run = await runs.retrieve(op.triggerRunId);
  return [
    "COMPLETED",
    "FAILED",
    "CRASHED",
    "CANCELED",
    "TIMED_OUT",
    "EXPIRED",
    "SYSTEM_FAILURE",
  ].includes(run.status)
    ? ((await failStoppedResearchAnalysis(op.workspaceId, op.id)) ?? op)
    : op;
}
/** Called only from the existing half-hour recovery; never resubmits billable analysis. */
export async function recoverResearchAnalyses() {
  let recovered = 0;
  for (const row of await listResearchAnalysisRecovery()) {
    const op = await findMcpOperation({
      workspaceId: row.workspace_id,
      operationId: row.id,
    });
    if (!op) continue;
    await failStoppedResearchAnalysis(op.workspaceId, op.id);
    recovered++;
  }
  return recovered;
}
