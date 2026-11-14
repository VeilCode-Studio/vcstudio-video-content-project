import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/drizzle";
import type { McpContext } from "@/lib/mcp/context";
import { mcpOperations } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** Claim an exact reviewed quote while serializing with connection/grant changes. */
export async function consumeResearchAnalysis(
  ctx: McpContext,
  operationId: string,
  manual: boolean,
) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with authority as materialized (
      select g.connection_id from mcp_workspace_grants g join mcp_connections c on c.id=g.connection_id
      join workspace_members m on m.workspace_id=g.workspace_id and m.user_id=${ctx.principal.userId}::uuid
      where c.id=${ctx.connection.id}::uuid and c.user_id=${ctx.principal.userId}::uuid and c.revoked_at is null
        and g.workspace_id=${ctx.workspaceId}::uuid and m.role in ('owner','editor')
        and date_trunc('milliseconds',c.updated_at)=${ctx.connection.updatedAt.toISOString()}::timestamptz
        and date_trunc('milliseconds',g.updated_at)=${ctx.grant.updatedAt.toISOString()}::timestamptz
        and g.scopes @> '["vcstudio:read","vcstudio:media","vcstudio:generate"]'::jsonb
        and (${manual}::boolean or (m.role='owner' and g.research_analysis_approval_mode='autonomous'))
      for update of g,c,m
    ) update mcp_operations o set status='approved',approval_hash=null,expires_at=now()+interval '2 hours',updated_at=now()
      where o.id=${operationId}::uuid and o.workspace_id=${ctx.workspaceId}::uuid and o.connection_id=${ctx.connection.id}::uuid
        and o.user_id=${ctx.principal.userId}::uuid and o.kind='research_analysis'
        and o.status=${manual ? "requires_approval" : "prepared"} and o.expires_at>now()
        and exists(select 1 from authority)
        and exists(select 1 from social_research_accounts a where a.id=(o.input->>'accountId')::uuid and a.workspace_id=o.workspace_id and a.archived_at is null)
    returning o.id
  `);
  return result.rows.length === 1;
}
export async function claimResearchAnalysis(
  workspaceId: string,
  operationId: string,
) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    update mcp_operations o set status='running',result='{"attemptCount":1,"providerSubmitted":false}'::jsonb,updated_at=now()
    where o.id=${operationId}::uuid and o.workspace_id=${workspaceId}::uuid and o.kind='research_analysis'
      and o.status in ('approved','queued') and o.expires_at>now()
      and exists(select 1 from usage_reservations r where r.workspace_id=o.workspace_id and r.media_generation_operation_id=o.id and r.status='pending' and r.expires_at>now())
    returning o.id
  `);
  return result.rows.length === 1;
}
/** Result writes and deletion lock the account first, so deletion cannot resurrect findings. */
export async function saveResearchAnalysisResult(input: {
  workspaceId: string;
  operationId: string;
  accountId: string;
  result: Record<string, unknown>;
}) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with target as materialized (select id from social_research_accounts where id=${input.accountId}::uuid and workspace_id=${input.workspaceId}::uuid and archived_at is null for update)
    update mcp_operations o set status='succeeded',result=${JSON.stringify(input.result)}::jsonb,error=null,updated_at=now()
    where o.id=${input.operationId}::uuid and o.workspace_id=${input.workspaceId}::uuid and o.kind='research_analysis' and o.status='running'
      and exists(select 1 from target) returning o.id
  `);
  return result.rows.length === 1;
}
export async function listResearchAnalysisOperations(
  workspaceId: string,
  accountId: string,
  summariesOnly = false,
) {
  const projected = summariesOnly
    ? sql`jsonb_build_object('summary',${mcpOperations.result}->'findings'->'summary','source',${mcpOperations.result}->'source','coverage',${mcpOperations.result}->'coverage')`
    : sql`${mcpOperations.result}-'prompt'`;
  return getDatabase()
    .select({
      id: mcpOperations.id,
      status: mcpOperations.status,
      updatedAt: mcpOperations.updatedAt,
      result: sql<Record<string, unknown> | null>`${projected}`,
    })
    .from(mcpOperations)
    .where(
      and(
        eq(mcpOperations.workspaceId, workspaceId),
        eq(mcpOperations.kind, "research_analysis"),
        sql`${mcpOperations.input}->>'accountId'=${accountId}`,
      ),
    )
    .orderBy(sql`${mcpOperations.createdAt} desc`)
    .limit(10);
}
export async function listResearchAnalysisRecovery() {
  const result = await getDatabase().execute<{
    workspace_id: string;
    id: string;
  }>(sql`
    select o.id,o.workspace_id from mcp_operations o join usage_reservations r on r.workspace_id=o.workspace_id and r.media_generation_operation_id=o.id
    where o.kind='research_analysis' and r.status='pending'
      and (o.status in ('succeeded','failed','cancelled','expired') or o.updated_at<now()-interval '30 minutes' or o.expires_at<=now())
    order by o.updated_at limit 25
  `);
  return result.rows;
}
