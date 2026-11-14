import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ResearchSnapshot } from "@studio/contracts/social-research";
vi.mock("server-only", () => ({}));
const pg = new PGlite();
const database = drizzle({ client: pg });
vi.mock("@/db/drizzle", () => ({ getDatabase: () => database }));
import {
  addResearchAccount,
  archiveResearchAccount,
  claimResearchRefresh,
  disconnectResearchConnection,
  findResearchAccount,
  findResearchOperation,
  finishResearchRefresh,
  getResearchConnection,
  listResearchSnapshots,
  saveResearchConnection,
  replaceResearchSources,
  deleteResearchAccount,
} from "@/db/repositories/social-research.repository";
import { researchConnectionView } from "@/lib/social/research/view";
import {
  openResearchToken,
  sealResearchToken,
} from "@/lib/social/research/secrets";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspace = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const key = Buffer.alloc(32, 4).toString("base64");
const data: ResearchSnapshot = {
  platform: "facebook",
  externalAccountId: "123",
  name: "Example Page",
  profileUrl: "https://www.facebook.com/123",
  biography: null,
  followers: 100,
  totalPosts: null,
  posts: [],
  hasMore: false,
  warnings: [],
};
beforeAll(async () => {
  await pg.exec(
    `create table workspaces(id uuid primary key); create table users(id uuid primary key); insert into workspaces values ('${workspaceId}'),('${otherWorkspace}'); insert into users values ('${userId}');`,
  );
  await pg.exec(
    await readFile(
      "migrations/20261114114656_social_account_research/migration.sql",
      "utf8",
    ),
  );
  await saveResearchConnection({
    workspaceId,
    connectedByUserId: userId,
    accessTokenSealed: sealResearchToken({
      workspaceId,
      token: "test-token",
      key,
    }),
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    scopes: ["pages_read_engagement"],
    sources: [],
  });
}, 30000);
afterAll(() => pg.close());
async function account(identifier: string) {
  const result = await addResearchAccount({
    workspaceId,
    createdByUserId: userId,
    platform: "facebook",
    identifier,
    name: "Page",
    notes: "Learn hooks",
  });
  if (!result) throw new Error("FIXTURE_ACCOUNT");
  return result;
}
async function claim(accountId: string, requestId = randomUUID()) {
  const connection = await getResearchConnection(workspaceId);
  return {
    requestId,
    result: await claimResearchRefresh({
      workspaceId,
      accountId,
      requestId,
      sourceId: null,
      connectionRevision: connection!.revision,
    }),
  };
}
describe("isolated PostgreSQL research storage", () => {
  it("encrypts and tenant-binds credentials and strips secrets from browser views", async () => {
    const connection = await getResearchConnection(workspaceId);
    expect(connection?.accessTokenSealed).not.toContain("test-token");
    expect(
      openResearchToken({
        workspaceId,
        sealed: connection!.accessTokenSealed!,
        key,
      }),
    ).toBe("test-token");
    expect(() =>
      openResearchToken({
        workspaceId: otherWorkspace,
        sealed: connection!.accessTokenSealed!,
        key,
      }),
    ).toThrow("RESEARCH_TOKEN_TENANT_MISMATCH");
    expect(JSON.stringify(researchConnectionView(connection))).not.toContain(
      "sealed",
    );
    expect(await getResearchConnection(otherWorkspace)).toBeNull();
  });
  it("keeps identities unique within, but independent across, workspaces", async () => {
    const first = await account("123");
    expect(
      await addResearchAccount({
        workspaceId,
        createdByUserId: userId,
        platform: "facebook",
        identifier: "123",
        name: "Duplicate",
        notes: "",
      }),
    ).toBeNull();
    const second = await addResearchAccount({
      workspaceId: otherWorkspace,
      createdByUserId: userId,
      platform: "facebook",
      identifier: "123",
      name: "Other",
      notes: "",
    });
    expect(second?.id).not.toBe(first.id);
    expect(await findResearchAccount(otherWorkspace, first.id)).toBeNull();
  });
  it("claims once, persists results atomically, and isolates snapshot reads", async () => {
    const row = await account("124");
    const operation = await claim(row.id);
    expect(operation.result).toBe(true);
    expect((await claim(row.id, operation.requestId)).result).toBe(false);
    expect((await claim(row.id)).result).toBe(false);
    expect(
      await finishResearchRefresh({
        workspaceId,
        requestId: operation.requestId,
        data,
        safeError: null,
      }),
    ).toBe(true);
    expect(
      await finishResearchRefresh({
        workspaceId,
        requestId: operation.requestId,
        data,
        safeError: null,
      }),
    ).toBe(false);
    expect(
      (await findResearchOperation(workspaceId, operation.requestId))?.status,
    ).toBe("succeeded");
    expect(
      await findResearchOperation(otherWorkspace, operation.requestId),
    ).toBeNull();
    expect(await listResearchSnapshots(otherWorkspace, row.id)).toEqual([]);
    expect(
      (await listResearchSnapshots(workspaceId, row.id))[0]?.data?.followers,
    ).toBe(100);
  });
  it("preserves the successful snapshot when a later attempt fails", async () => {
    const row = await account("125");
    const first = await claim(row.id);
    await finishResearchRefresh({
      workspaceId,
      requestId: first.requestId,
      data,
      safeError: null,
    });
    await pg.query(
      "update social_research_accounts set last_requested_at=now()-interval '2 minutes' where id=$1",
      [row.id],
    );
    const second = await claim(row.id);
    expect(second.result).toBe(true);
    await finishResearchRefresh({
      workspaceId,
      requestId: second.requestId,
      data: null,
      safeError: "Meta approval required",
    });
    expect(await listResearchSnapshots(workspaceId, row.id)).toHaveLength(1);
    expect((await findResearchAccount(workspaceId, row.id))?.lastError).toBe(
      "Meta approval required",
    );
    expect(
      (await findResearchAccount(workspaceId, row.id))?.refreshedAt,
    ).not.toBeNull();
  });
  it("rejects tenant-forged snapshot/account references at the database boundary", async () => {
    const row = await account("126");
    await expect(
      pg.query(
        "insert into social_research_snapshots(id,workspace_id,account_id,status,connection_revision) values($1,$2,$3,'running',1)",
        [randomUUID(), otherWorkspace, row.id],
      ),
    ).rejects.toThrow();
  });
  it("rejects inconsistent status/data and invalid Page identities", async () => {
    const row = await account("127");
    await expect(
      pg.query(
        "insert into social_research_snapshots(id,workspace_id,account_id,status,connection_revision) values($1,$2,$3,'succeeded',1)",
        [randomUUID(), workspaceId, row.id],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        "insert into social_research_accounts(workspace_id,platform,identifier,name) values($1,'facebook','not-a-page-id','Bad')",
        [workspaceId],
      ),
    ).rejects.toThrow();
  });
  it("archives with revision protection and restores the same identity/history", async () => {
    const row = await account("128");
    expect(
      await archiveResearchAccount({
        workspaceId: otherWorkspace,
        accountId: row.id,
        version: row.version,
      }),
    ).toBe(false);
    expect(
      await archiveResearchAccount({
        workspaceId,
        accountId: row.id,
        version: row.version + 1,
      }),
    ).toBe(false);
    expect(
      await archiveResearchAccount({
        workspaceId,
        accountId: row.id,
        version: row.version,
      }),
    ).toBe(true);
    expect(await findResearchAccount(workspaceId, row.id)).toBeNull();
    const restored = await addResearchAccount({
      workspaceId,
      createdByUserId: userId,
      platform: "facebook",
      identifier: "128",
      name: "Restored",
      notes: "",
    });
    expect(restored?.id).toBe(row.id);
    expect(restored?.version).toBe(row.version + 2);
  });
  it("permanently deletes every research record, isolates tenants and rejects late refresh results", async () => {
    const target = await account("131");
    const other = await account("132");
    const running = await claim(target.id);
    const otherOperation = await claim(other.id);
    expect(running.result).toBe(true);
    expect(otherOperation.result).toBe(true);
    const completedId = randomUUID(),
      failedId = randomUUID();
    await pg.query(
      `insert into social_research_snapshots(id,workspace_id,account_id,status,connection_revision,data,completed_at,safe_error) values ($1,$2,$3,'succeeded',1,$4::jsonb,now(),null),($5,$2,$3,'failed',1,null,now(),'failed transfer')`,
      [completedId, workspaceId, target.id, JSON.stringify(data), failedId],
    );
    const beforeGrant = await getResearchConnection(workspaceId);
    expect(
      await deleteResearchAccount({
        workspaceId: otherWorkspace,
        accountId: target.id,
        version: target.version,
      }),
    ).toBe(false);
    expect(
      await deleteResearchAccount({
        workspaceId,
        accountId: target.id,
        version: target.version + 1,
      }),
    ).toBe(false);
    expect(
      (
        await pg.query<{ count: number }>(
          `select count(*)::int as count from social_research_snapshots where account_id=$1`,
          [target.id],
        )
      ).rows[0]?.count,
    ).toBe(3);
    expect(
      await deleteResearchAccount({
        workspaceId,
        accountId: target.id,
        version: target.version,
      }),
    ).toBe(true);
    expect(await findResearchAccount(workspaceId, target.id)).toBeNull();
    for (const id of [running.requestId, completedId, failedId])
      expect(await findResearchOperation(workspaceId, id)).toBeNull();
    expect(await listResearchSnapshots(workspaceId, target.id)).toEqual([]);
    expect(
      await finishResearchRefresh({
        workspaceId,
        requestId: running.requestId,
        data,
        safeError: null,
      }),
    ).toBe(false);
    expect(
      await finishResearchRefresh({
        workspaceId,
        requestId: running.requestId,
        data: null,
        safeError: "late error",
      }),
    ).toBe(false);
    expect((await claim(target.id)).result).toBe(false);
    expect(await findResearchAccount(workspaceId, other.id)).not.toBeNull();
    expect(
      await findResearchOperation(workspaceId, otherOperation.requestId),
    ).not.toBeNull();
    expect(await getResearchConnection(workspaceId)).toEqual(beforeGrant);
    const replacement = await account("131");
    expect(replacement.id).not.toBe(target.id);
    expect(await listResearchSnapshots(workspaceId, replacement.id)).toEqual(
      [],
    );
  });
  it("rolls back observation removal if deleting the parent account fails", async () => {
    const target = await account("134");
    const running = await claim(target.id);
    await pg.exec(
      `create function reject_research_test_delete() returns trigger language plpgsql as $$begin raise exception 'test delete failure'; end;$$; create trigger reject_research_test_delete before delete on social_research_accounts for each row when(old.id='${target.id}'::uuid) execute function reject_research_test_delete();`,
    );
    try {
      await expect(
        deleteResearchAccount({
          workspaceId,
          accountId: target.id,
          version: target.version,
        }),
      ).rejects.toThrow();
      expect(await findResearchAccount(workspaceId, target.id)).not.toBeNull();
      expect(
        await findResearchOperation(workspaceId, running.requestId),
      ).not.toBeNull();
    } finally {
      await pg.exec(
        "drop trigger reject_research_test_delete on social_research_accounts; drop function reject_research_test_delete();",
      );
    }
  });
  it("can permanently remove a previously archived research account", async () => {
    const target = await account("133");
    expect(
      await archiveResearchAccount({
        workspaceId,
        accountId: target.id,
        version: target.version,
      }),
    ).toBe(true);
    expect(
      await deleteResearchAccount({
        workspaceId,
        accountId: target.id,
        version: target.version + 1,
      }),
    ).toBe(true);
    expect(
      (
        await pg.query(`select id from social_research_accounts where id=$1`, [
          target.id,
        ])
      ).rows,
    ).toEqual([]);
  });
  it("source repair is tenant/revision guarded and preserves credential and scopes", async () => {
    const before = await getResearchConnection(workspaceId);
    expect(before).not.toBeNull();
    const sources = [{ id: "42", username: "verified" }];
    expect(
      await replaceResearchSources({
        workspaceId: otherWorkspace,
        revision: before!.revision,
        sources,
      }),
    ).toBe(false);
    expect(
      await replaceResearchSources({
        workspaceId,
        revision: before!.revision + 1,
        sources,
      }),
    ).toBe(false);
    expect(
      await replaceResearchSources({
        workspaceId,
        revision: before!.revision,
        sources,
      }),
    ).toBe(true);
    const after = await getResearchConnection(workspaceId);
    expect(after?.sources).toEqual(sources);
    expect(after?.revision).toBe(before!.revision + 1);
    expect(after?.accessTokenSealed).toBe(before!.accessTokenSealed);
    expect(after?.scopes).toEqual(before!.scopes);
    expect(after?.expiresAt).toEqual(before!.expiresAt);
  });
  it("disconnect blocks late results and future claims, while preserving prior snapshots", async () => {
    const row = await account("129");
    const operation = await claim(row.id);
    expect(operation.result).toBe(true);
    await disconnectResearchConnection(workspaceId);
    expect(
      await finishResearchRefresh({
        workspaceId,
        requestId: operation.requestId,
        data,
        safeError: null,
      }),
    ).toBe(false);
    expect(
      await finishResearchRefresh({
        workspaceId,
        requestId: operation.requestId,
        data: null,
        safeError: "Disconnected",
      }),
    ).toBe(true);
    const next = await account("130");
    expect((await claim(next.id)).result).toBe(false);
    expect(
      (await getResearchConnection(workspaceId))?.accessTokenSealed,
    ).toBeNull();
    expect(
      await replaceResearchSources({
        workspaceId,
        revision: (await getResearchConnection(workspaceId))!.revision,
        sources: [{ id: "42", username: "stale" }],
      }),
    ).toBe(false);
  });
});
