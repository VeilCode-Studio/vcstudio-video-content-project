import "server-only";
import { loadEffectiveWorkspaceBudget } from "@/lib/budgets/workspace-budget";
import {
  getProjectCommittedCostCents,
  getWorkspaceCommittedCostCents,
} from "@/db/repositories/scenes.repository";
import { findProject } from "@/db/repositories/projects.repository";
import type { McpBudgetNotice } from "@studio/contracts/mcp-budget";

export async function loadMcpBudgetNotice(input: {
  workspaceId: string;
  projectId?: string;
  estimatedCostCents: number;
  maximumCostCents: number;
}): Promise<McpBudgetNotice> {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const month = new Date(day);
  month.setUTCDate(1);
  const [budget, daily, monthly, project, projectSpend] = await Promise.all([
    loadEffectiveWorkspaceBudget(input),
    getWorkspaceCommittedCostCents({
      workspaceId: input.workspaceId,
      since: day,
    }),
    getWorkspaceCommittedCostCents({
      workspaceId: input.workspaceId,
      since: month,
    }),
    input.projectId
      ? findProject({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        })
      : null,
    input.projectId
      ? getProjectCommittedCostCents({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        })
      : 0,
  ]);
  const cost = input.estimatedCostCents;
  const warnings: string[] = [];
  if (cost > input.maximumCostCents)
    warnings.push(
      `Estimate ${cost} cents exceeds the requested budget of ${input.maximumCostCents} cents.`,
    );
  if (daily + cost > budget.dailyBudgetCents)
    warnings.push(
      `Estimated daily spend ${daily + cost} cents exceeds the workspace daily budget of ${budget.dailyBudgetCents} cents.`,
    );
  if (monthly + cost > budget.monthlyBudgetCents)
    warnings.push(
      `Estimated monthly spend ${monthly + cost} cents exceeds the workspace monthly budget of ${budget.monthlyBudgetCents} cents.`,
    );
  if (project && projectSpend + cost > project.maximumBudgetCents)
    warnings.push(
      `Estimated project spend ${projectSpend + cost} cents exceeds its budget of ${project.maximumBudgetCents} cents.`,
    );
  return {
    policy: "advisory",
    estimatedCostCents: cost,
    requestedMaximumCostCents: input.maximumCostCents,
    warnings,
    execution:
      "Follow the connection's approval mode. Cost and budget warnings do not require extra approval for an autonomous connection.",
  };
}
