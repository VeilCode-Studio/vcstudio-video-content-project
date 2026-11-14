import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  connection: vi.fn(),
  operation: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
  provider: vi.fn(),
  enabled: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  findResearchAccount: mocks.account,
  getResearchConnection: mocks.connection,
  findResearchOperation: mocks.operation,
  claimResearchRefresh: mocks.claim,
  finishResearchRefresh: mocks.finish,
}));
vi.mock("./meta-provider", () => ({ fetchMetaResearch: mocks.provider }));
vi.mock("./environment", () => ({ isSocialResearchEnabled: mocks.enabled }));
vi.mock("./secrets", () => ({ openResearchToken: () => "test-token" }));
vi.mock("@/lib/env/server", () => ({
  getPublishingEnvironment: () => ({
    FACEBOOK_GRAPH_API_VERSION: "v25.0",
    PLATFORM_TOKEN_ENCRYPTION_KEY: "test-key",
  }),
}));
vi.mock("@/lib/rate-limit/enforce-rate-limit", () => ({
  enforceRateLimit: mocks.limit,
}));
import { refreshResearchAccount } from "./refresh";
import { SocialResearchError } from "./errors";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const input = {
  accountId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  sourceId: "42",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.account.mockResolvedValue({
    platform: "instagram",
    identifier: "business",
  });
  mocks.operation.mockResolvedValue(null);
  mocks.connection.mockResolvedValue({
    accessTokenSealed: "sealed",
    revokedAt: null,
    expiresAt: new Date("2030-01-01"),
    revision: 2,
    sources: [{ id: "42" }],
    scopes: ["instagram_basic", "instagram_manage_insights"],
  });
  mocks.claim.mockResolvedValue(true);
  mocks.finish.mockResolvedValue(true);
  mocks.provider.mockResolvedValue({ platform: "instagram", posts: [] });
});
describe("authorized research refresh orchestration", () => {
  it("disabled research makes no database or provider calls", async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "configuration" });
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("uses the authorized workspace for every boundary", async () => {
    expect(await refreshResearchAccount(workspaceId, input)).toBe(
      input.requestId,
    );
    expect(mocks.account).toHaveBeenCalledWith(workspaceId, input.accountId);
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, connectionRevision: 2 }),
    );
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, requestId: input.requestId }),
    );
  });
  it("cannot refresh an account outside this workspace", async () => {
    mocks.account.mockResolvedValue(null);
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "access" });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {
      accessTokenSealed: "sealed",
      revokedAt: new Date(),
      expiresAt: new Date("2030-01-01"),
    },
    {
      accessTokenSealed: "sealed",
      revokedAt: null,
      expiresAt: new Date("2020-01-01"),
    },
  ])("requires an active unexpired research grant", async (connection) => {
    mocks.connection.mockResolvedValue(connection);
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "expired" });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("rejects source-account tampering before any provider request", async () => {
    await expect(
      refreshResearchAccount(workspaceId, { ...input, sourceId: "999" }),
    ).rejects.toMatchObject({ code: "access" });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("returns a completed identical request without contacting Meta again", async () => {
    mocks.operation.mockResolvedValue({
      accountId: input.accountId,
      sourceId: "42",
      status: "succeeded",
      id: input.requestId,
    });
    expect(await refreshResearchAccount(workspaceId, input)).toBe(
      input.requestId,
    );
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("rejects changed idempotency inputs and running operations", async () => {
    mocks.operation.mockResolvedValue({
      accountId: "different",
      sourceId: "42",
      status: "succeeded",
    });
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "conflict" });
    mocks.operation.mockResolvedValue({
      accountId: input.accountId,
      sourceId: "42",
      status: "running",
    });
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("does not request Meta if the database lease is not claimed", async () => {
    mocks.claim.mockResolvedValue(false);
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "rate_limit" });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("persists an actionable safe failure while preserving the previous snapshot", async () => {
    mocks.provider.mockRejectedValue(
      new SocialResearchError("access", "App Review access needed"),
    );
    await expect(refreshResearchAccount(workspaceId, input)).rejects.toThrow(
      "App Review access needed",
    );
    expect(mocks.finish).toHaveBeenCalledWith({
      workspaceId,
      requestId: input.requestId,
      data: null,
      safeError: "App Review access needed",
    });
  });
  it("does not report success after a grant is revoked during the request", async () => {
    mocks.finish.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(
      refreshResearchAccount(workspaceId, input),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(mocks.finish).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: null }),
    );
  });
});
