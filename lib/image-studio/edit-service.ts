import "server-only";
import { z } from "zod";
import {
  studioImageRequestSchema,
  studioImageEditSchema,
  studioImageEditStartSchema,
} from "@studio/contracts/image-studio";
import { renderImageEditInstructions } from "@studio/prompts";
import { findLibraryImageJob } from "@/db/repositories/library-image-jobs.repository";
import { findReadyMediaAssets } from "@/db/repositories/media-assets.repository";
import { LibraryImageError } from "@/db/commands/library-image-jobs";
import { createMediaAssetDownloadUrl } from "@/lib/storage/media-asset-storage";
import { toMediaAssetView } from "@/lib/media/media-asset-view";
import { IMAGE_REFERENCE_TYPES } from "./reference-selection";
import {
  authorizeImageStudio,
  quoteStudioImage,
  startStudioImage,
} from "./service";
import type { ImageStudioSourceView } from "./source-view";
async function sourceJob(workspaceId: string, id: unknown) {
  const job = await findLibraryImageJob(workspaceId, z.uuid().parse(id));
  if (!job || job.status !== "succeeded")
    throw new LibraryImageError("Choose a completed image in this workspace.");
  return { job, request: studioImageRequestSchema.parse(job.request) };
}
export async function getStudioImageSource(
  workspaceId: unknown,
  id: unknown,
): Promise<ImageStudioSourceView> {
  const ctx = await authorizeImageStudio(workspaceId);
  const { job, request } = await sourceJob(ctx.workspaceId, id);
  const [asset] = await findReadyMediaAssets({
    workspaceId: ctx.workspaceId,
    mediaAssetIds: [job.id],
  });
  if (
    !asset ||
    asset.kind !== "image" ||
    !IMAGE_REFERENCE_TYPES.some((type) => type === asset.contentType)
  )
    throw new LibraryImageError(
      "This image is no longer available in the media library.",
    );
  return {
    asset: toMediaAssetView(
      asset,
      await createMediaAssetDownloadUrl(asset.objectKey),
    ),
    size: request.size,
    quality: request.quality,
  };
}
async function editRequest(workspaceId: unknown, raw: unknown) {
  const ctx = await authorizeImageStudio(workspaceId, true);
  const edit = studioImageEditSchema.parse(raw);
  const { request } = await sourceJob(ctx.workspaceId, edit.sourceJobId);
  // Keep the source job immutable. The ordinary image plan verifies its private
  // original and ETag, and the existing provider selects images.edit for references.
  return studioImageRequestSchema.parse({
    title: (request.title || "Generated image").slice(0, 190) + " (edit)",
    prompt: renderImageEditInstructions(edit.instructions),
    size: request.size,
    quality: edit.quality,
    referenceAssetIds: [edit.sourceJobId],
  });
}
export async function quoteStudioImageEdit(workspaceId: unknown, raw: unknown) {
  return quoteStudioImage(workspaceId, await editRequest(workspaceId, raw));
}
export async function startStudioImageEdit(workspaceId: unknown, raw: unknown) {
  const input = studioImageEditStartSchema.parse(raw);
  return startStudioImage(workspaceId, {
    request: await editRequest(workspaceId, input.edit),
    quote: input.quote,
    idempotencyKey: input.idempotencyKey,
  });
}
