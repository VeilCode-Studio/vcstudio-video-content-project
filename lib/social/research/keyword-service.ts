import "server-only";
import {
  researchKeywordInputSchema,
  researchKeywordSampleSchema,
  researchKeywordMediaSchema,
} from "@studio/contracts/social-research";
import {
  listResearchKeywordSamples,
  listResearchKeywordMedia,
} from "@/db/repositories/research-keywords.repository";
import { findResearchAccount } from "@/db/repositories/social-research.repository";
import { isSocialResearchEnabled } from "./environment";
import { SocialResearchError } from "./errors";
import { researchKeywords } from "./keywords";

/** Caller resolves current membership/Read scope. All reads remain workspace-scoped. */
export async function loadResearchKeywords(workspaceId: string, raw: unknown) {
  const filters = researchKeywordInputSchema.parse(raw);
  if (!isSocialResearchEnabled())
    throw new SocialResearchError(
      "configuration",
      "Social research is disabled.",
    );
  if (
    filters.accountId !== "all" &&
    !(await findResearchAccount(workspaceId, filters.accountId))
  )
    throw new SocialResearchError(
      "access",
      "That research account is unavailable in this workspace.",
    );
  const samples = (await listResearchKeywordSamples(workspaceId, filters)).map(
    (row) => researchKeywordSampleSchema.parse(row.sample),
  );
  const ids = samples
    .slice(0, 20)
    .flatMap((item) => (item.snapshotId ? [item.snapshotId] : []));
  const analyses =
    filters.media === "captions_and_media"
      ? (await listResearchKeywordMedia(workspaceId, ids)).map((row) =>
          researchKeywordMediaSchema.parse(row.media),
        )
      : [];
  return researchKeywords(filters, samples, analyses);
}
