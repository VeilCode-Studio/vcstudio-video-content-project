import "server-only";
import { z } from "zod";
import {
  researchSnapshotSchema,
  type ResearchSnapshot,
  type ResearchPlatform,
} from "@studio/contracts/social-research";
import { metaResearchRequest } from "./meta-client";

const count = z.number().int().nonnegative().nullish();
const summary = z
  .object({ summary: z.object({ total_count: count }).optional() })
  .optional();
const paging = z.object({ next: z.string().optional() }).optional();
const instagramSchema = z.object({
  business_discovery: z.object({
    id: z.string().regex(/^\d+$/),
    username: z.string(),
    biography: z.string().optional(),
    followers_count: count,
    media_count: count,
    media: z
      .object({
        data: z
          .array(
            z.object({
              id: z.string(),
              caption: z.string().optional(),
              media_type: z.string().optional(),
              media_product_type: z.string().optional(),
              permalink: z.string(),
              timestamp: z.string().optional(),
              like_count: count,
              comments_count: count,
            }),
          )
          .max(25),
        paging,
      })
      .optional(),
  }),
});
const facebookSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string(),
  about: z.string().optional(),
  followers_count: count,
  posts: z
    .object({
      data: z
        .array(
          z.object({
            id: z.string(),
            message: z.string().optional(),
            permalink_url: z.string(),
            created_time: z.string().optional(),
            reactions: summary,
            comments: summary,
            shares: z.object({ count }).optional(),
            attachments: z
              .object({
                data: z
                  .array(
                    z.object({
                      media_type: z.string().optional(),
                      type: z.string().optional(),
                    }),
                  )
                  .max(25),
              })
              .optional(),
          }),
        )
        .max(25),
      paging,
    })
    .optional(),
});

function date(value?: string): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
function socialLink(value: string, platform: ResearchPlatform): string {
  const url = new URL(value);
  const domain = platform === "instagram" ? "instagram.com" : "facebook.com";
  if (
    url.protocol !== "https:" ||
    !(url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ||
    url.username ||
    url.password
  )
    throw new Error("INVALID_META_LINK");
  // Facebook photo/story/video permalinks can carry their identity in the query.
  for (const key of [...url.searchParams.keys()]) {
    if (
      platform !== "facebook" ||
      !["fbid", "story_fbid", "id", "v"].includes(key)
    )
      url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

export async function fetchMetaResearch(input: {
  version: string;
  token: string;
  platform: ResearchPlatform;
  identifier: string;
  sourceId: string | null;
}): Promise<ResearchSnapshot> {
  if (input.platform === "instagram") {
    if (
      !input.sourceId ||
      !/^\d{1,40}$/.test(input.sourceId) ||
      !/^[a-z0-9_][a-z0-9_.]{0,29}$/.test(input.identifier)
    )
      throw new Error("INVALID_RESEARCH_ACCOUNT");
    const raw = await metaResearchRequest({
      version: input.version,
      token: input.token,
      path: input.sourceId,
      query: {
        fields: `business_discovery.username(${input.identifier}){id,username,biography,followers_count,media_count,media.limit(25){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`,
      },
    });
    const profile = instagramSchema.parse(raw).business_discovery;
    const posts = profile.media?.data ?? [];
    return researchSnapshotSchema.parse({
      platform: input.platform,
      externalAccountId: profile.id,
      name: profile.username,
      profileUrl: socialLink(
        `https://www.instagram.com/${profile.username}/`,
        "instagram",
      ),
      biography: profile.biography ?? null,
      followers: profile.followers_count ?? null,
      totalPosts: profile.media_count ?? null,
      posts: posts.map((post) => ({
        id: post.id,
        url: socialLink(post.permalink, "instagram"),
        publishedAt: date(post.timestamp),
        text: post.caption ?? "",
        format:
          post.media_product_type === "REELS"
            ? "reel"
            : post.media_type === "CAROUSEL_ALBUM"
              ? "carousel"
              : post.media_type === "VIDEO"
                ? "video"
                : post.media_type === "IMAGE"
                  ? "image"
                  : "other",
        likes: post.like_count ?? null,
        comments: post.comments_count ?? null,
        shares: null,
      })),
      hasMore: Boolean(profile.media?.paging?.next),
      warnings: [
        "Competitor reach, impressions, saves, private comments, watch time and conversions are not available here. Missing counts are unknown, not zero.",
        ...(profile.media
          ? []
          : [
              "Meta did not return the media field; this is not evidence that the account has no posts.",
            ]),
      ],
    });
  }
  if (!/^\d{1,40}$/.test(input.identifier))
    throw new Error("INVALID_RESEARCH_ACCOUNT");
  const raw = await metaResearchRequest({
    version: input.version,
    token: input.token,
    path: input.identifier,
    query: {
      fields:
        "id,name,about,followers_count,posts.limit(25){id,message,permalink_url,created_time,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares,attachments{media_type,type}}",
    },
  });
  const profile = facebookSchema.parse(raw);
  return researchSnapshotSchema.parse({
    platform: "facebook",
    externalAccountId: profile.id,
    name: profile.name,
    profileUrl: `https://www.facebook.com/${profile.id}`,
    biography: profile.about ?? null,
    followers: profile.followers_count ?? null,
    totalPosts: null,
    posts: (profile.posts?.data ?? []).map((post) => {
      const attachment = post.attachments?.data[0];
      return {
        id: post.id,
        url: socialLink(post.permalink_url, "facebook"),
        publishedAt: date(post.created_time),
        text: post.message ?? "",
        format:
          attachment?.media_type === "video"
            ? "video"
            : attachment?.type === "album"
              ? "carousel"
              : attachment?.media_type === "photo"
                ? "image"
                : !attachment
                  ? "text"
                  : "other",
        likes: post.reactions?.summary?.total_count ?? null,
        comments: post.comments?.summary?.total_count ?? null,
        shares: post.shares?.count ?? null,
      };
    }),
    hasMore: Boolean(profile.posts?.paging?.next),
    warnings: [
      "Facebook reactions are shown in the likes/reactions column. Competitor reach, impressions, private profiles and conversions are not available.",
      ...(profile.posts
        ? []
        : [
            "Meta did not return the posts field; this is not evidence that the Page has no posts.",
          ]),
    ],
  });
}
