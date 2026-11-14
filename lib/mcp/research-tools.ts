import "server-only";
import { z } from "zod";
import {
  mcpMutationInput,
  mcpPageInput,
  mcpWorkspaceInput,
} from "@studio/contracts";
import { researchAccountInputSchema } from "@studio/contracts/social-research";
import {
  prepareResearchAnalysisInput,
  executeResearchAnalysisInput,
  researchAnalysisStatusInput,
} from "@studio/contracts/mcp-research";
import {
  listResearchAccounts,
  findResearchAccount,
  listResearchObservationSummaries,
  findResearchOperation,
  addResearchAccount,
  getResearchConnection,
} from "@/db/repositories/social-research.repository";
import {
  researchAccountView,
  researchSnapshotView,
  researchConnectionView,
} from "@/lib/social/research/view";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import { analyzeResearchSnapshots } from "@/lib/social/research/analysis";
import { refreshResearchAccount } from "@/lib/social/research/refresh";
import { loadResearchPreviews } from "@/lib/social/research/previews";
import { SocialResearchError } from "@/lib/social/research/errors";
import { requireMcp, McpError } from "./errors";
import { authorizeMcp, type McpContext } from "./context";
import { requireResearchEditor } from "./research-policy";
import { mutateOnce } from "./operations";
import type { McpToolRegistrar } from "./register-tool";
import {
  prepareResearchAnalysis,
  executeResearchAnalysis,
  getResearchAnalysisStatus,
} from "./research-analysis-service";
import { listResearchAnalysisOperations } from "@/db/repositories/research-analysis.repository";

function enabled() {
  requireMcp(
    isSocialResearchEnabled(),
    "feature_disabled",
    "Social account research is disabled.",
  );
}
async function safe<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SocialResearchError)
      throw new McpError(error.code, error.message);
    throw error;
  }
}
async function requireSavedAccount(ctx: McpContext, id: string) {
  enabled();
  const row = await findResearchAccount(ctx.workspaceId, id);
  requireMcp(
    row,
    "not_found",
    "This research account is unavailable in your workspace.",
  );
  return row;
}
export function registerResearchTools(register: McpToolRegistrar) {
  register(
    "list_research_accounts",
    "List this workspace's saved Facebook/Instagram research watchlist and available source identities. Saved reads only; does not refresh, authorize Meta or activate Marketing.",
    "vcstudio:read",
    mcpPageInput,
    true,
    async (ctx, p) => {
      enabled();
      const [rows, grant] = await Promise.all([
        listResearchAccounts(ctx.workspaceId, (p.page - 1) * 20),
        getResearchConnection(ctx.workspaceId),
      ]);
      return {
        items: rows.slice(0, 20).map(researchAccountView),
        page: p.page,
        pageSize: 20,
        hasMore: rows.length > 20,
        connection: researchConnectionView(grant),
        href: "/app/social/research",
      };
    },
  );
  register(
    "get_research_account",
    "Read an account with paginated observation summaries and recent saved-analysis summaries. No repeated post bodies or transcripts. Use get_research_observation for paginated captions/metrics and get_research_analysis_status for full findings. Missing metrics are unknown.",
    "vcstudio:read",
    mcpPageInput.extend({ accountId: z.uuid() }),
    true,
    async (ctx, p) => {
      const account = await requireSavedAccount(ctx, p.accountId);
      const rows = await listResearchObservationSummaries(
        ctx.workspaceId,
        account.id,
        (p.page - 1) * 10,
      );
      const items = rows.slice(0, 10).map((row) => ({
        ...row,
        capturedAt: new Date(row.capturedAt).toISOString(),
      }));
      const analyses = (
        await listResearchAnalysisOperations(ctx.workspaceId, account.id, true)
      ).flatMap((op) => {
        const summary = z.string().max(3000).safeParse(op.result?.summary);
        return op.status === "succeeded" && summary.success
          ? [
              {
                id: op.id,
                summary: summary.data,
                coverage: op.result?.coverage,
                source: op.result?.source,
                performanceEvidence: op.result?.performanceEvidence,
                completedAt: op.updatedAt.toISOString(),
              },
            ]
          : [];
      });
      return {
        account: researchAccountView(account),
        observations: items,
        analyses,
        page: p.page,
        pageSize: 10,
        hasMore: rows.length > 10,
        href: `/app/social/research?account=${account.id}`,
      };
    },
  );
  register(
    "get_research_observation",
    "Read one saved observation with ten posts per page and descriptive format ranking. Supply postId for one exact full-caption post, or postPage for the bounded sample (25 posts total). No media fetch, metric refresh or proven causal success claims.",
    "vcstudio:read",
    mcpWorkspaceInput.extend({
      snapshotId: z.uuid(),
      postPage: z.number().int().min(1).max(1000).default(1),
      postId: z.string().min(1).max(120).optional(),
    }),
    true,
    async (ctx, p) => {
      enabled();
      const row = await findResearchOperation(ctx.workspaceId, p.snapshotId);
      requireMcp(
        row?.status === "succeeded",
        "not_found",
        "That saved observation is unavailable.",
      );
      await requireSavedAccount(ctx, row.accountId);
      const view = researchSnapshotView(row);
      const matching = p.postId
        ? view.data.posts.filter((post) => post.id === p.postId)
        : view.data.posts.slice((p.postPage - 1) * 10, p.postPage * 10);
      requireMcp(
        !p.postId || matching.length === 1,
        "not_found",
        "That post is not part of this saved observation.",
      );
      const { ranked, ...comparison } = analyzeResearchSnapshots(view);
      return {
        ...view,
        data: { ...view.data, posts: matching },
        pagination: {
          postPage: p.postPage,
          pageSize: p.postId ? 1 : 10,
          totalSampledPosts: view.data.posts.length,
          hasMore: !p.postId && p.postPage * 10 < view.data.posts.length,
        },
        comparison: {
          ...comparison,
          ranked: ranked.slice(0, 10).map(({ post, score }) => ({
            postId: post.id,
            url: post.url,
            format: post.format,
            score,
          })),
        },
      };
    },
  );
  register(
    "add_research_account",
    "Save a public Page ID or professional Instagram username to the research watchlist. Does not fetch data, follow an external account or grant Meta access. Do not add duplicates.",
    "vcstudio:edit",
    mcpMutationInput.extend({ account: researchAccountInputSchema }),
    false,
    async (ctx, p) => {
      enabled();
      requireResearchEditor(ctx);
      return mutateOnce(
        ctx,
        "research_add",
        p.idempotencyKey,
        { account: p.account },
        async () => {
          const row = await addResearchAccount({
            ...p.account,
            workspaceId: ctx.workspaceId,
            createdByUserId: ctx.principal.userId,
          });
          requireMcp(
            row,
            "conflict",
            "This account is already on the watchlist.",
          );
          return {
            accountId: row.id,
            href: `/app/social/research?account=${row.id}`,
          };
        },
      );
    },
  );
  register(
    "refresh_research_account",
    "Explicitly refresh an existing research account using official Meta APIs and the existing grant. Select a returned Instagram source ID for Instagram. No recurring monitoring, scraping, AI charge or Marketing work. Reuse the same key on retry; query saved observations afterward.",
    "vcstudio:edit",
    mcpMutationInput.extend({
      accountId: z.uuid(),
      sourceId: z
        .string()
        .regex(/^\d{1,40}$/)
        .nullable()
        .default(null),
    }),
    false,
    async (ctx, p) => {
      await requireSavedAccount(ctx, p.accountId);
      requireResearchEditor(ctx);
      return safe(() =>
        mutateOnce(
          ctx,
          "research_refresh",
          p.idempotencyKey,
          { accountId: p.accountId, sourceId: p.sourceId },
          async (operationId) => ({
            snapshotId: await safe(() =>
              refreshResearchAccount(ctx.workspaceId, {
                accountId: p.accountId,
                sourceId: p.sourceId,
                requestId: operationId,
              }),
            ),
            accountId: p.accountId,
            href: `/app/social/research?account=${p.accountId}`,
          }),
        ),
      );
    },
  );
  register(
    "get_research_media",
    "Retrieve transient Meta CDN references for an exact saved observation. Links alone do not mean you viewed the image/video. Use prepare_research_analysis for actual media understanding. No media URLs or files are saved. Missing video sources must be reported, not replaced with browser automation.",
    "vcstudio:media",
    mcpWorkspaceInput.extend({ snapshotId: z.uuid() }),
    true,
    async (ctx, p) => {
      await authorizeMcp(ctx.principal, ctx.workspaceId, "vcstudio:read");
      requireResearchEditor(ctx);
      return safe(() => loadResearchPreviews(ctx.workspaceId, p));
    },
  );
  register(
    "prepare_research_analysis",
    "Prepare actual image/carousel/video-with-audio analysis of ONE saved research post. Requires Read, Media and Generate. Supply explicit maximumCostCents; no billable submission at preparation. Read analysisApprovalMode: autonomous permits execute_research_analysis; manual requires the signed-in review. Never claim a caption-only result analyzed media.",
    "vcstudio:generate",
    prepareResearchAnalysisInput,
    false,
    (ctx, p) => prepareResearchAnalysis(ctx, p.idempotencyKey, p.request),
  );
  register(
    "execute_research_analysis",
    "Execute the exact prepared research analysis only for an owner-enabled autonomous analysis grant. Use operationId and the SAME idempotencyKey. This downloads temporary media and starts bounded billable multimodal analysis. Poll get_research_analysis_status; no browser or individual approval needed in autonomous mode. Never blindly create a new key after failure.",
    "vcstudio:generate",
    executeResearchAnalysisInput,
    false,
    (ctx, p) => executeResearchAnalysis(ctx, p.operationId, p.idempotencyKey),
  );
  register(
    "get_research_analysis_status",
    "Read a workspace research analysis: status, coverage, transcript/visual observations, performance evidence, hypotheses, limitations and safe failures. No new billable attempt. Findings are evidence, not proof of why content performed. Deleted-account findings are unavailable.",
    "vcstudio:read",
    researchAnalysisStatusInput,
    true,
    (ctx, p) => getResearchAnalysisStatus(ctx, p.operationId),
  );
}
