import "server-only";
import { connectionHealth } from "./connection-health";

import type { ContentPlatform } from "@/db/schema";
import { platformConnectionLabel } from "@/lib/publishing/connection-label";
import { getReconnectAuthorizePath } from "@/lib/publishing/connection-reconnect";
import {
  listPlatformConnections,
  type PlatformConnectionSummary,
} from "@/db/repositories/publishing.repository";
import { getPublishingEnvironment } from "@/lib/env/server";
import { CONTENT_PLATFORM_LABELS } from "@/lib/titles/title-view";
import {
  getPlatformPostCapability,
  isSocialPostPlatform,
} from "@/lib/social/platform-post-capabilities";

export type WorkspaceChannelView = {
  id: string;
  platform: ContentPlatform;
  platformLabel: string;
  accountName: string;
  accountUrl: string | null;
  status: "active" | "expired" | "revoked";
  lastError: string | null;
  updatedAtLabel: string;
  authorizationExpiresAtLabel?: string | null;
  postingRequirement: string;
  /** OAuth start route that re-authorizes this account; null when not offered. */
  reconnectPath: string | null;
};

export type WorkspaceChannelPlatformView = {
  platform: ContentPlatform;
  label: string;
  available: boolean;
};

export type WorkspaceChannelsView = {
  /** Video publishing (YouTube/Facebook/Instagram/TikTok render uploads). */
  enabled: boolean;
  /** Social posting, which is what makes LinkedIn connectable at all. */
  pinterestReady?: boolean;
  socialPostingEnabled: boolean;
  channels: WorkspaceChannelView[];
  platforms: WorkspaceChannelPlatformView[];
};

const PLATFORM_ORDER: readonly ContentPlatform[] = [
  "youtube",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "twitter",
  "pinterest",
];

function formatUtc(value: Date): string {
  return `${value.toISOString().slice(0, 10)} UTC`;
}

export function buildWorkspaceChannelsView(input: {
  enabled: boolean;
  pinterestReady?: boolean;
  socialPostingEnabled: boolean;
  connections: PlatformConnectionSummary[];
  now?: Date;
}): WorkspaceChannelsView {
  const now = input.now ?? new Date();
  return {
    enabled: input.enabled,
    pinterestReady: Boolean(input.pinterestReady),
    socialPostingEnabled: input.socialPostingEnabled,
    channels: input.connections.map((connection) => ({
      id: connection.id,
      platform: connection.platform,
      platformLabel: platformConnectionLabel(connection),
      accountName: connection.externalAccountName,
      accountUrl: connection.externalAccountUrl,
      status: connectionHealth(
        {
          status: connection.status,
          expiresAt: connection.accessTokenExpiresAt,
          lastError: connection.lastError,
        },
        now,
      ).status,
      lastError: connection.lastError,
      updatedAtLabel: formatUtc(connection.updatedAt),
      authorizationExpiresAtLabel: connection.accessTokenExpiresAt
        ? connection.accessTokenExpiresAt
            .toISOString()
            .replace("T", " ")
            .slice(0, 16) + " UTC"
        : null,
      postingRequirement: isSocialPostPlatform(connection.platform)
        ? getPlatformPostCapability(connection.platform).mediaRequirement
        : "This account is used for video publishing only.",
      reconnectPath: getReconnectAuthorizePath(connection, {
        videoPublishingEnabled: input.enabled,
        socialPostingEnabled: input.socialPostingEnabled,
        pinterestEnabled: input.pinterestReady,
      }),
    })),
    platforms: PLATFORM_ORDER.map((platform) => ({
      platform,
      label: CONTENT_PLATFORM_LABELS[platform],
      available:
        platform === "pinterest" ? Boolean(input.pinterestReady) : true,
    })),
  };
}

export async function loadWorkspaceChannelsView(input: {
  workspaceId: string;
}): Promise<WorkspaceChannelsView> {
  const [connections, environment] = await Promise.all([
    listPlatformConnections({ workspaceId: input.workspaceId }),
    Promise.resolve(getPublishingEnvironment()),
  ]);
  return buildWorkspaceChannelsView({
    enabled: environment.ENABLE_VIDEO_PUBLISHING,
    socialPostingEnabled: environment.ENABLE_SOCIAL_POSTING,
    pinterestReady: Boolean(
      environment.ENABLE_PINTEREST &&
      environment.PINTEREST_ACCESS_TIER !== "pending" &&
      environment.ENABLE_SOCIAL_POSTING &&
      environment.PINTEREST_API_ID &&
      environment.PINTEREST_API_SECRET,
    ),
    connections,
  });
}
