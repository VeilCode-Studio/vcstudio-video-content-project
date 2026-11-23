/* Private signed originals are not sent through the public image cache. */
/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MediaDownloadButton } from "@/components/social/MediaDownloadButton";
import type { StudioImageJob } from "@studio/contracts/image-studio";
import { ImageStudioViewerImage } from "./ImageStudioViewerImage";
import { ImageStudioEditDialog } from "./ImageStudioEditDialog";
export function ImageStudioImageViewer({
  workspaceId,
  job,
  canEdit,
  onCreated,
}: {
  workspaceId: string;
  job: StudioImageJob;
  canEdit: boolean;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={"View image " + job.title}
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full overflow-hidden rounded-lg p-0"
          />
        }
      >
        <img
          src={job.previewUrl ?? ""}
          alt={job.title}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full bg-muted object-contain"
        />
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-6xl gap-4 p-4 sm:max-w-6xl sm:p-6 font-[family-name:var(--font-geist-sans,Arial,sans-serif)]">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="break-words">{job.title}</DialogTitle>
          <DialogDescription>
            View the full image in its original proportions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <MediaDownloadButton asset={{ id: job.id, title: job.title }} />
          <ImageStudioEditDialog
            workspaceId={workspaceId}
            jobId={job.id}
            disabled={!canEdit}
            onCreated={onCreated}
          />
        </div>
        {open && job.previewUrl ? (
          <ImageStudioViewerImage
            workspaceId={workspaceId}
            jobId={job.id}
            url={job.previewUrl}
            title={job.title}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
