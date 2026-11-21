import { describe, expect, it } from "vitest";
import { connectionHealth } from "./connection-health";

const now = new Date("2026-11-21T12:00:00Z");
describe("publishing connection health", () => {
  it.each([
    ["2026-11-21T11:59:59Z", "expired", false],
    ["2026-11-21T12:00:00Z", "expired", false],
    ["2026-11-21T12:00:01Z", "active", true],
  ] as const)(
    "compares token expiry %s at the same instant across views",
    (expiry, status, healthy) => {
      expect(
        connectionHealth(
          { status: "active", expiresAt: new Date(expiry) },
          now,
        ),
      ).toEqual({ status, healthy });
    },
  );
  it("supports non-expiring active tokens", () => {
    expect(
      connectionHealth({ status: "active", expiresAt: null }, now).healthy,
    ).toBe(true);
  });
  it("keeps revoked accounts disconnected even with future expiry", () => {
    expect(
      connectionHealth(
        { status: "revoked", expiresAt: new Date("2027-01-01") },
        now,
      ),
    ).toEqual({ status: "revoked", healthy: false });
  });
  it("keeps stored expired status and flags errors on active accounts", () => {
    expect(
      connectionHealth({ status: "expired", expiresAt: null }, now).healthy,
    ).toBe(false);
    expect(
      connectionHealth(
        { status: "active", expiresAt: null, lastError: "Reconnect required." },
        now,
      ),
    ).toEqual({ status: "active", healthy: false });
  });
});
