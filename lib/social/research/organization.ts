import type { ResearchCategoryFilter } from "@studio/contracts/research-categories";

export function researchAccountsHref(input: {
  category?: ResearchCategoryFilter;
  page?: number;
  accountId?: string;
  historyPage?: number;
  observationId?: string;
}) {
  const query = new URLSearchParams();
  if (input.category && input.category !== "all")
    query.set("category", input.category);
  if (input.page) query.set("page", String(input.page));
  if (input.accountId) query.set("account", input.accountId);
  if (input.historyPage) query.set("historyPage", String(input.historyPage));
  if (input.observationId) query.set("observation", input.observationId);
  return `/app/social/research${query.size ? `?${query}` : ""}`;
}
