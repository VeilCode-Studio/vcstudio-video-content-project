import { mcpBudgetNoticeSchema } from "./mcp-budget";
import { z } from "zod";
import { mcpMutationInput, mcpWorkspaceInput } from "./mcp";
export const researchAnalysisApprovalModeSchema = z.enum([
  "manual",
  "autonomous",
]);
export type ResearchAnalysisApprovalMode = z.infer<
  typeof researchAnalysisApprovalModeSchema
>;
export const researchAnalysisRequestSchema = z.object({
  snapshotId: z.uuid(),
  postId: z.string().min(1).max(120),
  goal: z
    .string()
    .trim()
    .max(2000)
    .default("Identify evidence-backed content lessons and experiments."),
  maximumCostCents: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .describe(
      "Advisory analysis budget in cents; exceeding it returns a warning and does not block authorized execution.",
    ),
});
export const prepareResearchAnalysisInput = mcpMutationInput.extend({
  request: researchAnalysisRequestSchema,
});
export const executeResearchAnalysisInput = mcpMutationInput.extend({
  operationId: z.uuid(),
});
export const researchAnalysisStatusInput = mcpWorkspaceInput.extend({
  operationId: z.uuid(),
});
export const researchAnalysisPreviewSchema = z.object({
  budget: mcpBudgetNoticeSchema.optional(),
  accountName: z.string(),
  postUrl: z.url(),
  caption: z.string(),
  format: z.string(),
  goal: z.string(),
  model: z.string(),
  estimatedCostCents: z.number().int().nonnegative(),
  maximumCostCents: z.number().int().nonnegative(),
  maximumDurationSeconds: z.number(),
  maximumBytes: z.number(),
  expiresAt: z.iso.datetime(),
});
export const researchAnalysisFindingsSchema = z.object({
  summary: z.string().max(3000),
  transcript: z.string().max(20000).nullable(),
  observations: z
    .array(
      z.object({
        aspect: z.enum([
          "hook",
          "visuals",
          "structure",
          "pacing",
          "audio",
          "call_to_action",
          "other",
        ]),
        finding: z.string().max(2000),
        evidence: z.string().max(1500),
        slide: z.number().int().min(1).max(20).nullable(),
        timeSeconds: z.number().nonnegative().nullable(),
      }),
    )
    .max(30),
  hypotheses: z.array(z.string().max(1500)).max(10),
  experiments: z.array(z.string().max(1500)).max(10),
  limitations: z.array(z.string().max(1000)).max(15),
});
export type ResearchAnalysisRequest = z.infer<
  typeof researchAnalysisRequestSchema
>;
export type ResearchAnalysisPreview = z.infer<
  typeof researchAnalysisPreviewSchema
>;
export type ResearchAnalysisFindings = z.infer<
  typeof researchAnalysisFindingsSchema
>;
