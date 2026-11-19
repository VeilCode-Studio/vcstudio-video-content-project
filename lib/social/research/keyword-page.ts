import "server-only";
import type { ResearchKeywordInput } from "@studio/contracts/social-research";
import {
  findResearchAccount,
  listResearchAccounts,
} from "@/db/repositories/social-research.repository";
import { isSocialResearchEnabled } from "./environment";
import { loadResearchKeywords } from "./keyword-service";
import { SocialResearchError } from "./errors";

export async function loadResearchKeywordPage(
  workspaceId: string,
  filters: ResearchKeywordInput,
) {
  if (!isSocialResearchEnabled())
    return {
      report: null,
      accounts: [],
      error: "Social research is disabled on this deployment.",
    };
  try {
    const [report, rows] = await Promise.all([
      loadResearchKeywords(workspaceId, filters),
      listResearchAccounts(workspaceId),
    ]);
    const accounts = rows.slice(0, 20).map(({ id, name }) => ({ id, name }));
    if (
      filters.accountId !== "all" &&
      !accounts.some((item) => item.id === filters.accountId)
    ) {
      const selected = await findResearchAccount(
        workspaceId,
        filters.accountId,
      );
      if (selected) accounts.push({ id: selected.id, name: selected.name });
    }
    return { report, accounts, error: null };
  } catch (error) {
    if (!(error instanceof SocialResearchError))
      console.error("SOCIAL_RESEARCH_KEYWORDS_LOAD_FAILED", { workspaceId });
    return {
      report: null,
      accounts: [],
      error:
        error instanceof SocialResearchError
          ? error.message
          : "Saved research could not be loaded. Try again, or refresh the account observation from Account research.",
    };
  }
}
