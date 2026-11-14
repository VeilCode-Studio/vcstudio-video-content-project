import "server-only";
import { z } from "zod";
import {
  findMcpOperation,
  updateMcpOperation,
} from "@/db/repositories/mcp.repository";
import {
  claimResearchAnalysis,
  listResearchAnalysisOperations,
  saveResearchAnalysisResult,
} from "@/db/repositories/research-analysis.repository";
import { settleMcpGeneration } from "@/db/commands/mcp-generation-commands";
import {
  researchAnalysisRequestSchema,
  researchAnalysisPreviewSchema,
  researchAnalysisFindingsSchema,
  type ResearchAnalysisFindings,
} from "@studio/contracts/mcp-research";
import {
  RESEARCH_MEDIA_ANALYSIS_PROMPT_VERSION,
  researchMediaAnalysisPrompt,
} from "@studio/prompts";
import { researchAnalysisWorkerContext } from "./research-analysis-service";
import { collectResearchMedia } from "@/lib/social/research/analysis-media";
import { analyzeResearchMedia } from "@/lib/social/research/gemini-analysis-provider";
import { loadResearchPreviews } from "@/lib/social/research/previews";
import {
  researchAnalysisConfiguration,
  researchAnalysisCost,
} from "@/lib/social/research/analysis-environment";
import { fingerprint } from "./fingerprint";
import { requireMcp, McpError } from "./errors";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
export const researchAnalysisTaskInput = z.object({
  workspaceId: z.uuid(),
  operationId: z.uuid(),
});
export async function runResearchAnalysis(
  input: z.infer<typeof researchAnalysisTaskInput>,
) {
  const op = await findMcpOperation(input);
  if (
    !op ||
    !(await claimResearchAnalysis(input.workspaceId, input.operationId))
  )
    return { status: op?.status ?? "unavailable" };
  let submitted = false,
    actualCostCents = 0;
  let progress: Record<string, unknown> = {
    attemptCount: 1,
    provider: "google",
    startedAt: new Date().toISOString(),
    promptTemplateVersion: RESEARCH_MEDIA_ANALYSIS_PROMPT_VERSION,
  };
  try {
    const request = researchAnalysisRequestSchema.parse(op.input.request);
    const quote = researchAnalysisPreviewSchema.parse(op.input.preview);
    const { ctx, source } = await researchAnalysisWorkerContext(op);
    const previews = await loadResearchPreviews(ctx.workspaceId, {
      snapshotId: request.snapshotId,
    });
    const selected = previews.posts.find(
      (post) => post.postId === request.postId,
    );
    requireMcp(
      selected,
      "media_unavailable",
      "Meta no longer exposes media for this saved post. Refresh research or choose another post; no caption-only analysis ran.",
    );
    const media = await collectResearchMedia(
      selected,
      researchAnalysisConfiguration().FFPROBE_PATH,
    );
    const evidence = {
      caption: source.post.text,
      format: source.post.format,
      goal: request.goal,
      coverage: media.coverage,
    };
    const cacheKey = fingerprint({
      media: media.mediaHash,
      evidence,
      model: quote.model,
      configuration: op.input.configuration,
      prompt: RESEARCH_MEDIA_ANALYSIS_PROMPT_VERSION,
    });
    const cached = (
      await listResearchAnalysisOperations(ctx.workspaceId, source.account.id)
    ).find(
      (item) =>
        item.status === "succeeded" &&
        item.result?.cacheKey === cacheKey &&
        researchAnalysisFindingsSchema.safeParse(item.result.findings).success,
    );
    await researchAnalysisWorkerContext(op);
    let findings: ResearchAnalysisFindings;
    let providerDetails: Record<string, unknown>;
    if (cached) {
      findings = researchAnalysisFindingsSchema.parse(cached.result?.findings);
      providerDetails = { cacheHit: true, sourceAnalysisId: cached.id };
    } else {
      const result = await analyzeResearchMedia({
        parts: media.parts,
        evidence,
        beforeSubmit: async () => {
          await researchAnalysisWorkerContext(op);
          progress = {
            ...progress,
            model: quote.model,
            providerSubmitted: true,
            estimatedCostCents: quote.estimatedCostCents,
            providerSubmittedAt: new Date().toISOString(),
          };
          const recorded = await updateMcpOperation({
            ...input,
            from: ["running"],
            values: { result: progress },
          });
          requireMcp(
            recorded,
            "conflict",
            "This analysis was cancelled before submission.",
          );
          submitted = true;
          actualCostCents = quote.estimatedCostCents;
        },
      });
      findings = result.findings;
      if (media.coverage.audioStreams === 0)
        findings = {
          ...findings,
          transcript: null,
          limitations: [
            ...findings.limitations.slice(0, 14),
            "No audio stream was supplied; no spoken-content claims are verified.",
          ],
        };
      actualCostCents = result.usage
        ? researchAnalysisCost(
            result.usage.promptTokenCount,
            result.usage.candidatesTokenCount + result.usage.thoughtsTokenCount,
          )
        : quote.estimatedCostCents;
      providerDetails = {
        cacheHit: false,
        providerRequestId: result.requestId,
        modelVersion: result.modelVersion,
        usage: result.usage,
        usageAccounting: result.usage
          ? "conservative configured multimodal token rates"
          : "unknown usage; quote retained",
      };
    }
    await researchAnalysisWorkerContext(op);
    requireMcp(
      findings.observations.every(
        (item) =>
          (item.slide === null || item.slide <= media.coverage.items) &&
          (item.timeSeconds === null ||
            (media.coverage.durationSeconds > 0 &&
              item.timeSeconds <= media.coverage.durationSeconds)) &&
          (item.aspect !== "audio" || media.coverage.audioStreams > 0),
      ),
      "invalid_provider_result",
      "The provider returned evidence positions outside the analyzed media. Findings were not accepted.",
    );
    const result = {
      ...progress,
      ...providerDetails,
      model: quote.model,
      findings,
      coverage: media.coverage,
      mediaHash: media.mediaHash,
      cacheKey,
      prompt: researchMediaAnalysisPrompt(evidence),
      promptTemplateVersion: RESEARCH_MEDIA_ANALYSIS_PROMPT_VERSION,
      actualCostCents,
      completedAt: new Date().toISOString(),
      source: {
        snapshotId: request.snapshotId,
        postId: request.postId,
        url: source.post.url,
        observedAt: (
          source.row.completedAt ?? source.row.createdAt
        ).toISOString(),
      },
      performanceEvidence: {
        likes: source.post.likes,
        comments: source.post.comments,
        shares: source.post.shares,
        sampledPosts: source.snapshot.posts.length,
        hasMore: source.snapshot.hasMore,
        causality: "not_established",
      },
      href: `/app/social/research?account=${source.account.id}&observation=${request.snapshotId}`,
    };
    requireMcp(
      await saveResearchAnalysisResult({
        ...input,
        accountId: source.account.id,
        result,
      }),
      "conflict",
      "Research was deleted or changed before findings could be saved.",
    );
    await settleMcpGeneration(
      input.workspaceId,
      input.operationId,
      actualCostCents,
    );
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorUserId: op.userId,
      action: "mcp_action_completed",
      targetType: "mcp_operation",
      targetId: op.id,
      metadata: {
        kind: "research_analysis",
        provider: "google",
        actualCostCents,
        cacheHit: !!cached,
      },
    });
    return { status: "succeeded" };
  } catch (error) {
    await updateMcpOperation({
      ...input,
      from: ["running"],
      values: {
        status: "failed",
        error:
          error instanceof McpError
            ? error.message
            : "Media analysis could not finish safely. No automatic paid retry was made. Inspect status and Usage & budgets before preparing again.",
        result: {
          ...progress,
          providerSubmitted: submitted,
          actualCostCents,
          completedAt: new Date().toISOString(),
        },
      },
    });
    await settleMcpGeneration(
      input.workspaceId,
      input.operationId,
      actualCostCents,
    );
    return { status: "failed" };
  }
}
