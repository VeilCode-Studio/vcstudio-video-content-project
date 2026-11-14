"use client";
import { useState } from "react";
import { PlayIcon, ImageOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResearchPreviewItem } from "@studio/contracts/social-research-previews";
import { ResearchRemoteImage } from "./ResearchRemoteImage";

export function ResearchMediaItem({
  item,
  label,
}: {
  item: ResearchPreviewItem;
  label: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  if (item.kind === "image" && item.url)
    return <ResearchRemoteImage key={item.url} src={item.url} alt={label} />;
  if (failed)
    return (
      <p
        role="status"
        className="flex aspect-square items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground"
      >
        <ImageOffIcon aria-hidden="true" />
        Video unavailable or link expired. Reload previews or open the original
        post.
      </p>
    );
  if (playing && item.url)
    return (
      <video
        aria-label={label}
        src={item.url}
        poster={item.posterUrl ?? undefined}
        controls
        playsInline
        preload="none"
        onError={() => setFailed(true)}
        className="aspect-square w-full bg-black object-contain"
      />
    );
  return (
    <div className="relative flex aspect-square items-center justify-center bg-muted/40">
      {item.posterUrl ? (
        <ResearchRemoteImage
          key={item.posterUrl}
          src={item.posterUrl}
          alt={`${label} cover`}
        />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
        {item.kind === "video" && item.url ? (
          <Button variant="secondary" onClick={() => setPlaying(true)}>
            <PlayIcon aria-hidden="true" />
            Load video
          </Button>
        ) : (
          <span className="rounded-lg bg-background/95 p-3 text-sm text-muted-foreground">
            {item.kind === "video"
              ? "Meta did not provide a playable video. View the original post."
              : "Media preview unavailable. View the original post."}
          </span>
        )}
      </div>
    </div>
  );
}
