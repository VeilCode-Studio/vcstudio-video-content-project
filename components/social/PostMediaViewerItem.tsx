"use client";
/* eslint-disable @next/next/no-img-element -- Private, expiring signed media URLs. */
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostAttachmentView } from "@/lib/social/social-post-view";

export function PostMediaViewerItem({
  attachment,
}: {
  attachment: PostAttachmentView;
}) {
  const { asset } = attachment;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const blocked =
    asset.inspectionPending || asset.inspectionFailed || !asset.previewUrl;
  return (
    <div className="relative flex h-[min(62dvh,720px)] min-h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-black text-white">
      {blocked ? (
        <p role="status" className="max-w-md p-6 text-center text-sm">
          {asset.inspectionPending
            ? "Video verification is in progress. Check its status in the post before previewing."
            : asset.inspectionFailed
              ? "Video verification failed. This file cannot be previewed."
              : "This media is no longer available for preview."}
        </p>
      ) : failed ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-4 p-6 text-center"
        >
          <p>
            This media could not be loaded. Try again, or refresh the post if
            its preview link has expired.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setLoaded(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry preview
          </Button>
        </div>
      ) : asset.kind === "image" ? (
        <>
          {!loaded && (
            <span
              role="status"
              className="absolute flex items-center gap-2 text-sm"
            >
              <Loader2Icon
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Loading image...
            </span>
          )}
          <img
            key={attempt}
            src={asset.previewUrl}
            alt={asset.altText || asset.title}
            className="size-full object-contain"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : asset.kind === "video" ? (
        <video
          key={attempt}
          aria-label={asset.title}
          className="size-full object-contain"
          controls
          playsInline
          preload="none"
          poster={asset.thumbnailUrl}
          src={asset.previewUrl}
          onError={() => setFailed(true)}
        >
          <track kind="captions" />
        </video>
      ) : (
        <audio
          key={attempt}
          aria-label={asset.title}
          className="w-full max-w-xl px-4"
          controls
          preload="none"
          src={asset.previewUrl}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
