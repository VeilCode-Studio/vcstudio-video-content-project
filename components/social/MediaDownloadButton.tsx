"use client";
import { useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { downloadMedia } from "@/lib/storage/download-media.client";
import { Button } from "@/components/ui/button";
import type { MediaAssetView } from "@/lib/media/media-asset-view";

export function MediaDownloadButton({
  asset,
  source = "library",
  postId,
  unavailable = false,
}: {
  asset: MediaAssetView;
  source?: "library" | "render";
  postId?: string;
  unavailable?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled =
    unavailable ||
    asset.inspectionPending ||
    asset.inspectionFailed ||
    (source === "render" && !postId);
  return (
    <div className="min-w-0 space-y-1">
      <Button
        type="button"
        disabled={Boolean(disabled) || pending}
        size="sm"
        variant="outline"
        aria-label={`Download ${asset.title}`}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setError(null);
          try {
            await downloadMedia({ assetId: asset.id, source, postId });
          } catch {
            setError("Download unavailable. Please try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? (
          <Loader2Icon aria-hidden className="animate-spin" />
        ) : (
          <DownloadIcon aria-hidden />
        )}
        {pending ? "Preparing..." : "Download"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
