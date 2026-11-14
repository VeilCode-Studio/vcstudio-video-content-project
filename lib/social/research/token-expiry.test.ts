import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const request = vi.hoisted(() => vi.fn());
vi.mock("./meta-client", () => ({ metaResearchRequest: request }));
import { resolveResearchTokenDeadline } from "./token-expiry";

const now = Date.parse("2026-11-14T12:00:00Z");
const input = {
  token: "private-token",
  appId: "123",
  appSecret: "private-secret",
  version: "v25.0",
};
const metadata = {
  app_id: "123",
  is_valid: true,
  expires_at: now / 1000 + 7200,
  data_access_expires_at: now / 1000 + 3600,
};
beforeEach(() => {
  request.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(() => vi.restoreAllMocks());

describe("Meta research token deadlines", () => {
  it("uses an explicit expiry without another provider request", async () => {
    expect(
      (
        await resolveResearchTokenDeadline({ ...input, expiresIn: 3600 })
      ).getTime(),
    ).toBe(now + 3600000);
    expect(request).not.toHaveBeenCalled();
  });
  it("validates omitted expiry through Meta and honors the earlier data-access deadline", async () => {
    request.mockResolvedValue({ data: metadata });
    expect((await resolveResearchTokenDeadline(input)).getTime()).toBe(
      now + 3600000,
    );
    expect(request).toHaveBeenCalledWith({
      version: "v25.0",
      path: "debug_token",
      token: "123|private-secret",
      query: { input_token: "private-token" },
    });
  });
  it("uses a shorter token expiry when data access lasts longer", async () => {
    request.mockResolvedValue({
      data: { ...metadata, expires_at: now / 1000 + 600 },
    });
    expect((await resolveResearchTokenDeadline(input)).getTime()).toBe(
      now + 600000,
    );
  });
  it("bounds verified non-expiring access with a local reconnect ceiling", async () => {
    request.mockResolvedValue({
      data: { ...metadata, expires_at: 0, data_access_expires_at: 0 },
    });
    expect((await resolveResearchTokenDeadline(input)).getTime()).toBe(
      now + 60 * 86400000,
    );
    expect(
      (
        await resolveResearchTokenDeadline({ ...input, expiresIn: 365 * 86400 })
      ).getTime(),
    ).toBe(now + 60 * 86400000);
  });
  it.each([
    { app_id: "another-app" },
    { is_valid: false },
    { expires_at: now / 1000 - 1 },
    { data_access_expires_at: now / 1000 - 1 },
  ])("rejects invalid, wrong-app and expired metadata %j", async (override) => {
    request.mockResolvedValue({ data: { ...metadata, ...override } });
    await expect(resolveResearchTokenDeadline(input)).rejects.toThrow();
  });
  it("rejects missing metadata expiry rather than assuming 60 days", async () => {
    request.mockResolvedValue({ data: { app_id: "123", is_valid: true } });
    await expect(resolveResearchTokenDeadline(input)).rejects.toThrow();
  });
});
