"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  BinocularsIcon,
  Clock3Icon,
  ChevronDownIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  archiveResearchAccountAction,
  refreshResearchAccountAction,
} from "@/app/(authenticated)/app/social/research/actions";
import type {
  ResearchAccountView,
  ResearchConnectionView,
  ResearchSnapshotView,
  ResearchAuthorizationFailure,
} from "@studio/contracts/social-research";
import { ResearchConnectionPanel } from "./ResearchConnectionPanel";
import { ResearchAccountForm } from "./ResearchAccountForm";
import { ResearchSnapshotPanel } from "./ResearchSnapshotPanel";
import { researchDate } from "@/lib/social/research/view";
import { ResearchAuthorizationFeedback } from "./ResearchAuthorizationFeedback";
import { DeleteResearchAccountDialog } from "./DeleteResearchAccountDialog";

export type ResearchWorkspaceProps = {
  enabled: boolean;
  canManage: boolean;
  canResearch: boolean;
  connection: ResearchConnectionView;
  accounts: ResearchAccountView[];
  selected: ResearchAccountView | null;
  snapshots: ResearchSnapshotView[];
  observationId: string | null;
  page: number;
  historyPage: number;
  hasMoreAccounts: boolean;
  hasMoreSnapshots: boolean;
  authorization: "connected" | "cancelled" | "failed" | "invalid" | null;
  authorizationFailure?: ResearchAuthorizationFailure | null;
  authorizationReference?: string | null;
};

export function ResearchWorkspace(props: ResearchWorkspaceProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const requestId = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [source, setSource] = useState(props.connection.sources[0]?.id ?? "");
  const sourceId = props.connection.sources.some((item) => item.id === source)
    ? source
    : (props.connection.sources[0]?.id ?? "");
  const observationIndex = Math.max(
    0,
    props.snapshots.findIndex(
      (snapshot) => snapshot.id === props.observationId,
    ),
  );
  const snapshot = props.snapshots[observationIndex];
  const selected = props.selected;
  const refreshDisabled =
    !props.enabled ||
    !props.canResearch ||
    !props.connection.connected ||
    pending ||
    (selected?.platform === "instagram" && !sourceId);
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="app-heading">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Social · Intelligence
            </span>
            <Badge
              className="border-sky-500/25 bg-sky-500/15 text-sky-800 dark:text-sky-200"
              variant="outline"
            >
              <Clock3Icon />
              Manual refresh
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Account research
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Learn from the work other accounts share. Save real observations,
            compare their posts and turn evidence into your next experiment.
          </p>
        </div>
        {props.enabled && props.canResearch ? <ResearchAccountForm /> : null}
      </header>
      {props.authorization ? (
        <ResearchAuthorizationFeedback
          status={props.authorization}
          failure={props.authorizationFailure}
          reference={props.authorizationReference}
          canRetry={props.enabled && props.canManage}
        />
      ) : null}
      {!props.enabled ? (
        <p
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
        >
          Social research is not enabled on this deployment. Its database
          migration and read-only Meta authorization must be configured first.
          Marketing Studio remains paused.
        </p>
      ) : null}
      <ResearchConnectionPanel
        connection={props.connection}
        canManage={props.canManage}
        enabled={props.enabled}
      />
      <Collapsible className="app-panel rounded-2xl border bg-muted/20">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-between gap-3 whitespace-normal text-left"
            />
          }
        >
          What official Meta access can and cannot show
          <ChevronDownIcon className="size-4 shrink-0" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="mt-4 grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
            <p>
              <strong className="text-foreground">Instagram:</strong> public
              Business/Creator profiles and the media/counts Meta exposes
              through Business Discovery. Requires a professional source linked
              to a Facebook Page and eligible research permissions. Direct
              Instagram publishing consent alone is insufficient.
            </p>
            <p>
              <strong className="text-foreground">Facebook:</strong> public Page
              posts and counts when your app/token has access. Competitor Pages
              may require Page Public Content Access approval. Personal profiles
              and private content are excluded.
            </p>
            <p>
              Snapshots contain at most 25 exposed posts. Refreshes are manual,
              rate-limited and never run on a schedule. Stored counts are
              observations at a time, not lifetime performance guarantees.
            </p>
            <p>
              We do not have competitor private insights, conversions, saves,
              audience demographics or reliable reach. Missing values stay
              unavailable. Media stays on its source platform; research does not
              copy competitor files into your library.
            </p>
          </div>
        </CollapsiblePanel>
      </Collapsible>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <aside
          className="app-section min-w-0"
          aria-label="Saved research accounts"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Accounts of interest</h2>
            <Badge variant="secondary">
              {props.accounts.length} on this page
            </Badge>
          </div>
          {props.accounts.length ? (
            <nav className="flex flex-col gap-2" aria-label="Research accounts">
              {props.accounts.map((account) => (
                <Link
                  key={account.id}
                  href={`/app/social/research?account=${account.id}&page=${props.page}`}
                  aria-current={
                    selected?.id === account.id ? "page" : undefined
                  }
                  className={`flex min-w-0 flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-accent/40 ${selected?.id === account.id ? "border-primary/50 bg-accent/50" : "bg-card"}`}
                >
                  <span className="break-words font-medium">
                    {account.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{account.platform}</Badge>
                    <span className="break-all">
                      {account.platform === "instagram" ? "@" : "ID "}
                      {account.identifier}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {account.refreshedAt
                      ? `Observed ${researchDate(account.refreshedAt)}`
                      : "Not researched yet"}
                  </span>
                  {account.lastError ? (
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Access needs attention
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Save an account to begin. No monitoring or API requests start
              until you refresh it.
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            {props.page > 0 ? (
              <Link
                className="underline underline-offset-4"
                href={`/app/social/research?page=${props.page - 1}`}
              >
                Previous accounts
              </Link>
            ) : null}
            {props.hasMoreAccounts ? (
              <Link
                className="underline underline-offset-4"
                href={`/app/social/research?page=${props.page + 1}`}
              >
                Next accounts
              </Link>
            ) : null}
          </div>
        </aside>
        <section
          className="app-section min-w-0"
          aria-label="Account observations"
        >
          {selected ? (
            <>
              <header className="app-section">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="app-heading">
                    <h2 className="break-words text-xl font-semibold">
                      {selected.name}
                    </h2>
                    {selected.notes ? (
                      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {selected.notes}
                      </p>
                    ) : null}
                  </div>
                  {props.canResearch ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => setArchiveOpen(true)}
                      >
                        <ArchiveIcon />
                        Archive
                      </Button>
                      <DeleteResearchAccountDialog
                        key={selected.id}
                        account={selected}
                        disabled={pending}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  {selected.platform === "instagram" ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Label htmlFor="research-source">
                        Your authorized Instagram source
                      </Label>
                      <FormSelect
                        id="research-source"
                        value={sourceId || "none"}
                        onValueChange={setSource}
                        disabled={
                          pending || props.connection.sources.length === 0
                        }
                      >
                        {props.connection.sources.length ? (
                          props.connection.sources.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              @{item.username}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none">
                            No authorized source
                          </SelectItem>
                        )}
                      </FormSelect>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    className="h-10 shrink-0"
                    disabled={refreshDisabled}
                    aria-busy={pending}
                    onClick={() => {
                      if (busy.current) return;
                      busy.current = true;
                      setError(false);
                      setMessage(
                        "Requesting up to 25 exposed posts from Meta…",
                      );
                      requestId.current ??= crypto.randomUUID();
                      const currentRequestId = requestId.current;
                      start(async () => {
                        try {
                          const result = await refreshResearchAccountAction({
                            accountId: selected.id,
                            sourceId:
                              selected.platform === "instagram"
                                ? sourceId
                                : null,
                            requestId: currentRequestId,
                          });
                          requestId.current = null;
                          if (!result.ok) {
                            setError(true);
                            setMessage(result.error);
                            router.refresh();
                            return;
                          }
                          setMessage(
                            "Observation saved. Comparisons now use this snapshot.",
                          );
                          router.replace(
                            `/app/social/research?account=${selected.id}&page=${props.page}`,
                          );
                          router.refresh();
                        } catch {
                          setError(true);
                          setMessage(
                            "The response was interrupted. Retry to check the same refresh safely.",
                          );
                        } finally {
                          busy.current = false;
                        }
                      });
                    }}
                  >
                    {pending ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <RefreshCwIcon />
                    )}
                    {pending ? "Refreshing research…" : "Refresh research"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  One refresh per account per minute. A slow or interrupted
                  refresh releases its lock after 90 seconds. No recurring
                  worker or paid AI request.
                </p>
                {message ? (
                  <p
                    role={error ? "alert" : "status"}
                    aria-live="polite"
                    className={`rounded-xl border p-3 text-sm ${error ? "border-destructive/30 text-destructive" : "bg-accent/40"}`}
                  >
                    {message}
                  </p>
                ) : selected.lastError ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
                  >
                    {selected.lastError}
                  </p>
                ) : null}
              </header>
              {snapshot ? (
                <>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="research-observation">
                      Saved observation
                    </Label>
                    <FormSelect
                      id="research-observation"
                      value={snapshot.id}
                      onValueChange={(id) =>
                        router.push(
                          `/app/social/research?account=${selected.id}&page=${props.page}&historyPage=${props.historyPage}&observation=${id}`,
                        )
                      }
                    >
                      {props.snapshots.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {researchDate(item.capturedAt)}
                        </SelectItem>
                      ))}
                    </FormSelect>
                  </div>
                  <ResearchSnapshotPanel
                    snapshot={snapshot}
                    previous={props.snapshots[observationIndex + 1]}
                  />
                  <div className="flex flex-wrap gap-4 text-sm">
                    {props.historyPage > 0 ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/app/social/research?account=${selected.id}&page=${props.page}&historyPage=${props.historyPage - 1}`}
                      >
                        Newer observations
                      </Link>
                    ) : null}
                    {props.hasMoreSnapshots ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/app/social/research?account=${selected.id}&page=${props.page}&historyPage=${props.historyPage + 1}`}
                      >
                        Older observations
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="app-panel flex flex-col items-start gap-3 rounded-2xl border border-dashed">
                  <BinocularsIcon className="size-8 text-muted-foreground" />
                  <h3 className="font-semibold">
                    Your first observation starts here
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Authorize research, then refresh this account. If Meta
                    blocks access, we will show the reason rather than inventing
                    a report.
                  </p>
                </div>
              )}
              <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Archive this research account?</DialogTitle>
                    <DialogDescription>
                      Remove {selected.name} from this watchlist. Historical
                      observations are preserved; no source account or published
                      post is changed.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => setArchiveOpen(false)}
                    >
                      Keep account
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          try {
                            const result = await archiveResearchAccountAction({
                              accountId: selected.id,
                              version: selected.version,
                            });
                            if (!result.ok) {
                              setError(true);
                              setMessage(result.error);
                              setArchiveOpen(false);
                              return;
                            }
                            setArchiveOpen(false);
                            router.push("/app/social/research");
                            router.refresh();
                          } catch {
                            setError(true);
                            setMessage(
                              "The account could not be archived. Try again.",
                            );
                            setArchiveOpen(false);
                          }
                        })
                      }
                    >
                      {pending ? (
                        <Loader2Icon className="animate-spin" />
                      ) : null}
                      {pending ? "Archiving…" : "Archive account"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="app-panel rounded-2xl border border-dashed text-sm text-muted-foreground">
              Select or add an account to view its research. An unavailable
              account cannot be read from another workspace.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
