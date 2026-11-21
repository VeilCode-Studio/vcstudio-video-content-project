import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PinterestSocialPostProvider } from "./pinterest-social-post-provider";
import type { PublishPostRequest } from "@/lib/publishing/social-post-provider";
const fetcher = vi.fn<typeof fetch>();
const provider = new PinterestSocialPostProvider();
function request(): PublishPostRequest {
  return {
    tokens: { accessToken: "test-access" },
    account: { externalAccountId: "42" },
    text: "Shared copy",
    pinterestSettings: {
      boardId: "123",
      boardName: "Board",
      title: "Pin",
      description: null,
      link: "https://example.test/",
      videoCoverAssetId: null,
    },
    media: [
      {
        kind: "image",
        sourceUrl: "https://private.test/image",
        contentType: "image/png",
        sizeBytes: 3,
        fileName: "image.png",
        altText: "Original image",
      },
    ],
    providerOperationId: null,
    providerOperationSecret: null,
    onProviderOperationCreated: vi.fn(),
  };
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
describe("Pinterest Pin publishing", () => {
  it("creates an image Pin with exact board, copy, link and original media", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ id: "987" }));
    const input = request();
    expect(await provider.publishPost(input)).toMatchObject({
      externalPostId: "987",
      externalPostUrl: "https://www.pinterest.com/pin/987/",
      completionStage: "published",
    });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      board_id: "123",
      title: "Pin",
      description: "Shared copy",
      link: "https://example.test/",
      media_source: {
        source_type: "image_url",
        url: "https://private.test/image",
      },
    });
    expect(input.onProviderOperationCreated).toHaveBeenNthCalledWith(
      1,
      "pinterest:creating:pin",
    );
    expect(input.onProviderOperationCreated).toHaveBeenLastCalledWith(
      "pinterest:pin:987",
    );
  });
  it("reuses a completed checkpoint without another Pin", async () => {
    const input = request();
    input.providerOperationId = "pinterest:pin:987";
    expect(await provider.publishPost(input)).toMatchObject({
      externalPostId: "987",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses automatic replay of an ambiguous create", async () => {
    const input = request();
    input.providerOperationId = "pinterest:creating:pin";
    await expect(provider.publishPost(input)).rejects.toMatchObject({
      failure: { mayHavePublished: true, retriable: false },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["image/webp", "image/gif"])(
    "rejects unsupported %s before contacting Pinterest",
    async (contentType) => {
      const input = request();
      input.media[0].contentType = contentType;
      await expect(provider.publishPost(input)).rejects.toThrow(/JPEG or PNG/);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects text-only and multi-media Pins", async () => {
    for (const media of [[], [...request().media, ...request().media]])
      await expect(
        provider.publishPost({ ...request(), media }),
      ).rejects.toThrow("exactly one");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never retries a timed-out Pin creation automatically", async () => {
    fetcher.mockRejectedValueOnce(new Error("private raw error"));
    await expect(provider.publishPost(request())).rejects.toMatchObject({
      failure: {
        category: "transport_ambiguous",
        mayHavePublished: true,
        retriable: false,
      },
    });
  });
  it("publishes an inspected video using registered upload and explicit cover", async () => {
    const input = request();
    input.media = [
      {
        ...input.media[0],
        kind: "video",
        contentType: "video/mp4",
        fileName: "video.mp4",
      },
    ];
    input.pinterestCoverUrl = "https://private.test/cover";
    fetcher
      .mockResolvedValueOnce(
        Response.json({
          media_id: "555",
          upload_url:
            "https://pinterest-media-upload.s3-accelerate.amazonaws.com/",
          upload_parameters: { key: "video", policy: "private" },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
      .mockImplementationOnce(async (_url, init) => {
        const bytes = await new Response(init?.body).text();
        expect(bytes).toContain('name="file"');
        expect(init?.headers).not.toHaveProperty("Authorization");
        return new Response(null, { status: 204 });
      })
      .mockResolvedValueOnce(Response.json({ status: "succeeded" }))
      .mockResolvedValueOnce(Response.json({ id: "987" }));
    expect(await provider.publishPost(input)).toMatchObject({
      externalPostId: "987",
    });
    expect(
      JSON.parse(String(fetcher.mock.calls[4][1]?.body)).media_source,
    ).toEqual({
      source_type: "video_id",
      media_id: "555",
      cover_image_url: "https://private.test/cover",
    });
  });
  it("resumes processing without uploading or creating duplicate videos", async () => {
    const input = request();
    input.media[0] = {
      ...input.media[0],
      kind: "video",
      contentType: "video/mp4",
    };
    input.pinterestCoverUrl = "https://private.test/cover";
    input.providerOperationId = "pinterest:media:555";
    fetcher
      .mockResolvedValueOnce(Response.json({ status: "succeeded" }))
      .mockResolvedValueOnce(Response.json({ id: "987" }));
    await provider.publishPost(input);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects untrusted upload hosts before reading source bytes", async () => {
    const input = request();
    input.media[0] = {
      ...input.media[0],
      kind: "video",
      contentType: "video/mp4",
    };
    input.pinterestCoverUrl = "https://private.test/cover";
    fetcher.mockResolvedValueOnce(
      Response.json({
        media_id: "555",
        upload_url: "https://attacker.test/",
        upload_parameters: {},
      }),
    );
    await expect(provider.publishPost(input)).rejects.toThrow(
      "unsupported upload destination",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves a retryable checkpoint after a definitive rate-limit rejection", async () => {
    const input = request();
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    await expect(provider.publishPost(input)).rejects.toMatchObject({
      failure: { mayHavePublished: false, retriable: true },
    });
    expect(input.onProviderOperationCreated).toHaveBeenLastCalledWith(
      "pinterest:retry:image",
    );
  });
  it("retains the uncertain-outcome guard after a server-side create error", async () => {
    const input = request();
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 500 }));
    await expect(provider.publishPost(input)).rejects.toMatchObject({
      failure: { mayHavePublished: true, retriable: false },
    });
    expect(input.onProviderOperationCreated).toHaveBeenLastCalledWith(
      "pinterest:creating:pin",
    );
  });
});
