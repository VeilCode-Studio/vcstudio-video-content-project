import { task } from "@trigger.dev/sdk";
import {
  researchAnalysisTaskInput,
  runResearchAnalysis,
} from "@/lib/mcp/run-research-analysis";
import { failStoppedResearchAnalysis } from "@/lib/mcp/research-analysis-recovery";
export const mcpResearchAnalysisTask = task({
  id: "mcp-research-analysis",
  queue: { name: "research-analysis", concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 600,
  run: async (payload: unknown) =>
    runResearchAnalysis(researchAnalysisTaskInput.parse(payload)),
  onFailure: async ({ payload }) => {
    const input = researchAnalysisTaskInput.parse(payload);
    await failStoppedResearchAnalysis(input.workspaceId, input.operationId);
  },
});
