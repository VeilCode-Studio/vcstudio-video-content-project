import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ResearchKeywordInput,
  ResearchKeywordReport,
} from "@studio/contracts/social-research";
import { ResearchKeywordForm } from "./ResearchKeywordForm";
import { ResearchKeywordResults } from "./ResearchKeywordResults";

export function ResearchKeywordWorkspace({
  filters,
  report,
  accounts,
  error,
}: {
  filters: ResearchKeywordInput;
  report: ResearchKeywordReport | null;
  accounts: { id: string; name: string }[];
  error: string | null;
}) {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="app-heading">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Social · Intelligence
            </span>
            <Badge
              variant="outline"
              className="border-sky-500/25 bg-sky-500/15 text-sky-800 dark:text-sky-200"
            >
              Saved evidence
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Keyword research
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Discover the words and hashtags appearing in your research accounts’
            content. Compare observed engagement and trace each idea to its
            source.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/app/social/research" />}
        >
          Account research
        </Button>
      </header>
      {error ? (
        <div
          role="alert"
          className="app-panel rounded-2xl border border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200"
        >
          <h2 className="font-semibold">Research could not be loaded</h2>
          <p className="mt-2 text-sm">{error}</p>
          <Link
            href="/app/social/research/keywords"
            className="mt-3 inline-block text-sm underline"
          >
            Reset filters and try again
          </Link>
        </div>
      ) : null}
      <ResearchKeywordForm
        key={JSON.stringify(filters)}
        filters={filters}
        accounts={accounts}
      />
      {report ? <ResearchKeywordResults report={report} /> : null}
    </div>
  );
}
