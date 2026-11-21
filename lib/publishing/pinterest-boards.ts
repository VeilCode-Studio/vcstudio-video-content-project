import "server-only";
import { z } from "zod";
import {
  pinterestBoardSchema,
  pinterestBoardQuerySchema,
  type PinterestBoardPage,
} from "@studio/contracts/publishing";
import { findPlatformConnectionWithTokens } from "@/db/repositories/publishing.repository";
import { updatePlatformConnectionTokens } from "@/db/commands/platform-connection-commands";
import { getPublishingEnvironment } from "@/lib/env/server";
import { openSecret } from "@/lib/crypto/secret-box";
import {
  createConnectionOAuthProvider,
  isSocialPostPlatformConfigured,
} from "./social-post-registry";
import { pinterestRequest } from "./providers/pinterest-client";
import { requireCapability } from "@/lib/policies/workspace-policy";
import type { WorkspaceRole } from "@/db/schema";
export class PinterestSettingsError extends Error {}
export async function pinterestAccountToken(
  workspaceId: string,
  connectionId: string,
) {
  if (!isSocialPostPlatformConfigured("pinterest"))
    throw new PinterestSettingsError(
      "Pinterest is unavailable while app approval or credentials are pending.",
    );
  const connection = await findPlatformConnectionWithTokens({
    workspaceId,
    connectionId,
  });
  if (
    !connection ||
    connection.platform !== "pinterest" ||
    connection.status !== "active" ||
    !connection.accessTokenSealed
  )
    throw new PinterestSettingsError(
      "Select an active Pinterest connection in this workspace.",
    );
  const key = getPublishingEnvironment().PLATFORM_TOKEN_ENCRYPTION_KEY;
  if (
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() <= Date.now() + 60_000
  ) {
    if (!connection.refreshTokenSealed)
      throw new PinterestSettingsError("Reconnect this Pinterest account.");
    const tokens = await createConnectionOAuthProvider(
      connection,
    ).refreshTokens({
      refreshToken: openSecret({ sealed: connection.refreshTokenSealed, key }),
    });
    await updatePlatformConnectionTokens({ workspaceId, connectionId, tokens });
    return tokens.accessToken;
  }
  return openSecret({ sealed: connection.accessTokenSealed, key });
}
export async function listAuthorizedPinterestBoards(
  context: { workspaceId: string; role: WorkspaceRole },
  raw: unknown,
): Promise<PinterestBoardPage> {
  requireCapability(context.role, "composePosts");
  const input = pinterestBoardQuerySchema.parse(raw);
  const token = await pinterestAccountToken(
    context.workspaceId,
    input.connectionId,
  );
  const query = new URLSearchParams({ page_size: "50", privacy: "PUBLIC" });
  if (input.bookmark) query.set("bookmark", input.bookmark);
  const result = z
    .object({
      items: z.array(pinterestBoardSchema).max(50),
      bookmark: z.string().max(2048).nullish(),
    })
    .safeParse(await pinterestRequest(token, `/boards?${query}`));
  if (!result.success)
    throw new PinterestSettingsError(
      "Pinterest returned an invalid board list. Try again.",
    );
  return { items: result.data.items, bookmark: result.data.bookmark ?? null };
}
export async function readPinterestBoard(
  workspaceId: string,
  connectionId: string,
  boardId: string,
) {
  const id = pinterestBoardSchema.shape.id.parse(boardId);
  const token = await pinterestAccountToken(workspaceId, connectionId);
  const board = pinterestBoardSchema.safeParse(
    await pinterestRequest(token, `/boards/${id}`),
  );
  if (!board.success || board.data.id !== id || board.data.privacy !== "PUBLIC")
    throw new PinterestSettingsError(
      "Choose an accessible public Pinterest board. Secret and protected boards are not supported.",
    );
  return board.data;
}
