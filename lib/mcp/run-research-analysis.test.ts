import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  operation: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
  cache: vi.fn(),
  save: vi.fn(),
  settle: vi.fn(),
  authority: vi.fn(),
  media: vi.fn(),
  provider: vi.fn(),
  previews: vi.fn(),
}));
vi.mock("@/db/repositories/mcp.repository", () => ({
  findMcpOperation: m.operation,
  updateMcpOperation: m.update,
}));
vi.mock("@/db/repositories/research-analysis.repository", () => ({
  claimResearchAnalysis: m.claim,
  listResearchAnalysisOperations: m.cache,
  saveResearchAnalysisResult: m.save,
}));
vi.mock("@/db/commands/mcp-generation-commands", () => ({
  settleMcpGeneration: m.settle,
}));
vi.mock("./research-analysis-service", () => ({
  researchAnalysisWorkerContext: m.authority,
}));
vi.mock("@/lib/social/research/analysis-media", () => ({
  collectResearchMedia: m.media,
}));
vi.mock("@/lib/social/research/gemini-analysis-provider", () => ({
  analyzeResearchMedia: m.provider,
}));
vi.mock("@/lib/social/research/previews", () => ({
  loadResearchPreviews: m.previews,
}));
vi.mock("@/lib/rate-limit/enforce-rate-limit", () => ({
  enforceRateLimit: vi.fn(),
}));
vi.mock("@/lib/audit/record-audit-event", () => ({
  recordAuditEvent: vi.fn(),
}));
import { runResearchAnalysis } from "./run-research-analysis";
import {
  mcpContextFixture,
  mcpIds,
  mcpOperationFixture,
} from "@/lib/test-utils/mcp-fixtures";
import { McpError } from "./errors";
const findings = {
  summary: "Observed content",
  transcript: "Spoken words",
  observations: [],
  hypotheses: [],
  experiments: [],
  limitations: [],
};
const request = {
  snapshotId: mcpIds.post,
  postId: "post-1",
  goal: "Study the visual hook",
  maximumCostCents: 20,
};
let op = mcpOperationFixture();
let saved: Record<string, unknown> | null;
beforeEach(() => {
  vi.clearAllMocks();
  saved = null;
  op = mcpOperationFixture({
    kind: "research_analysis",
    status: "queued",
    input: {
      request,
      accountId: mcpIds.asset,
      preview: {
        accountName: "Business",
        postUrl: "https://instagram.com/p/1/",
        caption: "Caption",
        format: "reel",
        goal: request.goal,
        model: "gemini-3.5-flash-lite",
        estimatedCostCents: 17,
        maximumCostCents: 20,
        maximumDurationSeconds: 120,
        maximumBytes: 12582912,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
      configuration: { model: "test" },
    },
  });
  m.operation.mockImplementation(async () => op);
  m.claim.mockResolvedValue(true);
  m.update.mockImplementation(async (input) => {
    op = { ...op, ...input.values };
    return op;
  });
  m.authority.mockResolvedValue({
    ctx: mcpContextFixture(),
    source: {
      account: { id: mcpIds.asset },
      post: {
        text: "Caption",
        format: "reel",
        url: "https://instagram.com/p/1/",
        likes: 10,
        comments: 2,
        shares: null,
      },
      row: { createdAt: new Date() },
      snapshot: { posts: [{}], hasMore: true },
    },
  });
  m.previews.mockResolvedValue({
    posts: [
      {
        postId: "post-1",
        items: [
          {
            kind: "video",
            url: "https://video.fbcdn.net/clip.mp4",
            posterUrl: null,
          },
        ],
        hasMore: false,
      },
    ],
  });
  m.media.mockResolvedValue({
    parts: [{ inlineData: { mimeType: "video/mp4", data: "temporary" } }],
    mediaHash: "hash",
    coverage: {
      items: 1,
      durationSeconds: 20,
      audioStreams: 1,
      downloadedBytes: 100,
    },
  });
  m.cache.mockResolvedValue([]);
  m.save.mockImplementation(async (input) => {
    saved = input.result;
    return true;
  });
  m.provider.mockImplementation(async (input) => {
    await input.beforeSubmit();
    return {
      findings,
      requestId: "request",
      modelVersion: "model",
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 200,
        thoughtsTokenCount: 100,
      },
    };
  });
});
describe("durable media analysis execution", () => {
  it("stores findings and exact public evidence but no binary or signed media URL", async () => {
    expect(
      await runResearchAnalysis({
        workspaceId: mcpIds.workspace,
        operationId: op.id,
      }),
    ).toEqual({ status: "succeeded" });
    expect(saved).toMatchObject({
      findings,
      coverage: { audioStreams: 1 },
      providerRequestId: "request",
      attemptCount: 1,
      performanceEvidence: {
        likes: 10,
        comments: 2,
        causality: "not_established",
      },
    });
    expect(JSON.stringify(saved)).not.toContain("temporary");
    expect(JSON.stringify(saved)).not.toContain("video.fbcdn.net");
    expect(m.settle).toHaveBeenCalledWith(mcpIds.workspace, op.id, 1);
    expect(m.authority.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  it("does not run a provider or settle twice when another worker owns the claim", async () => {
    m.claim.mockResolvedValue(false);
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    expect(m.provider).not.toHaveBeenCalled();
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("missing actual media releases the reservation without caption-only analysis", async () => {
    m.previews.mockResolvedValue({ posts: [] });
    expect(
      (
        await runResearchAnalysis({
          workspaceId: mcpIds.workspace,
          operationId: op.id,
        })
      ).status,
    ).toBe("failed");
    expect(m.provider).not.toHaveBeenCalled();
    expect(m.settle).toHaveBeenCalledWith(mcpIds.workspace, op.id, 0);
  });
  it("unknown failure after paid submission retains the quoted cost and makes no paid retry", async () => {
    m.provider.mockImplementation(async (input) => {
      await input.beforeSubmit();
      throw new Error("private token raw url");
    });
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    expect(op.error).not.toContain("private token");
    expect(m.settle).toHaveBeenCalledWith(mcpIds.workspace, op.id, 17);
    expect(m.provider).toHaveBeenCalledTimes(1);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("deletion/revocation before submission blocks work and drops late results", async () => {
    m.authority.mockRejectedValueOnce(
      new McpError("permission_denied", "revoked"),
    );
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    expect(m.provider).not.toHaveBeenCalled();
    m.authority.mockResolvedValue({
      ctx: mcpContextFixture(),
      source: {
        account: { id: mcpIds.asset },
        post: {
          text: "Caption",
          format: "reel",
          url: "https://instagram.com/p/1/",
        },
        row: { createdAt: new Date() },
        snapshot: { posts: [], hasMore: false },
      },
    });
    m.save.mockResolvedValue(false);
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    expect(op.status).toBe("failed");
    expect(m.settle).toHaveBeenLastCalledWith(mcpIds.workspace, op.id, 1);
  });
  it("silent video cannot retain a model-invented transcript", async () => {
    m.media.mockResolvedValue({
      parts: [],
      mediaHash: "hash",
      coverage: {
        items: 1,
        durationSeconds: 10,
        audioStreams: 0,
        downloadedBytes: 100,
      },
    });
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    expect(saved).toMatchObject({
      findings: {
        transcript: null,
        limitations: expect.arrayContaining([
          expect.stringContaining("No audio stream"),
        ]),
      },
    });
  });
  it("reuses completed identical-media analysis without another paid request", async () => {
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    const cached = saved;
    m.cache.mockResolvedValue([
      { id: "old-analysis", status: "succeeded", result: cached },
    ]);
    m.provider.mockClear();
    m.settle.mockClear();
    await runResearchAnalysis({
      workspaceId: mcpIds.workspace,
      operationId: op.id,
    });
    expect(m.provider).not.toHaveBeenCalled();
    expect(m.settle).toHaveBeenCalledWith(mcpIds.workspace, op.id, 0);
    expect(saved).toMatchObject({
      cacheHit: true,
      sourceAnalysisId: "old-analysis",
    });
  });
});
