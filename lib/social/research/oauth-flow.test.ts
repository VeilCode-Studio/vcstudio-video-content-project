import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchAuthorizationError } from "./authorization-error";
import { SocialResearchError } from "./errors";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  enabled: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  exchange: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  getAuthenticatedWorkspaceContext: mocks.context,
}));
vi.mock("@/lib/social/research/environment", () => ({
  isSocialResearchEnabled: mocks.enabled,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
}));
vi.mock("@/lib/env/server", () => ({
  getPublishingEnvironment: () => ({
    FACEBOOK_GRAPH_API_VERSION: "v25.0",
    PLATFORM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  }),
  getPublishingWebEnvironment: () => ({
    APP_BASE_URL: "https://studio.test",
    FACEBOOK_APP_ID: "app",
    FACEBOOK_APP_SECRET: "secret",
    OAUTH_STATE_SECRET: "test-state-secret-at-least-32-characters",
    OAUTH_STATE_TTL_SECONDS: 600,
  }),
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  saveResearchConnection: mocks.save,
}));
vi.mock("@/lib/audit/record-audit-event", () => ({
  recordAuditEvent: mocks.audit,
}));
vi.mock("./oauth", async (original) => ({
  ...(await original<typeof import("./oauth")>()),
  exchangeResearchConsent: mocks.exchange,
}));
import { GET as authorize } from "@/app/api/social/research/authorize/route";
import { GET as callback } from "@/app/api/social/research/callback/route";
import { createOAuthState } from "@/lib/publishing/oauth-state";
const workspaceId = "11111111-1111-4111-8111-111111111111";
function state(
  platform = "meta:research",
  workspace = workspaceId,
  now = new Date(),
) {
  return createOAuthState({
    workspaceId: workspace,
    userId: "owner",
    platform,
    now,
    secret: "test-state-secret-at-least-32-characters",
  });
}
function request(signed: string) {
  return new Request(
    `https://studio.test/api/social/research/callback?${new URLSearchParams({ code: "code", state: signed })}`,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.context.mockResolvedValue({
    user: { id: "owner" },
    activeMembership: { workspaceId, role: "owner" },
  });
  mocks.exchange.mockResolvedValue({
    token: "secret-access",
    expiresAt: new Date("2030-01-01"),
    scopes: ["pages_read_engagement"],
    sources: [],
  });
});
afterEach(() => vi.restoreAllMocks());
describe("research OAuth route isolation", () => {
  it("sets a secure-purpose HttpOnly cookie and a separate callback", async () => {
    const result = await authorize();
    const url = new URL(result.headers.get("location")!);
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://studio.test/api/social/research/callback",
    );
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(result.headers.get("set-cookie")).toContain(
      "Path=/api/social/research",
    );
  });
  it("does not authorize editors or disabled deployments", async () => {
    mocks.context.mockResolvedValue({
      user: { id: "owner" },
      activeMembership: { workspaceId, role: "editor" },
    });
    expect((await authorize()).status).toBe(403);
    mocks.enabled.mockReturnValue(false);
    expect((await authorize()).status).toBe(404);
    expect((await callback(request(state()))).status).toBe(404);
  });
  it.each(["cookie", "purpose", "workspace", "expired"])(
    "rejects invalid %s before token exchange",
    async (kind) => {
      const signed =
        kind === "purpose"
          ? state("facebook")
          : kind === "workspace"
            ? state("meta:research", "22222222-2222-4222-8222-222222222222")
            : kind === "expired"
              ? state(
                  "meta:research",
                  workspaceId,
                  new Date(Date.now() - 3600000),
                )
              : state();
      mocks.get.mockReturnValue({
        value: kind === "cookie" ? "other-cookie" : signed,
      });
      const result = await callback(request(signed));
      expect(result.headers.get("location")).toContain("authorization=invalid");
      expect(mocks.exchange).not.toHaveBeenCalled();
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
  it("seals the token and only writes the dedicated research connection", async () => {
    const signed = state();
    mocks.get.mockReturnValue({ value: signed });
    const result = await callback(request(signed));
    expect(result.headers.get("location")).toContain("authorization=connected");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        connectedByUserId: "owner",
        scopes: ["pages_read_engagement"],
      }),
    );
    expect(JSON.stringify(mocks.save.mock.calls[0])).not.toContain(
      "secret-access",
    );
    expect(result.headers.get("location")).not.toContain("secret-access");
    expect(mocks.set).toHaveBeenCalled();
  });
  it("reports the exact failed stage and logs only allowlisted diagnostics", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const signed = state();
    mocks.get.mockReturnValue({ value: signed });
    mocks.exchange.mockRejectedValueOnce(
      new ResearchAuthorizationError(
        "account_discovery",
        new SocialResearchError(
          "access",
          "secret-access provider URL with secret",
          200,
        ),
      ),
    );
    const response = await callback(request(signed));
    const url = new URL(response.headers.get("location")!);
    expect(url.searchParams.get("failure")).toBe("account_discovery");
    expect(url.searchParams.get("reference")).toMatch(/^[a-f0-9-]{36}$/);
    expect(log).toHaveBeenCalledWith("SOCIAL_RESEARCH_AUTHORIZATION_FAILED", {
      reference: url.searchParams.get("reference"),
      stage: "account_discovery",
      category: "access",
      providerCode: 200,
      validationFields: [],
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(url.toString()).not.toContain("secret");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("distinguishes saving failures from Meta consent failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const signed = state();
    mocks.get.mockReturnValue({ value: signed });
    mocks.save.mockRejectedValueOnce(new Error("private database URL"));
    expect((await callback(request(signed))).headers.get("location")).toContain(
      "failure=save_connection",
    );
  });
  it("distinguishes declined consent from a provider authorization error", async () => {
    const signed = state();
    mocks.get.mockReturnValue({ value: signed });
    expect(
      (
        await callback(
          new Request(
            `https://studio.test/api/social/research/callback?state=${signed}&error=access_denied`,
          ),
        )
      ).headers.get("location"),
    ).toContain("authorization=cancelled");
    expect(
      (
        await callback(
          new Request(
            `https://studio.test/api/social/research/callback?state=${signed}&error=server_error&error_description=secret`,
          ),
        )
      ).headers.get("location"),
    ).toContain("failure=consent");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});
