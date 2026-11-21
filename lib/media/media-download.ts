import "server-only";
import type { z } from "zod";
import { mediaDownloadSchema } from "@studio/contracts/media-download";
import { findMediaAsset } from "@/db/repositories/media-assets.repository";
import { listSocialPostMedia } from "@/db/repositories/social-posts.repository";
import { mediaAvailability } from "./media-availability";
import { createMediaAssetDownloadUrl } from "@/lib/storage/media-asset-storage";

export async function mediaDownloadUrl(
  workspaceId: string,
  input: z.infer<typeof mediaDownloadSchema>,
): Promise<string | null> {
  if (input.source === "render") {
    if (!input.postId) return null;
    const media = await listSocialPostMedia({
      workspaceId,
      postId: input.postId,
    });
    const asset = media.find(
      (item) => item.source === "render" && item.sourceId === input.assetId,
    );
    if (
      !asset ||
      asset.unavailable ||
      asset.inspectionPending ||
      asset.inspectionFailed ||
      !asset.objectKey
    )
      return null;
    return createMediaAssetDownloadUrl(
      asset.objectKey,
      300,
      asset.originalFileName,
    );
  }
  const asset = await findMediaAsset({
    workspaceId,
    mediaAssetId: input.assetId,
  });
  if (
    !asset ||
    asset.deletedAt ||
    !asset.objectKey ||
    !mediaAvailability(asset).ready
  )
    return null;
  return createMediaAssetDownloadUrl(
    asset.objectKey,
    300,
    asset.originalFileName || asset.title || "download",
  );
}
