import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const pg = new PGlite();
const database = drizzle({ client: pg });
vi.mock("@/db/drizzle", () => ({ getDatabase: () => database }));
import {
  createResearchCategory,
  listResearchCategories,
  renameResearchCategory,
  deleteResearchCategory,
  assignResearchCategory,
} from "@/db/repositories/research-categories.repository";
import {
  addResearchAccount,
  findResearchAccount,
  listResearchAccounts,
} from "@/db/repositories/social-research.repository";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  await pg.exec(
    `create table workspaces(id uuid primary key); create table users(id uuid primary key); insert into workspaces values('${workspaceId}'),('${other}'); insert into users values('${user}');`,
  );
  for (const file of [
    "20261114114656_social_account_research",
    "20261126005534_social_research_categories",
  ])
    await pg.exec(await readFile(`migrations/${file}/migration.sql`, "utf8"));
}, 30000);
afterAll(() => pg.close());
async function category(name: string, workspace = workspaceId) {
  const row = await createResearchCategory({ workspaceId: workspace, name });
  if (!row) throw new Error("CATEGORY_FIXTURE");
  return row.id;
}
async function account(identifier: string, categoryId: string | null = null) {
  const row = await addResearchAccount({
    workspaceId,
    createdByUserId: user,
    platform: "instagram",
    identifier,
    name: identifier,
    notes: "",
    categoryId,
  });
  if (!row) throw new Error("ACCOUNT_FIXTURE");
  return row;
}
describe("research category PostgreSQL invariants", () => {
  it("seeds three defaults without assigning or altering existing accounts", async () => {
    expect(
      (await listResearchCategories(workspaceId)).map((row) => row.name),
    ).toEqual(["Competitors", "Industry insights", "Inspiration"]);
    expect(
      (await listResearchCategories(workspaceId)).every(
        (row) => row.accountCount === 0,
      ),
    ).toBe(true);
  });
  it("rejects case-insensitive duplicates within a tenant and allows the same name in another", async () => {
    await category("Finance");
    expect(
      await createResearchCategory({ workspaceId, name: "finance" }),
    ).toBeNull();
    expect(
      await createResearchCategory({ workspaceId: other, name: "Finance" }),
    ).not.toBeNull();
  });
  it("enforces trimmed nonempty bounded names and positive revisions at the database boundary", async () => {
    for (const name of ["", " ", " padded ", "x".repeat(81)])
      await expect(
        createResearchCategory({ workspaceId, name }),
      ).rejects.toThrow();
  });
  it("moves an account with revision protection, filters before pagination and counts across all rows", async () => {
    const id = await category("Focused");
    const row = await account("focused.account");
    expect(
      await assignResearchCategory({
        workspaceId,
        categoryId: id,
        accountId: row.id,
        version: row.version,
      }),
    ).not.toBeNull();
    expect(
      await assignResearchCategory({
        workspaceId,
        categoryId: null,
        accountId: row.id,
        version: row.version,
      }),
    ).toBeNull();
    expect(
      (await listResearchAccounts(workspaceId, 0, id)).map((item) => item.id),
    ).toEqual([row.id]);
    expect(await listResearchAccounts(workspaceId, 20, id)).toEqual([]);
    expect(
      (await listResearchAccounts(workspaceId, 0, "uncategorized")).some(
        (item) => item.id === row.id,
      ),
    ).toBe(false);
    expect(
      (await listResearchCategories(workspaceId)).find((item) => item.id === id)
        ?.accountCount,
    ).toBe(1);
  });
  it("rejects cross-workspace identifiers in assignment and direct inserts", async () => {
    const id = await category("Other tenant", other);
    const row = await account("isolated.account");
    expect(
      await assignResearchCategory({
        workspaceId,
        categoryId: id,
        accountId: row.id,
        version: row.version,
      }),
    ).toBeNull();
    expect(
      await assignResearchCategory({
        workspaceId: other,
        categoryId: null,
        accountId: row.id,
        version: row.version,
      }),
    ).toBeNull();
    await expect(account("forged.account", id)).rejects.toThrow();
  });
  it("requires matching category revision and tenant for rename and deletion", async () => {
    const id = await category("Rename me");
    expect(
      await renameResearchCategory({
        workspaceId: other,
        categoryId: id,
        version: 1,
        name: "Forged",
      }),
    ).toBeNull();
    expect(
      await renameResearchCategory({
        workspaceId,
        categoryId: id,
        version: 1,
        name: "Renamed",
      }),
    ).not.toBeNull();
    expect(
      await deleteResearchCategory({ workspaceId, categoryId: id, version: 1 }),
    ).toBeNull();
    expect(
      await deleteResearchCategory({ workspaceId, categoryId: id, version: 2 }),
    ).not.toBeNull();
  });
  it("removes only the category and preserves accounts and their saved history", async () => {
    const id = await category("Temporary folder");
    const row = await account("history.account", id);
    await pg.query(
      "insert into social_research_snapshots(id,workspace_id,account_id,status,connection_revision,data,completed_at) values(gen_random_uuid(),$1,$2,'succeeded',1,'{}',now())",
      [workspaceId, row.id],
    );
    expect(
      await deleteResearchCategory({ workspaceId, categoryId: id, version: 1 }),
    ).not.toBeNull();
    const saved = await findResearchAccount(workspaceId, row.id);
    expect(saved?.categoryId).toBeNull();
    expect(saved?.version).toBe(row.version + 1);
    expect(
      (
        await pg.query(
          "select id from social_research_snapshots where account_id=$1",
          [row.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("enforces the 50-category ceiling and reuses a removed slot", async () => {
    for (let i = 0; i < 55; i++)
      await createResearchCategory({ workspaceId: other, name: `Folder ${i}` });
    const rows = await listResearchCategories(other);
    expect(rows).toHaveLength(50);
    expect(
      await createResearchCategory({ workspaceId: other, name: "Overflow" }),
    ).toBeNull();
    await deleteResearchCategory({
      workspaceId: other,
      categoryId: rows[0].id,
      version: rows[0].version,
    });
    expect(
      await createResearchCategory({ workspaceId: other, name: "Reused slot" }),
    ).not.toBeNull();
  });
});
