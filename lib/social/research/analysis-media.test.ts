import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/mcp/safe-download", () => ({ withPublicDownload: m.download }));
import { collectResearchMedia } from "./analysis-media";
const preview = {
  postId: "one",
  items: [
    {
      kind: "image" as const,
      url: "https://scontent.xx.fbcdn.net/photo.jpg",
      posterUrl: null,
    },
  ],
  hasMore: false,
};
beforeEach(() => vi.clearAllMocks());
function response(bytes: Buffer, type = "image/png") {
  return {
    body: (async function* () {
      yield bytes;
    })(),
    contentType: type,
    contentLength: bytes.length,
  };
}
describe("temporary actual-content media validation", () => {
  it("decodes and fits the full image without persistent storage or passing source URLs to the model", async () => {
    const bytes = await sharp({
      create: { width: 400, height: 800, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    m.download.mockImplementation(async (url, consume, validate) => {
      validate(new URL(url));
      return consume(response(bytes));
    });
    const result = await collectResearchMedia(preview, "unused-ffprobe");
    expect(result.coverage.items).toBe(1);
    expect(result.coverage.audioStreams).toBe(0);
    const image = await sharp(
      Buffer.from(result.parts[0]!.inlineData.data, "base64"),
    ).metadata();
    expect(image.width).toBe(400);
    expect(image.height).toBe(800);
    expect(result.parts[0]!.inlineData.mimeType).toBe("image/jpeg");
    expect(JSON.stringify(result)).not.toContain("fbcdn.net");
  });
  it("rejects covers without a real video URL and incomplete carousels before download", async () => {
    await expect(
      collectResearchMedia(
        {
          ...preview,
          items: [
            { kind: "video", url: null, posterUrl: preview.items[0]!.url },
          ],
        },
        "unused",
      ),
    ).rejects.toMatchObject({ code: "media_unavailable" });
    await expect(
      collectResearchMedia({ ...preview, hasMore: true }, "unused"),
    ).rejects.toMatchObject({ code: "media_unavailable" });
    expect(m.download).not.toHaveBeenCalled();
  });
  it("rejects oversized, disguised and SVG files without provider submission", async () => {
    m.download.mockImplementation(async (_url, consume) =>
      consume({
        ...response(Buffer.from("small")),
        contentLength: 13 * 1024 * 1024,
      }),
    );
    await expect(collectResearchMedia(preview, "unused")).rejects.toMatchObject(
      { code: "media_too_large" },
    );
    m.download.mockImplementation(async (_url, consume) =>
      consume(response(Buffer.from("<html>not an image</html>"))),
    );
    await expect(collectResearchMedia(preview, "unused")).rejects.toThrow();
    m.download.mockImplementation(async (_url, consume) =>
      consume(response(Buffer.from("<svg/>"), "image/svg+xml")),
    );
    await expect(collectResearchMedia(preview, "unused")).rejects.toMatchObject(
      { code: "invalid_media" },
    );
  });
  it("requires every redirect to stay on the Meta CDN allowlist", async () => {
    m.download.mockImplementation(async (_url, _consume, validate) =>
      validate(new URL("https://outside.invalid/file")),
    );
    await expect(collectResearchMedia(preview, "unused")).rejects.toMatchObject(
      { code: "invalid_source" },
    );
  });
  it("rejects a video MIME label with non-video bytes before ffprobe", async () => {
    m.download.mockImplementation(async (_url, consume) =>
      consume(response(Buffer.from("<html>invalid video</html>"), "video/mp4")),
    );
    await expect(
      collectResearchMedia(
        {
          ...preview,
          items: [
            { kind: "video", url: preview.items[0]!.url, posterUrl: null },
          ],
        },
        "unused",
      ),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });
});
