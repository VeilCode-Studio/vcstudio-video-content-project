"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { disconnectResearchAction } from "@/app/(authenticated)/app/social/research/actions";
import type { ResearchConnectionView } from "@studio/contracts/social-research";
import { researchDate } from "@/lib/social/research/view";

export function ResearchConnectionPanel({
  connection,
  canManage,
  enabled,
}: {
  connection: ResearchConnectionView;
  canManage: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="app-panel app-section rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ShieldCheckIcon className="size-5 shrink-0 text-primary" />
          <h2 className="font-semibold">Research access</h2>
        </div>
        <Badge variant={connection.connected ? "secondary" : "outline"}>
          {connection.connected ? "Meta authorized" : "Authorization needed"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Authorize read-only research separately from your publishing accounts.
        Meta decides which public accounts and fields are accessible; connecting
        does not grant unrestricted competitor access.
      </p>
      <p className="text-sm text-muted-foreground">
        The Instagram accounts in Meta’s picker are your research sources, not
        the competitors you can track. One eligible source can research multiple
        professional accounts added to your watchlist. To expose another source,
        check that it is a Business or Creator account linked to a Facebook Page
        you can manage, then review Meta’s account selection when reconnecting.
      </p>
      {connection.connected && connection.expiresAt ? (
        <p className="text-xs text-muted-foreground">
          Authorization expires {researchDate(connection.expiresAt)}.{" "}
          {connection.sources.length} professional Instagram source
          {connection.sources.length === 1 ? "" : "s"} discovered (up to 50).
        </p>
      ) : null}
      {connection.connected && connection.sources.length === 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          No Instagram research source was returned. Connect a professional
          Instagram account to a Facebook Page you manage, grant the research
          permissions and reconnect. Your direct Instagram publishing connection
          is separate.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canManage && enabled ? (
          <Button
            nativeButton={false}
            render={<a href="/api/social/research/authorize" />}
          >
            <KeyRoundIcon />
            {connection.connected
              ? "Reconnect Meta research"
              : "Authorize Meta research"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "A workspace owner can authorize or reconnect Meta research."
              : "Research is disabled until its database and Meta setup are ready."}
          </p>
        )}
        {canManage && connection.connected ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              Disconnect research
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disconnect research access?</DialogTitle>
                <DialogDescription>
                  This removes VCStudio’s stored research credential. Saved
                  observations and publishing connections stay available. It
                  does not revoke the Meta app itself.
                </DialogDescription>
              </DialogHeader>
              {error ? <p role="alert">{error}</p> : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Keep connected
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const result = await disconnectResearchAction();
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        setOpen(false);
                        router.refresh();
                      } catch {
                        setError(
                          "Research access could not be disconnected. Try again.",
                        );
                      }
                    })
                  }
                >
                  {pending ? <Loader2Icon className="animate-spin" /> : null}
                  {pending ? "Disconnecting…" : "Disconnect research"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </section>
  );
}
