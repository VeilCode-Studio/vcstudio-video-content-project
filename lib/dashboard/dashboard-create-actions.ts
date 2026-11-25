import {
  ClapperboardIcon,
  FolderPlusIcon,
  ImageIcon,
  LightbulbIcon,
  type LucideIcon,
} from "lucide-react";

export type DashboardCreateTone = "ocean" | "ember" | "forest" | "violet";

export type DashboardCreateAction = {
  title: string;
  description: string;
  callToAction: string;
  /** An existing route; each page enforces its own authorization. */
  href: string;
  icon: LucideIcon;
  tone: DashboardCreateTone;
};

/**
 * Quick-start tiles on the dashboard. Navigation only — every destination is
 * an existing page that already appears in the sidebar for the same roles.
 */
export const DASHBOARD_CREATE_ACTIONS: readonly DashboardCreateAction[] = [
  {
    title: "New project",
    description: "Turn a narration script into scenes",
    callToAction: "Start a project",
    href: "/app/projects",
    icon: FolderPlusIcon,
    tone: "ocean",
  },
  {
    title: "Idea Lab",
    description: "Research and shape the next video",
    callToAction: "Explore ideas",
    href: "/app/ideas",
    icon: LightbulbIcon,
    tone: "ember",
  },
  {
    title: "Image Studio",
    description: "Generate and refine scene imagery",
    callToAction: "Open studio",
    href: "/app/images",
    icon: ImageIcon,
    tone: "forest",
  },
  {
    title: "Video Studio",
    description: "Animate scenes into finished clips",
    callToAction: "Open studio",
    href: "/app/video",
    icon: ClapperboardIcon,
    tone: "violet",
  },
];
