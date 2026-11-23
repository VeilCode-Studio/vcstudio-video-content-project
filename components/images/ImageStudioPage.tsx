"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ImageIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import { ImageStudioReferences } from "./ImageStudioReferences";
import type { ImageReferenceLimits } from "@/lib/image-studio/reference-selection";
import type { MediaAssetView } from "@/lib/media/media-asset-view";
import type {
  StudioImageJob,
  StudioImageRequest,
} from "@studio/contracts/image-studio";
import {
  quoteImageAction,
  startImageAction,
  imageHistoryAction,
  retryImageQueueAction,
} from "@/app/(authenticated)/app/images/actions";
import { ImageStudioJobCard } from "./ImageStudioJobCard";
export function ImageStudioPage({
  workspaceId,
  options,
  canGenerate,
  initialJobs,
}: {
  workspaceId: string;
  options: ImageReferenceLimits & { enabled: boolean; model: string };
  canGenerate: boolean;
  initialJobs: StudioImageJob[];
}) {
  const [title, setTitle] = useState(""),
    [prompt, setPrompt] = useState(""),
    [size, setSize] = useState<StudioImageRequest["size"]>("1024x1024"),
    [quality, setQuality] = useState<StudioImageRequest["quality"]>("medium");
  const [uploading, setUploading] = useState(false);
  const [references, setReferences] = useState<MediaAssetView[]>([]);
  const [review, setReview] = useState<{
    token: string;
    estimatedCostCents: number;
    model: string;
    dailyBudgetCents: number;
    monthlyBudgetCents: number;
  } | null>(null);
  const [hasOlder, setHasOlder] = useState(initialJobs.length === 20);
  const [jobs, setJobs] = useState(initialJobs),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const activeIds = jobs
    .filter((j) => j.status === "queued" || j.status === "running")
    .slice(0, 4)
    .map((j) => j.id)
    .join(",");
  const request = (): StudioImageRequest => ({
    title,
    prompt,
    size,
    quality,
    referenceAssetIds: references.map((r) => r.id),
  });
  function changed() {
    setReview(null);
    key.current = null;
  }
  async function refresh(more = false) {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await imageHistoryAction(
        workspaceId,
        more && jobs.at(-1)
          ? { createdAt: jobs.at(-1)!.createdAt, id: jobs.at(-1)!.id }
          : undefined,
      );
      if (!result.ok) setError(result.error);
      else {
        if (more && result.value.length < 20) setHasOlder(false);
        setJobs((previous) =>
          more
            ? [
                ...previous,
                ...result.value.filter(
                  (j) => !previous.some((p) => p.id === j.id),
                ),
              ]
            : [
                ...result.value,
                ...previous.filter(
                  (j) => !result.value.some((p) => p.id === j.id),
                ),
              ],
        );
      }
    } catch {
      setError("Image history could not refresh. Your prompt is preserved.");
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void imageHistoryAction(workspaceId, undefined, activeIds.split(","))
        .then((r) => {
          if (cancelled) return;
          if (r.ok)
            setJobs((previous) => [
              ...r.value,
              ...previous.filter((j) => !r.value.some((p) => p.id === j.id)),
            ]);
          else setError(r.error);
        })
        .catch(() => {
          if (!cancelled)
            setError(
              "Status updates paused. Refresh to check your saved jobs.",
            );
        })
        .finally(() => {
          inFlight = false;
        });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeIds, workspaceId]);
  async function estimate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await quoteImageAction(workspaceId, request());
      if (!r.ok) setError(r.error);
      else {
        setReview(r.value);
        key.current = crypto.randomUUID();
      }
    } catch {
      setError("The estimate could not load. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!review || busy) return;
    setBusy(true);
    setError(null);
    try {
      key.current ??= crypto.randomUUID();
      const r = await startImageAction(workspaceId, {
        request: request(),
        quote: review.token,
        idempotencyKey: key.current,
      });
      if (!r.ok) setError(r.error);
      else {
        setReview(null);
        await refresh();
      }
    } catch {
      setError(
        "The queue handoff was not confirmed. Retry with the same inputs to avoid duplicates.",
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || uploading || !canGenerate || !options.enabled;
  return (
    <div className="app-page font-[family-name:var(--font-geist-sans,Arial,sans-serif)]">
      <header className="app-page-header">
        <div className="app-heading">
          <p className="text-sm text-muted-foreground">Create</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Image Studio
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Create an image from your prompt and optional references. Results
            join your media library for posts and project scenes.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            options.enabled
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          }
        >
          {options.enabled ? "Generation available" : "Generation unavailable"}
        </Badge>
      </header>
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ImageIcon aria-hidden className="size-5" />
            Create an image
          </h2>
          <p className="text-sm text-muted-foreground">
            OpenAI - {options.model}
          </p>
        </CardHeader>
        <CardContent className="app-section">
          <div className="flex flex-col gap-2">
            <Label htmlFor="image-title">Image name (optional)</Label>
            <Input
              id="image-title"
              value={title}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => {
                setTitle(e.target.value);
                changed();
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="image-prompt">Prompt</Label>
            <Textarea
              id="image-prompt"
              value={prompt}
              maxLength={24000}
              rows={6}
              disabled={disabled}
              onChange={(e) => {
                setPrompt(e.target.value);
                changed();
              }}
              placeholder="Describe the subject, setting, composition and style..."
            />
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="image-size">Canvas</Label>
              <FormSelect
                id="image-size"
                value={size}
                disabled={disabled}
                onValueChange={(v) => {
                  if (
                    v === "1024x1024" ||
                    v === "1536x1024" ||
                    v === "1024x1536"
                  ) {
                    setSize(v);
                    changed();
                  }
                }}
              >
                <SelectItem value="1024x1024">Square (1024 x 1024)</SelectItem>
                <SelectItem value="1536x1024">
                  Landscape (1536 x 1024)
                </SelectItem>
                <SelectItem value="1024x1536">
                  Portrait (1024 x 1536)
                </SelectItem>
              </FormSelect>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="image-quality">Quality</Label>
              <FormSelect
                id="image-quality"
                value={quality}
                disabled={disabled}
                onValueChange={(v) => {
                  if (v === "low" || v === "medium" || v === "high") {
                    setQuality(v);
                    changed();
                  }
                }}
              >
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </FormSelect>
            </div>
          </div>
          <ImageStudioReferences
            workspaceId={workspaceId}
            references={references}
            limits={options}
            disabled={disabled}
            onChange={(assets) => {
              setReferences(assets);
              changed();
            }}
            onBusyChange={(active) => {
              setUploading(active);
              if (active) changed();
            }}
          />
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          {!options.enabled ? (
            <p className="text-sm text-muted-foreground">
              Image generation is disabled in this deployment. An owner can
              check provider configuration in Readiness.
            </p>
          ) : null}
          {!canGenerate ? (
            <p className="text-sm text-muted-foreground">
              Your workspace role can view images. An owner or editor can
              generate them.
            </p>
          ) : null}
          {review ? (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <p className="font-medium">
                Estimated cost ${(review.estimatedCostCents / 100).toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">
                One image - {size} - {quality}. This estimate is valid for ten
                minutes. Workspace spending limits apply.
              </p>
              <Button
                type="button"
                onClick={() => void generate()}
                disabled={disabled}
              >
                {busy ? (
                  <Loader2Icon aria-hidden className="animate-spin" />
                ) : null}
                Generate image
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="self-start"
              disabled={disabled || !prompt.trim()}
              onClick={() => void estimate()}
            >
              {busy ? (
                <Loader2Icon aria-hidden className="animate-spin" />
              ) : null}
              Review estimate
            </Button>
          )}
        </CardContent>
      </Card>
      <section className="app-section">
        <div className="app-page-header">
          <h2 className="text-xl font-semibold">Your images</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon
                aria-hidden
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/app/social/library?kind=image" />}
            >
              Media library
            </Button>
          </div>
        </div>
        {jobs.length ? (
          <div className="app-grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <ImageStudioJobCard
                key={job.id}
                job={job}
                workspaceId={workspaceId}
                canEdit={canGenerate && options.enabled}
                onCreated={() => refresh()}
                canRetry={canGenerate && options.enabled && job.canRetry}
                onRetry={async () => {
                  try {
                    const r = await retryImageQueueAction(workspaceId, job.id);
                    if (!r.ok) setError(r.error);
                    await refresh();
                  } catch {
                    setError(
                      "The queue could not be reached. Your saved request is preserved; try again.",
                    );
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
            Your generated images and saved requests appear here.
          </p>
        )}
        {hasOlder ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={refreshing}
            onClick={() => void refresh(true)}
          >
            Load older requests
          </Button>
        ) : null}
      </section>
    </div>
  );
}
