import type { ContentPlatform } from "@/db/schema";
import { CONTENT_PLATFORM_LABELS } from "@/lib/platforms/platform-labels";

const PLATFORM_ORDER: readonly ContentPlatform[] = [
  "youtube",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "twitter",
  "pinterest",
];

/** Keep every connection, including expired/revoked accounts, in its platform group. */
export function groupConnections<T extends { platform: ContentPlatform }>(
  connections: readonly T[],
) {
  return PLATFORM_ORDER.flatMap((platform) => {
    const items = connections.filter(
      (connection) => connection.platform === platform,
    );
    return items.length
      ? [{ platform, label: CONTENT_PLATFORM_LABELS[platform], items }]
      : [];
  });
}
