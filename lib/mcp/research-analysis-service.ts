import { loadMcpBudgetNotice } from "./budget-notice";
import "server-only";
import { tasks } from "@trigger.dev/sdk";
import {
  researchAnalysisRequestSchema,
  researchAnalysisPreviewSchema,
  type ResearchAnalysisRequest,
} from "@studio/contracts/mcp-research";
import { researchSnapshotSchema } from "@studio/contracts/social-research";
import {
  findResearchOperation,
  findResearchAccount,
  getResearchConnection,
} from "@/db/repositories/social-research.repository";
import {
  beginMcpOperation,
  findMcpOperation,
  findMcpOperationByKey,
  updateMcpOperation,
  type McpOperation,
} from "@/db/repositories/mcp.repository";
import { consumeResearchAnalysis } from "@/db/repositories/research-analysis.repository";
import {
  reserveMcpGeneration,
  settleMcpGeneration,
} from "@/db/commands/mcp-generation-commands";
import { loadEffectiveWorkspaceBudget } from "@/lib/budgets/workspace-budget";
import {
  researchAnalysisConfiguration,
  researchAnalysisCost,
  RESEARCH_MAX_INPUT_TOKENS,
  RESEARCH_MAX_OUTPUT_TOKENS,
  RESEARCH_MAX_BYTES,
  RESEARCH_MAX_DURATION_SECONDS,
} from "@/lib/social/research/analysis-environment";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import { authorizeMcp, authorizeMcpBrowser, type McpContext } from "./context";
import { requireResearchEditor, researchApprovalMode } from "./research-policy";
import { fingerprint } from "./fingerprint";
import { McpError, requireMcp } from "./errors";
import { publicOperation } from "./operations";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { reconcileResearchAnalysis } from "./research-analysis-recovery";

export function researchAuthority(ctx: McpContext) {
  return fingerprint({
    connection: ctx.connection.updatedAt.toISOString(),
    grant: ctx.grant.updatedAt.toISOString(),
    role: ctx.membership.role,
    mode: ctx.grant.researchAnalysisApprovalMode,
    userId: ctx.principal.userId,
  });
}
export async function authorizeResearchAnalysis(ctx: McpContext) {
  requireMcp(
    isSocialResearchEnabled(),
    "feature_disabled",
    "Social research is disabled.",
  );
  requireMcp(
    researchAnalysisConfiguration().available,
    "feature_disabled",
    "Research media analysis is not configured. Saved research remains readable.",
  );
  requireResearchEditor(ctx);
  for (const scope of [
    "vcstudio:read",
    "vcstudio:media",
    "vcstudio:generate",
  ] as const)
    await authorizeMcp(ctx.principal, ctx.workspaceId, scope);
}
export async function researchAnalysisSource(
  workspaceId: string,
  request: ResearchAnalysisRequest,
) {
  const row = await findResearchOperation(workspaceId, request.snapshotId);
  requireMcp(
    row?.status === "succeeded",
    "not_found",
    "This saved research observation is unavailable.",
  );
  const account = await findResearchAccount(workspaceId, row.accountId);
  requireMcp(
    account,
    "not_found",
    "The research account was archived or deleted.",
  );
  const snapshot = researchSnapshotSchema.parse(row.data);
  const post = snapshot.posts.find((post) => post.id === request.postId);
  requireMcp(post, "not_found", "This post is not part of that observation.");
  requireMcp(
    ["image", "carousel", "video", "reel"].includes(post.format),
    "invalid_input",
    "Choose a saved image, carousel, Reel or video. Caption-only analysis is not media analysis.",
  );
  const connection = await getResearchConnection(workspaceId);
  requireMcp(
    connection?.accessTokenSealed &&
      !connection.revokedAt &&
      connection.expiresAt &&
      connection.expiresAt > new Date(),
    "permission_denied",
    "Ask the workspace owner to reconnect Meta research.",
  );
  return { row, account, snapshot, post, metaRevision: connection.revision };
}
function planConfiguration() {
  const c = researchAnalysisConfiguration();
  return {
    model: c.RESEARCH_ANALYSIS_MODEL,
    inputRate: c.RESEARCH_ANALYSIS_INPUT_COST_PER_MILLION_CENTS,
    outputRate: c.RESEARCH_ANALYSIS_OUTPUT_COST_PER_MILLION_CENTS,
  };
}
export async function prepareResearchAnalysis(
  ctx: McpContext,
  key: string,
  raw: ResearchAnalysisRequest,
) {
  await authorizeResearchAnalysis(ctx);
  const request = researchAnalysisRequestSchema.parse(raw);
  const hash = fingerprint({ kind: "research_analysis", request });
  const previous = await findMcpOperationByKey(
    ctx.connection.id,
    ctx.workspaceId,
    key,
  );
  if (previous) {
    requireMcp(
      previous.kind === "research_analysis" && previous.fingerprint === hash,
      "conflict",
      "That key belongs to another request or deleted research.",
    );
    return {
      operation: publicOperation(previous),
      preview: previous.input.preview,
      analysisApprovalMode: researchApprovalMode({
        ...ctx.grant,
        role: ctx.membership.role,
      }),
    };
  }
  const source = await researchAnalysisSource(ctx.workspaceId, request);
  const estimatedCostCents = researchAnalysisCost(
    RESEARCH_MAX_INPUT_TOKENS,
    RESEARCH_MAX_OUTPUT_TOKENS,
  );
  const expiresAt = new Date(Date.now() + 600000);
  const preview = researchAnalysisPreviewSchema.parse({
    budget: await loadMcpBudgetNotice({
      workspaceId: ctx.workspaceId,
      estimatedCostCents,
      maximumCostCents: request.maximumCostCents,
    }),
    accountName: source.account.name,
    postUrl: source.post.url,
    caption: source.post.text,
    format: source.post.format,
    goal: request.goal,
    model: planConfiguration().model,
    estimatedCostCents,
    maximumCostCents: request.maximumCostCents,
    maximumBytes: RESEARCH_MAX_BYTES,
    maximumDurationSeconds: RESEARCH_MAX_DURATION_SECONDS,
    expiresAt: expiresAt.toISOString(),
  });
  const mode = researchApprovalMode({
    ...ctx.grant,
    role: ctx.membership.role,
  });
  const started = await beginMcpOperation({
    workspaceId: ctx.workspaceId,
    connectionId: ctx.connection.id,
    userId: ctx.principal.userId,
    kind: "research_analysis",
    idempotencyKey: key,
    fingerprint: hash,
    status: mode === "autonomous" ? "prepared" : "requires_approval",
    expiresAt,
    input: {
      accountId: source.account.id,
      budgetPolicy: "advisory",
      request,
      preview,
      authority: researchAuthority(ctx),
      metaRevision: source.metaRevision,
      sourceHash: fingerprint(source.snapshot),
      configuration: planConfiguration(),
    },
  });
  requireMcp(
    started.operation.fingerprint === hash,
    "conflict",
    "That key was concurrently used for different inputs.",
  );
  await recordAuditEvent({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.principal.userId,
    action: "mcp_action_completed",
    targetType: "mcp_operation",
    targetId: started.operation.id,
    metadata: {
      kind: "research_analysis_prepared",
      approvalMode: mode,
      estimatedCostCents,
    },
  });
  return {
    operation: publicOperation(started.operation),
    preview,
    analysisApprovalMode: mode,
    reviewUrl: publicOperation(started.operation).href,
  };
}
export async function assertResearchAnalysisAuthority(
  ctx: McpContext,
  op: McpOperation,
) {
  await authorizeResearchAnalysis(ctx);
  requireMcp(
    op.connectionId === ctx.connection.id &&
      op.userId === ctx.principal.userId &&
      op.kind === "research_analysis" &&
      !op.input.deleted,
    "permission_denied",
    "This research analysis is unavailable for this connection.",
  );
  requireMcp(
    op.input.authority === researchAuthority(ctx),
    "conflict",
    "Connection permissions changed; prepare a fresh analysis.",
  );
  requireMcp(
    fingerprint(op.input.configuration) === fingerprint(planConfiguration()),
    "conflict",
    "The analysis model or pricing changed; prepare again.",
  );
  const source = await researchAnalysisSource(
    ctx.workspaceId,
    researchAnalysisRequestSchema.parse(op.input.request),
  );
  requireMcp(
    source.metaRevision === op.input.metaRevision &&
      fingerprint(source.snapshot) === op.input.sourceHash,
    "conflict",
    "The saved research or Meta authorization changed; prepare again.",
  );
  return source;
}
export async function dispatchResearchAnalysis(
  ctx: McpContext,
  op: McpOperation,
) {
  const preview = researchAnalysisPreviewSchema.parse(op.input.preview);
  const budget = await loadEffectiveWorkspaceBudget({
    workspaceId: ctx.workspaceId,
  });
  try {
    await reserveMcpGeneration({
      workspaceId: ctx.workspaceId,
      operationId: op.id,
      estimatedCostCents: preview.estimatedCostCents,
      maximumCostCents: preview.maximumCostCents,
      dailyBudgetCents: budget.dailyBudgetCents,
      monthlyBudgetCents: budget.monthlyBudgetCents,
      kind: "research_analysis",
    });
  } catch (error) {
    if (!(error instanceof McpError) || error.code !== "capacity_unavailable")
      throw error;
    const waiting = await updateMcpOperation({
      workspaceId: ctx.workspaceId,
      operationId: op.id,
      from: ["approved"],
      values: { error: error.message },
    });
    return publicOperation(waiting ?? op);
  }
  try {
    const handle = await tasks.trigger(
      "mcp-research-analysis",
      { workspaceId: ctx.workspaceId, operationId: op.id },
      { idempotencyKey: `research-analysis:${op.id}`, idempotencyKeyTTL: "2h" },
    );
    const queued = await updateMcpOperation({
      workspaceId: ctx.workspaceId,
      operationId: op.id,
      from: ["approved"],
      values: { status: "queued", triggerRunId: handle.id },
    });
    if (!queued)
      await updateMcpOperation({
        workspaceId: ctx.workspaceId,
        operationId: op.id,
        from: ["queued", "running"],
        values: { triggerRunId: handle.id },
      });
    return publicOperation(
      queued ??
        (await findMcpOperation({
          workspaceId: ctx.workspaceId,
          operationId: op.id,
        })) ??
        op,
    );
  } catch {
    // Dispatch outcome can be uncertain. Keep the reservation until recovery verifies no submission.
    const failed = await updateMcpOperation({
      workspaceId: ctx.workspaceId,
      operationId: op.id,
      from: ["approved"],
      values: {
        error:
          "Worker dispatch was not confirmed. Check status using this operation; do not prepare a duplicate paid request.",
      },
    });
    return publicOperation(failed ?? op);
  }
}
async function start(
  ctx: McpContext,
  id: string,
  key: string | undefined,
  manual: boolean,
) {
  const op = await findMcpOperation({
    workspaceId: ctx.workspaceId,
    operationId: id,
  });
  requireMcp(op, "not_found", "Analysis request not found.");
  await assertResearchAnalysisAuthority(ctx, op);
  requireMcp(
    manual || op.idempotencyKey === key,
    "conflict",
    "Use the same idempotency key as preparation.",
  );
  if (op.status === "approved") {
    requireMcp(
      op.expiresAt > new Date(),
      "expired",
      "This analysis quote expired. Prepare a fresh request.",
    );
    return dispatchResearchAnalysis(ctx, op);
  }
  if (!["requires_approval", "prepared"].includes(op.status))
    return publicOperation(op);
  requireMcp(
    op.expiresAt > new Date(),
    "expired",
    "This analysis quote expired. Prepare a fresh request.",
  );
  requireMcp(
    manual ||
      researchApprovalMode({ ...ctx.grant, role: ctx.membership.role }) ===
        "autonomous",
    "approval_required",
    "This connection requires human approval through its signed-in review.",
  );
  const consumed = await consumeResearchAnalysis(ctx, id, manual);
  if (!consumed) {
    const current = await findMcpOperation({
      workspaceId: ctx.workspaceId,
      operationId: id,
    });
    requireMcp(
      current && !["requires_approval", "prepared"].includes(current.status),
      "conflict",
      "This approval became stale or was already consumed.",
    );
    return publicOperation(current);
  }
  const approved = await findMcpOperation({
    workspaceId: ctx.workspaceId,
    operationId: id,
  });
  requireMcp(approved, "not_found", "Analysis is unavailable.");
  await recordAuditEvent({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.principal.userId,
    action: "mcp_action_completed",
    targetType: "mcp_operation",
    targetId: id,
    metadata: {
      kind: "research_analysis_authorized",
      approvalMode: manual ? "manual" : "autonomous",
    },
  });
  try {
    return await dispatchResearchAnalysis(ctx, approved);
  } catch (error) {
    await updateMcpOperation({
      workspaceId: ctx.workspaceId,
      operationId: id,
      from: ["approved"],
      values: {
        status: "failed",
        error:
          "Analysis could not acquire a processing slot. Inspect this operation and active work before retrying.",
      },
    });
    await settleMcpGeneration(ctx.workspaceId, id, 0);
    throw error;
  }
}
export async function executeResearchAnalysis(
  ctx: McpContext,
  id: string,
  key: string,
) {
  return start(ctx, id, key, false);
}
// Only invoked by the authenticated same-origin browser action. No ordinary MCP confirmation argument exists.
export async function approveResearchAnalysis(ctx: McpContext, id: string) {
  return start(ctx, id, undefined, true);
}
export async function researchAnalysisWorkerContext(op: McpOperation) {
  const ctx = await authorizeMcpBrowser(
    op.userId,
    op.connectionId,
    op.workspaceId,
    "vcstudio:generate",
  );
  const source = await assertResearchAnalysisAuthority(ctx, op);
  return { ctx, source };
}
export async function getResearchAnalysisStatus(ctx: McpContext, id: string) {
  requireMcp(
    isSocialResearchEnabled(),
    "feature_disabled",
    "Research is disabled.",
  );
  const op = await findMcpOperation({
    workspaceId: ctx.workspaceId,
    operationId: id,
  });
  requireMcp(
    op?.kind === "research_analysis",
    "not_found",
    "Analysis is unavailable in this workspace.",
  );
  requireMcp(
    !op.input.deleted,
    "not_found",
    "This research account and its analysis were permanently deleted.",
  );
  const accountId = op.input.accountId;
  requireMcp(
    typeof accountId === "string" &&
      (await findResearchAccount(ctx.workspaceId, accountId)),
    "not_found",
    "This research account is unavailable.",
  );
  return publicOperation(await reconcileResearchAnalysis(op));
}
