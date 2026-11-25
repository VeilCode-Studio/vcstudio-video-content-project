import Link from "next/link";
import { FolderIcon, FolderOpenIcon } from "lucide-react";
import type { ProjectListItem } from "@/db/repositories/projects.repository";
import { DashboardSectionHeading } from "@/components/application/DashboardSectionHeading";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function DashboardRecentProjects({
  projects,
}: {
  projects: ProjectListItem[];
}) {
  return (
    <section
      aria-labelledby="dashboard-recent-projects-heading"
      className="app-section"
    >
      <DashboardSectionHeading
        href="/app/projects"
        icon={FolderOpenIcon}
        id="dashboard-recent-projects-heading"
        title="Recent projects"
      />
      <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderIcon aria-hidden className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">No projects yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first project to start turning scripts into scenes.
              </p>
            </div>
            <Link
              className="mt-1 text-xs font-medium text-primary hover:underline"
              href="/app/projects"
            >
              Go to projects
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors duration-200 outline-none hover:bg-muted focus-visible:bg-muted"
                  href={`/app/projects/${project.id}/script`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {project.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {project.aspectRatio} · Updated{" "}
                      {dateFormatter.format(project.updatedAt)}
                    </p>
                  </div>
                  <ProjectStatusBadge
                    hasPublished={project.hasPublished}
                    status={project.status}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
