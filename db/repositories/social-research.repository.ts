import "server-only";
import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db/drizzle";
import {
  socialResearchAccounts as accounts,
  socialResearchConnections as connections,
  socialResearchSnapshots as snapshots,
} from "@/db/schema";
import type {
  ResearchSnapshot,
  ResearchPlatform,
  ResearchSource,
} from "@studio/contracts/social-research";

export async function listResearchAccounts(workspaceId: string, offset = 0) {
  return getDatabase()
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.workspaceId, workspaceId), isNull(accounts.archivedAt)),
    )
    .orderBy(desc(accounts.createdAt), desc(accounts.id))
    .limit(21)
    .offset(offset);
}
export async function findResearchAccount(
  workspaceId: string,
  accountId: string,
) {
  const [row] = await getDatabase()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.workspaceId, workspaceId),
        eq(accounts.id, accountId),
        isNull(accounts.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
export async function getResearchConnection(workspaceId: string) {
  const [row] = await getDatabase()
    .select()
    .from(connections)
    .where(eq(connections.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}
export async function listResearchSnapshots(
  workspaceId: string,
  accountId: string,
  offset = 0,
) {
  return getDatabase()
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.workspaceId, workspaceId),
        eq(snapshots.accountId, accountId),
        eq(snapshots.status, "succeeded"),
      ),
    )
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .limit(11)
    .offset(offset);
}
export async function findResearchOperation(
  workspaceId: string,
  requestId: string,
) {
  const [row] = await getDatabase()
    .select()
    .from(snapshots)
    .where(
      and(eq(snapshots.workspaceId, workspaceId), eq(snapshots.id, requestId)),
    )
    .limit(1);
  return row ?? null;
}
/** MCP history summaries exclude all post bodies at the database boundary. */
export async function listResearchObservationSummaries(
  workspaceId: string,
  accountId: string,
  offset = 0,
) {
  return getDatabase()
    .select({
      id: snapshots.id,
      capturedAt: sql<Date>`coalesce(${snapshots.completedAt},${snapshots.createdAt})`,
      followers: sql<number | null>`${snapshots.data}->'followers'`,
      sampledPosts: sql<number>`jsonb_array_length(${snapshots.data}->'posts')`,
      hasMore: sql<boolean>`(${snapshots.data}->>'hasMore')::boolean`,
    })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.workspaceId, workspaceId),
        eq(snapshots.accountId, accountId),
        eq(snapshots.status, "succeeded"),
      ),
    )
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .limit(11)
    .offset(offset);
}
export async function saveResearchConnection(input: {
  workspaceId: string;
  connectedByUserId: string;
  accessTokenSealed: string;
  expiresAt: Date;
  scopes: string[];
  sources: ResearchSource[];
}) {
  const [row] = await getDatabase()
    .insert(connections)
    .values(input)
    .onConflictDoUpdate({
      target: connections.workspaceId,
      set: {
        ...input,
        revokedAt: null,
        revision: sql`${connections.revision} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ revision: connections.revision });
  return row;
}
export async function disconnectResearchConnection(workspaceId: string) {
  // Only the dedicated research token is cleared; no publishing consent is revoked.
  await getDatabase()
    .update(connections)
    .set({
      accessTokenSealed: null,
      sources: [],
      scopes: [],
      revokedAt: new Date(),
      revision: sql`${connections.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(connections.workspaceId, workspaceId));
}
export async function replaceResearchSources(input: {
  workspaceId: string;
  revision: number;
  sources: ResearchSource[];
}) {
  const [row] = await getDatabase()
    .update(connections)
    .set({
      sources: input.sources,
      revision: sql`${connections.revision}+1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(connections.workspaceId, input.workspaceId),
        eq(connections.revision, input.revision),
        isNull(connections.revokedAt),
        sql`${connections.accessTokenSealed} is not null and ${connections.expiresAt}>now()`,
      ),
    )
    .returning({ workspaceId: connections.workspaceId });
  return Boolean(row);
}
export async function addResearchAccount(input: {
  workspaceId: string;
  createdByUserId: string;
  platform: ResearchPlatform;
  identifier: string;
  name: string;
  notes: string;
}) {
  const [row] = await getDatabase()
    .insert(accounts)
    .values(input)
    .onConflictDoUpdate({
      target: [accounts.workspaceId, accounts.platform, accounts.identifier],
      set: {
        archivedAt: null,
        name: input.name,
        notes: input.notes,
        version: sql`${accounts.version}+1`,
        updatedAt: new Date(),
      },
      setWhere: isNotNull(accounts.archivedAt),
    })
    .returning();
  return row ?? null;
}
export async function archiveResearchAccount(input: {
  workspaceId: string;
  accountId: string;
  version: number;
}) {
  const [row] = await getDatabase()
    .update(accounts)
    .set({
      archivedAt: new Date(),
      version: sql`${accounts.version}+1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(accounts.workspaceId, input.workspaceId),
        eq(accounts.id, input.accountId),
        eq(accounts.version, input.version),
        isNull(accounts.archivedAt),
        sql`(${accounts.refreshLeaseUntil} is null or ${accounts.refreshLeaseUntil}<now())`,
      ),
    )
    .returning({ id: accounts.id });
  return Boolean(row);
}

/** Purge the account and every observation/refresh attempt in one atomic statement. */
export async function deleteResearchAccount(input: {
  workspaceId: string;
  accountId: string;
  version: number;
}): Promise<boolean> {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with target as (
      select id,workspace_id,identifier,platform from social_research_accounts
      where id=${input.accountId}::uuid and workspace_id=${input.workspaceId}::uuid and version=${input.version}
      for update
    ), cleared_mcp as (
      update mcp_operations o set status='cancelled',approval_hash=null,sealed_source=null,
        input='{"deleted":true}'::jsonb,fingerprint='deleted',
        result=jsonb_build_object('deleted',true,'providerSubmitted',coalesce((o.result->>'providerSubmitted')::boolean,false),
          'estimatedCostCents',coalesce(o.input->'preview'->'estimatedCostCents',o.result->'estimatedCostCents','0'::jsonb))
          || case when o.result ? 'actualCostCents' then jsonb_build_object('actualCostCents',o.result->'actualCostCents') else '{}'::jsonb end,
        error='Research account and all associated content permanently deleted.',updated_at=now()
      from target t where o.workspace_id=t.workspace_id and o.kind in ('research_add','research_refresh','research_analysis')
        and (o.input->>'accountId'=t.id::text or o.result->>'accountId'=t.id::text
          or (o.input->'account'->>'identifier'=t.identifier and o.input->'account'->>'platform'=t.platform))
      returning o.id
    ), removed_snapshots as (
      delete from social_research_snapshots s using target t
      where s.account_id=t.id and s.workspace_id=t.workspace_id and (select count(*) from cleared_mcp)>=0 returning s.id
    ), removed_account as (
      delete from social_research_accounts a using target t
      where a.id=t.id and a.workspace_id=t.workspace_id
        and (select count(*) from removed_snapshots)>=0
      returning a.id
    ) select id from removed_account
  `);
  return result.rows.length === 1;
}

/** Lease + durable operation are one statement, so retries cannot start duplicate provider work. */
export async function claimResearchRefresh(input: {
  workspaceId: string;
  accountId: string;
  requestId: string;
  sourceId: string | null;
  connectionRevision: number;
}) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with claimed as (
      update social_research_accounts a set last_requested_at=now(), refresh_lease_until=now()+interval '90 seconds', updated_at=now()
      where a.workspace_id=${input.workspaceId}::uuid and a.id=${input.accountId}::uuid and a.archived_at is null
        and (a.refresh_lease_until is null or a.refresh_lease_until<now())
        and (a.last_requested_at is null or a.last_requested_at<now()-interval '60 seconds')
        and not exists(select 1 from social_research_snapshots where id=${input.requestId}::uuid)
        and exists(select 1 from social_research_connections c where c.workspace_id=a.workspace_id and c.revision=${input.connectionRevision} and c.revoked_at is null and c.access_token_sealed is not null and c.expires_at>now())
      returning a.id,a.workspace_id
    )
    insert into social_research_snapshots(id,workspace_id,account_id,source_id,status,connection_revision)
    select ${input.requestId}::uuid,workspace_id,id,${input.sourceId},'running',${input.connectionRevision} from claimed
    on conflict do nothing returning id
  `);
  return result.rows.length === 1;
}

/** Lock account before snapshot, matching deletion; revoked grants and deleted accounts cannot accept late results. */
export async function finishResearchRefresh(input: {
  workspaceId: string;
  requestId: string;
  data: ResearchSnapshot | null;
  safeError: string | null;
}) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with locked_account as (
      select a.id from social_research_accounts a
      join social_research_snapshots existing on existing.account_id=a.id and existing.workspace_id=a.workspace_id
      where existing.id=${input.requestId}::uuid and a.workspace_id=${input.workspaceId}::uuid
      for update of a
    ), completed as (
      update social_research_snapshots s set status=${input.data ? "succeeded" : "failed"},data=${input.data ? JSON.stringify(input.data) : null}::jsonb,
        safe_error=${input.safeError},completed_at=now(),updated_at=now()
      where s.id=${input.requestId}::uuid and s.workspace_id=${input.workspaceId}::uuid and s.status='running'
        and exists(select 1 from locked_account a where a.id=s.account_id)
        and (${input.data === null} or exists(select 1 from social_research_connections c where c.workspace_id=s.workspace_id and c.revision=s.connection_revision and c.revoked_at is null and c.access_token_sealed is not null and c.expires_at>now()))
      returning s.id,s.account_id,s.workspace_id,s.created_at
    )
    update social_research_accounts a set refresh_lease_until=null,last_error=${input.safeError},
      refreshed_at=case when ${input.data !== null} then now() else a.refreshed_at end,version=a.version+1,updated_at=now()
    from completed c where a.id=c.account_id and a.workspace_id=c.workspace_id and a.last_requested_at<=c.created_at returning c.id
  `);
  return result.rows.length === 1;
}
