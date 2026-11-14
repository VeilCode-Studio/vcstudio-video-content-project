import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { withPublicDownload } from "@/lib/mcp/safe-download";
import { researchMediaUrl } from "./media-url";
import { requireMcp } from "@/lib/mcp/errors";
import {
  RESEARCH_MAX_BYTES,
  RESEARCH_MAX_DURATION_SECONDS,
} from "./analysis-environment";
import type { ResearchPreviews } from "@studio/contracts/social-research-previews";
const execFileAsync = promisify(execFile);
export type ResearchMediaPart = {
  inlineData: {
    mimeType: "image/jpeg" | "video/mp4" | "video/webm" | "video/quicktime";
    data: string;
  };
};
const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive() }),
  streams: z.array(z.object({ codec_type: z.string() })).min(1),
});
/** Binaries exist only in worker memory/its private temporary directory. No R2/provider file upload. */
export async function collectResearchMedia(
  preview: ResearchPreviews["posts"][number],
  ffprobePath: string,
) {
  requireMcp(
    preview.items.length > 0 && !preview.hasMore,
    "media_unavailable",
    "Meta did not expose a complete bounded set of media. Open the source or refresh research; no caption-only analysis was substituted.",
  );
  const parts: ResearchMediaPart[] = [];
  let bytes = 0;
  let durationSeconds = 0;
  let audioStreams = 0;
  const hash = createHash("sha256");
  const dir = await mkdtemp(join(tmpdir(), "vcstudio-research-"));
  try {
    for (const [index, item] of preview.items.entries()) {
      const url = researchMediaUrl(item.url);
      requireMcp(
        url,
        "media_unavailable",
        "Meta did not provide an accessible original media file. A video cover is insufficient for video analysis.",
      );
      const downloaded = await withPublicDownload(
        url,
        async (response) => {
          requireMcp(
            response.contentLength === null ||
              response.contentLength <= RESEARCH_MAX_BYTES - bytes,
            "media_too_large",
            "Research media exceeds the 12 MB total analysis limit.",
          );
          const chunks: Buffer[] = [];
          for await (const chunk of response.body) {
            bytes += chunk.byteLength;
            requireMcp(
              bytes <= RESEARCH_MAX_BYTES,
              "media_too_large",
              "Research media exceeds the 12 MB total analysis limit.",
            );
            chunks.push(Buffer.from(chunk));
          }
          return { bytes: Buffer.concat(chunks), type: response.contentType };
        },
        (redirect) => {
          requireMcp(
            researchMediaUrl(redirect.href),
            "invalid_source",
            "Research media redirected outside Meta's allowed CDN hosts.",
          );
        },
      );
      if (item.kind === "image") {
        requireMcp(
          ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
            downloaded.type,
          ),
          "invalid_media",
          "The image URL returned an unsupported file type.",
        );
        const metadata = await sharp(downloaded.bytes, {
          limitInputPixels: 40_000_000,
          failOn: "error",
        }).metadata();
        requireMcp(
          ["jpeg", "png", "webp", "gif"].includes(metadata.format ?? ""),
          "invalid_media",
          "The image's actual contents are not a supported image.",
        );
        const normalized = await sharp(downloaded.bytes, {
          limitInputPixels: 40_000_000,
          failOn: "error",
        })
          .rotate()
          .resize({
            width: 1024,
            height: 1024,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        hash.update("image/jpeg").update(normalized);
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: normalized.toString("base64"),
          },
        });
      } else {
        const mime = z
          .enum(["video/mp4", "video/webm", "video/quicktime"])
          .parse(downloaded.type);
        requireMcp(
          mime === "video/webm"
            ? downloaded.bytes
                .subarray(0, 4)
                .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
            : downloaded.bytes.subarray(4, 8).toString("ascii") === "ftyp",
          "invalid_media",
          "The video file signature does not match its declared type.",
        );
        const file = join(dir, `video-${index}.bin`);
        await writeFile(file, downloaded.bytes, { mode: 0o600 });
        const output = await execFileAsync(
          ffprobePath,
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_entries",
            "format=duration:stream=codec_type",
            "-of",
            "json",
            file,
          ],
          { timeout: 20000, maxBuffer: 512000, windowsHide: true },
        );
        const probe = probeSchema.parse(JSON.parse(output.stdout));
        requireMcp(
          probe.streams.some((s) => s.codec_type === "video"),
          "invalid_media",
          "No actual video stream was found.",
        );
        durationSeconds += probe.format.duration;
        audioStreams += probe.streams.filter(
          (s) => s.codec_type === "audio",
        ).length;
        requireMcp(
          durationSeconds <= RESEARCH_MAX_DURATION_SECONDS,
          "media_too_long",
          "Research video analysis is limited to 120 seconds total per post. No silent truncation was performed.",
        );
        hash.update(mime).update(downloaded.bytes);
        parts.push({
          inlineData: {
            mimeType: mime,
            data: downloaded.bytes.toString("base64"),
          },
        });
      }
    }
    return {
      parts,
      mediaHash: hash.digest("hex"),
      coverage: {
        items: parts.length,
        durationSeconds,
        audioStreams,
        downloadedBytes: bytes,
        videoSampling: "provider native video sampling; not every frame",
        imageProcessing:
          "entire image fitted within 1024px; animated images use the first frame",
      },
    };
  } finally {
    // Only the exact mkdtemp directory under the OS temp root can be removed.
    if (
      dirname(resolve(dir)) !== resolve(tmpdir()) ||
      !dir.split(/[\\/]/).at(-1)?.startsWith("vcstudio-research-")
    )
      throw new Error("UNSAFE_RESEARCH_TEMP_PATH");
    await rm(dir, { recursive: true, force: true });
  }
}
