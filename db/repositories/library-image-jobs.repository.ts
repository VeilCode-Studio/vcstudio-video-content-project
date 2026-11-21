import "server-only";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { getDatabase } from "@/db/drizzle";
import { libraryImageJobs, usageReservations, users } from "@/db/schema";
export async function findLibraryImageJob(workspaceId: string, id: string) {
  const [row] = await getDatabase()
    .select()
    .from(libraryImageJobs)
    .where(
      and(
        eq(libraryImageJobs.workspaceId, workspaceId),
        eq(libraryImageJobs.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}
export async function listLibraryImageJobs(
  workspaceId: string,
  before?: { createdAt: Date; id: string },
) {
  return getDatabase()
    .select()
    .from(libraryImageJobs)
    .where(
      and(
        eq(libraryImageJobs.workspaceId, workspaceId),
        before
          ? sql`(${libraryImageJobs.createdAt},${libraryImageJobs.id})<(${before.createdAt.toISOString()}::timestamptz,${before.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(libraryImageJobs.createdAt), desc(libraryImageJobs.id))
    .limit(20);
}
export async function findLibraryImageActor(id: string) {
  const [row] = await getDatabase()
    .select({ clerkUserId: users.clerkUserId })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}
export async function expiredLibraryImageJobs() {
  return getDatabase()
    .select({ job: libraryImageJobs })
    .from(libraryImageJobs)
    .innerJoin(
      usageReservations,
      and(
        eq(usageReservations.libraryImageJobId, libraryImageJobs.id),
        eq(usageReservations.workspaceId, libraryImageJobs.workspaceId),
      ),
    )
    .where(
      and(
        eq(usageReservations.status, "pending"),
        lte(usageReservations.expiresAt, new Date()),
      ),
    )
    .limit(50);
}

export async function findLibraryImageByKey(
  workspaceId: string,
  userId: string,
  key: string,
) {
  const [row] = await getDatabase()
    .select()
    .from(libraryImageJobs)
    .where(
      and(
        eq(libraryImageJobs.workspaceId, workspaceId),
        eq(libraryImageJobs.userId, userId),
        eq(libraryImageJobs.idempotencyKey, key),
      ),
    )
    .limit(1);
  return row ?? null;
}
