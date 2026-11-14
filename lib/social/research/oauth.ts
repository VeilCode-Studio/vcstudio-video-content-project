import "server-only";
import { z } from "zod";
import { researchSourcesSchema } from "@studio/contracts/social-research";
import { metaResearchRequest } from "./meta-client";
import { SocialResearchError } from "./errors";
import { ResearchAuthorizationError } from "./authorization-error";
import type { ResearchAuthorizationFailure } from "@studio/contracts/social-research";
import { resolveResearchTokenDeadline } from "./token-expiry";
import {
  readResearchTokenMetadata,
  type ResearchTokenMetadata,
} from "./token-metadata";
import { discoverResearchSources } from "./source-discovery";

export const RESEARCH_OAUTH_COOKIE = "vcstudio_research_oauth";
export const RESEARCH_OAUTH_PATH = "/api/social/research";
export const RESEARCH_OAUTH_PURPOSE = "meta:research";
export const RESEARCH_PATH = "/app/social/research";
export const RESEARCH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_insights",
] as const;

export function createResearchAuthorizationUrl(input: {
  appId: string;
  version: string;
  baseUrl: string;
  state: string;
}) {
  const url = new URL(`https://www.facebook.com/${input.version}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: `${input.baseUrl}/api/social/research/callback`,
    response_type: "code",
    scope: RESEARCH_SCOPES.join(","),
    state: input.state,
    auth_type: "rerequest",
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z
    .union([
      z.number().int().nonnegative(),
      z
        .string()
        .regex(/^\d{1,10}$/)
        .transform(Number),
    ])
    .nullish(),
});
const permissionsSchema = z.object({
  data: z
    .array(z.object({ permission: z.string(), status: z.string() }))
    .max(100),
});

export async function exchangeResearchConsent(input: {
  code: string;
  appId: string;
  appSecret: string;
  version: string;
  baseUrl: string;
}) {
  let stage: ResearchAuthorizationFailure = "token_exchange";
  try {
    // Meta documents GET for token exchange; URL values stay server-side and must never be logged.
    const short = z.object({ access_token: z.string().min(1) }).parse(
      await metaResearchRequest({
        version: input.version,
        path: "oauth/access_token",
        query: {
          client_id: input.appId,
          client_secret: input.appSecret,
          redirect_uri: `${input.baseUrl}/api/social/research/callback`,
          code: input.code,
        },
      }),
    );
    stage = "token_extension";
    const token = tokenSchema.parse(
      await metaResearchRequest({
        version: input.version,
        path: "oauth/access_token",
        query: {
          grant_type: "fb_exchange_token",
          client_id: input.appId,
          client_secret: input.appSecret,
          fb_exchange_token: short.access_token,
        },
      }),
    );
    let metadata: Promise<ResearchTokenMetadata> | undefined;
    const inspectToken = () =>
      (metadata ??= readResearchTokenMetadata({
        token: token.access_token,
        appId: input.appId,
        appSecret: input.appSecret,
        version: input.version,
      }));
    const expiresAt = await resolveResearchTokenDeadline({
      token: token.access_token,
      expiresIn: token.expires_in,
      inspectToken,
      appId: input.appId,
      appSecret: input.appSecret,
      version: input.version,
    });
    stage = "permissions";
    const permissions = permissionsSchema.parse(
      await metaResearchRequest({
        version: input.version,
        path: "me/permissions",
        token: token.access_token,
      }),
    );
    const scopes = permissions.data
      .filter(
        (permission) =>
          permission.status === "granted" &&
          RESEARCH_SCOPES.some((scope) => scope === permission.permission),
      )
      .map((permission) => permission.permission);
    if (!scopes.includes("pages_read_engagement"))
      throw new SocialResearchError(
        "access",
        "Meta research permissions were not granted.",
      );
    stage = "account_discovery";
    const sources =
      scopes.includes("instagram_basic") && scopes.includes("pages_show_list")
        ? await discoverResearchSources({
            token: token.access_token,
            appId: input.appId,
            appSecret: input.appSecret,
            version: input.version,
            inspectToken,
          })
        : [];

    return {
      token: token.access_token,
      expiresAt,
      scopes,
      sources: researchSourcesSchema.parse(sources),
    };
  } catch (error) {
    throw new ResearchAuthorizationError(stage, error);
  }
}
