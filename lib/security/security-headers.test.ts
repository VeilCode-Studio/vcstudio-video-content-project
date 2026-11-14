import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "@/lib/security/security-headers";

const production = {
  nodeEnvironment: "production",
  cspMode: "report-only",
  r2Endpoint: "https://account.r2.cloudflarestorage.com",
} as const;

describe("security headers", () => {
  it("allows Meta images/videos only on research and preserves framing/script protections", () => {
    const research = buildSecurityHeaders({
      pathname: "/app/social/research",
      environment: { ...production, cspMode: "enforce" },
    });
    const policy = research["Content-Security-Policy"];
    expect(policy).toContain("https://*.cdninstagram.com");
    expect(policy).toContain("https://*.fbcdn.net");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(
      policy?.split(";").find((part) => part.includes("script-src")),
    ).not.toContain("fbcdn");
    expect(research["Referrer-Policy"]).toBe("no-referrer");
    expect(research["X-Frame-Options"]).toBe("DENY");
    expect(
      buildSecurityHeaders({
        pathname: "/app/social/posts",
        environment: production,
      })["Content-Security-Policy-Report-Only"],
    ).not.toContain("fbcdn");
  });
  it("starts CSP in report-only mode and allows the configured R2 origin", () => {
    const headers = buildSecurityHeaders({
      pathname: "/",
      environment: production,
    });
    expect(headers["Content-Security-Policy-Report-Only"]).toContain(
      "https://account.r2.cloudflarestorage.com",
    );
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("allows microphone only on the project audio page and denies camera everywhere", () => {
    expect(
      buildSecurityHeaders({
        pathname: "/app/projects/abc/audio",
        environment: production,
      })["Permissions-Policy"],
    ).toContain("microphone=(self)");
    const other = buildSecurityHeaders({
      pathname: "/app/projects/abc/render",
      environment: production,
    })["Permissions-Policy"];
    expect(other).toContain("microphone=()");
    expect(other).toContain("camera=()");
  });

  it("emits HSTS only in production and can enforce CSP explicitly", () => {
    expect(
      buildSecurityHeaders({ pathname: "/", environment: production })[
        "Strict-Transport-Security"
      ],
    ).toBeDefined();
    const development = buildSecurityHeaders({
      pathname: "/",
      environment: { nodeEnvironment: "development", cspMode: "enforce" },
    });
    expect(development["Strict-Transport-Security"]).toBeUndefined();
    expect(development["Content-Security-Policy"]).toContain("'unsafe-eval'");
  });
});
