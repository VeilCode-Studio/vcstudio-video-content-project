"use client";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaAssetPreview } from "@/components/social/MediaAssetPreview";
import type { MediaAssetView } from "@/lib/media/media-asset-view";
export function ImageStudioReferenceCard({
  asset,
  disabled,
  onRemove,
}: {
  asset: MediaAssetView;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border bg-card p-2">
      <MediaAssetPreview
        asset={asset}
        controls={false}
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-muted"
      />
      <figcaption className="mt-2 flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs" title={asset.title}>
          {asset.title}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={"Remove reference " + asset.title}
          onClick={onRemove}
        >
          <XIcon aria-hidden />
        </Button>
      </figcaption>
    </figure>
  );
}
