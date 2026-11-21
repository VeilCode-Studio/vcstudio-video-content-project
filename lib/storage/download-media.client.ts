"use client";
import { mediaDownloadResponseSchema } from "@studio/contracts/media-download";

/** Only the small authorization response is fetched. The browser streams the file. */
export async function downloadMedia(input: {
  assetId: string;
  source: "library" | "render";
  postId?: string;
}) {
  const query = new URLSearchParams({
    source: input.source,
    ...(input.postId ? { postId: input.postId } : {}),
  });
  const response = await fetch(
    `/api/media/${input.assetId}/download?${query}`,
    { cache: "no-store" },
  );
  const parsed = mediaDownloadResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!response.ok || !parsed.success)
    throw new Error(
      "The download could not start. Check access or media availability and try again.",
    );
  const link = document.createElement("a");
  link.href = parsed.data.url;
  link.download = "";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}
