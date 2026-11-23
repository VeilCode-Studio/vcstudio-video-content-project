"use client";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import type { StudioImageJob } from "@studio/contracts/image-studio";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageStudioImageViewer } from "./ImageStudioImageViewer";
import { ImageStudioEditDialog } from "./ImageStudioEditDialog";
import { MediaDownloadButton } from "@/components/social/MediaDownloadButton";
export function ImageStudioJobCard({
  job,
  workspaceId,
  canEdit,
  onCreated,
  canRetry,
  onRetry,
}: {
  job: StudioImageJob;
  workspaceId: string;
  canEdit: boolean;
  onCreated: () => Promise<void>;
  canRetry: boolean;
  onRetry: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 break-words font-semibold">{job.title}</h3>
          <Badge
            role="status"
            variant={job.status === "failed" ? "destructive" : "secondary"}
          >
            {job.status}
          </Badge>
        </div>
        {job.previewUrl ? (
          <ImageStudioImageViewer
            workspaceId={workspaceId}
            job={job}
            canEdit={canEdit}
            onCreated={onCreated}
          />
        ) : job.status === "queued" || job.status === "running" ? (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
            <Loader2Icon
              aria-label="Image generation in progress"
              className="animate-spin"
            />
          </div>
        ) : job.status === "succeeded" ? (
          <p className="text-sm text-muted-foreground">
            This image is no longer in the media library.
          </p>
        ) : null}
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {job.prompt}
        </p>
        <p className="text-xs text-muted-foreground">
          {job.actualCostCents === null ? "Estimated" : "Recorded"} cost $
          {((job.actualCostCents ?? job.estimatedCostCents) / 100).toFixed(2)}
        </p>
        {job.error ? (
          <p role="alert" className="text-sm text-destructive">
            {job.error}
          </p>
        ) : null}
        {job.previewUrl ? (
          <div className="flex flex-wrap gap-2">
            <MediaDownloadButton
              asset={{
                id: job.id,
                title: job.title,
              }}
            />
            <ImageStudioEditDialog
              workspaceId={workspaceId}
              jobId={job.id}
              disabled={!canEdit}
              onCreated={onCreated}
            />
          </div>
        ) : null}
        {job.status === "queued" && canRetry ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRetry();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2Icon aria-hidden className="animate-spin" /> : null}
            Retry queue
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
