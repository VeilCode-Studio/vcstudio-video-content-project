import type { McpContext } from "./context";
import { can } from "@/lib/policies/workspace-policy";
import { requireMcp } from "./errors";
import type { ResearchAnalysisApprovalMode } from "@studio/contracts/mcp-research";
export function researchApprovalMode(input: {
  role: string;
  researchAnalysisApprovalMode?: ResearchAnalysisApprovalMode;
}): ResearchAnalysisApprovalMode {
  return input.role === "owner" &&
    input.researchAnalysisApprovalMode === "autonomous"
    ? "autonomous"
    : "manual";
}
export function assertResearchApprovalGrant(input: {
  role: string;
  researchAnalysisApprovalMode: ResearchAnalysisApprovalMode;
  scopes: string[];
}) {
  requireMcp(
    input.researchAnalysisApprovalMode !== "autonomous" ||
      (input.role === "owner" &&
        ["vcstudio:read", "vcstudio:media", "vcstudio:generate"].every((s) =>
          input.scopes.includes(s),
        )),
    "permission_denied",
    "Only an owner with Read, Media and Generate permissions can enable autonomous research analysis.",
  );
}
export function requireResearchEditor(ctx: McpContext) {
  requireMcp(
    can(ctx.membership.role, "researchSocialAccounts"),
    "permission_denied",
    "Your current role cannot refresh or process research media.",
  );
}
