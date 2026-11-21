import "server-only";
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk";
import {
  studioImageRequestSchema,
  studioImageStartSchema,
  type StudioImageRequest,
  type StudioImageJob,
} from "@studio/contracts/image-studio";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { requireWorkspaceMembership } from "@/lib/auth/workspace-context";
import { requireCapability } from "@/lib/policies/workspace-policy";
import {
  getPublishingWebEnvironment,
  getSceneImageEnvironment,
  getMediaLibraryEnvironment,
} from "@/lib/env/server";
import {
  createOAuthState,
  verifyOAuthState,
} from "@/lib/publishing/oauth-state";
import { studioImagePlan } from "./plan";
import { fingerprint } from "@/lib/mcp/fingerprint";
import { loadEffectiveWorkspaceBudget } from "@/lib/budgets/workspace-budget";
import {
  reserveLibraryImage,
  updateLibraryImage,
  LibraryImageError,
} from "@/db/commands/library-image-jobs";
import {
  findLibraryImageJob,
  findLibraryImageByKey,
  listLibraryImageJobs,
} from "@/db/repositories/library-image-jobs.repository";
import { findReadyMediaAssets } from "@/db/repositories/media-assets.repository";
import { createMediaAssetDownloadUrl } from "@/lib/storage/media-asset-storage";
import { enforceRateLimit } from "@/lib/rate-limit/enforce-rate-limit";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
export async function authorizeImageStudio(
  workspaceId: unknown,
  write = false,
) {
  const id = z.uuid().parse(workspaceId);
  const user = await requireAuthenticatedUser();
  const membership = await requireWorkspaceMembership({
    workspaceId: id,
    userId: user.id,
  });
  if (write) requireCapability(membership.role, "generateSceneImages");
  return { workspaceId: id, userId: user.id, role: membership.role };
}
const purpose = (request: StudioImageRequest, plan: unknown) =>
  "image-studio:" + fingerprint({ request, plan });
export async function quoteStudioImage(workspaceId: unknown, raw: unknown) {
  const ctx = await authorizeImageStudio(workspaceId, true);
  const request = studioImageRequestSchema.parse(raw);
  const plan = await studioImagePlan(ctx.workspaceId, request);
  const budget = await loadEffectiveWorkspaceBudget(ctx);
  return {
    token: createOAuthState({
      ...ctx,
      platform: purpose(request, plan),
      secret: getPublishingWebEnvironment().OAUTH_STATE_SECRET,
    }),
    estimatedCostCents: plan.estimatedCostCents,
    model: plan.configuration.model,
    dailyBudgetCents: budget.dailyBudgetCents,
    monthlyBudgetCents: budget.monthlyBudgetCents,
  };
}
export async function dispatchStudioImage(
  workspaceId: unknown,
  rawId: unknown,
) {
  const ctx = await authorizeImageStudio(workspaceId, true);
  const id = z.uuid().parse(rawId);
  const job = await findLibraryImageJob(ctx.workspaceId, id);
  if (!job || job.userId !== ctx.userId)
    throw new LibraryImageError("This generation is unavailable.");
  if (job.status !== "queued" || job.attemptCount !== 0) return { id };
  if (Date.now() - job.createdAt.getTime() > 15 * 60_000)
    throw new LibraryImageError(
      "This saved request expired before dispatch. Wait for its usage reservation to be recovered, then review a fresh estimate.",
    );
  try {
    const handle = await tasks.trigger(
      "library-image-generation",
      { workspaceId: ctx.workspaceId, jobId: id },
      { idempotencyKey: "library-image:" + id },
    );
    await updateLibraryImage(ctx.workspaceId, id, ["queued"], {
      triggerRunId: handle.id,
      safeErrorMessage: null,
    });
  } catch {
    await updateLibraryImage(ctx.workspaceId, id, ["queued"], {
      safeErrorMessage:
        "The queue handoff was not confirmed. Retry this saved request using Retry queue. No second generation will be created.",
    });
  }
  return { id };
}
export async function startStudioImage(workspaceId: unknown, raw: unknown) {
  const ctx = await authorizeImageStudio(workspaceId, true);
  const input = studioImageStartSchema.parse(raw);
  const existing = await findLibraryImageByKey(
    ctx.workspaceId,
    ctx.userId,
    input.idempotencyKey,
  );
  if (existing) {
    if (fingerprint(existing.request) !== fingerprint(input.request))
      throw new LibraryImageError(
        "This request key belongs to different inputs.",
      );
    return dispatchStudioImage(ctx.workspaceId, existing.id);
  }
  const plan = await studioImagePlan(ctx.workspaceId, input.request);
  let verified;
  try {
    verified = verifyOAuthState({
      state: input.quote,
      secret: getPublishingWebEnvironment().OAUTH_STATE_SECRET,
      ttlSeconds: 600,
      platform: purpose(input.request, plan),
    });
  } catch {
    throw new LibraryImageError(
      "This estimate expired or its inputs changed. Review a fresh estimate.",
    );
  }
  if (
    verified.workspaceId !== ctx.workspaceId ||
    verified.userId !== ctx.userId
  )
    throw new LibraryImageError(
      "This estimate belongs to another user or workspace.",
    );
  await enforceRateLimit({
    workspaceId: ctx.workspaceId,
    operation: "scene_image_generation",
  });
  const budget = await loadEffectiveWorkspaceBudget(ctx);
  const id = await reserveLibraryImage({
    ...ctx,
    key: input.idempotencyKey,
    hash: fingerprint({ request: input.request, plan }),
    request: input.request,
    plan,
    cost: plan.estimatedCostCents,
    daily: budget.dailyBudgetCents,
    monthly: budget.monthlyBudgetCents,
  });
  await recordAuditEvent({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "generation_started",
    targetType: "library_image_job",
    targetId: id,
    metadata: {
      model: plan.configuration.model,
      estimatedCostCents: plan.estimatedCostCents,
    },
  });
  return dispatchStudioImage(ctx.workspaceId, id);
}
export async function imageStudioHistory(
  workspaceId: unknown,
  before?: { createdAt: string; id: string },
  trackedIds: string[] = [],
): Promise<StudioImageJob[]> {
  const ctx = await authorizeImageStudio(workspaceId);
  const jobs = await listLibraryImageJobs(
    ctx.workspaceId,
    before
      ? { createdAt: new Date(before.createdAt), id: before.id }
      : undefined,
  );
  // A slow job can move beyond the latest history page while other jobs finish.
  // Keep polling those explicitly displayed requests, bounded by queue capacity.
  const missing = [
    ...new Set(z.array(z.uuid()).max(4).parse(trackedIds)),
  ].filter((id) => !jobs.some((job) => job.id === id));
  for (const job of await Promise.all(
    missing.map((id) => findLibraryImageJob(ctx.workspaceId, id)),
  )) {
    if (job) jobs.push(job);
  }
  const assets = jobs.length
    ? await findReadyMediaAssets({
        workspaceId: ctx.workspaceId,
        mediaAssetIds: jobs
          .filter((j) => j.status === "succeeded")
          .map((j) => j.id),
      })
    : [];
  return Promise.all(
    jobs.map(async (job) => {
      const request = studioImageRequestSchema.parse(job.request);
      const asset = assets.find((a) => a.id === job.id);
      return {
        id: job.id,
        title: request.title || "Generated image",
        prompt: request.prompt,
        status: job.status,
        estimatedCostCents: job.estimatedCostCents,
        actualCostCents: job.actualCostCents,
        error: job.safeErrorMessage,
        createdAt: job.createdAt.toISOString(),
        previewUrl: asset
          ? await createMediaAssetDownloadUrl(asset.objectKey)
          : null,
        canRetry:
          job.userId === ctx.userId &&
          job.status === "queued" &&
          job.attemptCount === 0 &&
          Date.now() - job.createdAt.getTime() < 15 * 60_000,
      };
    }),
  );
}
export function imageStudioOptions() {
  const env = getSceneImageEnvironment();
  return {
    enabled:
      env.ENABLE_SCENE_IMAGE_GENERATION &&
      env.OPENAI_IMAGE_MODEL.startsWith("gpt-image-"),
    model: env.OPENAI_IMAGE_MODEL,
    maxReferences: Math.min(16, env.MAX_REFERENCE_ASSETS_PER_GENERATION),
    maxReferenceBytes: env.MAX_REFERENCE_BYTES_PER_GENERATION,
    maxImageBytes: getMediaLibraryEnvironment().MAX_MEDIA_IMAGE_BYTES,
  };
}
