import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchMetaResearchPreviews } from "./meta-previews";
import { researchMediaUrl } from "./media-url";
import { researchSnapshotSchema } from "@studio/contracts/social-research";
const request = vi.fn<typeof fetch>();
const snapshot = researchSnapshotSchema.parse({
  platform: "instagram",
  externalAccountId: "789",
  name: "business",
  profileUrl: "https://instagram.com/business/",
  biography: "Bio",
  followers: 100,
  totalPosts: 30,
  hasMore: true,
  warnings: [],
  posts: [
    {
      id: "1",
      url: "https://instagram.com/p/1/",
      publishedAt: null,
      text: "Carousel",
      format: "carousel",
      likes: 1,
      comments: 1,
      shares: null,
    },
    {
      id: "2",
      url: "https://instagram.com/p/2/",
      publishedAt: null,
      text: "Reel",
      format: "reel",
      likes: null,
      comments: 1,
      shares: null,
    },
  ],
});
const input = {
  version: "v25.0",
  token: "private-test-token",
  sourceId: "42",
  identifier: "business",
  snapshot,
};
function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());
describe("transient Meta previews", () => {
  it("falls back once without thumbnail fields on Graph code 100", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 }),
    );
    request.mockResolvedValueOnce(
      json({
        business_discovery: {
          id: "789",
          media: {
            data: [
              {
                id: "2",
                media_type: "VIDEO",
                media_url: "https://video.xx.fbcdn.net/clip.mp4",
              },
            ],
          },
        },
      }),
    );
    expect(
      (await fetchMetaResearchPreviews(input)).posts[0]?.items[0]?.url,
    ).toContain("clip.mp4");
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      new URL(String(request.mock.calls[1]![0])).searchParams.get("fields"),
    ).not.toContain("thumbnail_url");
  });
  it.each([190, 4, 200])("does not retry Meta code %s", async (code) => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code } }), { status: 400 }),
    );
    await expect(fetchMetaResearchPreviews(input)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("returns image/video carousel children, profile photo, and only saved post IDs", async () => {
    request.mockResolvedValueOnce(
      json({
        business_discovery: {
          id: "789",
          profile_picture_url:
            "https://scontent.cdninstagram.com/profile.jpg?sig=ok",
          media: {
            data: [
              {
                id: "1",
                media_type: "CAROUSEL_ALBUM",
                children: {
                  data: [
                    {
                      id: "c1",
                      media_type: "IMAGE",
                      media_url: "https://scontent.cdninstagram.com/one.jpg",
                    },
                    {
                      id: "c2",
                      media_type: "VIDEO",
                      media_url: "https://video.xx.fbcdn.net/two.mp4",
                      thumbnail_url: "https://scontent.xx.fbcdn.net/two.jpg",
                    },
                  ],
                  paging: { next: "https://not-followed.invalid" },
                },
              },
              { id: "2", media_type: "VIDEO" },
              {
                id: "new-post",
                media_type: "IMAGE",
                media_url: "https://scontent.xx.fbcdn.net/new.jpg",
              },
            ],
          },
        },
      }),
    );
    const data = await fetchMetaResearchPreviews(input);
    expect(data.profileImageUrl).toContain("profile.jpg");
    expect(data.posts).toHaveLength(2);
    expect(data.posts[0]).toMatchObject({
      postId: "1",
      hasMore: true,
      items: [{ kind: "image" }, { kind: "video" }],
    });
    expect(data.posts[1]?.items).toEqual([
      { kind: "video", url: null, posterUrl: null },
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).not.toContain(input.token);
    expect(options?.headers).toEqual({
      Authorization: `Bearer ${input.token}`,
    });
    expect(options?.cache).toBe("no-store");
    expect(new URL(String(url)).searchParams.get("fields")).toContain(
      "children.limit(20)",
    );
    expect(
      researchSnapshotSchema.parse({
        ...snapshot,
        profileImageUrl: data.profileImageUrl,
        fetchedAt: data.fetchedAt,
      }),
    ).not.toHaveProperty("profileImageUrl");
  });
  it("supports Facebook album images and video cover without inventing playable video", async () => {
    request.mockResolvedValueOnce(
      json({
        id: "789",
        picture: { data: { url: "https://scontent.xx.fbcdn.net/profile.jpg" } },
        posts: {
          data: [
            {
              id: "1",
              attachments: {
                data: [
                  {
                    type: "album",
                    subattachments: {
                      data: [
                        {
                          media_type: "photo",
                          media: {
                            image: {
                              src: "https://scontent.xx.fbcdn.net/one.jpg",
                            },
                          },
                        },
                        {
                          media_type: "video",
                          media: {
                            image: {
                              src: "https://scontent.xx.fbcdn.net/cover.jpg",
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              id: "2",
              full_picture: "https://scontent.xx.fbcdn.net/fallback.jpg",
            },
          ],
        },
      }),
    );
    const data = await fetchMetaResearchPreviews({
      ...input,
      identifier: "789",
      sourceId: null,
      snapshot: { ...snapshot, platform: "facebook" },
    });
    expect(data.posts[0]?.items[1]).toEqual({
      kind: "video",
      url: null,
      posterUrl: "https://scontent.xx.fbcdn.net/cover.jpg",
    });
    expect(data.posts[1]?.items[0]?.kind).toBe("image");
  });
  it("rejects a different provider identity and injected query identifiers", async () => {
    request.mockResolvedValueOnce(json({ business_discovery: { id: "999" } }));
    await expect(fetchMetaResearchPreviews(input)).rejects.toMatchObject({
      code: "conflict",
    });
    request.mockClear();
    await expect(
      fetchMetaResearchPreviews({ ...input, identifier: "a){id}" }),
    ).rejects.toMatchObject({ code: "access" });
    expect(request).not.toHaveBeenCalled();
  });
  it("bounds carousel response size", async () => {
    request.mockResolvedValueOnce(
      json({
        business_discovery: {
          id: "789",
          media: {
            data: [
              {
                id: "1",
                children: {
                  data: Array.from({ length: 21 }, (_, i) => ({
                    id: String(i),
                  })),
                },
              },
            ],
          },
        },
      }),
    );
    await expect(fetchMetaResearchPreviews(input)).rejects.toThrow();
  });
});
describe("Meta preview URL allowlist", () => {
  it.each([
    "http://scontent.fbcdn.net/a",
    "https://fbcdn.net.evil.invalid/a",
    "https://evil.invalid/a",
    "https://127.0.0.1/a",
    "https://user:password@fbcdn.net/a",
    "https://fbcdn.net:8443/a",
    "data:image/png;base64,a",
    "https://fbcdn.net/a?access_token=secret",
    "https://fbcdn.net/a?client_secret=secret",
    null,
  ])("rejects unsafe or credential-bearing URL %s", (url) =>
    expect(researchMediaUrl(url)).toBeNull(),
  );
  it("keeps CDN signatures without allowing arbitrary hosts", () => {
    expect(
      researchMediaUrl(
        "https://scontent.xx.fbcdn.net/image.jpg?oh=signature#fragment",
      ),
    ).toBe("https://scontent.xx.fbcdn.net/image.jpg?oh=signature");
  });
});
