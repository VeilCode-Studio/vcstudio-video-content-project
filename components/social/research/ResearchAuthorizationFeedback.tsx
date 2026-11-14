import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { AlertTitle } from "@/components/ui/AlertTitle";
import { AlertDescription } from "@/components/ui/AlertDescription";
import { Button } from "@/components/ui/button";
import type { ResearchAuthorizationFailure } from "@studio/contracts/social-research";
import { researchAuthorizationMessages } from "@/lib/social/research/authorization-feedback";

export function ResearchAuthorizationFeedback({
  status,
  failure,
  reference,
  canRetry,
}: {
  status: "connected" | "cancelled" | "failed" | "invalid";
  failure?: ResearchAuthorizationFailure | null;
  reference?: string | null;
  canRetry: boolean;
}) {
  const failed = status === "failed" || status === "invalid";
  const message = failure
    ? researchAuthorizationMessages[failure]
    : status === "invalid"
      ? researchAuthorizationMessages.session
      : null;
  return (
    <Alert
      variant={failed ? "destructive" : "default"}
      role={failed ? "alert" : "status"}
      className={
        failed
          ? "border-l-4"
          : status === "connected"
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-amber-500/30 bg-amber-500/10"
      }
    >
      {failed ? (
        <CircleAlertIcon aria-hidden="true" />
      ) : status === "connected" ? (
        <CircleCheckIcon aria-hidden="true" />
      ) : (
        <InfoIcon aria-hidden="true" />
      )}
      <AlertTitle>
        {failed
          ? (message?.title ?? "Research authorization failed")
          : status === "connected"
            ? "Research access authorized"
            : "Authorization cancelled"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {failed
            ? (message?.detail ??
              "Meta research authorization did not finish. No new research access was confirmed.")
            : status === "connected"
              ? "Choose an account and refresh to check the data Meta allows this app to read."
              : "No new research access was granted. You can start again when ready."}
        </p>
        {failed ? (
          <p>
            {message?.action ??
              "Start a fresh authorization. If it fails again, share the reference below so the failed step can be identified."}
          </p>
        ) : null}
        {reference && failed ? (
          <p className="break-all font-mono text-xs">
            Support reference: {reference}
          </p>
        ) : null}
        {failed && canRetry ? (
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={<a href="/api/social/research/authorize" />}
          >
            Try authorization again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
