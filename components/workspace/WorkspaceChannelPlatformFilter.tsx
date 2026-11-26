"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { PlatformMarkIcon } from "@/components/brand/PlatformMarkIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkspaceChannelView } from "@/lib/publishing/workspace-connections-view";
import type { groupConnections } from "@/lib/publishing/group-connections";

export function WorkspaceChannelPlatformFilter({
  groups,
  total,
  value,
  onValueChange,
}: {
  groups: ReturnType<typeof groupConnections<WorkspaceChannelView>>;
  total: number;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const items = [
    { value: "all", label: "All platforms" },
    ...groups.map((group) => ({ value: group.platform, label: group.label })),
  ];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectTrigger
        aria-label="Filter accounts by platform"
        className="w-48 max-w-full rounded-xl bg-background px-3 shadow-none"
      >
        <SlidersHorizontalIcon
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          <span className="flex w-full items-center justify-between gap-3">
            <span>All platforms</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {total}
            </span>
          </span>
        </SelectItem>
        {groups.map((group) => (
          <SelectItem key={group.platform} value={group.platform}>
            <span className="flex w-full items-center gap-2">
              <PlatformMarkIcon
                platform={group.platform}
                className="size-3.5 shrink-0"
              />
              <span className="flex-1">{group.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {group.items.length}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
