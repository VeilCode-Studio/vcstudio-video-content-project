import { redirect } from "next/navigation";
import { z } from "zod";
import { researchKeywordInputSchema } from "@studio/contracts/social-research";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { loadResearchKeywordPage } from "@/lib/social/research/keyword-page";
import { ResearchKeywordWorkspace } from "@/components/social/research/ResearchKeywordWorkspace";

const querySchema = researchKeywordInputSchema.extend({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export default async function ResearchKeywordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthenticatedWorkspaceContext();
  if (!context) redirect("/onboarding");
  const parsed = querySchema.safeParse(await searchParams);
  const filters = parsed.success
    ? parsed.data
    : researchKeywordInputSchema.parse({});
  const data = parsed.success
    ? await loadResearchKeywordPage(
        context.activeMembership.workspaceId,
        filters,
      )
    : {
        report: null,
        accounts: [],
        error:
          "The filters are invalid. Use a valid account, a phrase up to 100 characters and a positive page number.",
      };
  return <ResearchKeywordWorkspace filters={filters} {...data} />;
}
