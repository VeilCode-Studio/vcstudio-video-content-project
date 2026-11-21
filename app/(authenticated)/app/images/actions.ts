"use server";
import { ZodError, z } from "zod";
import { studioImageCursorSchema } from "@studio/contracts/image-studio";
import {
  quoteStudioImage,
  startStudioImage,
  imageStudioHistory,
  dispatchStudioImage,
} from "@/lib/image-studio/service";
import { LibraryImageError } from "@/db/commands/library-image-jobs";
import { McpError } from "@/lib/mcp/errors";
import {
  AuthenticationRequiredError,
  WorkspaceAccessDeniedError,
  WorkspacePermissionDeniedError,
} from "@/lib/domain/errors";
async function result<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof LibraryImageError || error instanceof McpError)
      return { ok: false, error: error.message };
    if (
      error instanceof AuthenticationRequiredError ||
      error instanceof WorkspaceAccessDeniedError ||
      error instanceof WorkspacePermissionDeniedError
    )
      return { ok: false, error: error.message };
    if (error instanceof ZodError)
      return {
        ok: false,
        error: error.issues[0]?.message ?? "Check the image settings.",
      };
    console.error("IMAGE_STUDIO_ACTION_FAILED", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return {
      ok: false,
      error:
        "This image request could not complete. Check workspace access and provider availability.",
    };
  }
}
export async function quoteImageAction(workspaceId: unknown, raw: unknown) {
  return result(() => quoteStudioImage(workspaceId, raw));
}
export async function startImageAction(workspaceId: unknown, raw: unknown) {
  return result(() => startStudioImage(workspaceId, raw));
}
export async function retryImageQueueAction(workspaceId: unknown, id: unknown) {
  return result(() => dispatchStudioImage(workspaceId, id));
}
export async function imageHistoryAction(
  workspaceId: unknown,
  before?: unknown,
  trackedIds?: unknown,
) {
  return result(() =>
    imageStudioHistory(
      workspaceId,
      before ? studioImageCursorSchema.parse(before) : undefined,
      trackedIds ? z.array(z.uuid()).max(4).parse(trackedIds) : [],
    ),
  );
}
