import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("server-only", () => ({}));
import {
  libraryImageReservationSql,
  libraryImageCompletionSql,
  type ReserveLibraryImage,
} from "@/db/commands/library-image-jobs";
const pg = new PGlite();
const workspace = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
let sequence = 0;
const input = (): ReserveLibraryImage => ({
  workspaceId: workspace,
  userId: user,
  key: "key-" + ++sequence,
  hash: "hash",
  request: {
    title: "Independent image",
    prompt: "A tree",
    quality: "low",
    size: "1024x1024",
    referenceAssetIds: [],
  },
  plan: { kind: "image" },
  cost: 8,
  daily: 100,
  monthly: 1000,
});
async function reserve(p: ReserveLibraryImage) {
  const q = new PgDialect().sqlToQuery(libraryImageReservationSql(p));
  return pg.query<{ id: string; request_hash: string }>(q.sql, q.params);
}
beforeAll(async () => {
  await pg.exec(`create table workspaces(id uuid primary key);create table users(id uuid primary key);
create type usage_operation_type as enum ('media_generation','research_analysis','scene_image_generation');
create type usage_reservation_status as enum ('pending','released','reconciled');
create table usage_reservations(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid,operation_type usage_operation_type not null,analysis_run_id uuid,image_generation_id uuid,audio_generation_id uuid,video_render_id uuid,script_generation_id uuid,title_generation_id uuid,thumbnail_generation_id uuid,clip_generation_id uuid,chapter_generation_id uuid,video_generation_id uuid,media_generation_operation_id uuid,status usage_reservation_status default 'pending',reserved_cost_cents int not null,actual_cost_cents int,expires_at timestamptz not null,created_at timestamptz default now(),updated_at timestamptz default now(),constraint usage_reservations_single_operation check(true));
create table media_assets(id uuid primary key,workspace_id uuid,uploaded_by_user_id uuid,kind text,status text,object_key text,content_type text,size_bytes int,original_file_name text,title text,tags jsonb,width int,height int);
create table usage_events(id uuid primary key default gen_random_uuid(),workspace_id uuid,reservation_id uuid,operation_type usage_operation_type,event_type text,estimated_cost_cents int,actual_cost_cents int,safe_metadata jsonb,unique(reservation_id,event_type));
insert into workspaces values('${workspace}'); insert into users values('${user}');
insert into usage_reservations(workspace_id,operation_type,media_generation_operation_id,reserved_cost_cents,expires_at)values('${workspace}','media_generation',gen_random_uuid(),1,now()+interval '1 hour');`);
  const sql = await readFile(
    "migrations/20261121163013_independent_image_studio/migration.sql",
    "utf8",
  );
  await pg.transaction(async (tx) => {
    await tx.exec(sql);
  });
}, 30000);
afterAll(() => pg.close());
describe("independent image reservation migration", () => {
  it("preserves historical MCP reservations", async () => {
    expect(
      (
        await pg.query(
          "select count(*)::int n from usage_reservations where media_generation_operation_id is not null and library_image_job_id is null",
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });
  it("atomically creates a job, reservation and event exactly once", async () => {
    const p = input();
    const first = await reserve(p);
    expect(first.rows).toHaveLength(1);
    const repeated = await reserve(p);
    expect(repeated.rows).toEqual(first.rows);
    expect(
      (
        await pg.query(
          "select count(*)::int n from usage_events where safe_metadata->>'libraryImageJobId'=$1",
          [first.rows[0]!.id],
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });
  it("enforces budgets before creating a job", async () => {
    const p = input();
    p.daily = 0;
    expect((await reserve(p)).rows).toEqual([]);
    expect(
      (
        await pg.query(
          "select id from library_image_jobs where idempotency_key=$1",
          [p.key],
        )
      ).rows,
    ).toEqual([]);
  });
  it("returns the existing hash for conflict detection", async () => {
    const p = input();
    await reserve(p);
    expect(
      (await reserve({ ...p, hash: "changed" })).rows[0]!.request_hash,
    ).toBe("hash");
  });
  it("rejects simultaneous MCP and browser identities", async () => {
    const p = input();
    const job = (await reserve(p)).rows[0]!.id;
    await expect(
      pg.query(
        "update usage_reservations set media_generation_operation_id=gen_random_uuid() where library_image_job_id=$1",
        [job],
      ),
    ).rejects.toThrow();
  });
  it("enforces tenant scope on reservation links", async () => {
    const p = input();
    const job = (await reserve(p)).rows[0]!.id;
    await expect(
      pg.query(
        "update usage_reservations set workspace_id='33333333-3333-4333-8333-333333333333' where library_image_job_id=$1",
        [job],
      ),
    ).rejects.toThrow();
  });
  it("limits a workspace to four active jobs", async () => {
    while (
      Number(
        (
          await pg.query<{ n: number }>(
            "select count(*)::int n from library_image_jobs",
          )
        ).rows[0]!.n,
      ) < 4
    )
      await reserve(input());
    expect((await reserve(input())).rows).toEqual([]);
  });
});

describe("atomic library completion", () => {
  it("writes a ready original only when the saved job is still running", async () => {
    const { rows } = await pg.query<{ id: string }>(
      "select id from library_image_jobs limit 1",
    );
    const id = rows[0]!.id;
    const q = new PgDialect().sqlToQuery(
      libraryImageCompletionSql({
        workspaceId: workspace,
        id,
        userId: user,
        title: "Tree",
        objectKey: "private/tree.png",
        contentType: "image/png",
        sizeBytes: 200,
        width: 4,
        height: 3,
        fileName: "tree.png",
        cost: 2,
        requestId: "req",
        usage: {},
      }),
    );
    await pg.query(
      "update library_image_jobs set status='failed' where id=$1",
      [id],
    );
    expect((await pg.query(q.sql, q.params)).rows).toEqual([]);
    expect((await pg.query("select id from media_assets")).rows).toEqual([]);
    await pg.query(
      "update library_image_jobs set status='running' where id=$1",
      [id],
    );
    expect((await pg.query(q.sql, q.params)).rows).toEqual([{ id }]);
    expect(
      (await pg.query("select status,width,height,tags from media_assets"))
        .rows,
    ).toEqual([
      {
        status: "ready",
        width: 4,
        height: 3,
        tags: ["generated", "image-studio"],
      },
    ]);
    expect((await pg.query(q.sql, q.params)).rows).toEqual([]);
  });
});
