import { z } from "zod";
export const mediaDownloadSchema = z.object({
  assetId: z.uuid(),
  source: z.enum(["library", "render"]).default("library"),
  postId: z.uuid().optional(),
});
export const mediaDownloadResponseSchema = z.object({
  url: z.url().refine((value) => new URL(value).protocol === "https:"),
});
