import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  context: vi.fn(),
  enabled: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  assign: vi.fn(),
  audit: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  getAuthenticatedWorkspaceContext: m.context,
}));
vi.mock("./environment", () => ({ isSocialResearchEnabled: m.enabled }));
vi.mock("@/db/repositories/research-categories.repository", () => ({
  createResearchCategory: m.create,
  renameResearchCategory: m.rename,
  deleteResearchCategory: m.remove,
  assignResearchCategory: m.assign,
}));
vi.mock("@/lib/audit/record-audit-event", () => ({
  recordAuditEvent: m.audit,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
import {
  createResearchCategoryAction,
  renameResearchCategoryAction,
  deleteResearchCategoryAction,
  assignResearchCategoryAction,
} from "@/app/(authenticated)/app/social/research/category-actions";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const accountId = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  vi.clearAllMocks();
  m.enabled.mockReturnValue(true);
  m.context.mockResolvedValue({
    user: { id: "owner" },
    activeMembership: { workspaceId, role: "owner" },
  });
  for (const fn of [m.create, m.rename, m.remove, m.assign])
    fn.mockResolvedValue({ id: categoryId });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("research category action security", () => {
  it.each(["owner", "editor"])(
    "allows %s to organize only the authenticated workspace",
    async (role) => {
      m.context.mockResolvedValue({
        user: { id: "member" },
        activeMembership: { workspaceId, role },
      });
      expect(
        (
          await createResearchCategoryAction({
            name: " Finance ",
            workspaceId: "forged",
          })
        ).ok,
      ).toBe(true);
      expect(m.create).toHaveBeenCalledWith({ workspaceId, name: "Finance" });
      expect(
        (
          await assignResearchCategoryAction({
            accountId,
            categoryId,
            version: 3,
            workspaceId: "forged",
          })
        ).ok,
      ).toBe(true);
      expect(m.assign).toHaveBeenCalledWith({
        workspaceId,
        accountId,
        categoryId,
        version: 3,
      });
    },
  );
  it("blocks all writes for viewers, missing sessions and disabled deployments", async () => {
    for (const context of [
      null,
      {
        user: { id: "viewer" },
        activeMembership: { workspaceId, role: "viewer" },
      },
    ]) {
      m.context.mockResolvedValue(context);
      for (const action of [
        createResearchCategoryAction,
        renameResearchCategoryAction,
        deleteResearchCategoryAction,
        assignResearchCategoryAction,
      ])
        expect(
          (await action({ name: "Finance", accountId, categoryId, version: 1 }))
            .ok,
        ).toBe(false);
    }
    m.enabled.mockReturnValue(false);
    expect((await createResearchCategoryAction({ name: "Finance" })).ok).toBe(
      false,
    );
    for (const fn of [m.create, m.rename, m.remove, m.assign])
      expect(fn).not.toHaveBeenCalled();
  });
  it("rejects malformed and stale changes without hiding errors", async () => {
    expect((await createResearchCategoryAction({ name: " " })).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
    m.rename.mockResolvedValue(null);
    expect(
      (
        await renameResearchCategoryAction({
          name: "Finance",
          categoryId,
          version: 1,
        })
      ).ok,
    ).toBe(false);
  });
  it("audits removal while preserving research and returns safe failures", async () => {
    expect(
      (await deleteResearchCategoryAction({ categoryId, version: 2 })).ok,
    ).toBe(true);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        targetId: categoryId,
        metadata: { operation: "category_removed_accounts_preserved" },
      }),
    );
    m.assign.mockRejectedValue(new Error("SECRET_INTERNAL_FAILURE"));
    const result = await assignResearchCategoryAction({
      accountId,
      categoryId,
      version: 1,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET_INTERNAL_FAILURE");
  });
});
