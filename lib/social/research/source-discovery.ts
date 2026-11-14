import "server-only";
import { z } from "zod";
import {
  researchSourcesSchema,
  type ResearchSource,
} from "@studio/contracts/social-research";
import { metaResearchRequest } from "./meta-client";
import {
  readResearchTokenMetadata,
  type ResearchTokenMetadata,
} from "./token-metadata";
import { SocialResearchError } from "./errors";

const sourceSchema = z.object({
  id: z.string().regex(/^\d{1,40}$/),
  username: z.string().min(1).max(100),
});
const pagesSchema = z.object({
  data: z
    .array(
      z.object({
        instagram_business_account: z
          .object({
            id: z.string().regex(/^\d{1,40}$/),
            username: z.string().max(100).optional(),
          })
          .nullish(),
      }),
    )
    .max(25),
  paging: z
    .object({
      cursors: z.object({ after: z.string().max(1000).optional() }).optional(),
      next: z.string().optional(),
    })
    .optional(),
});

/** Consent targets are hints: every missing Instagram ID is verified using this research token. */
export async function discoverResearchSources(input: {
  token: string;
  appId: string;
  appSecret: string;
  version: string;
  inspectToken?: () => Promise<ResearchTokenMetadata>;
}): Promise<ResearchSource[]> {
  const sources = new Map<string, ResearchSource>();
  let after: string | undefined;
  let pageError: unknown;
  try {
    for (let index = 0; index < 2; index++) {
      const result = pagesSchema.parse(
        await metaResearchRequest({
          version: input.version,
          path: "me/accounts",
          token: input.token,
          query: {
            fields: "instagram_business_account{id,username}",
            limit: "25",
            ...(after ? { after } : {}),
          },
        }),
      );
      for (const page of result.data) {
        const source = page.instagram_business_account;
        if (source)
          sources.set(source.id, {
            id: source.id,
            username: source.username ?? source.id,
          });
      }
      after = result.paging?.cursors?.after;
      if (!result.paging?.next || !after) break;
    }
  } catch (error) {
    pageError = error;
    console.warn("SOCIAL_RESEARCH_PAGE_LIST_UNAVAILABLE");
  }
  let metadata: ResearchTokenMetadata;
  try {
    metadata = await (input.inspectToken
      ? input.inspectToken()
      : readResearchTokenMetadata(input));
  } catch (error) {
    if (
      !(error instanceof SocialResearchError) ||
      !["unavailable", "rate_limit"].includes(error.code)
    )
      throw error;
    if (sources.size === 0) throw pageError ?? error;
    console.warn("SOCIAL_RESEARCH_SOURCE_HINTS_UNAVAILABLE");
    return researchSourcesSchema.parse([...sources.values()]);
  }
  const candidates = [
    ...new Set(
      metadata.granular_scopes
        .filter((scope) => scope.scope === "instagram_basic")
        .flatMap((scope) => scope.target_ids ?? []),
    ),
  ].filter((id) => !sources.has(id));
  // At most twelve fallback reads, four concurrent requests. No unbounded fanout.
  const limited = candidates.slice(0, 12);
  for (let start = 0; start < limited.length; start += 4) {
    const results = await Promise.allSettled(
      limited.slice(start, start + 4).map(async (id) => {
        const source = sourceSchema.parse(
          await metaResearchRequest({
            version: input.version,
            path: id,
            token: input.token,
            query: { fields: "id,username" },
          }),
        );
        if (source.id !== id)
          throw new SocialResearchError(
            "access",
            "Meta returned a different Instagram source identity.",
          );
        return source;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled")
        sources.set(result.value.id, result.value);
      else console.warn("SOCIAL_RESEARCH_SOURCE_LOOKUP_FAILED");
    }
  }
  if (candidates.length > limited.length)
    console.warn("SOCIAL_RESEARCH_SOURCE_LOOKUP_LIMIT");
  if (sources.size === 0 && limited.length > 0)
    throw new SocialResearchError(
      "access",
      "Meta listed Instagram consent but none of those source accounts could be verified. Check Page/account access or retry source discovery.",
    );
  if (sources.size === 0 && pageError) throw pageError;
  return researchSourcesSchema.parse([...sources.values()].slice(0, 50));
}
