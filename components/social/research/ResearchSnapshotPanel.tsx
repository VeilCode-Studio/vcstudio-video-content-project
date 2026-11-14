"use client";
import { useState, useTransition } from "react";
import type { ResearchSnapshotView } from "@studio/contracts/social-research";
import { BarChart3Icon, ExternalLinkIcon, LightbulbIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ResearchPostCard } from "./ResearchPostCard";
import { analyzeResearchSnapshots } from "@/lib/social/research/analysis";
import { researchDate } from "@/lib/social/research/view";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/Alert";
import { Loader2Icon, ImagesIcon, UserRoundIcon } from "lucide-react";
import { loadResearchPreviewsAction } from "@/app/(authenticated)/app/social/research/actions";
import type { ResearchPreviews } from "@studio/contracts/social-research-previews";

export function ResearchSnapshotPanel({
  snapshot,
  previous,
  canLoadPreviews = false,
}: {
  snapshot: ResearchSnapshotView;
  previous?: ResearchSnapshotView;
  canLoadPreviews?: boolean;
}) {
  const [previews, setPreviews] = useState<ResearchPreviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const analysis = analyzeResearchSnapshots(snapshot, previous);
  const data = snapshot.data;
  return (
    <div className="app-section min-w-0">
      <section className="app-panel app-section rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-14 shrink-0">
              {previews?.profileImageUrl ? (
                <AvatarImage
                  src={previews.profileImageUrl}
                  alt={`${data.name} profile photo`}
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <AvatarFallback>
                <UserRoundIcon aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div className="app-heading min-w-0">
              <h3 className="break-words text-lg font-semibold">{data.name}</h3>
              <p className="text-xs text-muted-foreground">
                Observed {researchDate(snapshot.capturedAt)}
              </p>
            </div>
          </div>
          <Badge variant="secondary">Saved Meta snapshot</Badge>
        </div>
        {data.biography ? (
          <p className="break-words text-sm text-muted-foreground">
            {data.biography}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Meta did not expose an account bio in this observation.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!canLoadPreviews || pending}
            aria-busy={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                try {
                  const result = await loadResearchPreviewsAction({
                    snapshotId: snapshot.id,
                  });
                  if (result.ok) setPreviews(result.data);
                  else setError(result.error);
                } catch {
                  setError(
                    "Previews could not load. Try again or open the original post; your saved research is unchanged.",
                  );
                }
              });
            }}
          >
            {pending ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <ImagesIcon aria-hidden="true" />
            )}
            {pending
              ? "Loading previews…"
              : previews
                ? "Reload media previews"
                : "Load media previews"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {canLoadPreviews
              ? "Loads profile photo and post media directly from Meta. No media copies are stored. Videos load only when requested."
              : "An owner/editor with active Meta research access can load previews."}
          </p>
        </div>
        {error ? (
          <Alert variant="destructive">
            <p className="col-start-2">{error}</p>
          </Alert>
        ) : null}
        {previews ? (
          <p role="status" className="text-xs text-muted-foreground">
            Previews fetched {researchDate(previews.fetchedAt)}. Links can
            expire; reload them if needed. Saved metrics and bio remain from
            this observation.
            {!previews.profileImageUrl
              ? " Profile photo was not available from Meta."
              : ""}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Followers</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {data.followers?.toLocaleString("en-US") ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sampled posts</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {data.posts.length}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / 25 max
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              With engagement counts
            </dt>
            <dd className="mt-1 text-2xl font-semibold">
              {analysis.measurablePosts}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Follower change</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {analysis.followerChange === null
                ? "—"
                : `${analysis.followerChange > 0 ? "+" : ""}${analysis.followerChange.toLocaleString("en-US")}`}
            </dd>
          </div>
        </dl>
        {previous && analysis.followerChange !== null ? (
          <p className="text-xs text-muted-foreground">
            Follower change since {researchDate(previous.capturedAt)}; it is not
            a growth rate or attributable to a particular post.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Follower change needs two snapshots with an exposed follower count
            for the same account.
          </p>
        )}
        {analysis.oldestPost && analysis.newestPost ? (
          <p className="text-xs text-muted-foreground">
            Post sample: {researchDate(analysis.oldestPost)} to{" "}
            {researchDate(analysis.newestPost)}.{" "}
            {data.hasMore
              ? "More posts exist; this sample is incomplete."
              : "This is the exposed sample, not a guarantee of complete account history."}
          </p>
        ) : null}
        <a
          href={data.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
        >
          Open account
          <ExternalLinkIcon className="size-3.5" />
        </a>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
      <section className="app-panel app-section rounded-2xl border bg-card">
        <h3 className="flex items-center gap-2 font-semibold">
          <BarChart3Icon className="size-4" />
          Format comparison
        </h3>
        <p className="text-sm text-muted-foreground">
          Median {data.platform === "facebook" ? "reactions" : "likes"} +
          comments within this account’s sample. Shares are separate. Missing
          metrics are excluded; small samples are exploratory.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 pr-4 font-medium">Format</th>
                <th className="px-3 py-3 font-medium">Posts</th>
                <th className="px-3 py-3 font-medium">Measured</th>
                <th className="py-3 pl-3 font-medium">Median engagement</th>
              </tr>
            </thead>
            <tbody>
              {analysis.formats.map((format) => (
                <tr key={format.format} className="border-b last:border-0">
                  <td className="py-3 pr-4">{format.format}</td>
                  <td className="px-3 py-3">{format.count}</td>
                  <td className="px-3 py-3">{format.measuredCount}</td>
                  <td className="py-3 pl-3">
                    {format.median?.toLocaleString("en-US") ?? "Unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="app-panel app-section rounded-2xl border bg-accent/30">
        <h3 className="flex items-center gap-2 font-semibold">
          <LightbulbIcon className="size-4" />
          What to learn and test
        </h3>
        {analysis.lessons.length ? (
          analysis.lessons.map((lesson) => (
            <div className="app-section" key={lesson.url}>
              <h4 className="text-sm font-medium">{lesson.title}</h4>
              <p className="text-sm text-muted-foreground">{lesson.detail}</p>
              <a
                href={lesson.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-4"
              >
                Inspect the evidence ↗
              </a>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            There are not enough exposed engagement counts to rank posts. Review
            the actual posts before drawing conclusions.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Posting time, audience size and content quality can all affect
          results. This data cannot prove the best time to post or guarantee
          your performance. No paid AI analysis runs here.
        </p>
      </section>
      <section className="app-section">
        <h3 className="font-semibold">Observed posts</h3>
        {data.posts.length ? (
          <div className="app-grid grid-cols-1 xl:grid-cols-2">
            {data.posts.map((post, index) => (
              <ResearchPostCard
                key={post.id}
                post={post}
                index={index}
                facebook={data.platform === "facebook"}
                previews={previews}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No posts were returned in this observation. This may reflect Meta’s
            access limits.
          </p>
        )}
      </section>
    </div>
  );
}
