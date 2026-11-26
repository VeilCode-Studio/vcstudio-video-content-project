"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { groupConnections } from "@/lib/publishing/group-connections";
import { WorkspaceChannelCard } from "./WorkspaceChannelCard";
import { WorkspaceChannelPlatformFilter } from "./WorkspaceChannelPlatformFilter";
import type { WorkspaceChannelView } from "@/lib/publishing/workspace-connections-view";
import type { DisconnectChannelResult } from "@/components/publish/DisconnectChannelDialog";

export function WorkspaceChannelAccounts({
  channels,
  canManageConnections,
  onDisconnect,
}: {
  channels: WorkspaceChannelView[];
  canManageConnections: boolean;
  onDisconnect: (connectionId: string) => Promise<DisconnectChannelResult>;
}) {
  const [platform, setPlatform] = useState("all");
  const groups = groupConnections(channels);
  const selected = groups.find((group) => group.platform === platform);
  const visible = selected?.items ?? groups.flatMap((group) => group.items);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Connected accounts</h2>
          <span
            role="status"
            aria-live="polite"
            className="text-xs tabular-nums text-muted-foreground"
          >
            {selected
              ? `${visible.length} of ${channels.length}`
              : channels.length}{" "}
            {channels.length === 1 ? "account" : "accounts"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {selected ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPlatform("all")}
            >
              Reset
            </Button>
          ) : null}
          <WorkspaceChannelPlatformFilter
            groups={groups}
            total={channels.length}
            value={selected ? platform : "all"}
            onValueChange={setPlatform}
          />
        </div>
      </div>
      <ul
        aria-label={
          selected ? `${selected.label} accounts` : "Connected accounts"
        }
        className="app-grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
      >
        {visible.map((channel) => (
          <WorkspaceChannelCard
            key={channel.id}
            channel={channel}
            canManageConnections={canManageConnections}
            onDisconnect={onDisconnect}
          />
        ))}
      </ul>
    </div>
  );
}
