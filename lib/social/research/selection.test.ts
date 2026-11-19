import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ account: vi.fn(), snapshots: vi.fn() }));
vi.mock("@/db/repositories/social-research.repository", () => ({
  findResearchAccount: m.account,
  listResearchSnapshots: m.snapshots,
}));
vi.mock("./view", () => ({
  researchAccountView: (row: unknown) => row,
  researchSnapshotView: (row: unknown) => row,
}));
import { loadResearchSelection } from "./selection";
const accountId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  m.account.mockResolvedValue({ id: accountId });
  m.snapshots.mockResolvedValue(
    Array.from({ length: 11 }, (_, i) => ({ id: String(i) })),
  );
});
it("reads only selected account observations, scoped and bounded", async () => {
  const result = await loadResearchSelection("workspace", {
    accountId,
    historyPage: 2,
  });
  expect(m.account).toHaveBeenCalledWith("workspace", accountId);
  expect(m.snapshots).toHaveBeenCalledWith("workspace", accountId, 20);
  expect(result.snapshots).toHaveLength(10);
  expect(result.hasMoreSnapshots).toBe(true);
});
it("rejects invalid pagination without reading", async () => {
  await expect(
    loadResearchSelection("workspace", { accountId, historyPage: -1 }),
  ).rejects.toThrow();
  expect(m.account).not.toHaveBeenCalled();
});
it("rejects foreign/deleted accounts before reading observations", async () => {
  m.account.mockResolvedValue(null);
  await expect(
    loadResearchSelection("workspace", { accountId }),
  ).rejects.toThrow("no longer available");
  expect(m.snapshots).not.toHaveBeenCalled();
});
