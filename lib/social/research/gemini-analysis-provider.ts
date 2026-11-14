import "server-only";
import { z } from "zod";
import { researchAnalysisFindingsSchema } from "@studio/contracts/mcp-research";
import {
  RESEARCH_MEDIA_ANALYSIS_SYSTEM,
  researchMediaAnalysisPrompt,
} from "@studio/prompts";
import {
  researchAnalysisConfiguration,
  RESEARCH_MAX_INPUT_TOKENS,
  RESEARCH_MAX_OUTPUT_TOKENS,
} from "./analysis-environment";
import type { ResearchMediaPart } from "./analysis-media";
import { McpError, requireMcp } from "@/lib/mcp/errors";
const responseSchema = z.object({
  responseId: z.string().optional(),
  modelVersion: z.string().optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
              thought: z.boolean().optional(),
            }),
          ),
        }),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative(),
      candidatesTokenCount: z.number().int().nonnegative().default(0),
      thoughtsTokenCount: z.number().int().nonnegative().default(0),
    })
    .optional(),
});
async function request(method: string, body: unknown) {
  const env = researchAnalysisConfiguration();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.RESEARCH_ANALYSIS_MODEL}:${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GOOGLE_AI_VIDEO_GENERATION_API_KEY,
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(180000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new McpError(
      "provider_unavailable",
      [401, 403].includes(response.status)
        ? "Google rejected the analysis credentials or project access. No automatic retry was made."
        : response.status === 429
          ? "Google's analysis quota or billing access is unavailable. No automatic paid retry was made."
          : "The analysis provider could not complete this request. No automatic retry was made.",
    );
  }
  const reader = response.body?.getReader();
  requireMcp(
    reader,
    "provider_unavailable",
    "The analysis provider returned no data.",
  );
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      requireMcp(
        bytes <= 1_000_000,
        "invalid_provider_result",
        "The analysis response exceeded its limit.",
      );
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export async function analyzeResearchMedia(input: {
  parts: ResearchMediaPart[];
  evidence: Record<string, unknown>;
  beforeSubmit: () => Promise<void>;
}) {
  const contents = [
    {
      role: "user",
      parts: [
        { text: researchMediaAnalysisPrompt(input.evidence) },
        ...input.parts,
      ],
    },
  ];
  const tokens = z
    .object({ totalTokens: z.number().int().nonnegative() })
    .parse(await request("countTokens", { contents }));
  // Leave a conservative 10k-token margin for system instructions and provider accounting.
  requireMcp(
    tokens.totalTokens + 10000 <= RESEARCH_MAX_INPUT_TOKENS,
    "media_too_large",
    "This media exceeds the bounded analysis token budget. No billable analysis was submitted.",
  );
  await input.beforeSubmit();
  const raw = responseSchema.parse(
    await request("generateContent", {
      systemInstruction: { parts: [{ text: RESEARCH_MEDIA_ANALYSIS_SYSTEM }] },
      contents,
      generationConfig: {
        maxOutputTokens: RESEARCH_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(researchAnalysisFindingsSchema),
      },
    }),
  );
  const candidate = raw.candidates?.[0];
  requireMcp(
    candidate?.finishReason === "STOP",
    "invalid_provider_result",
    "Analysis was blocked or incomplete. Its result was not accepted.",
  );
  const text = candidate.content.parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  return {
    findings: researchAnalysisFindingsSchema.parse(JSON.parse(text)),
    requestId: raw.responseId ?? null,
    modelVersion: raw.modelVersion ?? null,
    usage: raw.usageMetadata ?? null,
  };
}
