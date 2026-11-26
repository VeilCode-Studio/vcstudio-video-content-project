import { describe, expect, it } from "vitest";
import { groupConnections } from "./group-connections";
describe("platform connection groups", () => {
  it("groups interleaved accounts without losing expired or revoked connections", () => {
    const accounts = [
      { id: "1", platform: "tiktok" as const, status: "active" },
      { id: "2", platform: "facebook" as const, status: "expired" },
      { id: "3", platform: "tiktok" as const, status: "revoked" },
      { id: "4", platform: "linkedin" as const, status: "active" },
    ];
    const groups = groupConnections(accounts);
    expect(groups.map((group) => group.platform)).toEqual([
      "facebook",
      "tiktok",
      "linkedin",
    ]);
    expect(
      groups
        .find((group) => group.platform === "tiktok")
        ?.items.map((item) => item.id),
    ).toEqual(["1", "3"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(
      accounts.length,
    );
  });
  it("does not render empty platform groups", () =>
    expect(groupConnections([])).toEqual([]));
});
