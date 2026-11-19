import { ResearchKeywordWorkspace } from "@/components/social/research/ResearchKeywordWorkspace";
import {
  researchKeywordInputSchema,
  type ResearchKeywordSample,
} from "@studio/contracts/social-research";
import { researchKeywords } from "@/lib/social/research/keywords";

export function ResearchKeywordsHarness() {
  const params = new URLSearchParams(window.location.search);
  const accountId = "11111111-1111-4111-8111-111111111111";
  const filters = researchKeywordInputSchema.parse({
    query: params.get("query") ?? "",
  });
  const sample: ResearchKeywordSample = {
    accountId,
    accountName: "Example account",
    platform: "instagram",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    observedAt: "2026-11-19T10:00:00Z",
    hasMore: true,
    posts: Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      url: `https://www.instagram.com/p/post${i}/`,
      text: `Saving money and building better habits #Finance #Épargne ${i === 1 ? "unknownmetric" : ""}`,
      format: "carousel",
      publishedAt: null,
      likes: i ? null : 10,
      comments: 2,
      shares: null,
      textTruncated: false,
    })),
  };
  return (
    <main className="mx-auto min-w-0 max-w-7xl p-4 sm:p-8">
      <ResearchKeywordWorkspace
        filters={filters}
        report={
          params.has("error")
            ? null
            : researchKeywords(filters, params.has("empty") ? [] : [sample])
        }
        accounts={[{ id: accountId, name: "Example account" }]}
        error={
          params.has("error")
            ? "Saved research could not be loaded. Try again."
            : null
        }
      />
    </main>
  );
}
