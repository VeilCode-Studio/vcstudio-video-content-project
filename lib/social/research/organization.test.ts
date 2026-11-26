import { describe, expect, it } from "vitest";
import { researchAccountsHref } from "./organization";
import {
  createResearchCategorySchema,
  researchCategoryFilterSchema,
} from "@studio/contracts/research-categories";
describe("research organization navigation", () => {
  it("preserves filters through account/history pagination", () => {
    const url = new URL(
      researchAccountsHref({
        category: "uncategorized",
        accountId: "test",
        page: 2,
        historyPage: 3,
        observationId: "saved",
      }),
      "https://example.test",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: "uncategorized",
      account: "test",
      page: "2",
      historyPage: "3",
      observation: "saved",
    });
  });
  it("starts category selection at page one with no stale account or observation", () =>
    expect(researchAccountsHref({ category: "uncategorized" })).toBe(
      "/app/social/research?category=uncategorized",
    ));
  it("normalizes names and rejects invalid filters", () => {
    expect(createResearchCategorySchema.parse({ name: " Finance " })).toEqual({
      name: "Finance",
    });
    expect(createResearchCategorySchema.safeParse({ name: " " }).success).toBe(
      false,
    );
    expect(researchCategoryFilterSchema.safeParse("forged").success).toBe(
      false,
    );
  });
});
