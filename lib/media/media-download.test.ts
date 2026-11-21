import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ find: vi.fn(), media: vi.fn(), sign: vi.fn() }));
vi.mock("@/db/repositories/media-assets.repository", () => ({
  findMediaAsset: m.find,
}));
vi.mock("@/db/repositories/social-posts.repository", () => ({
  listSocialPostMedia: m.media,
}));
vi.mock("@/lib/storage/media-asset-storage", () => ({
  createMediaAssetDownloadUrl: m.sign,
}));
import { mediaDownloadUrl } from "./media-download";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  m.find.mockResolvedValue({
    status: "ready",
    kind: "image",
    inspectionStatus: null,
    deletedAt: null,
    objectKey: "private/original",
    originalFileName: "Original.png",
  });
  m.sign.mockResolvedValue("https://private.example/signed");
});
describe("workspace media downloads", () => {
  it("authorizes library lookup in the workspace and signs the original attachment", async () => {
    expect(
      await mediaDownloadUrl("workspace", { assetId: id, source: "library" }),
    ).toBe("https://private.example/signed");
    expect(m.find).toHaveBeenCalledWith({
      workspaceId: "workspace",
      mediaAssetId: id,
    });
    expect(m.sign).toHaveBeenCalledWith(
      "private/original",
      300,
      "Original.png",
    );
  });
  it.each([
    null,
    { status: "ready", kind: "image", deletedAt: new Date() },
    { status: "failed", kind: "video" },
    { status: "ready", kind: "video", inspectionStatus: "running" },
  ])("rejects inaccessible, deleted or unverified files", async (asset) => {
    m.find.mockResolvedValue(asset);
    expect(
      await mediaDownloadUrl("workspace", { assetId: id, source: "library" }),
    ).toBeNull();
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("requires a post for rendered media", async () => {
    expect(
      await mediaDownloadUrl("workspace", { assetId: id, source: "render" }),
    ).toBeNull();
    expect(m.media).not.toHaveBeenCalled();
  });
  it("authorizes the exact rendered attachment in the same workspace and post", async () => {
    m.media.mockResolvedValue([
      {
        source: "render",
        sourceId: id,
        unavailable: false,
        objectKey: "private/render",
        originalFileName: "render.mp4",
      },
    ]);
    expect(
      await mediaDownloadUrl("workspace", {
        assetId: id,
        source: "render",
        postId: id,
      }),
    ).toBeTruthy();
    expect(m.media).toHaveBeenCalledWith({
      workspaceId: "workspace",
      postId: id,
    });
    expect(m.sign).toHaveBeenCalledWith("private/render", 300, "render.mp4");
  });
  it.each([
    [],
    [{ source: "render", sourceId: "other", objectKey: "private" }],
    [
      {
        source: "render",
        sourceId: id,
        unavailable: true,
        objectKey: "private",
      },
    ],
  ])("rejects missing or removed render attachments", async (...items) => {
    m.media.mockResolvedValue(items);
    expect(
      await mediaDownloadUrl("workspace", {
        assetId: id,
        source: "render",
        postId: id,
      }),
    ).toBeNull();
    expect(m.sign).not.toHaveBeenCalled();
  });
});
