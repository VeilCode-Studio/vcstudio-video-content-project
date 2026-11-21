import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  connection: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
  environment: {
    PLATFORM_TOKEN_ENCRYPTION_KEY: "test",
    ENABLE_PINTEREST: true,
    PINTEREST_API_ID: "123",
    PINTEREST_API_SECRET: "test",
  },
  configured: true,
}));
vi.mock("@/db/repositories/publishing.repository", () => ({
  findPlatformConnectionWithTokens: mock.connection,
}));
vi.mock("@/db/commands/platform-connection-commands", () => ({
  updatePlatformConnectionTokens: mock.update,
}));
vi.mock("@/lib/env/server", () => ({
  getPublishingEnvironment: () => mock.environment,
}));
vi.mock("@/lib/crypto/secret-box", () => ({
  openSecret: ({ sealed }: { sealed: string }) => `opened-${sealed}`,
}));
vi.mock("./social-post-registry", () => ({
  isSocialPostPlatformConfigured: () => mock.configured,
  createConnectionOAuthProvider: () => ({ refreshTokens: mock.refresh }),
}));
vi.mock("./providers/pinterest-client", () => ({
  pinterestRequest: mock.request,
}));
import {
  listAuthorizedPinterestBoards,
  readPinterestBoard,
} from "./pinterest-boards";
const connectionId = "11111111-1111-4111-8111-111111111111",
  workspaceId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  mock.configured = true;
  mock.connection.mockResolvedValue({
    id: connectionId,
    platform: "pinterest",
    status: "active",
    accessTokenSealed: "access",
    refreshTokenSealed: "refresh",
    accessTokenExpiresAt: new Date(Date.now() + 3600000),
  });
  mock.request.mockResolvedValue({
    items: [{ id: "42", name: "Business", privacy: "PUBLIC" }],
    bookmark: "next",
  });
});
describe("authorized Pinterest board reads", () => {
  it("scopes credentials to the selected connection and server-resolved workspace", async () => {
    expect(
      await listAuthorizedPinterestBoards(
        { workspaceId, role: "editor" },
        { connectionId },
      ),
    ).toMatchObject({ items: [{ id: "42" }], bookmark: "next" });
    expect(mock.connection).toHaveBeenCalledWith({ connectionId, workspaceId });
    expect(mock.request).toHaveBeenCalledWith(
      "opened-access",
      "/boards?page_size=50&privacy=PUBLIC",
    );
  });
  it("denies a viewer before reading credentials", async () => {
    await expect(
      listAuthorizedPinterestBoards(
        { workspaceId, role: "viewer" },
        { connectionId },
      ),
    ).rejects.toThrow();
    expect(mock.connection).not.toHaveBeenCalled();
  });
  it("blocks pending app access without touching credentials or APIs", async () => {
    mock.configured = false;
    await expect(
      listAuthorizedPinterestBoards(
        { workspaceId, role: "owner" },
        { connectionId },
      ),
    ).rejects.toThrow("pending");
    expect(mock.connection).not.toHaveBeenCalled();
    expect(mock.request).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { platform: "youtube", status: "active" },
    { platform: "pinterest", status: "revoked" },
  ])(
    "rejects foreign, wrong-platform or revoked connections",
    async (connection) => {
      mock.connection.mockResolvedValue(connection);
      await expect(
        listAuthorizedPinterestBoards(
          { workspaceId, role: "owner" },
          { connectionId },
        ),
      ).rejects.toThrow("active Pinterest");
      expect(mock.request).not.toHaveBeenCalled();
    },
  );
  it("refreshes expiring tokens server-side and preserves rotated credentials", async () => {
    mock.connection.mockResolvedValue({
      id: connectionId,
      platform: "pinterest",
      status: "active",
      accessTokenSealed: "access",
      refreshTokenSealed: "refresh",
      accessTokenExpiresAt: new Date(0),
    });
    mock.refresh.mockResolvedValue({
      accessToken: "new",
      refreshToken: "rotated",
      scopes: [],
      expiresAt: new Date(),
    });
    await listAuthorizedPinterestBoards(
      { workspaceId, role: "owner" },
      { connectionId },
    );
    expect(mock.update).toHaveBeenCalledWith({
      connectionId,
      workspaceId,
      tokens: expect.objectContaining({ refreshToken: "rotated" }),
    });
    expect(mock.request).toHaveBeenCalledWith("new", expect.any(String));
  });
  it("encodes bounded pagination instead of interpolating cursor input", async () => {
    await listAuthorizedPinterestBoards(
      { workspaceId, role: "owner" },
      { connectionId, bookmark: "next&scope=all" },
    );
    expect(mock.request).toHaveBeenCalledWith(
      "opened-access",
      expect.stringContaining("bookmark=next%26scope%3Dall"),
    );
  });
  it.each(["SECRET", "PROTECTED"])(
    "rejects a %s board before preparing publication",
    async (privacy) => {
      mock.request.mockResolvedValue({ id: "42", name: "Private", privacy });
      await expect(
        readPinterestBoard(workspaceId, connectionId, "42"),
      ).rejects.toThrow("public Pinterest");
    },
  );
  it("rejects malformed board identifiers before API access", async () => {
    await expect(
      readPinterestBoard(workspaceId, connectionId, "../other"),
    ).rejects.toThrow();
    expect(mock.connection).not.toHaveBeenCalled();
  });
});
