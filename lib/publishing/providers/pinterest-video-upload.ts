import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PublishProviderError } from "@/lib/publishing/video-publish-provider";
import type { SocialPostMediaItem } from "@/lib/publishing/social-post-provider";
export const pinterestUploadSchema = z.object({
  media_id: z.string().regex(/^\d{1,32}$/),
  upload_url: z.url(),
  upload_parameters: z
    .record(z.string().max(100), z.string().max(8192))
    .refine((value) => Object.keys(value).length <= 50),
});
async function streamPinterestVideo(item: SocialPostMediaItem, raw: unknown) {
  const upload = pinterestUploadSchema.parse(raw);
  const url = new URL(upload.upload_url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pinterest-media-upload.s3-accelerate.amazonaws.com" ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("Pinterest returned an unsupported upload destination.");
  if (item.sizeBytes <= 0 || item.sizeBytes > 500 * 1024 * 1024)
    throw new Error("Pinterest video exceeds the 500 MB upload limit.");
  const response = await fetch(item.sourceUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body)
    throw new PublishProviderError({
      category: "asset_unavailable",
      safeMessage:
        "The Pinterest video could not be read from private storage.",
      retriable: true,
      mayHavePublished: false,
    });
  const boundary = `vcstudio-${randomUUID()}`;
  const encoder = new TextEncoder();
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_");
  let prefix = "";
  for (const [name, value] of Object.entries(upload.upload_parameters))
    prefix += `--${boundary}\r\nContent-Disposition: form-data; name="${safe(name)}"\r\n\r\n${value}\r\n`;
  prefix += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safe(item.fileName)}"\r\nContent-Type: ${item.contentType}\r\n\r\n`;
  const before = encoder.encode(prefix),
    after = encoder.encode(`\r\n--${boundary}--\r\n`);
  const reader = response.body.getReader();
  let sent = 0,
    started = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(before);
          return;
        }
        const chunk = await reader.read();
        if (chunk.done) {
          if (sent !== item.sizeBytes)
            throw new Error("Video length did not match its verified size.");
          controller.enqueue(after);
          controller.close();
          return;
        }
        sent += chunk.value.byteLength;
        if (sent > item.sizeBytes)
          throw new Error("Video exceeded its verified size.");
        controller.enqueue(chunk.value);
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        controller.error(error);
      }
    },
    cancel: () => reader.cancel(),
  });
  const options: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    duplex: "half",
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(
        before.byteLength + item.sizeBytes + after.byteLength,
      ),
    },
  };
  const uploaded = await fetch(url, options);
  if (!uploaded.ok)
    throw new PublishProviderError({
      category: "provider_error",
      safeMessage:
        "Pinterest did not accept the video upload. Retry this target later.",
      retriable: true,
      mayHavePublished: false,
    });
}

export async function uploadPinterestVideo(
  item: SocialPostMediaItem,
  raw: unknown,
) {
  try {
    await streamPinterestVideo(item, raw);
  } catch (error) {
    if (error instanceof PublishProviderError) throw error;
    throw new PublishProviderError({
      category: "provider_error",
      safeMessage:
        error instanceof Error &&
        error.message ===
          "Pinterest returned an unsupported upload destination."
          ? error.message
          : "Pinterest video transfer failed before Pin creation. Retry this target later.",
      retriable: true,
      mayHavePublished: false,
    });
  }
}
