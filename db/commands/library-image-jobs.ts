import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDatabase, getNeonClient } from "@/db/drizzle";
import { libraryImageJobs } from "@/db/schema";
import type {
  StudioImageRequest,
  StudioImageStatus,
} from "@studio/contracts/image-studio";
export class LibraryImageError extends Error {}
export type ReserveLibraryImage = {
  workspaceId: string;
  userId: string;
  key: string;
  hash: string;
  request: StudioImageRequest;
  plan: Record<string, unknown>;
  cost: number;
  daily: number;
  monthly: number;
};
export function libraryImageReservationSql(p: ReserveLibraryImage) {
  return sql`with totals as materialized (
 select coalesce(sum(case when status='pending' then reserved_cost_cents else coalesce(actual_cost_cents,0) end) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0) daily,
 coalesce(sum(case when status='pending' then reserved_cost_cents else coalesce(actual_cost_cents,0) end) filter(where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0) monthly
 from usage_reservations where workspace_id=${p.workspaceId}::uuid and status in ('pending','reconciled')
 ), job as (insert into library_image_jobs(workspace_id,user_id,idempotency_key,request_hash,request,plan,estimated_cost_cents)
 select ${p.workspaceId}::uuid,${p.userId}::uuid,${p.key},${p.hash},${JSON.stringify(p.request)}::jsonb,${JSON.stringify(p.plan)}::jsonb,${p.cost} from totals
 where ${p.cost}>0 and daily+${p.cost}<=${p.daily} and monthly+${p.cost}<=${p.monthly}
 and (select count(*) from library_image_jobs where workspace_id=${p.workspaceId}::uuid and status in ('queued','running'))<4
 on conflict(workspace_id,user_id,idempotency_key) do nothing returning *
 ), reservation as (insert into usage_reservations(workspace_id,operation_type,library_image_job_id,reserved_cost_cents,expires_at)
 select workspace_id,'media_generation',id,estimated_cost_cents,now()+interval '15 minutes' from job returning *
 ), event as (insert into usage_events(workspace_id,reservation_id,operation_type,event_type,estimated_cost_cents,safe_metadata)
 select workspace_id,id,operation_type,'reserved',reserved_cost_cents,jsonb_build_object('libraryImageJobId',library_image_job_id::text) from reservation returning id)
 select id,request_hash from job union all select id,request_hash from library_image_jobs where workspace_id=${p.workspaceId}::uuid and user_id=${p.userId}::uuid and idempotency_key=${p.key} limit 1`;
}
export async function reserveLibraryImage(p: ReserveLibraryImage) {
  const client = getNeonClient();
  const query = new PgDialect().sqlToQuery(libraryImageReservationSql(p));
  const rows = await client.transaction(
    [
      client`select pg_advisory_xact_lock(hashtextextended(${p.workspaceId},0))`,
      client.query(query.sql, query.params),
    ],
    { isolationLevel: "ReadCommitted" },
  );
  const result = z
    .array(z.object({ id: z.uuid(), request_hash: z.string() }))
    .parse(rows[1])[0];
  if (!result)
    throw new LibraryImageError(
      "Workspace budget or generation capacity is unavailable. No provider request was made.",
    );
  if (result.request_hash !== p.hash)
    throw new LibraryImageError(
      "This request key belongs to different inputs.",
    );
  return result.id;
}
export async function updateLibraryImage(
  workspaceId: string,
  id: string,
  from: StudioImageStatus[],
  values: Partial<typeof libraryImageJobs.$inferInsert>,
) {
  const [row] = await getDatabase()
    .update(libraryImageJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(libraryImageJobs.workspaceId, workspaceId),
        eq(libraryImageJobs.id, id),
        sql`${libraryImageJobs.status} in (${sql.join(
          from.map((s) => sql`${s}`),
          sql`,`,
        )})`,
      ),
    )
    .returning();
  return row ?? null;
}
export async function claimLibraryImage(workspaceId: string, id: string) {
  const [row] = await getDatabase()
    .update(libraryImageJobs)
    .set({ status: "running", attemptCount: 1, updatedAt: new Date() })
    .where(
      and(
        eq(libraryImageJobs.workspaceId, workspaceId),
        eq(libraryImageJobs.id, id),
        eq(libraryImageJobs.status, "queued"),
        eq(libraryImageJobs.attemptCount, 0),
        sql`exists(select 1 from usage_reservations where workspace_id=${workspaceId}::uuid and library_image_job_id=${id}::uuid and status='pending' and expires_at>now())`,
      ),
    )
    .returning();
  return row ?? null;
}
export async function settleLibraryImage(
  workspaceId: string,
  id: string,
  cost: number,
) {
  if (!Number.isSafeInteger(cost) || cost < 0)
    throw new Error("INVALID_IMAGE_COST");
  await getDatabase().execute(
    sql`with settled as (update usage_reservations set status=${cost === 0 ? "released" : "reconciled"}::usage_reservation_status,actual_cost_cents=${cost},updated_at=now() where workspace_id=${workspaceId}::uuid and library_image_job_id=${id}::uuid and status='pending' returning *) insert into usage_events(workspace_id,reservation_id,operation_type,event_type,estimated_cost_cents,actual_cost_cents,safe_metadata) select workspace_id,id,operation_type,${cost === 0 ? "released" : "reconciled"}::usage_event_type,reserved_cost_cents,${cost},jsonb_build_object('libraryImageJobId',${id}::text) from settled on conflict(reservation_id,event_type) do nothing`,
  );
}
export function libraryImageCompletionSql(p: {
  workspaceId: string;
  id: string;
  userId: string;
  title: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  fileName: string;
  cost: number;
  requestId: string | null;
  usage: Record<string, unknown>;
}) {
  return sql`with completed as (update library_image_jobs set status='succeeded',actual_cost_cents=${p.cost},provider_request_id=${p.requestId},usage=${JSON.stringify(p.usage)}::jsonb,safe_error_message=null,updated_at=now() where id=${p.id}::uuid and workspace_id=${p.workspaceId}::uuid and status='running' returning *)
  insert into media_assets(id,workspace_id,uploaded_by_user_id,kind,status,object_key,content_type,size_bytes,original_file_name,title,tags,width,height)
  select id,workspace_id,user_id,'image','ready',${p.objectKey},${p.contentType},${p.sizeBytes},${p.fileName},${p.title},'["generated","image-studio"]'::jsonb,${p.width},${p.height} from completed on conflict do nothing returning id`;
}
export async function completeLibraryImage(
  p: Parameters<typeof libraryImageCompletionSql>[0],
) {
  const result = await getDatabase().execute(libraryImageCompletionSql(p));
  if (result.rows.length === 0)
    throw new LibraryImageError("This generation is no longer active.");
}
