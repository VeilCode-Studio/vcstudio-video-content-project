"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import useEmblaCarousel from "embla-carousel-react";
import { CarouselContext, type CarouselProps } from "@/hooks/useCarousel";
export function Carousel({
  orientation = "horizontal",
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins,
  );
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      api?.on("select", onChange);
      api?.on("reInit", onChange);
      return () => {
        api?.off("select", onChange);
        api?.off("reInit", onChange);
      };
    },
    [api],
  );
  const getSnapshot = React.useCallback(
    () => (api?.canScrollPrev() ? 1 : 0) | (api?.canScrollNext() ? 2 : 0),
    [api],
  );
  const navigation = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => 0,
  );
  const canScrollPrev = Boolean(navigation & 1);
  const canScrollNext = Boolean(navigation & 2);

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = React.useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target instanceof HTMLMediaElement) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext],
  );

  React.useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api: api,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        onKeyDownCapture={handleKeyDown}
        className={cn("relative", className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}
