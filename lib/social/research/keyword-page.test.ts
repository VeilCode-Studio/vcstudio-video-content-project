import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  enabled: vi.fn(),
  load: vi.fn(),
  list: vi.fn(),
  find: vi.fn(),
}));
vi.mock("./environment", () => ({ isSocialResearchEnabled: m.enabled }));
vi.mock("./keyword-service", () => ({ loadResearchKeywords: m.load }));
vi.mock("@/db/repositories/social-research.repository", () => ({
  listResearchAccounts: m.list,
  findResearchAccount: m.find,
}));
import { loadResearchKeywordPage } from "./keyword-page";
import { SocialResearchError } from "./errors";
import { researchKeywordInputSchema } from "@studio/contracts/social-research";
const filters = researchKeywordInputSchema.parse({});
beforeEach(() => {
  vi.clearAllMocks();
  m.enabled.mockReturnValue(true);
  m.load.mockResolvedValue({ terms: [] });
  m.list.mockResolvedValue([]);
});
describe("keyword page loading", () => {
  it("performs no research query when disabled", async () => {
    m.enabled.mockReturnValue(false);
    expect(await loadResearchKeywordPage("workspace", filters)).toMatchObject({
      report: null,
      error: expect.stringContaining("disabled"),
    });
    expect(m.load).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });
  it("keeps database reads tenant scoped and account options bounded", async () => {
    m.list.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: String(i), name: "Page" })),
    );
    const result = await loadResearchKeywordPage("workspace", filters);
    expect(result.accounts).toHaveLength(20);
    expect(m.list).toHaveBeenCalledWith("workspace");
    expect(m.load).toHaveBeenCalledWith("workspace", filters);
  });
  it("preserves an explicitly selected older account beyond the first options page", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    m.find.mockResolvedValue({ id, name: "Older Page" });
    const result = await loadResearchKeywordPage("workspace", {
      ...filters,
      accountId: id,
    });
    expect(result.accounts).toEqual([{ id, name: "Older Page" }]);
    expect(m.find).toHaveBeenCalledWith("workspace", id);
  });
  it("presents actionable domain errors without raw provider details", async () => {
    m.load.mockRejectedValue(
      new SocialResearchError("access", "That account is unavailable."),
    );
    expect(await loadResearchKeywordPage("workspace", filters)).toMatchObject({
      report: null,
      error: "That account is unavailable.",
    });
  });
  it("redacts unexpected failures and records a safe operational marker", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.load.mockRejectedValue(new Error("private-token"));
    const result = await loadResearchKeywordPage("workspace", filters);
    expect(JSON.stringify(result)).not.toContain("private-token");
    expect(log).toHaveBeenCalledWith("SOCIAL_RESEARCH_KEYWORDS_LOAD_FAILED", {
      workspaceId: "workspace",
    });
    log.mockRestore();
  });
});
