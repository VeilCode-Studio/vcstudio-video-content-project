import { sql } from "drizzle-orm";

/** Internal MCP linkage, never a browser-provided bypass flag. Invalid links retain ordinary limits. */
export function mcpAdvisoryBudgetSql(input: {
  workspaceId: string;
  operationId?: string;
  userId?: string;
  projectId?: string | null;
}) {
  if (!input.operationId) return sql`false`;
  return sql`exists(select 1 from mcp_operations budget_op
    where budget_op.id=${input.operationId ?? null}::uuid and budget_op.workspace_id=${input.workspaceId}::uuid
      and budget_op.kind in ('generate_media','research_analysis')
      and budget_op.status in ('approved','queued','running') and budget_op.expires_at>now()
      and budget_op.input->>'budgetPolicy'='advisory'
      ${input.userId ? sql`and budget_op.user_id=${input.userId}::uuid` : sql``}
      ${input.projectId ? sql`and coalesce(budget_op.input#>>'{request,projectId}',budget_op.input#>>'{request,video,target,projectId}')=${input.projectId}` : sql``})`;
}
