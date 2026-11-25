import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type {
  DashboardCreateAction,
  DashboardCreateTone,
} from "@/lib/dashboard/dashboard-create-actions";

/**
 * Tiles stay dark with white text in both themes, so each gradient is chosen
 * for at least 4.5:1 contrast against white at its lightest stop.
 */
const TONE_BACKGROUND: Record<DashboardCreateTone, string> = {
  ocean:
    "bg-[linear-gradient(140deg,oklch(0.3_0.07_258),oklch(0.43_0.09_215))]",
  ember: "bg-[linear-gradient(140deg,oklch(0.42_0.13_32),oklch(0.52_0.13_48))]",
  forest:
    "bg-[linear-gradient(140deg,oklch(0.33_0.06_165),oklch(0.46_0.08_135))]",
  violet:
    "bg-[linear-gradient(140deg,oklch(0.36_0.11_290),oklch(0.5_0.11_262))]",
};

export function DashboardCreateTile({
  action,
}: {
  action: DashboardCreateAction;
}) {
  const Icon = action.icon;
  return (
    <Link
      className={`group/tile relative flex min-h-44 flex-col justify-between overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/10 outline-none transition-shadow duration-300 hover:shadow-[0_24px_48px_-28px_oklch(0_0_0/70%)] focus-visible:ring-3 focus-visible:ring-ring ${TONE_BACKGROUND[action.tone]}`}
      href={action.href}
    >
      <Icon
        aria-hidden
        className="pointer-events-none absolute -right-5 -bottom-6 size-36 rotate-[-8deg] text-white/15 transition-transform duration-500 ease-out motion-safe:group-hover/tile:scale-105 motion-safe:group-hover/tile:rotate-0"
        strokeWidth={1.25}
      />
      <div className="relative">
        <h3 className="font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
          {action.title}
        </h3>
        <p className="mt-1 text-sm text-white/80">{action.description}</p>
      </div>
      <span className="relative mt-6 inline-flex w-fit items-center gap-1 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/30 backdrop-blur-sm transition-colors group-hover/tile:bg-white/25">
        {action.callToAction}
        <ChevronRightIcon
          aria-hidden
          className="size-4 transition-transform motion-safe:group-hover/tile:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
