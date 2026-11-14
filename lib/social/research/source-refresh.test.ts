import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  replace: vi.fn(),
  discover: vi.fn(),
  limit: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  getResearchConnection: mocks.grant,
  replaceResearchSources: mocks.replace,
}));
vi.mock("./source-discovery", () => ({
  discoverResearchSources: mocks.discover,
}));
vi.mock("./environment", () => ({ isSocialResearchEnabled: mocks.enabled }));
vi.mock("./secrets", () => ({ openResearchToken: () => "private-token" }));
vi.mock("@/lib/rate-limit/enforce-rate-limit", () => ({
  enforceRateLimit: mocks.limit,
}));
vi.mock("@/lib/env/server", () => ({
  getPublishingEnvironment: () => ({
    PLATFORM_TOKEN_ENCRYPTION_KEY: "private-key",
    FACEBOOK_GRAPH_API_VERSION: "v25.0",
  }),
  getPublishingWebEnvironment: () => ({
    FACEBOOK_APP_ID: "app",
    FACEBOOK_APP_SECRET: "private-secret",
  }),
}));
import { refreshResearchSources } from "./source-refresh";
const grant = {
  accessTokenSealed: "ciphertext",
  revokedAt: null,
  expiresAt: new Date("2030-01-01"),
  revision: 3,
  scopes: ["instagram_basic", "pages_show_list"],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.grant.mockResolvedValue({ ...grant });
  mocks.replace.mockResolvedValue(true);
  mocks.discover.mockResolvedValue([{ id: "42", username: "source" }]);
});
describe("research source refresh", () => {
  it("reuses current consent and conditionally replaces only its verified sources", async () => {
    expect(await refreshResearchSources("workspace")).toBe(1);
    expect(mocks.grant).toHaveBeenCalledWith("workspace");
    expect(mocks.limit).toHaveBeenCalledWith({
      workspaceId: "workspace",
      operation: "social_research",
    });
    expect(mocks.replace).toHaveBeenCalledWith({
      workspaceId: "workspace",
      revision: 3,
      sources: [{ id: "42", username: "source" }],
    });
  });
  it("does not overwrite changed or revoked consent", async () => {
    mocks.replace.mockResolvedValue(false);
    await expect(refreshResearchSources("workspace")).rejects.toMatchObject({
      code: "conflict",
    });
  });
  it.each([
    null,
    { ...grant, revokedAt: new Date() },
    { ...grant, expiresAt: new Date(0) },
    { ...grant, scopes: [] },
  ])(
    "blocks missing, expired, revoked or insufficient consent",
    async (value) => {
      mocks.grant.mockResolvedValue(value);
      await expect(refreshResearchSources("workspace")).rejects.toThrow();
      expect(mocks.discover).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    },
  );
  it("preserves saved data when discovery fails", async () => {
    mocks.discover.mockRejectedValueOnce(new Error("provider failed"));
    await expect(refreshResearchSources("workspace")).rejects.toThrow();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
