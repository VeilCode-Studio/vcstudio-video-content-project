import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const pg = new PGlite();
beforeAll(async () => {
  await pg.exec(
    `create type content_platform as enum ('youtube','linkedin'); create table social_posts(id int primary key, name text); create table social_post_targets(id int primary key, platform content_platform, status text); insert into social_posts values(1,'Existing post'); insert into social_post_targets values(1,'linkedin','published');`,
  );
  const migration = await readFile(
    "migrations/20261121051458_pinterest_publishing/migration.sql",
    "utf8",
  );
  const constraints = await readFile(
    "migrations/20261121051858_pinterest_settings_constraints/migration.sql",
    "utf8",
  );
  await pg.transaction(async (tx) => {
    await tx.exec(migration);
    await tx.exec(constraints);
  });
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("Pinterest additive migration", () => {
  it("preserves existing posts and publication outcomes", async () => {
    expect(
      (await pg.query("select * from social_posts where id=1")).rows,
    ).toEqual([{ id: 1, name: "Existing post", pinterest_settings: null }]);
    expect(
      (
        await pg.query(
          "select status,pinterest_settings from social_post_targets where id=1",
        )
      ).rows,
    ).toEqual([{ status: "published", pinterest_settings: null }]);
  });
  it("accepts Pinterest targets only with object settings", async () => {
    await pg.exec(
      `insert into social_post_targets values(2,'pinterest','pending','{"boardId":"42"}');`,
    );
    await expect(
      pg.exec(
        "insert into social_post_targets values(3,'pinterest','pending',null)",
      ),
    ).rejects.toThrow();
    await expect(
      pg.exec(
        `insert into social_post_targets values(4,'pinterest','pending','[]')`,
      ),
    ).rejects.toThrow();
  });
  it("rejects Pinterest settings on other platform targets", async () => {
    await expect(
      pg.exec(
        `insert into social_post_targets values(5,'youtube','pending','{}')`,
      ),
    ).rejects.toThrow();
  });
  it("rejects malformed post settings while allowing legacy nulls", async () => {
    await expect(
      pg.exec(`update social_posts set pinterest_settings='[]' where id=1`),
    ).rejects.toThrow();
    await pg.exec(
      `update social_posts set pinterest_settings='{"11111111-1111-4111-8111-111111111111":{"boardId":"42"}}' where id=1`,
    );
    expect(
      (await pg.query("select name from social_posts where id=1")).rows,
    ).toEqual([{ name: "Existing post" }]);
  });
});
