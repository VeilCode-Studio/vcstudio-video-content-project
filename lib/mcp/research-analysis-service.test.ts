import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  operation: vi.fn(),
  previous: vi.fn(),
  begin: vi.fn(),
  update: vi.fn(),
  snapshot: vi.fn(),
  account: vi.fn(),
  meta: vi.fn(),
  consume: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  trigger: vi.fn(),
  enabled: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("./context", () => ({
  authorizeMcp: m.authorize,
  authorizeMcpBrowser: m.authorize,
}));
vi.mock("@/db/repositories/mcp.repository", () => ({
  findMcpOperation: m.operation,
  findMcpOperationByKey: m.previous,
  beginMcpOperation: m.begin,
  updateMcpOperation: m.update,
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  findResearchOperation: m.snapshot,
  findResearchAccount: m.account,
  getResearchConnection: m.meta,
}));
vi.mock("@/db/repositories/research-analysis.repository", () => ({
  consumeResearchAnalysis: m.consume,
}));
vi.mock("@/db/commands/mcp-generation-commands", () => ({
  reserveMcpGeneration: m.reserve,
  settleMcpGeneration: m.settle,
}));
vi.mock("@/lib/budgets/workspace-budget", () => ({
  loadEffectiveWorkspaceBudget: async () => ({
    dailyBudgetCents: 100,
    monthlyBudgetCents: 1000,
  }),
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: m.trigger } }));
vi.mock("@/lib/social/research/environment", () => ({
  isSocialResearchEnabled: m.enabled,
}));
vi.mock("@/lib/audit/record-audit-event", () => ({
  recordAuditEvent: m.audit,
}));
vi.mock("./research-analysis-recovery", () => ({
  reconcileResearchAnalysis: async (op: unknown) => op,
}));
import {
  mcpContextFixture,
  mcpIds,
  mcpOperationFixture,
} from "@/lib/test-utils/mcp-fixtures";
import {
  prepareResearchAnalysis,
  executeResearchAnalysis,
  approveResearchAnalysis,
  researchAuthority,
} from "./research-analysis-service";
import { McpError } from "./errors";
const request = {
  snapshotId: mcpIds.post,
  postId: "post-1",
  goal: "Learn from the visual hook",
  maximumCostCents: 20,
};
const snapshot = {
  platform: "instagram",
  externalAccountId: "789",
  name: "Business",
  profileUrl: "https://instagram.com/business/",
  biography: null,
  followers: 100,
  totalPosts: 30,
  hasMore: true,
  warnings: [],
  posts: [
    {
      id: "post-1",
      url: "https://instagram.com/p/one/",
      publishedAt: null,
      text: "Caption",
      format: "reel",
      likes: 10,
      comments: 2,
      shares: null,
    },
  ],
};
let ctx = mcpContextFixture();
let op = mcpOperationFixture();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENABLE_RESEARCH_MEDIA_ANALYSIS", "true");
  vi.stubEnv("GOOGLE_AI_VIDEO_GENERATION_API_KEY", "test-key");
  ctx = mcpContextFixture();
  ctx.grant.researchAnalysisApprovalMode = "autonomous";
  m.authorize.mockResolvedValue(ctx);
  m.enabled.mockReturnValue(true);
  m.previous.mockResolvedValue(null);
  m.snapshot.mockResolvedValue({
    status: "succeeded",
    accountId: mcpIds.asset,
    data: snapshot,
  });
  m.account.mockResolvedValue({ id: mcpIds.asset, name: "Business" });
  m.meta.mockResolvedValue({
    accessTokenSealed: "sealed",
    revokedAt: null,
    expiresAt: new Date("2035-01-01"),
    revision: 1,
  });
  m.begin.mockImplementation(async (input) => {
    op = mcpOperationFixture({ ...input, id: mcpIds.operation });
    return { created: true, operation: op };
  });
  m.operation.mockImplementation(async () => op);
  m.consume.mockImplementation(async () => {
    op = { ...op, status: "approved" };
    return true;
  });
  m.update.mockImplementation(async (input) => {
    op = { ...op, ...input.values };
    return op;
  });
  m.trigger.mockResolvedValue({ id: "run-1" });
});
afterEach(() => vi.unstubAllEnvs());
describe("quoted research analysis", () => {
  it("prepares without media downloads, reservations or paid calls, then executes autonomously once", async () => {
    const prepared = await prepareResearchAnalysis(
      ctx,
      "research-key-1",
      request,
    );
    expect(prepared.analysisApprovalMode).toBe("autonomous");
    expect(op.status).toBe("prepared");
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.trigger).not.toHaveBeenCalled();
    expect(op.input).not.toHaveProperty("token");
    expect(op.input).not.toHaveProperty("mediaUrl");
    expect(
      (await executeResearchAnalysis(ctx, op.id, "research-key-1")).status,
    ).toBe("queued");
    expect(m.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ctx.workspaceId,
        kind: "research_analysis",
        estimatedCostCents: 17,
      }),
    );
    await executeResearchAnalysis(ctx, op.id, "research-key-1");
    expect(m.trigger).toHaveBeenCalledTimes(1);
  });
  it("manual mode cannot be bypassed with ordinary execution and browser approval consumes its exact operation", async () => {
    ctx.grant.researchAnalysisApprovalMode = "manual";
    await prepareResearchAnalysis(ctx, "research-key-2", request);
    await expect(
      executeResearchAnalysis(ctx, op.id, "research-key-2"),
    ).rejects.toMatchObject({ code: "approval_required" });
    expect(m.consume).not.toHaveBeenCalled();
    expect((await approveResearchAnalysis(ctx, op.id)).status).toBe("queued");
    expect(m.consume).toHaveBeenCalledWith(ctx, op.id, true);
  });
  it("rejects a low maximum, wrong key, stale permissions, expiry and missing source before dispatch", async () => {
    await expect(
      prepareResearchAnalysis(ctx, "low-budget", {
        ...request,
        maximumCostCents: 1,
      }),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
    await prepareResearchAnalysis(ctx, "research-key-3", request);
    await expect(
      executeResearchAnalysis(ctx, op.id, "different-key"),
    ).rejects.toMatchObject({ code: "conflict" });
    ctx.grant.updatedAt = new Date(Date.now() + 5000);
    await expect(
      executeResearchAnalysis(ctx, op.id, "research-key-3"),
    ).rejects.toMatchObject({ code: "conflict" });
    op.input.authority = researchAuthority(ctx);
    op.expiresAt = new Date(0);
    await expect(
      executeResearchAnalysis(ctx, op.id, "research-key-3"),
    ).rejects.toMatchObject({ code: "expired" });
    expect(m.trigger).not.toHaveBeenCalled();
  });
  it("rejects changed idempotent inputs and missing scopes through current authorization", async () => {
    await prepareResearchAnalysis(ctx, "research-key-4", request);
    m.previous.mockResolvedValue(op);
    expect(
      (await prepareResearchAnalysis(ctx, "research-key-4", request)).operation
        .id,
    ).toBe(op.id);
    await expect(
      prepareResearchAnalysis(ctx, "research-key-4", {
        ...request,
        goal: "Different goal",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    m.authorize.mockRejectedValue(new McpError("permission_denied", "revoked"));
    await expect(
      executeResearchAnalysis(ctx, op.id, "research-key-4"),
    ).rejects.toThrow("revoked");
  });
  it("keeps uncertain dispatch reserved without retrying a provider", async () => {
    await prepareResearchAnalysis(ctx, "research-key-5", request);
    m.trigger.mockRejectedValue(new Error("network"));
    expect(
      (await executeResearchAnalysis(ctx, op.id, "research-key-5")).status,
    ).toBe("approved");
    expect(m.settle).not.toHaveBeenCalled();
    expect(m.trigger).toHaveBeenCalledTimes(1);
  });
});
