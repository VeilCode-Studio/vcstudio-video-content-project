import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  samples: vi.fn(),
  media: vi.fn(),
  account: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@/db/repositories/research-keywords.repository", () => ({
  listResearchKeywordSamples: m.samples,
  listResearchKeywordMedia: m.media,
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  findResearchAccount: m.account,
}));
vi.mock("./environment", () => ({ isSocialResearchEnabled: m.enabled }));
import { loadResearchKeywords } from "./keyword-service";
beforeEach(() => {
  vi.clearAllMocks();
  m.samples.mockResolvedValue([]);
  m.media.mockResolvedValue([]);
  m.enabled.mockReturnValue(true);
  m.account.mockResolvedValue(null);
});
describe("keyword service boundaries", () => {
  it("passes workspace and validated filters to bounded repositories; skips media by default", async () => {
    await loadResearchKeywords("workspace", {});
    expect(m.samples).toHaveBeenCalledWith(
      "workspace",
      expect.objectContaining({ accountId: "all", media: "captions" }),
    );
    expect(m.media).not.toHaveBeenCalled();
  });
  it("blocks disabled deployments before querying research", async () => {
    m.enabled.mockReturnValue(false);
    await expect(loadResearchKeywords("workspace", {})).rejects.toThrow(
      "disabled",
    );
    expect(m.samples).not.toHaveBeenCalled();
  });
  it("rejects foreign, deleted or archived account identifiers", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await expect(
      loadResearchKeywords("workspace", { accountId: id }),
    ).rejects.toThrow("unavailable");
    expect(m.account).toHaveBeenCalledWith("workspace", id);
    expect(m.samples).not.toHaveBeenCalled();
  });
  it("validates identifiers and pagination before reading", async () => {
    for (const input of [
      { accountId: "fake" },
      { page: 0 },
      { query: "x".repeat(101) },
    ])
      await expect(loadResearchKeywords("workspace", input)).rejects.toThrow();
    expect(m.samples).not.toHaveBeenCalled();
  });
  it("fails closed on malformed stored observations", async () => {
    m.samples.mockResolvedValue([{ sample: { accountId: "fake" } }]);
    await expect(loadResearchKeywords("workspace", {})).rejects.toThrow();
  });
  it("uses only explicitly requested saved media projections in the same workspace", async () => {
    await loadResearchKeywords("workspace", { media: "captions_and_media" });
    expect(m.media).toHaveBeenCalledWith("workspace", []);
  });
});
