import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/Table";
import type { ResearchKeywordReport } from "@studio/contracts/social-research";
import { researchDate } from "@/lib/social/research/view";

export function ResearchKeywordResults({
  report,
}: {
  report: ResearchKeywordReport;
}) {
  const { coverage, filters } = report;
  const pageLink = (page: number) =>
    `/app/social/research/keywords?${new URLSearchParams({ ...filters, page: String(page) })}`;
  return (
    <section className="app-section" aria-label="Keyword research results">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Posts sampled", coverage.posts],
          ["Matching posts", coverage.matchedPosts],
          ["Posts with saved media evidence", coverage.mediaPosts],
        ].map(([label, value]) => (
          <div className="app-panel rounded-2xl border bg-card" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="app-panel app-section rounded-2xl border bg-card">
        <div className="app-heading">
          <h2 className="text-xl font-semibold">Terms in the sample</h2>
          <p className="text-sm text-muted-foreground">
            {coverage.accounts} active accounts · {coverage.observations}{" "}
            observations · {coverage.measuredPosts} posts with known
            likes/reactions and comments. Frequency is counted once per post.
          </p>
        </div>
        {report.terms.length ? (
          <Table className="min-w-[40rem]">
            <thead>
              <tr>
                <th className="p-3 text-left">Term</th>
                <th className="p-3 text-left">Posts</th>
                <th className="p-3 text-left">Accounts</th>
                <th className="p-3 text-left">Median interactions</th>
              </tr>
            </thead>
            <tbody>
              {report.terms.map((term) => (
                <tr key={term.term} className="border-t">
                  <td className="p-3">
                    <Link
                      className="font-medium underline underline-offset-4"
                      href={`/app/social/research/keywords?${new URLSearchParams({ ...filters, query: term.term, page: "1" })}`}
                    >
                      {term.term}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {term.kind}
                    </span>
                  </td>
                  <td className="p-3">
                    {term.postCount}
                    <span className="block text-xs text-muted-foreground">
                      {term.captionPostCount} caption · {term.mediaPostCount}{" "}
                      media
                    </span>
                  </td>
                  <td className="p-3">{term.accountCount}</td>
                  <td className="p-3">
                    {term.medianInteractions === null
                      ? "Unavailable"
                      : term.medianInteractions.toLocaleString()}
                    <span className="block text-xs text-muted-foreground">
                      {term.measuredPostCount} measured posts
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p
            role="status"
            className="rounded-xl border border-dashed p-6 text-muted-foreground"
          >
            No matching terms yet. Add and manually refresh a research account,
            or try another phrase. Missing evidence is not a zero-performance
            result.
          </p>
        )}
      </div>
      <div className="app-heading">
        <h2 className="text-xl font-semibold">Source posts</h2>
        <p className="text-sm text-muted-foreground">
          Caption excerpts and observed counts. Read the original post before
          drawing conclusions.
        </p>
      </div>
      <div className="app-grid xl:grid-cols-2">
        {report.posts.map((item) => (
          <article
            className="app-panel app-section min-w-0 rounded-2xl border bg-card"
            key={`${item.platform}:${item.post.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{item.accountName}</h3>
              <Badge variant="secondary">{item.platform}</Badge>
              <Badge variant="outline">{item.post.format}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Observed {researchDate(item.observedAt)} · Matched in{" "}
              {item.matchedIn.join(" and ")}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {item.post.text || "No caption available."}
            </p>
            <p className="text-sm text-muted-foreground">
              Likes/reactions: {item.post.likes ?? "unavailable"} · Comments:{" "}
              {item.post.comments ?? "unavailable"} · Shares:{" "}
              {item.post.shares ?? "unavailable"}
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <a
                href={item.post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Original post ↗
              </a>
              <Link
                href={`/app/social/research?account=${item.accountId}&observation=${item.snapshotId}`}
                className="underline underline-offset-4"
              >
                Saved observation
              </Link>
              {item.mediaOperationId ? (
                <Link
                  href={`/app/mcp/operations/${item.mediaOperationId}`}
                  className="underline underline-offset-4"
                >
                  Media findings
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <nav
        aria-label="Matching post pages"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <span className="text-sm text-muted-foreground">
          Page {filters.page} · Up to 10 source posts per page
        </span>
        <div className="flex gap-2">
          {filters.page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={pageLink(filters.page - 1)} />}
            >
              Previous
            </Button>
          ) : null}
          {report.hasMore ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={pageLink(filters.page + 1)} />}
            >
              Next
            </Button>
          ) : null}
        </div>
      </nav>
      <aside className="app-panel app-section rounded-2xl border border-amber-500/25 bg-amber-500/5">
        <h2 className="font-semibold">Coverage and limits</h2>
        <p className="text-sm">
          Observed between {coverage.oldestObservation ?? "not available"} and{" "}
          {coverage.newestObservation ?? "not available"}.
        </p>
        {coverage.accountsTruncated ||
        coverage.captionsTruncated ||
        coverage.providerHasMore ? (
          <p className="text-sm font-medium">
            Partial sample:{" "}
            {coverage.accountsTruncated ? "more than 20 accounts; " : ""}
            {coverage.captionsTruncated ? "some captions shortened; " : ""}
            {coverage.providerHasMore
              ? "Meta has additional posts outside the saved sample."
              : ""}
          </p>
        ) : null}
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {report.limitations.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
