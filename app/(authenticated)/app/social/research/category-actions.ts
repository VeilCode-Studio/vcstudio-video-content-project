"use server";

import { revalidatePath } from "next/cache";
import {
  createResearchCategorySchema,
  editResearchCategorySchema,
  deleteResearchCategorySchema,
  assignResearchCategorySchema,
  type ResearchCategoryActionResult,
} from "@studio/contracts/research-categories";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { requireCapability } from "@/lib/policies/workspace-policy";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import {
  createResearchCategory,
  renameResearchCategory,
  deleteResearchCategory,
  assignResearchCategory,
} from "@/db/repositories/research-categories.repository";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { SocialResearchError } from "@/lib/social/research/errors";

async function mutate(
  input: unknown,
  operation: "create" | "rename" | "delete" | "assign",
): Promise<ResearchCategoryActionResult> {
  try {
    if (!isSocialResearchEnabled())
      return { ok: false, error: "Social research is disabled." };
    const context = await getAuthenticatedWorkspaceContext();
    if (!context)
      return { ok: false, error: "Sign in and select your workspace first." };
    requireCapability(context.activeMembership.role, "researchSocialAccounts");
    const workspaceId = context.activeMembership.workspaceId;
    let row: { id: string } | null;
    switch (operation) {
      case "create":
        row = await createResearchCategory({
          ...createResearchCategorySchema.parse(input),
          workspaceId,
        });
        break;
      case "rename":
        row = await renameResearchCategory({
          ...editResearchCategorySchema.parse(input),
          workspaceId,
        });
        break;
      case "delete":
        row = await deleteResearchCategory({
          ...deleteResearchCategorySchema.parse(input),
          workspaceId,
        });
        break;
      case "assign":
        row = await assignResearchCategory({
          ...assignResearchCategorySchema.parse(input),
          workspaceId,
        });
        break;
    }
    if (!row)
      return {
        ok: false,
        error:
          operation === "create"
            ? "That name already exists, or this workspace has reached its 50-category limit."
            : "The account or category changed. Refresh and try again.",
      };
    if (operation === "delete")
      await recordAuditEvent({
        workspaceId,
        actorUserId: context.user.id,
        action: "platform_disconnected",
        targetType: "social_research_category",
        targetId: row.id,
        metadata: { operation: "category_removed_accounts_preserved" },
      });
    revalidatePath("/app/social/research");
    return { ok: true, id: row.id };
  } catch (error) {
    if (error instanceof SocialResearchError)
      return { ok: false, error: error.message };
    console.error("RESEARCH_CATEGORY_ACTION_FAILED", { operation });
    return {
      ok: false,
      error:
        "The category could not be saved. Check the name and your permissions, refresh, and try again.",
    };
  }
}

export async function createResearchCategoryAction(input: unknown) {
  return mutate(input, "create");
}
export async function renameResearchCategoryAction(input: unknown) {
  return mutate(input, "rename");
}
export async function deleteResearchCategoryAction(input: unknown) {
  return mutate(input, "delete");
}
export async function assignResearchCategoryAction(input: unknown) {
  return mutate(input, "assign");
}
