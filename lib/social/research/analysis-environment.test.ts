import { afterEach, describe, expect, it, vi } from "vitest";
import {
  researchAnalysisEnvironmentSchema,
  researchAnalysisConfiguration,
  researchAnalysisCost,
  RESEARCH_MAX_INPUT_TOKENS,
  RESEARCH_MAX_OUTPUT_TOKENS,
} from "./analysis-environment";
afterEach(() => vi.unstubAllEnvs());
describe("analysis configuration and cost ceiling", () => {
  it("is off by default, independently of generation and publishing", () => {
    expect(
      researchAnalysisEnvironmentSchema.parse({})
        .ENABLE_RESEARCH_MEDIA_ANALYSIS,
    ).toBe(false);
    vi.stubEnv("ENABLE_RESEARCH_MEDIA_ANALYSIS", "true");
    vi.stubEnv("GOOGLE_AI_VIDEO_GENERATION_API_KEY", "");
    expect(researchAnalysisConfiguration().available).toBe(false);
  });
  it("reserves the maximum configured multimodal input/output and rounds upward", () => {
    const config = researchAnalysisEnvironmentSchema.parse({});
    expect(
      researchAnalysisCost(
        RESEARCH_MAX_INPUT_TOKENS,
        RESEARCH_MAX_OUTPUT_TOKENS,
        { ...config, available: false },
      ),
    ).toBe(17);
    expect(researchAnalysisCost(1, 1, { ...config, available: false })).toBe(1);
  });
  it("rejects arbitrary model URL injection, invalid switches and negative rates", () => {
    for (const value of [
      { RESEARCH_ANALYSIS_MODEL: "https://evil.invalid" },
      { RESEARCH_ANALYSIS_INPUT_COST_PER_MILLION_CENTS: -1 },
      { ENABLE_RESEARCH_MEDIA_ANALYSIS: "yes" },
    ])
      expect(researchAnalysisEnvironmentSchema.safeParse(value).success).toBe(
        false,
      );
  });
});
