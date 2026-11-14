import "server-only";
import { z } from "zod";
import {
  claimResearchRefresh,
  findResearchAccount,
  findResearchOperation,
  finishResearchRefresh,
  getResearchConnection,
} from "@/db/repositories/social-research.repository";
import { getPublishingEnvironment } from "@/lib/env/server";
import { isSocialResearchEnabled } from "./environment";
import { openResearchToken } from "./secrets";
import { fetchMetaResearch } from "./meta-provider";
import { SocialResearchError } from "./errors";
import { enforceRateLimit } from "@/lib/rate-limit/enforce-rate-limit";

export const researchRefreshInputSchema = z.object({
  accountId: z.uuid(),
  requestId: z.uuid(),
  sourceId: z
    .string()
    .regex(/^\d{1,40}$/)
    .nullable()
    .default(null),
});

/** Caller must resolve workspace membership/capability; every repository read is tenant scoped. */
export async function refreshResearchAccount(
  workspaceId: string,
  raw: unknown,
): Promise<string> {
  const input = researchRefreshInputSchema.parse(raw);
  if (!isSocialResearchEnabled())
    throw new SocialResearchError(
      "configuration",
      "Social research is disabled for this deployment.",
    );
  const account = await findResearchAccount(workspaceId, input.accountId);
  if (!account)
    throw new SocialResearchError(
      "access",
      "That research account is not available in this workspace.",
    );
  if (account.platform === "facebook" && input.sourceId !== null)
    throw new SocialResearchError(
      "access",
      "A Facebook Page refresh does not accept an Instagram source.",
    );
  const sourceId = account.platform === "instagram" ? input.sourceId : null;
  const previous = await findResearchOperation(workspaceId, input.requestId);
  if (previous) {
    if (
      previous.accountId !== input.accountId ||
      previous.sourceId !== sourceId
    )
      throw new SocialResearchError(
        "conflict",
        "That refresh key belongs to a different request. Start a new refresh.",
      );
    if (previous.status === "succeeded") return previous.id;
    throw new SocialResearchError(
      "conflict",
      previous.safeError ??
        "That refresh is still running or was interrupted. Wait 90 seconds, then start a new refresh.",
    );
  }
  const connection = await getResearchConnection(workspaceId);
  if (
    !connection?.accessTokenSealed ||
    connection.revokedAt ||
    !connection.expiresAt ||
    connection.expiresAt.getTime() <= Date.now()
  )
    throw new SocialResearchError(
      "expired",
      "Ask the workspace owner to authorize Meta research access first.",
    );
  if (
    account.platform === "instagram" &&
    (!connection.scopes.includes("instagram_basic") ||
      !connection.scopes.includes("instagram_manage_insights") ||
      !sourceId ||
      !connection.sources.some((source) => source.id === sourceId))
  )
    throw new SocialResearchError(
      "access",
      "Choose a professional Instagram source authorized for research in this workspace, with Instagram basic and insights permissions granted.",
    );
  await enforceRateLimit({ workspaceId, operation: "social_research" });
  if (
    !(await claimResearchRefresh({
      ...input,
      sourceId,
      workspaceId,
      connectionRevision: connection.revision,
    }))
  )
    throw new SocialResearchError(
      "rate_limit",
      "This account was refreshed recently or a refresh is running. Wait at least one minute and try again.",
    );
  try {
    const environment = getPublishingEnvironment();
    const token = openResearchToken({
      workspaceId,
      sealed: connection.accessTokenSealed,
      key: environment.PLATFORM_TOKEN_ENCRYPTION_KEY,
    });
    const data = await fetchMetaResearch({
      platform: account.platform,
      identifier: account.identifier,
      sourceId,
      version: environment.FACEBOOK_GRAPH_API_VERSION,
      token,
    });
    if (
      !(await finishResearchRefresh({
        workspaceId,
        requestId: input.requestId,
        data,
        safeError: null,
      }))
    )
      throw new SocialResearchError(
        "conflict",
        "Research authorization changed during this refresh. The result was not saved; reconnect if needed and try again.",
      );
    return input.requestId;
  } catch (error) {
    if (!(error instanceof SocialResearchError))
      console.error("SOCIAL_RESEARCH_INVALID_PROVIDER_RESULT", {
        workspaceId,
        requestId: input.requestId,
      });
    const safe =
      error instanceof SocialResearchError
        ? error
        : new SocialResearchError(
            "unavailable",
            "Meta returned data that could not be verified. Your previous snapshot is preserved.",
          );
    await finishResearchRefresh({
      workspaceId,
      requestId: input.requestId,
      data: null,
      safeError: safe.message,
    });
    throw safe;
  }
}
