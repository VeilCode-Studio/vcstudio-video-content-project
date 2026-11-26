import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db/drizzle";
import {
  socialResearchCategories as categories,
  socialResearchAccounts as accounts,
} from "@/db/schema";
import type { ResearchCategoryView } from "@studio/contracts/research-categories";

export async function listResearchCategories(
  workspaceId: string,
): Promise<ResearchCategoryView[]> {
  return getDatabase()
    .select({
      id: categories.id,
      name: categories.name,
      version: categories.version,
      accountCount: sql<number>`count(${accounts.id})::int`,
    })
    .from(categories)
    .leftJoin(
      accounts,
      and(
        eq(accounts.categoryId, categories.id),
        eq(accounts.workspaceId, categories.workspaceId),
        isNull(accounts.archivedAt),
      ),
    )
    .where(eq(categories.workspaceId, workspaceId))
    .groupBy(categories.id)
    .orderBy(asc(categories.name))
    .limit(50);
}

export async function createResearchCategory(input: {
  workspaceId: string;
  name: string;
}) {
  // A unique tenant/slot constraint enforces the cap even for concurrent requests.
  const result = await getDatabase().execute<{ id: string }>(sql`
    insert into social_research_categories(workspace_id,name,slot)
    select ${input.workspaceId}::uuid,${input.name},available.slot
    from generate_series(1,50) available(slot)
    where not exists(select 1 from social_research_categories c where c.workspace_id=${input.workspaceId}::uuid and c.slot=available.slot)
    order by available.slot limit 1
    on conflict do nothing returning id
  `);
  return result.rows[0] ?? null;
}

export async function renameResearchCategory(input: {
  workspaceId: string;
  categoryId: string;
  version: number;
  name: string;
}) {
  const [row] = await getDatabase()
    .update(categories)
    .set({
      name: input.name,
      version: sql`${categories.version}+1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(categories.workspaceId, input.workspaceId),
        eq(categories.id, input.categoryId),
        eq(categories.version, input.version),
      ),
    )
    .returning({ id: categories.id });
  return row ?? null;
}

/** Removing a folder never removes accounts, snapshots, or paid-analysis results. */
export async function deleteResearchCategory(input: {
  workspaceId: string;
  categoryId: string;
  version: number;
}) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    with target as (
      select id,workspace_id from social_research_categories
      where workspace_id=${input.workspaceId}::uuid and id=${input.categoryId}::uuid and version=${input.version} for update
    ), moved as (
      update social_research_accounts a set category_id=null,version=a.version+1,updated_at=now()
      from target t where a.workspace_id=t.workspace_id and a.category_id=t.id returning a.id
    )
    delete from social_research_categories c using target t
    where c.id=t.id and c.workspace_id=t.workspace_id and (select count(*) from moved)>=0 returning c.id
  `);
  return result.rows[0] ?? null;
}

export async function assignResearchCategory(input: {
  workspaceId: string;
  accountId: string;
  version: number;
  categoryId: string | null;
}) {
  const result = await getDatabase().execute<{ id: string }>(sql`
    update social_research_accounts a set category_id=${input.categoryId}::uuid,version=a.version+1,updated_at=now()
    where a.workspace_id=${input.workspaceId}::uuid and a.id=${input.accountId}::uuid and a.version=${input.version} and a.archived_at is null
      and (${input.categoryId}::uuid is null or exists(select 1 from social_research_categories c where c.id=${input.categoryId}::uuid and c.workspace_id=a.workspace_id))
    returning a.id
  `);
  return result.rows[0] ?? null;
}
