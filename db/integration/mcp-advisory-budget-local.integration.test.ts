import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { mcpAdvisoryBudgetSql } from "@/db/commands/mcp-advisory-budget-sql";
const pg = new PGlite();
const workspaceId = randomUUID(),
  userId = randomUUID(),
  projectId = randomUUID(),
  operationId = randomUUID();
beforeAll(async () => {
  await pg.exec(
    "create table mcp_operations(id uuid,workspace_id uuid,user_id uuid,kind text,status text,input jsonb,expires_at timestamptz)",
  );
  await pg.query(
    "insert into mcp_operations values($1,$2,$3,'generate_media','approved',$4::jsonb,now()+interval '1 hour')",
    [
      operationId,
      workspaceId,
      userId,
      JSON.stringify({ budgetPolicy: "advisory", request: { projectId } }),
    ],
  );
});
afterAll(() => pg.close());
async function eligible(
  overrides: Partial<Parameters<typeof mcpAdvisoryBudgetSql>[0]> = {},
) {
  const q = new PgDialect().sqlToQuery(
    sql`select ${mcpAdvisoryBudgetSql({ workspaceId, operationId, userId, projectId, ...overrides })} allowed`,
  );
  return (await pg.query<{ allowed: boolean }>(q.sql, q.params)).rows[0]
    .allowed;
}
it("requires an exact workspace, user, project and operation link", async () => {
  expect(await eligible()).toBe(true);
  for (const key of [
    "workspaceId",
    "operationId",
    "userId",
    "projectId",
  ] as const)
    expect(await eligible({ [key]: randomUUID() })).toBe(false);
  expect(await eligible({ operationId: undefined })).toBe(false);
});
it("never treats unapproved, expired or ordinary operations as advisory", async () => {
  await pg.query("update mcp_operations set status='prepared'");
  expect(await eligible()).toBe(false);
  await pg.query(
    "update mcp_operations set status='approved',expires_at=now()-interval '1 second'",
  );
  expect(await eligible()).toBe(false);
  await pg.query(
    "update mcp_operations set expires_at=now()+interval '1 hour',input='{}'",
  );
  expect(await eligible()).toBe(false);
});
