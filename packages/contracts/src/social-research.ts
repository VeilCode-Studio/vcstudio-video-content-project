import { z } from "zod";

export const researchAuthorizationFailureSchema = z.enum([
  "configuration",
  "consent",
  "token_exchange",
  "token_extension",
  "permissions",
  "account_discovery",
  "save_connection",
  "audit",
  "session",
]);
export type ResearchAuthorizationFailure = z.infer<
  typeof researchAuthorizationFailureSchema
>;

export const researchPlatformSchema = z.enum(["facebook", "instagram"]);
export type ResearchPlatform = z.infer<typeof researchPlatformSchema>;

export const researchAccountInputSchema = z
  .object({
    platform: researchPlatformSchema,
    identifier: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    notes: z.string().trim().max(2000).default(""),
  })
  .superRefine((value, context) => {
    const valid =
      value.platform === "facebook"
        ? /^\d{1,40}$/.test(value.identifier)
        : /^@?[a-zA-Z0-9_][a-zA-Z0-9_.]{0,29}$/.test(value.identifier);
    if (!valid)
      context.addIssue({
        code: "custom",
        path: ["identifier"],
        message:
          value.platform === "facebook"
            ? "Use the numeric Facebook Page ID, not a personal profile or Page URL."
            : "Enter an Instagram username, not a profile URL.",
      });
  })
  .transform((value) => ({
    ...value,
    identifier: value.identifier.replace(/^@/, "").toLowerCase(),
  }));

const count = z.number().int().nonnegative().nullable();
export const researchPostSchema = z.object({
  id: z.string().min(1).max(120),
  url: z.url().max(2000),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  text: z.string().max(20000),
  format: z.enum(["image", "video", "reel", "carousel", "text", "other"]),
  likes: count,
  comments: count,
  shares: count,
});
export type ResearchPost = z.infer<typeof researchPostSchema>;

export const researchSnapshotSchema = z.object({
  platform: researchPlatformSchema,
  externalAccountId: z.string().min(1).max(100),
  name: z.string().max(200),
  profileUrl: z.url().max(2000),
  biography: z.string().max(5000).nullable(),
  followers: count,
  totalPosts: count,
  posts: z.array(researchPostSchema).max(25),
  hasMore: z.boolean(),
  warnings: z.array(z.string().max(500)).max(10),
});
export type ResearchSnapshot = z.infer<typeof researchSnapshotSchema>;

export const researchSourcesSchema = z
  .array(
    z.object({
      id: z.string().regex(/^\d{1,40}$/),
      username: z.string().max(100),
    }),
  )
  .max(50);
export type ResearchSource = z.infer<typeof researchSourcesSchema>[number];

export type ResearchAccountView = {
  id: string;
  platform: ResearchPlatform;
  identifier: string;
  name: string;
  notes: string;
  version: number;
  refreshedAt: string | null;
  lastError: string | null;
};
export type ResearchSnapshotView = {
  id: string;
  capturedAt: string;
  data: ResearchSnapshot;
};
export type ResearchConnectionView = {
  connected: boolean;
  expiresAt: string | null;
  sources: ResearchSource[];
  scopes: string[];
};
