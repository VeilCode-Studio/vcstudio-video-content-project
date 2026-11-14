import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { socialResearchEnvironmentSchema } from "./environment";
describe("research deployment flag", () => {
  it("defaults to off and validates explicit values", () => {
    expect(
      socialResearchEnvironmentSchema.parse({}).ENABLE_SOCIAL_RESEARCH,
    ).toBe(false);
    expect(
      socialResearchEnvironmentSchema.parse({ ENABLE_SOCIAL_RESEARCH: "true" })
        .ENABLE_SOCIAL_RESEARCH,
    ).toBe(true);
    expect(
      socialResearchEnvironmentSchema.safeParse({
        ENABLE_SOCIAL_RESEARCH: "yes",
      }).success,
    ).toBe(false);
  });
});
