import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  budget: vi.fn(),
  spend: vi.fn(),
  project: vi.fn(),
  projectSpend: vi.fn(),
}));
vi.mock("@/lib/budgets/workspace-budget", () => ({
  loadEffectiveWorkspaceBudget: m.budget,
}));
vi.mock("@/db/repositories/scenes.repository", () => ({
  getWorkspaceCommittedCostCents: m.spend,
  getProjectCommittedCostCents: m.projectSpend,
}));
vi.mock("@/db/repositories/projects.repository", () => ({
  findProject: m.project,
}));
import { loadMcpBudgetNotice } from "./budget-notice";
beforeEach(() => {
  vi.clearAllMocks();
  m.budget.mockResolvedValue({ dailyBudgetCents: 10, monthlyBudgetCents: 20 });
  m.spend.mockResolvedValue(8);
  m.project.mockResolvedValue({ maximumBudgetCents: 0 });
  m.projectSpend.mockResolvedValue(0);
});
it("reports all exceeded budgets without throwing and scopes every read", async () => {
  const input = {
    workspaceId: "workspace",
    projectId: "project",
    estimatedCostCents: 17,
    maximumCostCents: 0,
  };
  const notice = await loadMcpBudgetNotice(input);
  expect(notice.policy).toBe("advisory");
  expect(notice.warnings).toHaveLength(4);
  expect(notice.estimatedCostCents).toBe(17);
  expect(m.project).toHaveBeenCalledWith({
    workspaceId: "workspace",
    projectId: "project",
  });
  for (const [read] of m.spend.mock.calls)
    expect(read.workspaceId).toBe("workspace");
});
it("reports the estimate without invented warnings or project queries", async () => {
  const notice = await loadMcpBudgetNotice({
    workspaceId: "workspace",
    estimatedCostCents: 1,
    maximumCostCents: 1,
  });
  expect(notice.warnings).toEqual([]);
  expect(m.project).not.toHaveBeenCalled();
  expect(m.projectSpend).not.toHaveBeenCalled();
});
