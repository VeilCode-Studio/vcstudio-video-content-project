import "server-only";
import { researchPreviewInputSchema } from "@studio/contracts/social-research-previews";
import { researchSnapshotSchema } from "@studio/contracts/social-research";
import {
  findResearchOperation,
  findResearchAccount,
  getResearchConnection,
} from "@/db/repositories/social-research.repository";
import { getPublishingEnvironment } from "@/lib/env/server";
import { enforceRateLimit } from "@/lib/rate-limit/enforce-rate-limit";
import { openResearchToken } from "./secrets";
import { isSocialResearchEnabled } from "./environment";
import { SocialResearchError } from "./errors";
import { fetchMetaResearchPreviews } from "./meta-previews";

/** Caller must authorize membership/capability. All identifiers come from tenant-scoped records. */
export async function loadResearchPreviews(workspaceId: string, raw: unknown) {
  const { snapshotId } = researchPreviewInputSchema.parse(raw);
  if (!isSocialResearchEnabled())
    throw new SocialResearchError(
      "configuration",
      "Social research is disabled.",
    );
  const operation = await findResearchOperation(workspaceId, snapshotId);
  if (!operation || operation.status !== "succeeded")
    throw new SocialResearchError(
      "access",
      "This saved observation is unavailable in your workspace.",
    );
  const account = await findResearchAccount(workspaceId, operation.accountId);
  const snapshot = researchSnapshotSchema.parse(operation.data);
  if (!account || account.platform !== snapshot.platform)
    throw new SocialResearchError(
      "access",
      "This research account is unavailable.",
    );
  const connection = await getResearchConnection(workspaceId);
  if (
    !connection?.accessTokenSealed ||
    connection.revokedAt ||
    !connection.expiresAt ||
    connection.expiresAt.getTime() <= Date.now()
  )
    throw new SocialResearchError(
      "expired",
      "Ask the workspace owner to reconnect Meta research, then reload previews.",
    );
  if (
    !connection.scopes.includes("pages_read_engagement") ||
    (account.platform === "instagram" &&
      (!connection.scopes.includes("instagram_basic") ||
        !connection.scopes.includes("instagram_manage_insights") ||
        !connection.sources.some((source) => source.id === operation.sourceId)))
  )
    throw new SocialResearchError(
      "access",
      "The saved research source is no longer authorized. Refresh research with an authorized source.",
    );
  await enforceRateLimit({ workspaceId, operation: "social_research" });
  const environment = getPublishingEnvironment();
  const data = await fetchMetaResearchPreviews({
    version: environment.FACEBOOK_GRAPH_API_VERSION,
    token: openResearchToken({
      workspaceId,
      sealed: connection.accessTokenSealed,
      key: environment.PLATFORM_TOKEN_ENCRYPTION_KEY,
    }),
    sourceId: operation.sourceId,
    identifier: account.identifier,
    snapshot,
  });
  // Disconnection/deletion during the provider read must not return fresh credentials/media.
  const [current, currentAccount] = await Promise.all([
    getResearchConnection(workspaceId),
    findResearchAccount(workspaceId, operation.accountId),
  ]);
  if (
    !currentAccount ||
    !current?.accessTokenSealed ||
    current.revokedAt ||
    !current.expiresAt ||
    current.revision !== connection.revision ||
    current.expiresAt.getTime() <= Date.now()
  )
    throw new SocialResearchError(
      "conflict",
      "Research access changed while previews loaded. Refresh the page and try again.",
    );
  return data;
}
