import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  enabled: vi.fn(),
  add: vi.fn(),
  archive: vi.fn(),
  disconnect: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  audit: vi.fn(),
  sources: vi.fn(),
  remove: vi.fn(),
  previews: vi.fn(),
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  getAuthenticatedWorkspaceContext: mocks.context,
}));
vi.mock("@/lib/social/research/environment", () => ({
  isSocialResearchEnabled: mocks.enabled,
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  addResearchAccount: mocks.add,
  archiveResearchAccount: mocks.archive,
  disconnectResearchConnection: mocks.disconnect,
  deleteResearchAccount: mocks.remove,
}));
vi.mock("@/lib/social/research/refresh", () => ({
  refreshResearchAccount: mocks.refresh,
}));
vi.mock("@/lib/social/research/source-refresh", () => ({
  refreshResearchSources: mocks.sources,
}));
vi.mock("@/lib/social/research/previews", () => ({
  loadResearchPreviews: mocks.previews,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.invalidate }));
vi.mock("@/lib/audit/record-audit-event", () => ({
  recordAuditEvent: mocks.audit,
}));
import {
  addResearchAccountAction,
  archiveResearchAccountAction,
  disconnectResearchAction,
  refreshResearchAccountAction,
  refreshResearchSourcesAction,
  deleteResearchAccountAction,
  loadResearchPreviewsAction,
} from "@/app/(authenticated)/app/social/research/actions";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
function auth(role: "owner" | "editor" | "viewer") {
  return { user: { id: "owner" }, activeMembership: { workspaceId, role } };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.context.mockResolvedValue(auth("owner"));
  mocks.add.mockResolvedValue({ id: accountId });
  mocks.archive.mockResolvedValue(true);
  mocks.refresh.mockResolvedValue(accountId);
  mocks.remove.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("research server-action authorization", () => {
  it.each(["owner", "editor"] as const)(
    "allows %s deletion only in the authenticated workspace, with an anonymous audit event",
    async (role) => {
      mocks.context.mockResolvedValue(auth(role));
      expect(
        await deleteResearchAccountAction({
          accountId,
          version: 1,
          workspaceId: "forged",
        }),
      ).toEqual({ ok: true });
      expect(mocks.remove).toHaveBeenCalledWith({
        workspaceId,
        accountId,
        version: 1,
      });
      expect(mocks.audit).toHaveBeenCalledWith({
        workspaceId,
        actorUserId: "owner",
        action: "platform_disconnected",
        targetType: "social_research_account",
        metadata: { operation: "permanent_delete" },
      });
      expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(accountId);
      expect(mocks.invalidate).toHaveBeenCalledWith("/app/social/research");
    },
  );
  it("blocks viewer, missing-session and disabled deletion", async () => {
    for (const ctx of [auth("viewer"), null]) {
      mocks.context.mockResolvedValue(ctx);
      expect(
        (await deleteResearchAccountAction({ accountId, version: 1 })).ok,
      ).toBe(false);
    }
    mocks.context.mockResolvedValue(auth("owner"));
    mocks.enabled.mockReturnValue(false);
    expect(
      (await deleteResearchAccountAction({ accountId, version: 1 })).ok,
    ).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects invalid or stale deletion requests without claiming success", async () => {
    for (const input of [
      { accountId: "bad", version: 1 },
      { accountId, version: 0 },
      { accountId, version: "1" },
    ])
      expect((await deleteResearchAccountAction(input)).ok).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValue(false);
    expect(
      await deleteResearchAccountAction({ accountId, version: 1 }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("changed or has already been removed"),
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("allows only current owners to refresh source discovery", async () => {
    mocks.sources.mockResolvedValueOnce(1);
    expect(await refreshResearchSourcesAction()).toEqual({
      ok: true,
      sourceCount: 1,
    });
    expect(mocks.sources).toHaveBeenCalledWith(workspaceId);
    mocks.sources.mockClear();
    for (const role of ["editor", "viewer"] as const) {
      mocks.context.mockResolvedValue(auth(role));
      expect((await refreshResearchSourcesAction()).ok).toBe(false);
    }
    expect(mocks.sources).not.toHaveBeenCalled();
  });
  it.each(["owner", "editor"] as const)(
    "allows %s research using the authenticated workspace",
    async (role) => {
      mocks.context.mockResolvedValue(auth(role));
      expect(
        (
          await addResearchAccountAction({
            platform: "instagram",
            identifier: "@Business",
            name: "Example",
            workspaceId: "forged",
          })
        ).ok,
      ).toBe(true);
      expect(mocks.add).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          identifier: "business",
          createdByUserId: "owner",
        }),
      );
      expect(
        (
          await refreshResearchAccountAction({
            accountId,
            requestId: accountId,
          })
        ).ok,
      ).toBe(true);
      expect(mocks.refresh).toHaveBeenCalledWith(workspaceId, {
        accountId,
        requestId: accountId,
      });
    },
  );
  it("does not let viewers or missing sessions mutate research", async () => {
    for (const context of [auth("viewer"), null]) {
      mocks.context.mockResolvedValue(context);
      expect(
        (
          await addResearchAccountAction({
            platform: "facebook",
            identifier: "123",
            name: "Page",
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await refreshResearchAccountAction({
            accountId,
            requestId: accountId,
          })
        ).ok,
      ).toBe(false);
      expect(
        (await archiveResearchAccountAction({ accountId, version: 1 })).ok,
      ).toBe(false);
    }
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("reserves research-credential disconnection for owners", async () => {
    mocks.context.mockResolvedValue(auth("editor"));
    expect((await disconnectResearchAction()).ok).toBe(false);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    mocks.context.mockResolvedValue(auth("owner"));
    expect((await disconnectResearchAction()).ok).toBe(true);
    expect(mocks.disconnect).toHaveBeenCalledWith(workspaceId);
  });
  it("disables every write when research is off", async () => {
    mocks.enabled.mockReturnValue(false);
    expect(
      (await refreshResearchAccountAction({ accountId, requestId: accountId }))
        .ok,
    ).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("rejects invalid input without a database mutation", async () => {
    expect(
      (
        await addResearchAccountAction({
          platform: "facebook",
          identifier: "profile",
          name: "Page",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await archiveResearchAccountAction({
          accountId: "tampered",
          version: 1,
        })
      ).ok,
    ).toBe(false);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});

describe("transient research preview authorization", () => {
  it.each(["owner", "editor"] as const)(
    "allows %s reads in authenticated workspace only",
    async (role) => {
      mocks.context.mockResolvedValue(auth(role));
      mocks.previews.mockResolvedValue({ posts: [] });
      expect(
        await loadResearchPreviewsAction({
          snapshotId: accountId,
          workspaceId: "forged",
        }),
      ).toEqual({ ok: true, data: { posts: [] } });
      expect(mocks.previews).toHaveBeenCalledWith(workspaceId, {
        snapshotId: accountId,
      });
      expect(mocks.invalidate).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );
  it("denies viewers, disabled deployments, unsigned users and invalid input", async () => {
    mocks.context.mockResolvedValue(auth("viewer"));
    expect(
      (await loadResearchPreviewsAction({ snapshotId: accountId })).ok,
    ).toBe(false);
    mocks.context.mockResolvedValue(null);
    expect(
      (await loadResearchPreviewsAction({ snapshotId: accountId })).ok,
    ).toBe(false);
    mocks.enabled.mockReturnValue(false);
    expect(
      (await loadResearchPreviewsAction({ snapshotId: accountId })).ok,
    ).toBe(false);
    expect(
      (await loadResearchPreviewsAction({ snapshotId: "invalid" })).ok,
    ).toBe(false);
    expect(mocks.previews).not.toHaveBeenCalled();
  });
  it("does not leak raw provider errors or media URLs", async () => {
    mocks.previews.mockRejectedValue(
      new Error("secret=https://cdninstagram.com/signed"),
    );
    const result = await loadResearchPreviewsAction({ snapshotId: accountId });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
