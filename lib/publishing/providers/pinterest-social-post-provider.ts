import "server-only";
import { z } from "zod";
import { pinterestPinSettingsSchema } from "@studio/contracts/publishing";
import type {
  SocialPostProvider,
  PublishPostRequest,
  PublishPostResult,
} from "@/lib/publishing/social-post-provider";
import { PublishProviderError } from "@/lib/publishing/video-publish-provider";
import { pinterestRequest } from "./pinterest-client";
import {
  pinterestUploadSchema,
  uploadPinterestVideo,
} from "./pinterest-video-upload";
const idSchema = z.string().regex(/^\d{1,32}$/);
function failure(
  message: string,
  mayHavePublished = false,
  retriable = false,
): never {
  throw new PublishProviderError({
    category: mayHavePublished
      ? "transport_ambiguous"
      : retriable
        ? "provider_error"
        : "invalid_metadata",
    safeMessage: message,
    retriable,
    mayHavePublished,
  });
}
function result(id: string): PublishPostResult {
  return {
    externalPostId: id,
    externalPostUrl: `https://www.pinterest.com/pin/${id}/`,
    completionStage: "published",
  };
}
export class PinterestSocialPostProvider implements SocialPostProvider {
  readonly platform = "pinterest" as const;
  async publishPost(request: PublishPostRequest): Promise<PublishPostResult> {
    const saved = request.providerOperationId;
    if (saved?.startsWith("pinterest:pin:"))
      return result(idSchema.parse(saved.slice(14)));
    if (saved?.startsWith("pinterest:creating:"))
      failure(
        "A previous Pinterest create request has an uncertain outcome. Check the account before creating another Pin.",
        true,
      );
    const parsed = pinterestPinSettingsSchema.safeParse(
      request.pinterestSettings,
    );
    if (!parsed.success)
      failure("Complete the Pinterest board and Pin settings.");
    const settings = parsed.data;
    if (!idSchema.safeParse(settings.boardId).success)
      failure("Choose a Pinterest board before publishing.");
    if (request.media.length !== 1)
      failure("A Pinterest Pin requires exactly one image or video.");
    const item = request.media[0];
    const description = settings.description ?? request.text;
    if (description.length > 800)
      failure("Pinterest descriptions must be at most 800 characters.");
    let retryCheckpoint = "pinterest:retry:image";
    let source: Record<string, string>;
    const token = request.tokens.accessToken;
    if (item.kind === "image") {
      if (
        !["image/jpeg", "image/png"].includes(item.contentType) ||
        item.sizeBytes > 20 * 1024 * 1024
      )
        failure("Pinterest images must be JPEG or PNG, up to 20 MB.");
      source = { source_type: "image_url", url: item.sourceUrl };
    } else if (item.kind === "video") {
      if (
        !request.pinterestCoverUrl ||
        !["video/mp4", "video/quicktime"].includes(item.contentType)
      )
        failure(
          "Pinterest video Pins require an MP4/MOV video and a JPEG/PNG cover.",
        );
      let mediaId: string;
      if (saved?.startsWith("pinterest:media:"))
        mediaId = idSchema.parse(saved.slice(16));
      else {
        const upload =
          saved?.startsWith("pinterest:upload:") &&
          request.providerOperationSecret
            ? pinterestUploadSchema.parse(
                JSON.parse(request.providerOperationSecret),
              )
            : pinterestUploadSchema.parse(
                await pinterestRequest(token, "/media", {
                  media_type: "video",
                }),
              );
        mediaId = upload.media_id;
        if (
          saved?.startsWith("pinterest:upload:") &&
          saved.slice(17) !== mediaId
        )
          failure("The Pinterest upload checkpoint is invalid.");
        await request.onProviderOperationCreated?.(
          `pinterest:upload:${mediaId}`,
          JSON.stringify(upload),
        );
        await uploadPinterestVideo(item, upload);
        await request.onProviderOperationCreated?.(
          `pinterest:media:${mediaId}`,
        );
      }
      let ready = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const state = z
          .object({
            status: z.enum(["registered", "processing", "succeeded", "failed"]),
          })
          .safeParse(await pinterestRequest(token, `/media/${mediaId}`));
        if (!state.success || state.data.status === "failed")
          failure(
            "Pinterest rejected this video. Check its format before retrying.",
          );
        if (state.data.status === "succeeded") {
          ready = true;
          break;
        }
        await request.waitForProcessing?.(5000);
      }
      if (!ready)
        failure(
          "Pinterest is still processing this video. Retry the same target later.",
          false,
          true,
        );
      retryCheckpoint = `pinterest:media:${mediaId}`;
      source = {
        source_type: "video_id",
        media_id: mediaId,
        cover_image_url: request.pinterestCoverUrl,
      };
    } else failure("Pinterest Pins do not accept audio-only media.");
    // Durable pre-send checkpoint: ambiguous create attempts must never auto-replay.
    await request.onProviderOperationCreated?.("pinterest:creating:pin");
    let response: unknown;
    try {
      response = await pinterestRequest(
        token,
        "/pins",
        {
          board_id: settings.boardId,
          title: settings.title,
          description,
          ...(settings.link ? { link: settings.link } : {}),
          alt_text: item.altText.slice(0, 500),
          media_source: source,
        },
        true,
      );
    } catch (error) {
      if (
        error instanceof PublishProviderError &&
        !error.failure.mayHavePublished
      )
        await request.onProviderOperationCreated?.(retryCheckpoint);
      throw error;
    }
    const pin = z.object({ id: idSchema }).safeParse(response);
    if (!pin.success)
      failure(
        "Pinterest returned no valid Pin ID. Check the account before retrying.",
        true,
      );
    try {
      await request.onProviderOperationCreated?.(
        `pinterest:pin:${pin.data.id}`,
      );
    } catch {
      failure(
        "Pinterest created the Pin but its delivery checkpoint could not be saved. Check the account before retrying.",
        true,
      );
    }
    return result(pin.data.id);
  }
}
