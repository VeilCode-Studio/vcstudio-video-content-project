import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Icon-led section title with an optional "See all" link on the right. */
export function DashboardSectionHeading({
  href,
  icon: Icon,
  id,
  title,
}: {
  href?: string;
  icon: LucideIcon;
  id: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <h2 className="flex items-center gap-2.5 text-base font-semibold" id={id}>
        <Icon aria-hidden className="size-5 text-muted-foreground" />
        {title}
      </h2>
      {href ? (
        <Link
          className="rounded-full px-2 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          href={href}
        >
          See all
        </Link>
      ) : null}
    </div>
  );
}
