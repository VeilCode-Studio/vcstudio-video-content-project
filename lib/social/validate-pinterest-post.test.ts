import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getPublishingEnvironment: () => ({ PINTEREST_ACCESS_TIER: "trial" }),
}));
const mock = vi.hoisted(() => ({ assets: vi.fn(), board: vi.fn() }));
vi.mock("@/db/repositories/media-assets.repository", () => ({
  findReadyMediaAssets: mock.assets,
}));
vi.mock("@/lib/publishing/pinterest-boards", () => ({
  PinterestSettingsError: class extends Error {},
  readPinterestBoard: mock.board,
}));
import { validatePinterestPost } from "./validate-pinterest-post";
import { pinterestPinSettingsSchema } from "@studio/contracts/publishing";
const coverId = "11111111-1111-4111-8111-111111111111";
const input = () => ({
  workspaceId: "workspace",
  connectionId: "connection",
  settings: pinterestPinSettingsSchema.parse({
    boardId: "42",
    boardName: "Untrusted label",
  }),
  text: "Exact copy",
  hasVideo: false,
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.board.mockResolvedValue({
    id: "42",
    name: "Verified board",
    privacy: "PUBLIC",
  });
  mock.assets.mockResolvedValue([
    { id: coverId, kind: "image", contentType: "image/png", sizeBytes: 100 },
  ]);
});
describe("Pinterest immutable publication settings", () => {
  it("resolves the authorized board name and exact platform description", async () => {
    const result = await validatePinterestPost(input());
    expect(result.settings).toMatchObject({
      boardName: "Verified board",
      description: "Exact copy",
    });
    expect(mock.board).toHaveBeenCalledWith("workspace", "connection", "42");
  });
  it("refuses a video without an explicit ready cover", async () => {
    await expect(
      validatePinterestPost({ ...input(), hasVideo: true }),
    ).rejects.toThrow("cover");
  });
  it("scopes the cover lookup to the same workspace", async () => {
    const request = input();
    request.settings.videoCoverAssetId = coverId;
    await validatePinterestPost({ ...request, hasVideo: true });
    expect(mock.assets).toHaveBeenCalledWith({
      workspaceId: "workspace",
      mediaAssetIds: [coverId],
    });
  });
  it.each([
    { assets: [] },
    { assets: [{ kind: "video", contentType: "video/mp4", sizeBytes: 100 }] },
    { assets: [{ kind: "image", contentType: "image/webp", sizeBytes: 100 }] },
  ])("rejects unavailable or incompatible covers", async ({ assets }) => {
    mock.assets.mockResolvedValue(assets);
    const request = input();
    request.settings.videoCoverAssetId = coverId;
    await expect(
      validatePinterestPost({ ...request, hasVideo: true }),
    ).rejects.toThrow();
  });
  it("rejects overlength descriptions without shortening the copy", async () => {
    await expect(
      validatePinterestPost({ ...input(), text: "x".repeat(801) }),
    ).rejects.toThrow("800");
    expect(mock.board).not.toHaveBeenCalled();
  });
});

it.each([
  {
    kind: "video",
    contentType: "video/mp4",
    sizeBytes: 100,
    durationMilliseconds: null,
  },
  {
    kind: "video",
    contentType: "video/mp4",
    sizeBytes: 501 * 1024 * 1024,
    durationMilliseconds: 10000,
  },
  {
    kind: "video",
    contentType: "video/webm",
    sizeBytes: 100,
    durationMilliseconds: 10000,
  },
  {
    kind: "video",
    contentType: "video/mp4",
    sizeBytes: 100,
    durationMilliseconds: 1000,
  },
  {
    kind: "video",
    contentType: "video/mp4",
    sizeBytes: 100,
    durationMilliseconds: 901000,
  },
  {
    kind: "image",
    contentType: "image/webp",
    sizeBytes: 100,
    durationMilliseconds: null,
  },
] as const)(
  "rejects incompatible library or rendered media before board access: %j",
  async (item) => {
    await expect(
      validatePinterestPost({
        ...input(),
        media: [
          {
            ...item,
            linkId: "link",
            position: 0,
            source: "render",
            sourceId: "render",
            objectKey: "private/video",
            width: 1920,
            height: 1080,
            title: "Test",
            altText: "",
            originalFileName: "video.mp4",
            createdAt: new Date(),
            unavailable: false,
          },
        ],
      }),
    ).rejects.toThrow("Pinterest requires");
    expect(mock.board).not.toHaveBeenCalled();
  },
);
