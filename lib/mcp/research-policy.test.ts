import { describe, expect, it } from "vitest";
import {
  assertResearchApprovalGrant,
  researchApprovalMode,
} from "./research-policy";
describe("independent research analysis autonomy", () => {
  it("defaults to manual and only honors owner-enabled autonomy", () => {
    expect(researchApprovalMode({ role: "owner" })).toBe("manual");
    expect(
      researchApprovalMode({
        role: "owner",
        researchAnalysisApprovalMode: "autonomous",
      }),
    ).toBe("autonomous");
    expect(
      researchApprovalMode({
        role: "editor",
        researchAnalysisApprovalMode: "autonomous",
      }),
    ).toBe("manual");
    expect(
      researchApprovalMode({
        role: "viewer",
        researchAnalysisApprovalMode: "autonomous",
      }),
    ).toBe("manual");
  });
  it("requires all three scopes and owner role without borrowing generation/publishing autonomy", () => {
    const scopes = ["vcstudio:read", "vcstudio:media", "vcstudio:generate"];
    expect(() =>
      assertResearchApprovalGrant({
        role: "owner",
        researchAnalysisApprovalMode: "autonomous",
        scopes,
      }),
    ).not.toThrow();
    for (const missing of scopes)
      expect(() =>
        assertResearchApprovalGrant({
          role: "owner",
          researchAnalysisApprovalMode: "autonomous",
          scopes: scopes.filter((s) => s !== missing),
        }),
      ).toThrow();
    expect(() =>
      assertResearchApprovalGrant({
        role: "editor",
        researchAnalysisApprovalMode: "autonomous",
        scopes,
      }),
    ).toThrow();
    expect(() =>
      assertResearchApprovalGrant({
        role: "viewer",
        researchAnalysisApprovalMode: "manual",
        scopes: [],
      }),
    ).not.toThrow();
  });
});
