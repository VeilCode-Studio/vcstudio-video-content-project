"use server";

import { z } from "zod";
import { loadResearchSelection } from "@/lib/social/research/selection";
import type { ResearchSelectionResult } from "@studio/contracts/social-research";
import { revalidatePath } from "next/cache";
import {
  researchAccountInputSchema,
  deleteResearchAccountInputSchema,
} from "@studio/contracts/social-research";
import {
  addResearchAccount,
  archiveResearchAccount,
  disconnectResearchConnection,
  deleteResearchAccount,
} from "@/db/repositories/social-research.repository";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { requireCapability } from "@/lib/policies/workspace-policy";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import { refreshResearchAccount } from "@/lib/social/research/refresh";
import { SocialResearchError } from "@/lib/social/research/errors";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { refreshResearchSources } from "@/lib/social/research/source-refresh";
import { loadResearchPreviews } from "@/lib/social/research/previews";
import {
  researchPreviewInputSchema,
  type ResearchPreviewResult,
} from "@studio/contracts/social-research-previews";

export async function loadResearchPreviewsAction(
  input: unknown,
): Promise<ResearchPreviewResult> {
  const parsed = researchPreviewInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Choose a valid saved observation first." };
  try {
    const auth = await context();
    return {
      ok: true,
      data: await loadResearchPreviews(
        auth.activeMembership.workspaceId,
        parsed.data,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof SocialResearchError
          ? error.message
          : "Previews could not load. Your saved research is unchanged; try again or open the original post.",
    };
  }
}

export async function loadResearchSelectionAction(
  input: unknown,
): Promise<ResearchSelectionResult> {
  try {
    if (!isSocialResearchEnabled())
      throw new SocialResearchError(
        "configuration",
        "Social research is disabled.",
      );
    const auth = await getAuthenticatedWorkspaceContext();
    if (!auth)
      throw new SocialResearchError(
        "access",
        "Sign in and select your workspace first.",
      );
    return {
      ok: true,
      data: await loadResearchSelection(
        auth.activeMembership.workspaceId,
        input,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof SocialResearchError
          ? error.message
          : "Account observations could not load. Select the account again to retry; your watchlist is unchanged.",
    };
  }
}

export type ResearchActionResult =
  | { ok: true; id?: string; sourceCount?: number }
  | { ok: false; error: string };
async function context(ownerOnly = false) {
  if (!isSocialResearchEnabled())
    throw new SocialResearchError(
      "configuration",
      "Social research is disabled for this deployment.",
    );
  const result = await getAuthenticatedWorkspaceContext();
  if (!result)
    throw new SocialResearchError(
      "access",
      "Sign in and select your workspace first.",
    );
  requireCapability(
    result.activeMembership.role,
    ownerOnly ? "manageSettings" : "researchSocialAccounts",
  );
  return result;
}
function failure(error: unknown): ResearchActionResult {
  if (error instanceof SocialResearchError)
    return { ok: false, error: error.message };
  console.error("SOCIAL_RESEARCH_ACTION_FAILED");
  return {
    ok: false,
    error:
      "This action could not finish. Check your workspace permissions and try again.",
  };
}
export async function addResearchAccountAction(
  input: unknown,
): Promise<ResearchActionResult> {
  const parsed = researchAccountInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the account details.",
    };
  try {
    const auth = await context();
    const row = await addResearchAccount({
      ...parsed.data,
      workspaceId: auth.activeMembership.workspaceId,
      createdByUserId: auth.user.id,
    });
    if (!row)
      return {
        ok: false,
        error: "This account is already saved in this workspace.",
      };
    revalidatePath("/app/social/research");
    return { ok: true, id: row.id };
  } catch (error) {
    return failure(error);
  }
}
export async function refreshResearchAccountAction(
  input: unknown,
): Promise<ResearchActionResult> {
  try {
    const auth = await context();
    const id = await refreshResearchAccount(
      auth.activeMembership.workspaceId,
      input,
    );
    revalidatePath("/app/social/research");
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}
export async function archiveResearchAccountAction(
  input: unknown,
): Promise<ResearchActionResult> {
  const parsed = z
    .object({ accountId: z.uuid(), version: z.number().int().positive() })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That account selection is invalid." };
  try {
    const auth = await context();
    if (
      !(await archiveResearchAccount({
        ...parsed.data,
        workspaceId: auth.activeMembership.workspaceId,
      }))
    )
      return {
        ok: false,
        error:
          "The account changed or is refreshing. Refresh this page and try again.",
      };
    revalidatePath("/app/social/research");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
export async function disconnectResearchAction(): Promise<ResearchActionResult> {
  try {
    const auth = await context(true);
    await disconnectResearchConnection(auth.activeMembership.workspaceId);
    await recordAuditEvent({
      workspaceId: auth.activeMembership.workspaceId,
      actorUserId: auth.user.id,
      action: "platform_disconnected",
      targetType: "social_research_connection",
      metadata: { purpose: "research" },
    });
    revalidatePath("/app/social/research");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteResearchAccountAction(
  input: unknown,
): Promise<ResearchActionResult> {
  const parsed = deleteResearchAccountInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That research account selection is invalid." };
  try {
    const auth = await context();
    if (
      !(await deleteResearchAccount({
        workspaceId: auth.activeMembership.workspaceId,
        ...parsed.data,
      }))
    )
      return {
        ok: false,
        error:
          "This research account changed or has already been removed. Refresh the page and review it before deleting.",
      };
    // Keep an anonymous security event, without the deleted account's ID/name/content.
    await recordAuditEvent({
      workspaceId: auth.activeMembership.workspaceId,
      actorUserId: auth.user.id,
      action: "platform_disconnected",
      targetType: "social_research_account",
      metadata: { operation: "permanent_delete" },
    });
    revalidatePath("/app/social/research");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
export async function refreshResearchSourcesAction(): Promise<ResearchActionResult> {
  try {
    const auth = await context(true);
    const sourceCount = await refreshResearchSources(
      auth.activeMembership.workspaceId,
    );
    await recordAuditEvent({
      workspaceId: auth.activeMembership.workspaceId,
      actorUserId: auth.user.id,
      action: "platform_connected",
      targetType: "social_research_connection",
      metadata: {
        purpose: "research",
        event: "sources_refreshed",
        sourceCount,
      },
    });
    revalidatePath("/app/social/research");
    return { ok: true, sourceCount };
  } catch (error) {
    return failure(error);
  }
}
