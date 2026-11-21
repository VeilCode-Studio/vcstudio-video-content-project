import "server-only";
import sharp from "sharp";
import OpenAI from "openai";
import {
  studioImageRequestSchema,
  studioImageScopeSchema,
} from "@studio/contracts/image-studio";
import {
  findLibraryImageJob,
  findLibraryImageActor,
  expiredLibraryImageJobs,
} from "@/db/repositories/library-image-jobs.repository";
import {
  claimLibraryImage,
  updateLibraryImage,
  settleLibraryImage,
  completeLibraryImage,
  LibraryImageError,
} from "@/db/commands/library-image-jobs";
import { requireWorkspaceMembership } from "@/lib/auth/workspace-context";

import { requireCapability } from "@/lib/policies/workspace-policy";
import {
  getSceneImageEnvironment,
  getMediaLibraryEnvironment,
} from "@/lib/env/server";
import { standaloneGenerationPlanSchema } from "@/lib/mcp/standalone-generation-plan";
import { studioImagePlan } from "./plan";
import { fingerprint } from "@/lib/mcp/fingerprint";
import { OpenAiImageGenerationProvider } from "@/lib/openai/openai-image-generation-provider";
import { calculateActualSceneImageCostCents } from "@/lib/costs/scene-image-cost";
import { downloadSceneImageReferences } from "@/lib/storage/scene-image-storage";
import { putGeneratedMediaAsset } from "@/lib/storage/media-asset-storage";
import { createMediaLibraryObjectKey } from "@/lib/storage/object-key";
import { mediaContentTypeSchema } from "@/lib/schemas/media-asset";
import { classifyImageGenerationError } from "@/lib/openai/image-generation-error";
import { ImageGenerationProviderResponseError } from "@/lib/openai/image-generation-provider";
export async function authorizeLibraryImageActor(
  workspaceId: string,
  userId: string,
) {
  const user = await findLibraryImageActor(userId);
  if (!user)
    throw new LibraryImageError("Image generation access was revoked.");
  const membership = await requireWorkspaceMembership({ workspaceId, userId });
  requireCapability(membership.role, "generateSceneImages");
}
export async function failLibraryImage(workspaceId: string, id: string) {
  const job = await findLibraryImageJob(workspaceId, id);
  if (!job) return;
  if (job.status === "succeeded") {
    await settleLibraryImage(
      workspaceId,
      id,
      job.actualCostCents ?? job.estimatedCostCents,
    );
    return;
  }
  const cost = job.providerSubmitted
    ? (job.actualCostCents ?? job.estimatedCostCents)
    : 0;
  const failed = await updateLibraryImage(
    workspaceId,
    id,
    ["queued", "running"],
    {
      status: "failed",
      actualCostCents: cost,
      safeErrorMessage: job.providerSubmitted
        ? "The worker stopped after submission. Recorded or estimated usage was retained. Check Usage before starting another request."
        : "The request stopped before provider submission. Its reservation was released.",
    },
  );
  if (failed || job.status === "failed")
    await settleLibraryImage(workspaceId, id, cost);
}
export async function recoverLibraryImages() {
  let recovered = 0;
  for (const { job } of await expiredLibraryImageJobs()) {
    await failLibraryImage(job.workspaceId, job.id);
    recovered++;
  }
  return { recovered };
}
export async function runLibraryImage(raw: unknown) {
  const input = studioImageScopeSchema.parse(raw);
  const job = await claimLibraryImage(input.workspaceId, input.jobId);
  if (!job) return { status: "already_claimed" };
  let submitted = false;
  let cost = 0;
  let usage: Record<string, unknown> | null = null;
  try {
    const request = studioImageRequestSchema.parse(job.request);
    const plan = standaloneGenerationPlanSchema.parse(job.plan);
    if (plan.kind !== "image")
      throw new LibraryImageError("Invalid image plan.");
    await authorizeLibraryImageActor(job.workspaceId, job.userId);
    if (
      fingerprint(await studioImagePlan(job.workspaceId, request)) !==
      fingerprint(plan)
    )
      throw new LibraryImageError(
        "The references, pricing or model changed. Review a new estimate.",
      );
    const env = getSceneImageEnvironment();
    const references = await downloadSceneImageReferences({
      references: plan.references.map((r) => ({
        referenceAssetIdSnapshot: r.id,
        objectKeySnapshot: r.objectKey,
        contentTypeSnapshot: r.contentType,
        etagSnapshot: r.etag,
      })),
      maximumTotalBytes: env.MAX_REFERENCE_BYTES_PER_GENERATION,
    });
    for (const reference of references)
      await sharp(reference.bytes, { limitInputPixels: 40_000_000 }).stats();
    await authorizeLibraryImageActor(job.workspaceId, job.userId);
    const marked = await updateLibraryImage(
      job.workspaceId,
      job.id,
      ["running"],
      { providerSubmitted: true },
    );
    if (!marked)
      throw new LibraryImageError("The request is no longer active.");
    submitted = true;
    cost = plan.estimatedCostCents;
    const provider = new OpenAiImageGenerationProvider({
      apiKey: env.OPENAI_API_KEY,
      timeoutMilliseconds: env.OPENAI_REQUEST_TIMEOUT_SECONDS * 1000,
    });
    const generated = await provider.generate({
      ...plan.configuration,
      endUserId: job.userId,
      references,
    });
    cost = generated.usage
      ? calculateActualSceneImageCostCents({
          usage: generated.usage,
          rates: plan.rates,
        })
      : plan.estimatedCostCents;
    usage = generated.usage ? { ...generated.usage } : null;
    await updateLibraryImage(job.workspaceId, job.id, ["running"], {
      actualCostCents: cost,
      providerRequestId: generated.requestId,
      usage: generated.usage ? { ...generated.usage } : null,
    });
    const bytes = Buffer.from(generated.bytes);
    if (bytes.length > getMediaLibraryEnvironment().MAX_MEDIA_IMAGE_BYTES)
      throw new LibraryImageError(
        "The generated image exceeds the library size limit.",
      );
    const metadata = await sharp(bytes, {
      limitInputPixels: 40_000_000,
    }).metadata();
    await sharp(bytes, { limitInputPixels: 40_000_000 }).stats();
    if (!metadata.width || !metadata.height)
      throw new LibraryImageError("The generated image could not be decoded.");
    const contentType = mediaContentTypeSchema.parse(generated.mimeType);
    if (!contentType.startsWith("image/"))
      throw new LibraryImageError("The provider returned an unsupported file.");
    const objectKey = createMediaLibraryObjectKey({
      workspaceId: job.workspaceId,
      mediaAssetId: job.id,
      contentType,
    });
    await putGeneratedMediaAsset({ objectKey, bytes, contentType });
    await completeLibraryImage({
      workspaceId: job.workspaceId,
      id: job.id,
      userId: job.userId,
      title: request.title || "Generated image",
      objectKey,
      contentType,
      sizeBytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
      fileName:
        "generated-image." +
        (metadata.format === "jpeg" ? "jpg" : metadata.format || "png"),
      cost,
      requestId: generated.requestId,
      usage: generated.usage ? { ...generated.usage } : {},
    });
    await settleLibraryImage(job.workspaceId, job.id, cost);
    return { status: "succeeded", assetId: job.id };
  } catch (error) {
    const failure = classifyImageGenerationError(error);
    if (error instanceof ImageGenerationProviderResponseError && error.usage) {
      const plan = standaloneGenerationPlanSchema.parse(job.plan);
      if (plan.kind === "image") {
        cost = calculateActualSceneImageCostCents({
          usage: error.usage,
          rates: plan.rates,
        });
        usage = { ...error.usage };
      }
    }
    if (
      error instanceof OpenAI.APIError &&
      error.status &&
      error.status >= 400 &&
      error.status < 500
    )
      cost = 0;
    const safe =
      error instanceof LibraryImageError ? error.message : failure.safeMessage;
    await updateLibraryImage(job.workspaceId, job.id, ["running"], {
      status: "failed",
      actualCostCents: submitted ? cost : 0,
      usage: { ...usage, errorCode: failure.category },
      ...(failure.requestId ? { providerRequestId: failure.requestId } : {}),
      safeErrorMessage:
        safe +
        (submitted && cost > 0
          ? " Recorded or estimated usage was retained. No paid retry was made."
          : " No usage was retained."),
    });
    await settleLibraryImage(job.workspaceId, job.id, submitted ? cost : 0);
    return { status: "failed" };
  }
}
