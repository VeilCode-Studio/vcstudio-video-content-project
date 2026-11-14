import type {
  ResearchAccountView,
  ResearchConnectionView,
  ResearchSnapshotView,
} from "@studio/contracts/social-research";
import {
  researchSnapshotSchema,
  researchSourcesSchema,
} from "@studio/contracts/social-research";
import type {
  socialResearchAccounts,
  socialResearchConnections,
  socialResearchSnapshots,
} from "@/db/schema";

export function researchAccountView(
  row: typeof socialResearchAccounts.$inferSelect,
): ResearchAccountView {
  return {
    id: row.id,
    platform: row.platform,
    identifier: row.identifier,
    name: row.name,
    notes: row.notes,
    version: row.version,
    refreshedAt: row.refreshedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}
export function researchConnectionView(
  row: typeof socialResearchConnections.$inferSelect | null,
): ResearchConnectionView {
  return {
    connected: Boolean(
      row?.accessTokenSealed &&
      !row.revokedAt &&
      row.expiresAt &&
      row.expiresAt.getTime() > Date.now(),
    ),
    expiresAt: row?.expiresAt?.toISOString() ?? null,
    sources: researchSourcesSchema.parse(row?.sources ?? []),
    scopes: row?.scopes ?? [],
  };
}
export function researchSnapshotView(
  row: typeof socialResearchSnapshots.$inferSelect,
): ResearchSnapshotView {
  return {
    id: row.id,
    capturedAt: (row.completedAt ?? row.createdAt).toISOString(),
    data: researchSnapshotSchema.parse(row.data),
  };
}
export function researchDate(value: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
