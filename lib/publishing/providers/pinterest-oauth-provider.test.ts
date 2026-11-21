import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  PinterestOAuthProvider,
  PINTEREST_SCOPES,
} from "./pinterest-oauth-provider";
const fetcher = vi.fn<typeof fetch>();
const provider = new PinterestOAuthProvider({
  clientId: "123456",
  clientSecret: "test-secret",
});
const token = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  scope: PINTEREST_SCOPES.join(" "),
};
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
describe("Pinterest OAuth", () => {
  it("requests least necessary scopes with signed state and exact callback, never its secret", () => {
    const url = new URL(
      provider.createAuthorizationUrl({
        state: "signed-state",
        redirectUri: "https://studio.test/api/pinterest/callback",
      }),
    );
    expect(url.origin).toBe("https://www.pinterest.com");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toBe(PINTEREST_SCOPES.join(","));
    expect(url.toString()).not.toContain("test-secret");
  });
  it("exchanges code using Basic auth and validates account identity", async () => {
    fetcher.mockResolvedValueOnce(Response.json(token)).mockResolvedValueOnce(
      Response.json({
        id: "42",
        username: "studio_owner",
        business_name: "Studio",
      }),
    );
    const result = await provider.exchangeCode({
      code: "code",
      redirectUri: "https://studio.test/api/pinterest/callback",
    });
    expect(result.account).toEqual({
      externalAccountId: "42",
      externalAccountName: "Studio",
      externalAccountUrl: "https://www.pinterest.com/studio_owner/",
    });
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("123456:test-secret").toString("base64")}`,
    });
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain(
      "grant_type=authorization_code",
    );
  });
  it("rotates refresh tokens without inventing scopes or expiry", async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ ...token, refresh_token: "rotated" }),
    );
    expect(await provider.refreshTokens({ refreshToken: "old" })).toMatchObject(
      { refreshToken: "rotated", scopes: [...PINTEREST_SCOPES] },
    );
  });
  it.each([
    {},
    { ...token, scope: "user_accounts:read" },
    { ...token, expires_in: -1 },
  ])("rejects malformed or insufficient tokens safely", async (data) => {
    fetcher.mockResolvedValueOnce(Response.json(data));
    await expect(
      provider.exchangeCode({
        code: "code",
        redirectUri: "https://studio.test/api/pinterest/callback",
      }),
    ).rejects.toThrow(/Pinterest|Authorize/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not leak raw provider errors", async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ secret: "DO-NOT-EXPOSE" }, { status: 403 }),
    );
    await expect(
      provider.refreshTokens({ refreshToken: "old" }),
    ).rejects.not.toThrow("DO-NOT-EXPOSE");
  });
});
