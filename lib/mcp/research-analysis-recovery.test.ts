import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  op: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  settle: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/db/repositories/mcp.repository", () => ({
  findMcpOperation: m.op,
  updateMcpOperation: m.update,
}));
vi.mock("@/db/repositories/research-analysis.repository", () => ({
  listResearchAnalysisRecovery: m.list,
}));
vi.mock("@/db/commands/mcp-generation-commands", () => ({
  settleMcpGeneration: m.settle,
}));
vi.mock("@trigger.dev/sdk", () => ({ runs: { retrieve: m.run } }));
import {
  failStoppedResearchAnalysis,
  reconcileResearchAnalysis,
  recoverResearchAnalyses,
} from "./research-analysis-recovery";
import { mcpIds, mcpOperationFixture } from "@/lib/test-utils/mcp-fixtures";
beforeEach(() => vi.clearAllMocks());
describe("analysis recovery without paid retries", () => {
  it("releases pre-submission reservations and retains uncertain submitted cost", async () => {
    for (const submitted of [false, true]) {
      const op = mcpOperationFixture({
        kind: "research_analysis",
        status: "running",
        input: { preview: { estimatedCostCents: 17 } },
        result: { providerSubmitted: submitted },
      });
      m.op.mockResolvedValue(op);
      m.update.mockResolvedValue({ ...op, status: "failed" });
      await failStoppedResearchAnalysis(op.workspaceId, op.id);
      expect(m.settle).toHaveBeenLastCalledWith(
        op.workspaceId,
        op.id,
        submitted ? 17 : 0,
      );
    }
  });
  it("settles deleted-account tombstones without restoring content", async () => {
    const op = mcpOperationFixture({
      kind: "research_analysis",
      status: "cancelled",
      input: { deleted: true },
      result: {
        deleted: true,
        providerSubmitted: true,
        estimatedCostCents: 17,
      },
    });
    m.op.mockResolvedValue(op);
    m.update.mockResolvedValue(null);
    await failStoppedResearchAnalysis(op.workspaceId, op.id);
    expect(m.settle).toHaveBeenCalledWith(op.workspaceId, op.id, 17);
    expect(m.update.mock.calls[0]![0].from).not.toContain("cancelled");
  });
  it("checks terminal worker status only after a short grace period", async () => {
    const op = mcpOperationFixture({
      kind: "research_analysis",
      status: "running",
      triggerRunId: "run",
      updatedAt: new Date(Date.now() - 20000),
      result: { providerSubmitted: false },
    });
    m.op.mockResolvedValue(op);
    m.run.mockResolvedValue({ status: "CRASHED" });
    m.update.mockResolvedValue({ ...op, status: "failed" });
    expect((await reconcileResearchAnalysis(op)).status).toBe("failed");
    m.run.mockClear();
    await reconcileResearchAnalysis({ ...op, updatedAt: new Date() });
    expect(m.run).not.toHaveBeenCalled();
  });
  it("uses only selected existing recovery rows and reconciles saved actual cost", async () => {
    const op = mcpOperationFixture({
      kind: "research_analysis",
      status: "succeeded",
      result: { actualCostCents: 2, providerSubmitted: true },
    });
    m.list.mockResolvedValue([{ id: op.id, workspace_id: mcpIds.workspace }]);
    m.op.mockResolvedValue(op);
    m.update.mockResolvedValue(null);
    expect(await recoverResearchAnalyses()).toBe(1);
    expect(m.settle).toHaveBeenCalledWith(op.workspaceId, op.id, 2);
  });
});
