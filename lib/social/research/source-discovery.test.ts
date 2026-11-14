import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const request = vi.hoisted(() => vi.fn());
vi.mock("./meta-client", () => ({ metaResearchRequest: request }));
import { discoverResearchSources } from "./source-discovery";
import { SocialResearchError } from "./errors";
const input = {
  token: "private-user-token",
  appId: "123",
  appSecret: "private-secret",
  version: "v25.0",
};
function metadata(ids: string[]) {
  return {
    data: {
      app_id: "123",
      is_valid: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      granular_scopes: [{ scope: "instagram_basic", target_ids: ids }],
    },
  };
}
beforeEach(() => {
  request.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("consented Instagram source discovery", () => {
  it("recovers a verified consented Instagram source omitted from Page listing", async () => {
    request
      .mockResolvedValueOnce({ data: [{}] })
      .mockResolvedValueOnce(metadata(["42"]))
      .mockResolvedValueOnce({ id: "42", username: "veilcodestudio" });
    expect(await discoverResearchSources(input)).toEqual([
      { id: "42", username: "veilcodestudio" },
    ]);
    expect(request.mock.calls[2]?.[0]).toEqual({
      version: "v25.0",
      path: "42",
      token: "private-user-token",
      query: { fields: "id,username" },
    });
  });
  it("merges and deduplicates listed and omitted sources", async () => {
    request
      .mockResolvedValueOnce({
        data: [
          { instagram_business_account: { id: "41", username: "listed" } },
        ],
      })
      .mockResolvedValueOnce(metadata(["41", "42", "42"]))
      .mockResolvedValueOnce({ id: "42", username: "omitted" });
    expect(await discoverResearchSources(input)).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("can verify consent when the Page-list endpoint itself is unavailable", async () => {
    request
      .mockRejectedValueOnce(new Error("private network details"))
      .mockResolvedValueOnce(metadata(["42"]))
      .mockResolvedValueOnce({ id: "42", username: "source" });
    expect(await discoverResearchSources(input)).toHaveLength(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "private",
    );
  });
  it("does not accept a different identity returned for a consent hint", async () => {
    request
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce(metadata(["42"]))
      .mockResolvedValueOnce({ id: "99", username: "wrong" });
    await expect(discoverResearchSources(input)).rejects.toMatchObject({
      code: "access",
    });
  });
  it("does not add unverified hints when their lookup is denied", async () => {
    request
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce(metadata(["42"]))
      .mockRejectedValueOnce(new Error("private error"));
    await expect(discoverResearchSources(input)).rejects.toMatchObject({
      code: "access",
    });
  });
  it.each([false, true])(
    "rejects token metadata for another app even with listed sources (%s)",
    async (listed) => {
      request
        .mockResolvedValueOnce({
          data: listed
            ? [{ instagram_business_account: { id: "41", username: "listed" } }]
            : [],
        })
        .mockResolvedValueOnce({
          data: { ...metadata(["42"]).data, app_id: "different" },
        });
      await expect(discoverResearchSources(input)).rejects.toMatchObject({
        code: "access",
      });
      expect(request).toHaveBeenCalledTimes(2);
    },
  );
  it("preserves already-verified linked sources if optional hints are unavailable", async () => {
    request
      .mockResolvedValueOnce({
        data: [
          { instagram_business_account: { id: "41", username: "listed" } },
        ],
      })
      .mockRejectedValueOnce(
        new SocialResearchError("unavailable", "unavailable"),
      );
    expect(await discoverResearchSources(input)).toEqual([
      { id: "41", username: "listed" },
    ]);
  });
  it("bounds fallback lookups and concurrent requests", async () => {
    const ids = Array.from({ length: 13 }, (_, i) => String(i + 100));
    request
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce(metadata(ids));
    let active = 0,
      maxActive = 0;
    request.mockImplementation(async ({ path }: { path: string }) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { id: path, username: `source${path}` };
    });
    expect(await discoverResearchSources(input)).toHaveLength(12);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(request).toHaveBeenCalledTimes(14);
  });
});
