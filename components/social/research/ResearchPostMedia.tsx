"use client";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResearchPreviews } from "@studio/contracts/social-research-previews";
import { ResearchMediaItem } from "./ResearchMediaItem";

export function ResearchPostMedia({
  preview,
  label,
}: {
  preview: ResearchPreviews["posts"][number] | undefined;
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const item = preview?.items[index];
  if (!item)
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Meta did not expose media for this saved post. It may no longer be in
        the recent sample. View the original post below.
      </p>
    );
  return (
    <section
      aria-label={`${label} media`}
      className="min-w-0 overflow-hidden rounded-xl border"
    >
      <ResearchMediaItem
        key={`${index}:${item.url}:${item.posterUrl}`}
        item={item}
        label={`${label}, slide ${index + 1}`}
      />
      {preview.items.length > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t bg-background p-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous media"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {index + 1} / {preview.items.length}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next media"
            disabled={index === preview.items.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
      {preview.hasMore ? (
        <p className="p-2 text-xs text-muted-foreground">
          More slides may be available in the original post.
        </p>
      ) : null}
    </section>
  );
}
