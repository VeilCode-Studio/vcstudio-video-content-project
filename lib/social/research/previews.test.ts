import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  account: vi.fn(),
  connection: vi.fn(),
  enabled: vi.fn(),
  limit: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  findResearchOperation: mocks.operation,
  findResearchAccount: mocks.account,
  getResearchConnection: mocks.connection,
}));
vi.mock("./environment", () => ({ isSocialResearchEnabled: mocks.enabled }));
vi.mock("./meta-previews", () => ({
  fetchMetaResearchPreviews: mocks.provider,
}));
vi.mock("./secrets", () => ({ openResearchToken: () => "private-token" }));
vi.mock("@/lib/env/server", () => ({
  getPublishingEnvironment: () => ({
    FACEBOOK_GRAPH_API_VERSION: "v25.0",
    PLATFORM_TOKEN_ENCRYPTION_KEY: "key",
  }),
}));
vi.mock("@/lib/rate-limit/enforce-rate-limit", () => ({
  enforceRateLimit: mocks.limit,
}));
import { loadResearchPreviews } from "./previews";
const workspace = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
const snapshot = {
  platform: "instagram",
  externalAccountId: "789",
  name: "business",
  profileUrl: "https://instagram.com/business/",
  biography: null,
  followers: null,
  totalPosts: null,
  posts: [],
  hasMore: false,
  warnings: [],
};
const grant = {
  accessTokenSealed: "sealed",
  revokedAt: null,
  expiresAt: new Date("2035-01-01"),
  revision: 2,
  sources: [{ id: "42" }],
  scopes: [
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_insights",
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.operation.mockResolvedValue({
    accountId: "account",
    sourceId: "42",
    status: "succeeded",
    data: snapshot,
  });
  mocks.account.mockResolvedValue({
    platform: "instagram",
    identifier: "business",
  });
  mocks.connection.mockResolvedValue(grant);
  mocks.provider.mockResolvedValue({
    profileImageUrl: null,
    posts: [],
    fetchedAt: new Date().toISOString(),
  });
});
describe("authorized ephemeral previews", () => {
  it("uses tenant-scoped saved identities and does not create an observation", async () => {
    await loadResearchPreviews(workspace, {
      snapshotId,
      identifier: "attacker",
      sourceId: "bad",
    });
    expect(mocks.operation).toHaveBeenCalledWith(workspace, snapshotId);
    expect(mocks.account).toHaveBeenCalledWith(workspace, "account");
    expect(mocks.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "42",
        identifier: "business",
        snapshot,
        token: "private-token",
      }),
    );
    expect(mocks.limit).toHaveBeenCalledWith({
      workspaceId: workspace,
      operation: "social_research",
    });
  });
  it("disabled deployments do not query or fetch", async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      loadResearchPreviews(workspace, { snapshotId }),
    ).rejects.toMatchObject({ code: "configuration" });
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects forged or non-successful observations", async () => {
    for (const operation of [
      null,
      { status: "failed" },
      { status: "running" },
    ]) {
      mocks.operation.mockResolvedValue(operation);
      await expect(
        loadResearchPreviews(workspace, { snapshotId }),
      ).rejects.toMatchObject({ code: "access" });
    }
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...grant, revokedAt: new Date() },
    { ...grant, expiresAt: null },
    { ...grant, expiresAt: new Date("2020-01-01") },
    { ...grant, sources: [] },
    { ...grant, scopes: [] },
  ])(
    "rejects missing/revoked/expired/unauthorized grants",
    async (connection) => {
      mocks.connection.mockResolvedValue(connection);
      await expect(
        loadResearchPreviews(workspace, { snapshotId }),
      ).rejects.toBeInstanceOf(Error);
      expect(mocks.provider).not.toHaveBeenCalled();
    },
  );
  it("drops a late response after revocation, replacement or deletion", async () => {
    for (const change of [
      { ...grant, revokedAt: new Date() },
      { ...grant, revision: 3 },
      null,
    ]) {
      mocks.connection
        .mockResolvedValueOnce(grant)
        .mockResolvedValueOnce(change);
      await expect(
        loadResearchPreviews(workspace, { snapshotId }),
      ).rejects.toMatchObject({ code: "conflict" });
    }
    mocks.connection.mockResolvedValue(grant);
    mocks.account
      .mockResolvedValueOnce({ platform: "instagram", identifier: "business" })
      .mockResolvedValueOnce(null);
    await expect(
      loadResearchPreviews(workspace, { snapshotId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("a request-limit failure prevents Meta access", async () => {
    mocks.limit.mockRejectedValueOnce(new Error("LIMIT"));
    await expect(
      loadResearchPreviews(workspace, { snapshotId }),
    ).rejects.toThrow("LIMIT");
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});
