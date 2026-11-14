import { z } from "zod";
export const researchAnalysisEnvironmentSchema = z.object({
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  ENABLE_RESEARCH_MEDIA_ANALYSIS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RESEARCH_ANALYSIS_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .default("gemini-3.5-flash-lite"),
  // Conservative upper rates across input modalities, not a promise of free-tier billing.
  RESEARCH_ANALYSIS_INPUT_COST_PER_MILLION_CENTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(100),
  RESEARCH_ANALYSIS_OUTPUT_COST_PER_MILLION_CENTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(500),
  GOOGLE_AI_VIDEO_GENERATION_API_KEY: z.string().default(""),
});
export const RESEARCH_MAX_INPUT_TOKENS = 128000;
export const RESEARCH_MAX_OUTPUT_TOKENS = 8192;
export const RESEARCH_MAX_BYTES = 12 * 1024 * 1024;
export const RESEARCH_MAX_DURATION_SECONDS = 120;
export function researchAnalysisConfiguration() {
  const env = researchAnalysisEnvironmentSchema.parse(process.env);
  return {
    ...env,
    available:
      env.ENABLE_RESEARCH_MEDIA_ANALYSIS &&
      !!env.GOOGLE_AI_VIDEO_GENERATION_API_KEY,
  };
}
export function researchAnalysisCost(
  inputTokens: number,
  outputTokens: number,
  configuration = researchAnalysisConfiguration(),
) {
  return Math.ceil(
    (inputTokens *
      configuration.RESEARCH_ANALYSIS_INPUT_COST_PER_MILLION_CENTS +
      outputTokens *
        configuration.RESEARCH_ANALYSIS_OUTPUT_COST_PER_MILLION_CENTS) /
      1_000_000,
  );
}
