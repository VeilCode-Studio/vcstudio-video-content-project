"use client";
import { useEffect, useState, type RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Carousel } from "@/components/ui/Carousel";
import { CarouselContent } from "@/components/ui/CarouselContent";
import { CarouselItem } from "@/components/ui/CarouselItem";
import { CarouselPrevious } from "@/components/ui/CarouselPrevious";
import { CarouselNext } from "@/components/ui/CarouselNext";
import { type CarouselApi } from "@/hooks/useCarousel";
import { PostMediaViewerItem } from "./PostMediaViewerItem";
import type { PostAttachmentView } from "@/lib/social/social-post-view";

export function PostMediaViewer({
  attachments,
  initialIndex,
  onClose,
  returnFocus,
}: {
  attachments: PostAttachmentView[];
  initialIndex: number;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    if (!api) return;
    const update = () => setIndex(api.selectedScrollSnap());
    api.on("select", update);
    return () => {
      api.off("select", update);
    };
  }, [api]);
  const attachment = attachments[index];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        className="w-[calc(100%-2rem)] max-w-6xl gap-4 p-4 sm:max-w-6xl sm:p-6"
      >
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="break-words text-lg">
            {attachment?.asset.title || "Post media"}
          </DialogTitle>
          <DialogDescription>
            View attached media in full. Images retain their original
            proportions.
          </DialogDescription>
        </DialogHeader>
        <Carousel
          aria-label="Post media"
          opts={{ startIndex: initialIndex, watchFocus: false }}
          setApi={setApi}
        >
          <CarouselContent>
            {attachments.map((item, position) => (
              <CarouselItem
                key={`${item.source}:${item.asset.id}`}
                aria-label={`${position + 1} of ${attachments.length}`}
                aria-hidden={position !== index}
                inert={position !== index}
              >
                {position === index ? (
                  <PostMediaViewerItem
                    key={`${item.source}:${item.asset.id}`}
                    attachment={item}
                  />
                ) : (
                  <div className="h-[min(62dvh,720px)] min-h-40" />
                )}
              </CarouselItem>
            ))}
          </CarouselContent>
          {attachments.length > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-4">
              <CarouselPrevious className="static inset-auto m-0 size-10 translate-none" />
              <p
                role="status"
                aria-label="Media position"
                aria-live="polite"
                aria-atomic="true"
                className="min-w-20 text-center text-sm tabular-nums text-muted-foreground"
              >
                {index + 1} of {attachments.length}
              </p>
              <CarouselNext className="static inset-auto m-0 size-10 translate-none" />
            </div>
          ) : null}
        </Carousel>
      </DialogContent>
    </Dialog>
  );
}
