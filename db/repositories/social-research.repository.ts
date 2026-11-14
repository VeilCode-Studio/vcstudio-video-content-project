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

/** A disconnected/replaced research grant cannot commit a late provider result. */
export async function finishResearchRefresh(input: {
  workspaceId: string;
  requestId: string;
  data: ResearchSnapshot | null;
  safeError: string | null;
}) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with completed as (
      update social_research_snapshots s set status=${input.data ? "succeeded" : "failed"},data=${input.data ? JSON.stringify(input.data) : null}::jsonb,
        safe_error=${input.safeError},completed_at=now(),updated_at=now()
      where s.id=${input.requestId}::uuid and s.workspace_id=${input.workspaceId}::uuid and s.status='running'
        and (${input.data === null} or exists(select 1 from social_research_connections c where c.workspace_id=s.workspace_id and c.revision=s.connection_revision and c.revoked_at is null and c.access_token_sealed is not null and c.expires_at>now()))
      returning s.id,s.account_id,s.workspace_id,s.created_at
    )
    update social_research_accounts a set refresh_lease_until=null,last_error=${input.safeError},
      refreshed_at=case when ${input.data !== null} then now() else a.refreshed_at end,version=a.version+1,updated_at=now()
    from completed c where a.id=c.account_id and a.workspace_id=c.workspace_id and a.last_requested_at<=c.created_at returning c.id
  `);
  return result.rows.length === 1;
}
