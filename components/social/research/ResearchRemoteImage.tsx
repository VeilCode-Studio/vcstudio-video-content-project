"use client";
import { useState } from "react";
import { ImageOffIcon } from "lucide-react";

export function ResearchRemoteImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted/40">
      {state !== "failed" ? (
        <>
          {state === "loading" ? (
            <span
              role="status"
              className="absolute text-xs text-muted-foreground"
            >
              Loading image…
            </span>
          ) : null}
          {/* Remote Meta CDN URLs must bypass Next's persistent image optimizer cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
            className="relative max-h-full w-full object-contain"
          />
        </>
      ) : (
        <div
          role="status"
          className="flex max-w-xs flex-col items-center gap-2 p-4 text-center text-sm text-muted-foreground"
        >
          <ImageOffIcon aria-hidden="true" />
          Image unavailable or link expired. Reload previews or open the
          original post.
        </div>
      )}
    </div>
  );
}
