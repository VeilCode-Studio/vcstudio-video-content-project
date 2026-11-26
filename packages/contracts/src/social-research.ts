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

export const deleteResearchAccountInputSchema = z.object({
  accountId: z.uuid(),
  version: z.number().int().positive(),
});

export const researchAccountInputSchema = z
  .object({
    platform: researchPlatformSchema,
    identifier: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    notes: z.string().trim().max(2000).default(""),
    categoryId: z.uuid().nullable().optional(),
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
  categoryId?: string | null;
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

export const researchSelectionInputSchema = z.object({
  accountId: z.uuid(),
  historyPage: z.number().int().min(0).max(1000).default(0),
  observationId: z.uuid().optional(),
});
export type ResearchSelection = {
  selected: ResearchAccountView | null;
  snapshots: ResearchSnapshotView[];
  hasMoreSnapshots: boolean;
  historyPage: number;
  observationId: string | null;
};
export type ResearchSelectionResult =
  { ok: true; data: ResearchSelection } | { ok: false; error: string };

export const researchKeywordInputSchema = z.object({
  query: z.string().trim().max(100).default(""),
  kind: z.enum(["all", "keywords", "hashtags"]).default("all"),
  platform: z.enum(["all", "facebook", "instagram"]).default("all"),
  accountId: z.union([z.literal("all"), z.uuid()]).default("all"),
  media: z.enum(["captions", "captions_and_media"]).default("captions"),
  page: z.number().int().min(1).max(1000).default(1),
});
export type ResearchKeywordInput = z.infer<typeof researchKeywordInputSchema>;

export const researchKeywordSampleSchema = z.object({
  accountId: z.uuid(),
  accountName: z.string().max(200),
  platform: researchPlatformSchema,
  snapshotId: z.uuid().nullable(),
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  posts: z
    .array(researchPostSchema.extend({ textTruncated: z.boolean() }))
    .max(25),
  hasMore: z.boolean(),
});
export type ResearchKeywordSample = z.infer<typeof researchKeywordSampleSchema>;

export const researchKeywordMediaSchema = z.object({
  operationId: z.uuid(),
  snapshotId: z.uuid(),
  postId: z.string().max(120),
  transcript: z.string().max(6000).nullable(),
  evidence: z.array(z.string().max(1500)).max(10),
});
export type ResearchKeywordMedia = z.infer<typeof researchKeywordMediaSchema>;

export type ResearchKeywordTerm = {
  term: string;
  kind: "keyword" | "hashtag";
  postCount: number;
  captionPostCount: number;
  mediaPostCount: number;
  accountCount: number;
  measuredPostCount: number;
  medianInteractions: number | null;
  evidence: { snapshotId: string; postId: string; url: string }[];
};
export type ResearchKeywordEvidence = {
  accountId: string;
  accountName: string;
  platform: ResearchPlatform;
  snapshotId: string;
  observedAt: string;
  post: ResearchPost;
  mediaOperationId: string | null;
  matchedIn: ("caption" | "media")[];
  interactions: number | null;
};
export type ResearchKeywordReport = {
  filters: ResearchKeywordInput;
  coverage: {
    accounts: number;
    observations: number;
    posts: number;
    matchedPosts: number;
    mediaPosts: number;
    measuredPosts: number;
    oldestObservation: string | null;
    newestObservation: string | null;
    accountsTruncated: boolean;
    captionsTruncated: boolean;
    providerHasMore: boolean;
  };
  terms: ResearchKeywordTerm[];
  posts: ResearchKeywordEvidence[];
  hasMore: boolean;
  limitations: string[];
  hashtagDiscovery: "not_configured";
};
