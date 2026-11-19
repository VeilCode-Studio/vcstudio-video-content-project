import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/drizzle";
import type { ResearchKeywordInput } from "@studio/contracts/social-research";

/** Latest successful observation per active account; cap text before database egress. */
export async function listResearchKeywordSamples(
  workspaceId: string,
  filters: ResearchKeywordInput,
) {
  const result = await getDatabase().execute<{ sample: unknown }>(sql`
    with selected as (
      select id,name,platform,created_at from social_research_accounts
      where workspace_id=${workspaceId}::uuid and archived_at is null
        and (${filters.accountId}='all' or id::text=${filters.accountId})
        and (${filters.platform}='all' or platform::text=${filters.platform})
      order by created_at desc,id desc limit 21
    )
    select jsonb_build_object(
      'accountId',a.id,'accountName',a.name,'platform',a.platform,
      'snapshotId',s.id,'observedAt',coalesce(s.completed_at,s.created_at),
      'hasMore',coalesce((s.data->>'hasMore')::boolean,false),
      'posts',coalesce((select jsonb_agg(p.value || jsonb_build_object(
        'text',left(p.value->>'text',4000),
        'textTruncated',length(p.value->>'text')>4000
      ) order by p.ordinality) from jsonb_array_elements(s.data->'posts')
        with ordinality as p(value,ordinality) where p.ordinality<=25),'[]'::jsonb)
    ) as sample
    from selected a left join lateral (
      select id,data,completed_at,created_at from social_research_snapshots
      where workspace_id=${workspaceId}::uuid and account_id=a.id and status='succeeded'
      order by created_at desc,id desc limit 1
    ) s on true order by a.created_at desc,a.id desc
  `);
  return result.rows;
}

/** Only factual evidence/transcripts from completed analyses of these exact observations. */
export async function listResearchKeywordMedia(
  workspaceId: string,
  snapshotIds: string[],
) {
  if (!snapshotIds.length) return [];
  const ids = sql.join(
    snapshotIds.slice(0, 20).map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const result = await getDatabase().execute<{ media: unknown }>(sql`
    select jsonb_build_object(
      'operationId',r.id,'snapshotId',r.snapshot_id,'postId',r.post_id,
      'transcript',left(r.result->'findings'->>'transcript',6000),
      'evidence',coalesce((select jsonb_agg(e.value->'evidence' order by e.ordinality)
        from jsonb_array_elements(r.result->'findings'->'observations')
          with ordinality as e(value,ordinality) where e.ordinality<=10),'[]'::jsonb)
    ) as media from (
      select distinct on (s.id,o.result->'source'->>'postId')
        o.id,o.result,s.id as snapshot_id,o.result->'source'->>'postId' as post_id
      from mcp_operations o join social_research_snapshots s
        on s.workspace_id=o.workspace_id and s.id::text=o.result->'source'->>'snapshotId'
      join social_research_accounts a on a.workspace_id=s.workspace_id and a.id=s.account_id
      where o.workspace_id=${workspaceId}::uuid and o.kind='research_analysis'
        and o.status='succeeded' and s.status='succeeded' and a.archived_at is null
        and o.input->>'accountId'=a.id::text and s.id in (${ids})
      order by s.id,o.result->'source'->>'postId',o.updated_at desc,o.id desc
      limit 50
    ) r
  `);
  return result.rows;
}
