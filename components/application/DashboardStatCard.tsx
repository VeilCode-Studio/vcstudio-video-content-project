import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardStatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  href?: string;
  accent?: boolean;
};

export function DashboardStatCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
  accent = false,
}: DashboardStatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full",
            accent
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon aria-hidden className="size-4.5" />
        </span>
        {href ? (
          <ArrowUpRightIcon
            aria-hidden
            className="size-4 text-muted-foreground opacity-0 transition group-hover/stat:opacity-100"
          />
        ) : null}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </>
  );

  const className = cn(
    "group/stat rounded-3xl bg-card p-6 ring-1 ring-border transition-[box-shadow,background-color] duration-200",
    href &&
      "outline-none hover:bg-[color-mix(in_oklch,var(--card),var(--foreground)_3%)] hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring",
  );

  if (href) {
    return (
      <Link className={className} href={href}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
