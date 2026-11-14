import "server-only";
import {
  getResearchConnection,
  replaceResearchSources,
} from "@/db/repositories/social-research.repository";
import {
  getPublishingEnvironment,
  getPublishingWebEnvironment,
} from "@/lib/env/server";
import { enforceRateLimit } from "@/lib/rate-limit/enforce-rate-limit";
import { isSocialResearchEnabled } from "./environment";
import { openResearchToken } from "./secrets";
import { SocialResearchError } from "./errors";
import { discoverResearchSources } from "./source-discovery";

/** Caller must resolve current owner membership. Reuse consent; never rotate its token. */
export async function refreshResearchSources(
  workspaceId: string,
): Promise<number> {
  if (!isSocialResearchEnabled())
    throw new SocialResearchError(
      "configuration",
      "Social research is disabled.",
    );
  const grant = await getResearchConnection(workspaceId);
  if (
    !grant?.accessTokenSealed ||
    grant.revokedAt ||
    !grant.expiresAt ||
    grant.expiresAt.getTime() <= Date.now()
  )
    throw new SocialResearchError(
      "expired",
      "Authorize Meta research before checking source accounts.",
    );
  if (
    !grant.scopes.includes("instagram_basic") ||
    !grant.scopes.includes("pages_show_list")
  )
    throw new SocialResearchError(
      "access",
      "Reconnect research and grant Instagram basic and Page listing access.",
    );
  await enforceRateLimit({ workspaceId, operation: "social_research" });
  const environment = getPublishingEnvironment();
  const web = getPublishingWebEnvironment();
  const sources = await discoverResearchSources({
    token: openResearchToken({
      workspaceId,
      sealed: grant.accessTokenSealed,
      key: environment.PLATFORM_TOKEN_ENCRYPTION_KEY,
    }),
    appId: web.FACEBOOK_APP_ID,
    appSecret: web.FACEBOOK_APP_SECRET,
    version: environment.FACEBOOK_GRAPH_API_VERSION,
  });
  if (
    !(await replaceResearchSources({
      workspaceId,
      revision: grant.revision,
      sources,
    }))
  )
    throw new SocialResearchError(
      "conflict",
      "Research authorization changed during discovery. Refresh the page and try again.",
    );
  return sources.length;
}
