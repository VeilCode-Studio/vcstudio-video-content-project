import { z } from "zod";

// Transient response contracts only: never part of saved ResearchSnapshot data.
export const researchPreviewInputSchema = z.object({ snapshotId: z.uuid() });
export const researchPreviewItemSchema = z.object({
  kind: z.enum(["image", "video"]),
  url: z.url().max(8000).nullable(),
  posterUrl: z.url().max(8000).nullable(),
});
export const researchPreviewsSchema = z.object({
  fetchedAt: z.iso.datetime(),
  profileImageUrl: z.url().max(8000).nullable(),
  posts: z
    .array(
      z.object({
        postId: z.string().min(1).max(120),
        items: z.array(researchPreviewItemSchema).max(20),
        hasMore: z.boolean(),
      }),
    )
    .max(25),
});
export type ResearchPreviewItem = z.infer<typeof researchPreviewItemSchema>;
export type ResearchPreviews = z.infer<typeof researchPreviewsSchema>;
export type ResearchPreviewResult =
  { ok: true; data: ResearchPreviews } | { ok: false; error: string };
