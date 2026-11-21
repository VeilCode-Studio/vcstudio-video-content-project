import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  context: vi.fn(),
  download: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  getAuthenticatedWorkspaceContext: m.context,
}));
vi.mock("@/lib/media/media-download", () => ({ mediaDownloadUrl: m.download }));
import { GET } from "@/app/api/media/[assetId]/download/route";
const id = "11111111-1111-4111-8111-111111111111";
const call = (assetId = id) =>
  GET(new Request("https://app.test/api/media/" + assetId + "/download"), {
    params: Promise.resolve({ assetId }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(m.capture);
  m.context.mockResolvedValue({
    activeMembership: { workspaceId: "authorized-workspace" },
  });
  m.download.mockResolvedValue("https://private.example/signed");
});
afterEach(() => vi.restoreAllMocks());
it("resolves workspace membership before issuing a private download", async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.download).toHaveBeenCalledWith("authorized-workspace", {
    assetId: id,
    source: "library",
  });
});
it("denies callers without a workspace", async () => {
  m.context.mockResolvedValue(null);
  expect((await call()).status).toBe(403);
  expect(m.download).not.toHaveBeenCalled();
});
it("denies unauthenticated callers", async () => {
  m.context.mockRejectedValue(new Error("Unauthorized"));
  expect((await call()).status).toBe(403);
  expect(m.download).not.toHaveBeenCalled();
});
it("rejects tampered identifiers before storage access", async () => {
  expect((await call("invalid")).status).toBe(400);
  expect(m.download).not.toHaveBeenCalled();
});
it("returns actionable errors without provider details", async () => {
  m.download.mockRejectedValue(new Error("secret internal detail"));
  const response = await call();
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("secret");
  expect(m.capture).toHaveBeenCalled();
});
it("does not issue a URL for unavailable media", async () => {
  m.download.mockResolvedValue(null);
  expect((await call()).status).toBe(404);
});
