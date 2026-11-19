import { z } from "zod";

export const mcpBudgetNoticeSchema = z.object({
  policy: z.literal("advisory"),
  estimatedCostCents: z.number().int().nonnegative(),
  requestedMaximumCostCents: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  execution: z.literal(
    "Follow the connection's approval mode. Cost and budget warnings do not require extra approval for an autonomous connection.",
  ),
});
export type McpBudgetNotice = z.infer<typeof mcpBudgetNoticeSchema>;
