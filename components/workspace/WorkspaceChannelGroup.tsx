"use client";

import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/ui/collapsible";
import { PlatformMarkIcon } from "@/components/brand/PlatformMarkIcon";
import { WorkspaceChannelCard } from "./WorkspaceChannelCard";
import type { WorkspaceChannelView } from "@/lib/publishing/workspace-connections-view";
import type { DisconnectChannelResult } from "@/components/publish/DisconnectChannelDialog";

export function WorkspaceChannelGroup({
  label,
  channels,
  canManageConnections,
  onDisconnect,
}: {
  label: string;
  channels: WorkspaceChannelView[];
  canManageConnections: boolean;
  onDisconnect: (connectionId: string) => Promise<DisconnectChannelResult>;
}) {
  const attention = channels.filter(
    (channel) => channel.status !== "active" || channel.lastError,
  ).length;
  return (
    <Collapsible defaultOpen className="min-w-0 space-y-4">
      <h2>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 whitespace-normal px-0 py-2 text-left"
            />
          }
        >
          <PlatformMarkIcon
            platform={channels[0].platform}
            className="size-5 shrink-0"
          />
          <span className="text-base font-semibold">{label}</span>
          <Badge variant="secondary">
            {channels.length} {channels.length === 1 ? "account" : "accounts"}
          </Badge>
          {attention ? (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
            >
              {attention} need attention
            </Badge>
          ) : null}
          <ChevronDownIcon className="ml-auto size-4 shrink-0" />
        </CollapsibleTrigger>
      </h2>
      <CollapsiblePanel>
        <ul
          aria-label={`${label} accounts`}
          className="app-grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
        >
          {channels.map((channel) => (
            <WorkspaceChannelCard
              key={channel.id}
              channel={channel}
              canManageConnections={canManageConnections}
              onDisconnect={onDisconnect}
            />
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}
