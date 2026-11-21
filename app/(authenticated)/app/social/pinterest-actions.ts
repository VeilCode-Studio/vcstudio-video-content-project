"use server";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import {
  listAuthorizedPinterestBoards,
  PinterestSettingsError,
} from "@/lib/publishing/pinterest-boards";
import { PublishProviderError } from "@/lib/publishing/video-publish-provider";
export async function getPinterestBoardsAction(raw: unknown) {
  const context = await getAuthenticatedWorkspaceContext();
  if (!context)
    return { ok: false as const, error: "Sign in to view Pinterest boards." };
  try {
    return {
      ok: true as const,
      page: await listAuthorizedPinterestBoards(
        {
          workspaceId: context.activeMembership.workspaceId,
          role: context.activeMembership.role,
        },
        raw,
      ),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof PinterestSettingsError
          ? error.message
          : error instanceof PublishProviderError
            ? error.failure.safeMessage
            : "Pinterest boards could not be loaded. Check the connection and try again.",
    };
  }
}
