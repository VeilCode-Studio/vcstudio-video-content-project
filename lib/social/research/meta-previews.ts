import "server-only";
import { z } from "zod";
import {
  researchPreviewsSchema,
  type ResearchPreviewItem,
  type ResearchPreviews,
} from "@studio/contracts/social-research-previews";
import type { ResearchSnapshot } from "@studio/contracts/social-research";
import { metaResearchRequest } from "./meta-client";
import { researchMediaUrl } from "./media-url";
import { SocialResearchError } from "./errors";

const igItem = z.object({
  id: z.string(),
  media_type: z.string().nullish(),
  media_url: z.unknown().optional(),
  thumbnail_url: z.unknown().optional(),
});
const igSchema = z.object({
  business_discovery: z.object({
    id: z.string(),
    profile_picture_url: z.unknown().optional(),
    media: z
      .object({
        data: z
          .array(
            igItem.extend({
              children: z
                .object({
                  data: z.array(igItem).max(20),
                  paging: z.object({ next: z.string().optional() }).optional(),
                })
                .nullish(),
            }),
          )
          .max(25),
      })
      .nullish(),
  }),
});
const attachment = z.object({
  media_type: z.string().nullish(),
  type: z.string().nullish(),
  media: z
    .object({
      image: z.object({ src: z.unknown().optional() }).nullish(),
      source: z.unknown().optional(),
    })
    .nullish(),
});
const fbSchema = z.object({
  id: z.string(),
  picture: z
    .object({
      data: z.object({
        url: z.unknown().optional(),
        is_silhouette: z.boolean().optional(),
      }),
    })
    .nullish(),
  posts: z
    .object({
      data: z
        .array(
          z.object({
            id: z.string(),
            full_picture: z.unknown().optional(),
            attachments: z
              .object({
                data: z
                  .array(
                    attachment.extend({
                      subattachments: z
                        .object({
                          data: z.array(attachment).max(20),
                          paging: z
                            .object({ next: z.string().optional() })
                            .optional(),
                        })
                        .nullish(),
                    }),
                  )
                  .max(20),
              })
              .nullish(),
          }),
        )
        .max(25),
    })
    .nullish(),
});

function instagramItem(item: z.infer<typeof igItem>): ResearchPreviewItem {
  const video = item.media_type === "VIDEO";
  return {
    kind: video ? "video" : "image",
    url: researchMediaUrl(item.media_url),
    posterUrl: video ? researchMediaUrl(item.thumbnail_url) : null,
  };
}
function facebookItem(item: z.infer<typeof attachment>): ResearchPreviewItem {
  const video = item.media_type === "video" || item.type?.startsWith("video");
  const image = researchMediaUrl(item.media?.image?.src);
  return {
    kind: video ? "video" : "image",
    url: video ? researchMediaUrl(item.media?.source) : image,
    posterUrl: video ? image : null,
  };
}
/** URLs are returned to the signed-in page only. No binary fetch, storage or snapshot write. */
export async function fetchMetaResearchPreviews(input: {
  version: string;
  token: string;
  sourceId: string | null;
  identifier: string;
  snapshot: ResearchSnapshot;
}): Promise<ResearchPreviews> {
  const savedIds = new Set(input.snapshot.posts.map((post) => post.id));
  let profileImageUrl: string | null = null;
  let posts: ResearchPreviews["posts"] = [];
  let externalId: string;
  if (input.snapshot.platform === "instagram") {
    if (
      !input.sourceId ||
      !/^\d{1,40}$/.test(input.sourceId) ||
      !/^[a-z0-9_][a-z0-9_.]{0,29}$/.test(input.identifier)
    )
      throw new SocialResearchError(
        "access",
        "The research source is unavailable. Refresh this account with an authorized source.",
      );
    const query = {
      version: input.version,
      token: input.token,
      path: input.sourceId,
      query: {
        fields: `business_discovery.username(${input.identifier}){id,profile_picture_url,media.limit(25){id,media_type,media_url,thumbnail_url,children.limit(20){id,media_type,media_url,thumbnail_url}}}`,
      },
    };
    let raw: unknown;
    try {
      raw = await metaResearchRequest(query);
    } catch (error) {
      // Some Graph versions reject video thumbnails in Business Discovery.
      // One narrower read preserves images/videos; never retry expiry/rate/transport errors.
      if (!(error instanceof SocialResearchError) || error.providerCode !== 100)
        throw error;
      raw = await metaResearchRequest({
        ...query,
        query: { fields: query.query.fields.replaceAll(",thumbnail_url", "") },
      });
    }
    const profile = igSchema.parse(raw).business_discovery;
    externalId = profile.id;
    profileImageUrl = researchMediaUrl(profile.profile_picture_url);
    posts = (profile.media?.data ?? [])
      .filter((post) => savedIds.has(post.id))
      .map((post) => ({
        postId: post.id,
        items:
          post.media_type === "CAROUSEL_ALBUM"
            ? (post.children?.data ?? []).map(instagramItem)
            : [instagramItem(post)],
        hasMore: Boolean(post.children?.paging?.next),
      }));
  } else {
    if (!/^\d{1,40}$/.test(input.identifier))
      throw new SocialResearchError(
        "access",
        "The research Page is unavailable.",
      );
    const raw = await metaResearchRequest({
      version: input.version,
      token: input.token,
      path: input.identifier,
      query: {
        fields:
          "id,picture.type(large){url,is_silhouette},posts.limit(25){id,full_picture,attachments.limit(20){media_type,type,media,subattachments.limit(20){media_type,type,media}}}",
      },
    });
    const profile = fbSchema.parse(raw);
    externalId = profile.id;
    profileImageUrl = profile.picture?.data.is_silhouette
      ? null
      : researchMediaUrl(profile.picture?.data.url);
    posts = (profile.posts?.data ?? [])
      .filter((post) => savedIds.has(post.id))
      .map((post) => {
        const attachments = post.attachments?.data ?? [];
        const items = attachments.flatMap((item) =>
          item.subattachments?.data.length
            ? item.subattachments.data.map(facebookItem)
            : [facebookItem(item)],
        );
        if (!items.length && researchMediaUrl(post.full_picture))
          items.push({
            kind: "image",
            url: researchMediaUrl(post.full_picture),
            posterUrl: null,
          });
        return {
          postId: post.id,
          items: items.slice(0, 20),
          hasMore:
            items.length > 20 ||
            attachments.some((item) =>
              Boolean(item.subattachments?.paging?.next),
            ),
        };
      });
  }
  if (externalId !== input.snapshot.externalAccountId)
    throw new SocialResearchError(
      "conflict",
      "Meta returned a different account. Refresh research before loading its previews.",
    );
  return researchPreviewsSchema.parse({
    fetchedAt: new Date().toISOString(),
    profileImageUrl,
    posts,
  });
}
