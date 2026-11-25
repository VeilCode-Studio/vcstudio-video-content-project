import {
  ChartNoAxesColumnIcon,
  FolderKanbanIcon,
  ImagesIcon,
  SquarePlusIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import type { WorkspaceMembershipView } from "@/db/repositories/workspaces.repository";
import type { WorkspaceDashboardStatistics } from "@/db/repositories/dashboard.repository";
import type { ProjectListItem } from "@/db/repositories/projects.repository";
import { DashboardCreateTile } from "@/components/application/DashboardCreateTile";
import { DashboardRecentProjects } from "@/components/application/DashboardRecentProjects";
import { DashboardSectionHeading } from "@/components/application/DashboardSectionHeading";
import { DashboardStatCard } from "@/components/application/DashboardStatCard";
import { DASHBOARD_CREATE_ACTIONS } from "@/lib/dashboard/dashboard-create-actions";
import { formatUsdCents } from "@/lib/format/currency";

export function DashboardOverview({
  membership,
  statistics,
  recentProjects,
}: {
  membership: WorkspaceMembershipView;
  statistics: WorkspaceDashboardStatistics;
  recentProjects: ProjectListItem[];
}) {
  return (
    <section aria-labelledby="dashboard-heading" className="app-page">
      {/* Hero: always dark, in both themes, with white text. */}
      <div className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(120deg,oklch(0.22_0.05_268),oklch(0.3_0.06_235)_55%,oklch(0.34_0.07_205))] px-6 py-8 text-white ring-1 ring-white/10 sm:px-10 sm:py-10">
        <span
          aria-hidden
          className="absolute -right-10 -bottom-16 -z-10 h-40 w-72 rotate-[-14deg] rounded-[2.5rem] bg-[linear-gradient(120deg,oklch(0.85_0.12_195),oklch(0.75_0.14_215))] opacity-70 blur-[2px]"
        />
        <span
          aria-hidden
          className="absolute right-40 -bottom-20 -z-10 h-36 w-56 rotate-10 rounded-[2.5rem] bg-[linear-gradient(120deg,oklch(0.78_0.12_300),oklch(0.72_0.14_280))] opacity-60 blur-[2px]"
        />
        <p className="text-xs font-semibold tracking-[0.16em] text-white/65 uppercase">
          {membership.role} workspace
        </p>
        <h1
          className="mt-2 text-4xl leading-[1.05] sm:text-5xl"
          id="dashboard-heading"
        >
          Welcome to{" "}
          <span className="text-[oklch(0.86_0.12_215)]">
            {membership.workspaceName}
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/75 sm:text-base">
          Projects in flight, your character library, generated scene imagery,
          and this month&rsquo;s production spend across every billable
          operation.
        </p>
      </div>

      <section
        aria-labelledby="dashboard-create-heading"
        className="app-section"
      >
        <DashboardSectionHeading
          icon={SquarePlusIcon}
          id="dashboard-create-heading"
          title="Create"
        />
        <div className="app-grid sm:grid-cols-2 xl:grid-cols-4">
          {DASHBOARD_CREATE_ACTIONS.map((action) => (
            <DashboardCreateTile action={action} key={action.href} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="dashboard-overview-heading"
        className="app-section"
      >
        <DashboardSectionHeading
          icon={ChartNoAxesColumnIcon}
          id="dashboard-overview-heading"
          title="Overview"
        />
        <div className="app-grid sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard
            detail={
              statistics.projects.active > 0
                ? `${statistics.projects.active} active`
                : "No projects in progress"
            }
            href="/app/projects"
            icon={FolderKanbanIcon}
            label="Projects"
            value={statistics.projects.total.toLocaleString()}
          />
          <DashboardStatCard
            detail={
              statistics.characters.total > 0
                ? "In your character library"
                : "No characters yet"
            }
            href="/app/characters"
            icon={UsersIcon}
            label="Characters"
            value={statistics.characters.total.toLocaleString()}
          />
          <DashboardStatCard
            accent
            detail={
              statistics.sceneImages.awaitingReview > 0
                ? `${statistics.sceneImages.awaitingReview} awaiting review`
                : "None awaiting review"
            }
            icon={ImagesIcon}
            label="Scene images"
            value={statistics.sceneImages.succeeded.toLocaleString()}
          />
          <DashboardStatCard
            detail="All billable operations, month to date"
            icon={WalletIcon}
            label="Production spend"
            value={formatUsdCents(statistics.spend.monthToDateCents)}
          />
        </div>
      </section>

      <DashboardRecentProjects projects={recentProjects} />
    </section>
  );
}
