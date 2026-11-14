import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchMetaResearch } from "./meta-provider";
import { metaResearchRequest } from "./meta-client";
import {
  createResearchAuthorizationUrl,
  exchangeResearchConsent,
  RESEARCH_SCOPES,
} from "./oauth";
const fetchMock = vi.fn<typeof fetch>();
const input = {
  version: "v25.0",
  token: "private-test-token",
  platform: "instagram" as const,
  identifier: "business",
  sourceId: "42",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const ig = {
  business_discovery: {
    id: "789",
    username: "business",
    followers_count: 100,
    media_count: 50,
    media: {
      data: [
        {
          id: "1",
          permalink: "https://www.instagram.com/p/one/",
          caption: "Post",
          media_type: "VIDEO",
          media_product_type: "REELS",
          timestamp: "2026-11-10T09:00:00+0000",
          like_count: 0,
        },
      ],
      paging: { next: "https://evil.invalid/private" },
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
describe("bounded official Meta research", () => {
  it("reads Instagram Business Discovery, preserving missing counts and zero", async () => {
    fetchMock.mockResolvedValueOnce(json(ig));
    const result = await fetchMetaResearch(input);
    expect(result.posts[0]).toMatchObject({
      format: "reel",
      likes: 0,
      comments: null,
      shares: null,
      publishedAt: "2026-11-10T09:00:00.000Z",
    });
    expect(result.hasMore).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://graph.facebook.com/v25.0/42?");
    expect(new URL(String(url)).searchParams.get("fields")).toContain(
      "business_discovery.username(business)",
    );
    expect(request?.headers).toEqual({
      Authorization: "Bearer private-test-token",
    });
    expect(String(url)).not.toContain("private-test-token");
    expect(request?.redirect).toBe("error");
  });
  it("reads Facebook counts, attachment formats and missing shares honestly", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        id: "123",
        name: "Page",
        posts: {
          data: [
            {
              id: "123_1",
              message: "Post",
              permalink_url: "https://www.facebook.com/123/posts/1",
              reactions: { summary: { total_count: 5 } },
              comments: { summary: { total_count: 2 } },
              attachments: { data: [{ media_type: "video" }] },
            },
          ],
        },
      }),
    );
    const result = await fetchMetaResearch({
      ...input,
      platform: "facebook",
      identifier: "123",
      sourceId: null,
    });
    expect(result.posts[0]).toMatchObject({
      likes: 5,
      comments: 2,
      shares: null,
      format: "video",
    });
    expect(result.totalPosts).toBeNull();
  });
  it.each([
    [190, "expired"],
    [10, "access"],
    [100, "access"],
    [200, "access"],
    [4, "rate_limit"],
    [613, "rate_limit"],
    [2, "unavailable"],
  ])(
    "maps Meta error %s without exposing provider messages",
    async (code, category) => {
      fetchMock.mockResolvedValueOnce(
        json({ error: { code, message: "secret raw provider detail" } }, 400),
      );
      await expect(fetchMetaResearch(input)).rejects.toMatchObject({
        code: category,
      });
    },
  );
  it("does not interpret missing media as proven inactivity", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ business_discovery: { id: "123", username: "business" } }),
    );
    const result = await fetchMetaResearch(input);
    expect(result.posts).toEqual([]);
    expect(result.warnings.join(" ")).toContain("not evidence");
  });
  it("rejects field injection before requesting Meta", async () => {
    await expect(
      fetchMetaResearch({ ...input, identifier: "user){id}" }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects disguised or non-Meta links in provider data", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        business_discovery: {
          ...ig.business_discovery,
          media: {
            data: [
              {
                ...ig.business_discovery.media.data[0],
                permalink: "https://instagram.com.evil.invalid/post",
              },
            ],
          },
        },
      }),
    );
    await expect(fetchMetaResearch(input)).rejects.toThrow("INVALID_META_LINK");
  });
  it("preserves Facebook query-based post identities while removing tracking", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        id: "123",
        name: "Page",
        posts: {
          data: [
            {
              id: "1",
              permalink_url:
                "https://www.facebook.com/photo.php?fbid=456&id=123&utm_source=tracking",
            },
          ],
        },
      }),
    );
    const result = await fetchMetaResearch({
      ...input,
      platform: "facebook",
      identifier: "123",
      sourceId: null,
    });
    expect(result.posts[0]?.url).toBe(
      "https://www.facebook.com/photo.php?fbid=456&id=123",
    );
  });
  it("bounds response size and never retries transport failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(1500001)));
    await expect(fetchMetaResearch(input)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new Error("token=secret"));
    await expect(
      metaResearchRequest({ version: "v25.0", path: "123" }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
describe("read-only research OAuth", () => {
  it("reuses expiry inspection while recovering the consented source omitted from Page listing", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "short" }))
      .mockResolvedValueOnce(json({ access_token: "long" }))
      .mockResolvedValueOnce(
        json({
          data: {
            app_id: "app",
            is_valid: true,
            expires_at: 0,
            granular_scopes: [{ scope: "instagram_basic", target_ids: ["42"] }],
          },
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: RESEARCH_SCOPES.map((permission) => ({
            permission,
            status: "granted",
          })),
        }),
      )
      .mockResolvedValueOnce(json({ data: [{}] }))
      .mockResolvedValueOnce(json({ id: "42", username: "veilcodestudio" }));
    const result = await exchangeResearchConsent({
      code: "code",
      appId: "app",
      appSecret: "secret",
      version: "v25.0",
      baseUrl: "https://studio.test",
    });
    expect(result.sources).toEqual([{ id: "42", username: "veilcodestudio" }]);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        new URL(String(url)).pathname.endsWith("/debug_token"),
      ),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
  it.each([undefined, null, 0, "0", "3600"])(
    "accepts a verified token when expires_in is %s",
    async (expiresIn) => {
      const expiry = Math.floor(Date.now() / 1000) + 1800;
      fetchMock
        .mockResolvedValueOnce(json({ access_token: "short" }))
        .mockResolvedValueOnce(
          json({
            access_token: "long",
            ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
          }),
        );
      if (!expiresIn || expiresIn === "0")
        fetchMock.mockResolvedValueOnce(
          json({ data: { app_id: "app", is_valid: true, expires_at: expiry } }),
        );
      fetchMock.mockResolvedValueOnce(
        json({
          data: [{ permission: "pages_read_engagement", status: "granted" }],
        }),
      );
      const result = await exchangeResearchConsent({
        code: "code",
        appId: "app",
        appSecret: "secret",
        version: "v25.0",
        baseUrl: "https://studio.test",
      });
      expect(result.token).toBe("long");
      if (!expiresIn || expiresIn === "0") {
        expect(result.expiresAt.getTime()).toBe(expiry * 1000);
        const [url, options] = fetchMock.mock.calls[2]!;
        expect(new URL(String(url)).pathname).toBe("/v25.0/debug_token");
        expect(options?.headers).toEqual({
          Authorization: "Bearer app|secret",
        });
      }
      expect(fetchMock).toHaveBeenCalledTimes(
        expiresIn && expiresIn !== "0" ? 3 : 4,
      );
    },
  );
  it.each([
    "token_exchange",
    "token_extension",
    "permissions",
    "account_discovery",
  ] as const)(
    "identifies %s failures without retaining raw provider data",
    async (stage) => {
      if (stage !== "token_exchange")
        fetchMock.mockResolvedValueOnce(
          json({ access_token: "private-short" }),
        );
      if (stage === "permissions" || stage === "account_discovery")
        fetchMock.mockResolvedValueOnce(
          json({ access_token: "private-long", expires_in: 3600 }),
        );
      if (stage === "account_discovery")
        fetchMock.mockResolvedValueOnce(
          json({
            data: RESEARCH_SCOPES.map((permission) => ({
              permission,
              status: "granted",
            })),
          }),
        );
      fetchMock.mockResolvedValueOnce(
        json(
          {
            error: {
              code: 200,
              message: "secret provider detail private-long",
            },
          },
          403,
        ),
      );
      try {
        await exchangeResearchConsent({
          code: "private-code",
          appId: "app",
          appSecret: "private-secret",
          version: "v25.0",
          baseUrl: "https://studio.test",
        });
        throw new Error("Expected authorization failure");
      } catch (error) {
        expect(error).toMatchObject({
          stage,
          providerCode: 200,
          code: "access",
        });
        expect(JSON.stringify(error)).not.toContain("private-");
      }
    },
  );
  it("identifies token schema fields without keeping received secret values", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "private-short" }))
      .mockResolvedValueOnce(
        json({ access_token: "private-long", expires_in: "invalid" }),
      );
    await expect(
      exchangeResearchConsent({
        code: "code",
        appId: "app",
        appSecret: "secret",
        version: "v25.0",
        baseUrl: "https://studio.test",
      }),
    ).rejects.toMatchObject({
      stage: "token_extension",
      validationFields: ["expires_in"],
    });
  });
  it("requests research scopes without any publishing permissions", () => {
    const url = new URL(
      createResearchAuthorizationUrl({
        appId: "app",
        version: "v25.0",
        baseUrl: "https://studio.test",
        state: "signed",
      }),
    );
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      ...RESEARCH_SCOPES,
    ]);
    expect(url.searchParams.get("scope")).not.toContain("publish");
    expect(url.searchParams.get("scope")).not.toContain("manage_posts");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://studio.test/api/social/research/callback",
    );
  });
  it("saves only actually granted permissions and discovers bounded sources", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "short" }))
      .mockResolvedValueOnce(json({ access_token: "long", expires_in: 3600 }))
      .mockResolvedValueOnce(
        json({
          data: RESEARCH_SCOPES.map((permission) => ({
            permission,
            status: "granted",
          })),
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: [
            { instagram_business_account: { id: "42", username: "studio" } },
          ],
          paging: { cursors: { after: "next" }, next: "https://evil.invalid" },
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: [
            { instagram_business_account: { id: "43", username: "second" } },
            { instagram_business_account: { id: "44", username: "third" } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            app_id: "app",
            is_valid: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        }),
      );
    const result = await exchangeResearchConsent({
      code: "code",
      appId: "app",
      appSecret: "secret",
      version: "v25.0",
      baseUrl: "https://studio.test",
    });
    expect(result.sources).toEqual([
      { id: "42", username: "studio" },
      { id: "43", username: "second" },
      { id: "44", username: "third" },
    ]);
    expect(result.token).toBe("long");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain(
      "graph.facebook.com/v25.0/me/accounts",
    );
  });
  it("refuses missing required research consent", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "short" }))
      .mockResolvedValueOnce(json({ access_token: "long", expires_in: 3600 }))
      .mockResolvedValueOnce(
        json({
          data: [{ permission: "pages_read_engagement", status: "declined" }],
        }),
      );
    await expect(
      exchangeResearchConsent({
        code: "code",
        appId: "app",
        appSecret: "secret",
        version: "v25.0",
        baseUrl: "https://studio.test",
      }),
    ).rejects.toMatchObject({ code: "access" });
  });
});
