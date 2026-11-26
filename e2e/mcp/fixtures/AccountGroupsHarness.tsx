import { WorkspaceChannelAccounts } from "@/components/workspace/WorkspaceChannelAccounts";
import type { WorkspaceChannelView } from "@/lib/publishing/workspace-connections-view";

const channels: WorkspaceChannelView[] = [
  {
    id: "first",
    platform: "tiktok",
    platformLabel: "TikTok",
    accountName: "First TikTok",
    accountUrl: null,
    status: "active",
    lastError: null,
    updatedAtLabel: "2026-11-26",
    postingRequirement: "Finish posting in TikTok.",
    reconnectPath: "/api/tiktok/authorize",
  },
  {
    id: "facebook",
    platform: "facebook",
    platformLabel: "Facebook",
    accountName: "Business Page",
    accountUrl: null,
    status: "active",
    lastError: null,
    updatedAtLabel: "2026-11-26",
    postingRequirement: "Images and videos.",
    reconnectPath: "/api/facebook/authorize",
  },
  {
    id: "second",
    platform: "tiktok",
    platformLabel: "TikTok",
    accountName: "Second TikTok",
    accountUrl: null,
    status: "expired",
    lastError: null,
    updatedAtLabel: "2026-11-26",
    postingRequirement: "Finish posting in TikTok.",
    reconnectPath: "/api/tiktok/authorize",
  },
];
export function AccountGroupsHarness() {
  return (
    <main className="app-page">
      <WorkspaceChannelAccounts
        channels={channels}
        canManageConnections={
          !new URLSearchParams(location.search).has("readonly")
        }
        onDisconnect={async (id) => {
          sessionStorage.setItem("account-disconnect", id);
          return { success: true, error: null };
        }}
      />
    </main>
  );
}
