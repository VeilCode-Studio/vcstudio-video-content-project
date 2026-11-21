import { PinIcon, Clock3Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
export function PinterestConnectionPanel({
  ready,
  canConnect,
}: {
  ready: boolean;
  canConnect: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e60023] text-white">
            <PinIcon aria-hidden className="size-5" />
          </span>
          <div className="app-heading">
            <h2 className="text-base font-semibold">Pinterest</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              {ready
                ? "Connect an account, select its public board in a Social draft, and publish or schedule an image or video Pin. Video Pins require a cover image."
                : "Connection is on hold while Pinterest app approval and server credentials are pending. Existing channels remain available."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={
              ready
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }
          >
            {!ready ? <Clock3Icon aria-hidden className="size-3" /> : null}
            {ready ? "Connection available" : "Approval / setup pending"}
          </Badge>
          {canConnect ? (
            ready ? (
              <Button
                nativeButton={false}
                render={<a href="/api/pinterest/authorize" />}
                className="h-10 bg-[#e60023] text-white hover:bg-[#bd001e]"
              >
                Connect Pinterest
              </Button>
            ) : (
              <Button type="button" disabled className="h-10">
                Connect Pinterest
              </Button>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
