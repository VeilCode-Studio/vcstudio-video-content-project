import "server-only";
import { researchSelectionInputSchema } from "@studio/contracts/social-research";
import {
  findResearchAccount,
  listResearchSnapshots,
} from "@/db/repositories/social-research.repository";
import { researchAccountView, researchSnapshotView } from "./view";
import { SocialResearchError } from "./errors";

export async function loadResearchSelection(workspaceId: string, raw: unknown) {
  const input = researchSelectionInputSchema.parse(raw);
  const account = await findResearchAccount(workspaceId, input.accountId);
  if (!account)
    throw new SocialResearchError(
      "access",
      "This research account is no longer available in your workspace.",
    );
  const rows = await listResearchSnapshots(
    workspaceId,
    account.id,
    input.historyPage * 10,
  );
  return {
    selected: researchAccountView(account),
    snapshots: rows.slice(0, 10).map(researchSnapshotView),
    hasMoreSnapshots: rows.length > 10,
    historyPage: input.historyPage,
    observationId: input.observationId ?? null,
  };
}
