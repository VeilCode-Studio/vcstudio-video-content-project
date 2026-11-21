import { getPublishingEnvironment } from "@/lib/env/server";
import "server-only";
import {
  pinterestPinSettingsSchema,
  type PinterestPinSettings,
} from "@studio/contracts/publishing";
import { findReadyMediaAssets } from "@/db/repositories/media-assets.repository";
import {
  PinterestSettingsError,
  readPinterestBoard,
} from "@/lib/publishing/pinterest-boards";
export { PinterestSettingsError };
import type { SocialPostAttachment } from "@/lib/social/post-attachment";
export async function validatePinterestPost(input: {
  workspaceId: string;
  connectionId: string;
  settings: PinterestPinSettings | null | undefined;
  text: string;
  hasVideo: boolean;
  media?: readonly SocialPostAttachment[];
}) {
  if (input.media) {
    const media = input.media;
    if (media.length !== 1)
      throw new PinterestSettingsError(
        "Pinterest requires exactly one image or video.",
      );
    const item = media[0];
    if (item.kind === "image") {
      if (
        !["image/jpeg", "image/png"].includes(item.contentType) ||
        item.sizeBytes <= 0 ||
        item.sizeBytes > 20 * 1024 * 1024
      )
        throw new PinterestSettingsError(
          "Pinterest requires a JPEG/PNG image up to 20 MB.",
        );
    } else if (
      item.kind !== "video" ||
      !["video/mp4", "video/quicktime"].includes(item.contentType) ||
      item.sizeBytes <= 0 ||
      item.sizeBytes > 500 * 1024 * 1024 ||
      item.durationMilliseconds === null ||
      item.durationMilliseconds < 4000 ||
      item.durationMilliseconds > 900000
    ) {
      throw new PinterestSettingsError(
        "Pinterest requires an MP4/MOV video up to 500 MB, between 4 seconds and 15 minutes.",
      );
    }
  }
  const parsed = pinterestPinSettingsSchema.safeParse(input.settings);
  if (!parsed.success)
    throw new PinterestSettingsError(
      "Select a Pinterest board and complete the Pin settings.",
    );
  const settings = parsed.data;
  const accessTier = getPublishingEnvironment().PINTEREST_ACCESS_TIER;
  if (accessTier !== "trial" && accessTier !== "standard")
    throw new PinterestSettingsError(
      "Pinterest app approval is still pending.",
    );
  if (settings.accessTier && settings.accessTier !== accessTier)
    throw new PinterestSettingsError(
      "Pinterest app access changed. Prepare and approve a fresh publication before sending.",
    );
  const description = settings.description ?? input.text;
  if (description.length > 800)
    throw new PinterestSettingsError(
      "Pinterest descriptions must be at most 800 characters.",
    );
  const board = await readPinterestBoard(
    input.workspaceId,
    input.connectionId,
    settings.boardId,
  );
  const cover = settings.videoCoverAssetId
    ? (
        await findReadyMediaAssets({
          workspaceId: input.workspaceId,
          mediaAssetIds: [settings.videoCoverAssetId],
        })
      )[0]
    : null;
  if (input.hasVideo && !cover)
    throw new PinterestSettingsError(
      "Choose a ready JPEG or PNG cover image for the video Pin.",
    );
  if (
    settings.videoCoverAssetId &&
    (!cover ||
      cover.kind !== "image" ||
      !["image/jpeg", "image/png"].includes(cover.contentType) ||
      cover.sizeBytes > 20 * 1024 * 1024)
  )
    throw new PinterestSettingsError(
      "The Pinterest cover must be a ready JPEG/PNG image up to 20 MB in this workspace.",
    );
  return {
    settings: { ...settings, accessTier, boardName: board.name, description },
    cover,
  };
}
