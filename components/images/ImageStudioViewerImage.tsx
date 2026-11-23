/* Private signed originals are not sent through the public image cache. */
/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imageSourceAction } from "@/app/(authenticated)/app/images/actions";
export function ImageStudioViewerImage({
  workspaceId,
  jobId,
  url,
  title,
}: {
  workspaceId: string;
  jobId: string;
  url: string;
  title: string;
}) {
  const [src, setSrc] = useState(url),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  async function retry() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await imageSourceAction(workspaceId, jobId);
      if (!result.ok) setError(result.error);
      else {
        setSrc(result.value.asset.previewUrl);
        setLoaded(false);
        setAttempt((n) => n + 1);
        setError(null);
      }
    } catch {
      setError(
        "The preview could not refresh. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative flex h-[min(62dvh,720px)] min-h-40 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-black text-white">
      {error ? (
        <div
          role="alert"
          className="flex max-w-md flex-col items-center gap-4 p-4 text-center"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void retry()}
          >
            {busy ? <Loader2Icon aria-hidden className="animate-spin" /> : null}
            Retry preview
          </Button>
        </div>
      ) : (
        <>
          {!loaded ? (
            <span role="status" className="absolute flex items-center gap-2">
              <Loader2Icon aria-hidden className="size-4 animate-spin" />
              Loading image...
            </span>
          ) : null}
          <img
            key={attempt}
            src={src}
            alt={title}
            decoding="async"
            className="size-full object-contain"
            onLoad={() => setLoaded(true)}
            onError={() =>
              setError(
                "The image could not load. Refresh its private preview link to try again.",
              )
            }
          />
        </>
      )}
    </div>
  );
}
