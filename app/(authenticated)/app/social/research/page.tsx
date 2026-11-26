import { redirect } from "next/navigation";
import { z } from "zod";
import { researchCategoryFilterSchema } from "@studio/contracts/research-categories";
import { listResearchCategories } from "@/db/repositories/research-categories.repository";
import { researchAuthorizationFailureSchema } from "@studio/contracts/social-research";
import { ResearchWorkspace } from "@/components/social/research/ResearchWorkspace";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { can } from "@/lib/policies/workspace-policy";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import {
  findResearchAccount,
  getResearchConnection,
  listResearchAccounts,
  listResearchSnapshots,
} from "@/db/repositories/social-research.repository";
import {
  researchAccountView,
  researchConnectionView,
  researchSnapshotView,
} from "@/lib/social/research/view";

const querySchema = z.object({
  category: researchCategoryFilterSchema.catch("all").default("all"),
  account: z.uuid().optional().catch(undefined),
  observation: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(0).max(1000).catch(0).default(0),
  historyPage: z.coerce.number().int().min(0).max(1000).catch(0).default(0),
  failure: researchAuthorizationFailureSchema.optional().catch(undefined),
  reference: z.uuid().optional().catch(undefined),
  authorization: z
    .enum(["connected", "cancelled", "failed", "invalid"])
    .optional()
    .catch(undefined),
});

export default async function SocialResearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthenticatedWorkspaceContext();
  if (!context) redirect("/onboarding");
  const query = querySchema.parse(await searchParams);
  const enabled = isSocialResearchEnabled();
  const workspaceId = context.activeMembership.workspaceId;
  // Disabled deployments must not query the new tables or the paused Marketing subsystem.
  const [rows, connection, categories] = enabled
    ? await Promise.all([
        listResearchAccounts(workspaceId, query.page * 20, query.category),
        getResearchConnection(workspaceId),
        listResearchCategories(workspaceId),
      ])
    : [[], null, []];
  const accounts = rows.slice(0, 20);
  const selected =
    enabled && query.account
      ? await findResearchAccount(workspaceId, query.account)
      : (accounts[0] ?? null);
  const snapshots = selected
    ? await listResearchSnapshots(
        workspaceId,
        selected.id,
        query.historyPage * 10,
      )
    : [];
  return (
    <ResearchWorkspace
      enabled={enabled}
      canManage={can(context.activeMembership.role, "manageSettings")}
      canResearch={can(context.activeMembership.role, "researchSocialAccounts")}
      connection={researchConnectionView(connection)}
      accounts={accounts.map(researchAccountView)}
      categories={categories}
      categoryFilter={query.category}
      selected={selected ? researchAccountView(selected) : null}
      snapshots={snapshots.slice(0, 10).map(researchSnapshotView)}
      observationId={query.observation ?? null}
      page={query.page}
      historyPage={query.historyPage}
      hasMoreAccounts={rows.length > 20}
      hasMoreSnapshots={snapshots.length > 10}
      authorization={query.authorization ?? null}
      authorizationFailure={query.failure ?? null}
      authorizationReference={query.reference ?? null}
    />
  );
}
