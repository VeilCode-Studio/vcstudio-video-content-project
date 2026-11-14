"use client";
import { useActionState } from "react";
import type { McpPublicOperation } from "@studio/contracts";
import type { ResearchAnalysisPreview } from "@studio/contracts/mcp-research";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { decideMcpOperationAction } from "@/app/(authenticated)/app/mcp/operations/[operationId]/actions";
export function ResearchAnalysisBrowserApproval({
  operation,
  preview,
}: {
  operation: McpPublicOperation;
  preview: ResearchAnalysisPreview;
}) {
  const [state, action, pending] = useActionState(decideMcpOperationAction, {
    ok: false,
    message: "",
  });
  const expired = new Date(operation.expiresAt) <= new Date();
  return (
    <section className="app-panel app-section rounded-2xl border bg-card">
      <div className="app-page-header">
        <div className="app-heading">
          <h2 className="text-xl font-semibold">Review media analysis</h2>
          <p className="text-sm text-muted-foreground">
            {preview.accountName} · {preview.format}
          </p>
        </div>
        <Badge variant="secondary">
          {operation.status === "prepared"
            ? "Autonomous analysis"
            : "Approval required"}
        </Badge>
      </div>
      <p className="text-sm">
        Analyze the actual media for this exact saved post. Media is temporary;
        only findings and evidence are retained. Availability is checked before
        paid submission.
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">
        {preview.caption || "No caption supplied."}
      </p>
      <a
        href={preview.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline underline-offset-4"
      >
        View original post
      </a>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Analysis goal</dt>
          <dd className="break-words">{preview.goal}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Model</dt>
          <dd>{preview.model}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conservative estimate</dt>
          <dd>${(preview.estimatedCostCents / 100).toFixed(2)} USD</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Authorized maximum</dt>
          <dd>${(preview.maximumCostCents / 100).toFixed(2)} USD</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Up to {preview.maximumDurationSeconds} seconds of video and{" "}
        {Math.round(preview.maximumBytes / 1024 / 1024)} MB total. No silent
        truncation. This preview expires after ten minutes. Observations and
        hypotheses do not prove why a post performed well.
      </p>
      {operation.status === "prepared" ? (
        <p role="status">
          Nothing has started. The authorized assistant can execute this
          analysis through MCP.
        </p>
      ) : (
        <form action={action} className="app-section">
          <input type="hidden" name="operationId" value={operation.id} />
          <input
            type="hidden"
            name="workspaceId"
            value={operation.workspaceId}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              name="decision"
              value="approve"
              disabled={pending || state.ok || expired}
              aria-busy={pending}
            >
              {pending ? "Authorizing analysis…" : "Approve media analysis"}
            </Button>
            <Button
              type="submit"
              name="decision"
              value="cancel"
              variant="outline"
              disabled={pending || state.ok}
            >
              Cancel request
            </Button>
          </div>
          {expired ? (
            <p role="alert">
              This preview expired. Ask the assistant for a fresh analysis
              preparation.
            </p>
          ) : null}
          {state.message ? (
            <p role={state.ok ? "status" : "alert"}>{state.message}</p>
          ) : null}
        </form>
      )}
    </section>
  );
}
