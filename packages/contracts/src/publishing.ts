import { z } from "zod";

export const deleteSocialPostRequestSchema = z.object({
  postId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  deleteMedia: z.boolean().default(false),
});
export type PostDeletionPreview = {
  postId: string;
  name: string;
  version: number;
  status: string;
  mediaCount: number;
  removableMediaCount: number;
  canDelete: boolean;
};

export const facebookPageIdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,32}$/, "Enter the numeric Facebook Page ID.");

/** Safe for client props and action results; never include Page tokens. */
export type FacebookPageOption = {
  externalAccountId: string;
  externalAccountName: string;
};

export type FacebookPageLookupState = {
  page: FacebookPageOption | null;
  error: string | null;
};

export const socialYouTubeSettingsSchema = z.object({
  title: z.string().trim().max(100).default(""),
  description: z.string().max(5000).nullable().default(null),
  tags: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .default([])
    .refine(
      (tags) =>
        tags.map((tag) => (tag.includes(" ") ? `"${tag}"` : tag)).join(",")
          .length <= 500,
      "YouTube tags must total at most 500 characters.",
    ),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  // Unanswered declarations stay null; neither the browser nor an AI may guess.
  madeForKids: z.boolean().nullable().default(null),
  containsSyntheticMedia: z.boolean().nullable().default(null),
});
export type SocialYouTubeSettings = z.infer<typeof socialYouTubeSettingsSchema>;

export const YOUTUBE_THUMBNAIL_MAX_BYTES = 50 * 1024 * 1024;
export const YOUTUBE_THUMBNAIL_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
] as const;

/** App credentials from TikTok's Sandbox tab, never TikTok account passwords. */
export const tikTokSandboxCredentialsSchema = z.object({
  clientKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  clientSecret: z.string().trim().min(1).max(256).regex(/^\S+$/),
});

export type TikTokSandboxCredentials = z.infer<
  typeof tikTokSandboxCredentialsSchema
>;

/** One Pin destination. Omitted description uses the shared Social copy. */
export const pinterestPinSettingsSchema = z.object({
  accessTier: z.enum(["trial", "standard"]).optional(),
  boardId: z
    .string()
    .regex(/^\d{1,32}$/)
    .or(z.literal(""))
    .default(""),
  boardName: z.string().max(200).default(""),
  title: z.string().trim().max(100).default(""),
  description: z.string().max(800).nullable().default(null),
  link: z
    .url()
    .max(2048)
    .refine(
      (value) => new URL(value).protocol === "https:",
      "Use an HTTPS destination link.",
    )
    .nullable()
    .default(null),
  videoCoverAssetId: z.uuid().nullable().default(null),
});
export const pinterestPostSettingsSchema = z
  .record(z.uuid(), pinterestPinSettingsSchema)
  .refine(
    (value) => Object.keys(value).length <= 20,
    "Too many Pinterest destinations.",
  );
export type PinterestPinSettings = z.infer<typeof pinterestPinSettingsSchema>;
export type PinterestPostSettings = z.infer<typeof pinterestPostSettingsSchema>;
export const pinterestBoardQuerySchema = z.object({
  connectionId: z.uuid(),
  bookmark: z.string().max(2048).optional(),
});
export const pinterestBoardSchema = z.object({
  id: z.string().regex(/^\d{1,32}$/),
  name: z.string().min(1).max(200),
  privacy: z.enum(["PUBLIC", "PROTECTED", "SECRET"]).optional(),
});
export type PinterestBoard = z.infer<typeof pinterestBoardSchema>;
export type PinterestBoardPage = {
  items: PinterestBoard[];
  bookmark: string | null;
};

export const EMPTY_PINTEREST_PIN_SETTINGS = pinterestPinSettingsSchema.parse(
  {},
);
