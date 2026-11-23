"use client";
import { useId, useRef, useState } from "react";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import { MediaAssetPreview } from "@/components/social/MediaAssetPreview";
import {
  imageSourceAction,
  quoteImageEditAction,
  startImageEditAction,
} from "@/app/(authenticated)/app/images/actions";
import type { ImageStudioSourceView } from "@/lib/image-studio/source-view";
import type { StudioImageEdit } from "@studio/contracts/image-studio";
export function ImageStudioEditDialog({
  workspaceId,
  jobId,
  disabled,
  onCreated,
}: {
  workspaceId: string;
  jobId: string;
  disabled: boolean;
  onCreated: () => Promise<void>;
}) {
  const inputId = useId();
  const sequence = useRef(0);
  const key = useRef<string | null>(null);
  const [open, setOpen] = useState(false),
    [source, setSource] = useState<ImageStudioSourceView | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState(""),
    [quality, setQuality] = useState<StudioImageEdit["quality"]>("medium");
  const [review, setReview] = useState<{
    token: string;
    estimatedCostCents: number;
  } | null>(null);
  function changed() {
    setReview(null);
    key.current = null;
  }
  async function loadSource() {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    setSource(null);
    try {
      const result = await imageSourceAction(workspaceId, jobId);
      if (current !== sequence.current) return;
      if (!result.ok) setError(result.error);
      else {
        setSource(result.value);
        setQuality(result.value.quality);
      }
    } catch {
      if (current === sequence.current)
        setError("The source image could not load. Try again.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }
  function changeOpen(value: boolean) {
    if (busy) return;
    setOpen(value);
    if (value) {
      setInstructions("");
      changed();
      void loadSource();
    } else sequence.current++;
  }
  async function estimate() {
    if (busy || !source) return;
    setBusy(true);
    setError(null);
    try {
      const result = await quoteImageEditAction(workspaceId, {
        sourceJobId: jobId,
        instructions,
        quality,
      });
      if (!result.ok) setError(result.error);
      else {
        setReview(result.value);
        key.current = crypto.randomUUID();
      }
    } catch {
      setError(
        "The edit estimate could not load. Your instructions are preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy || !review) return;
    setBusy(true);
    setError(null);
    try {
      key.current ??= crypto.randomUUID();
      const result = await startImageEditAction(workspaceId, {
        edit: { sourceJobId: jobId, instructions, quality },
        quote: review.token,
        idempotencyKey: key.current,
      });
      if (!result.ok) setError(result.error);
      else {
        await onCreated();
        toast.success("Edited image requested", {
          description:
            "Your original is unchanged. Follow progress in Your images.",
        });
        setOpen(false);
        sequence.current++;
      }
    } catch {
      setError(
        "The queue handoff was not confirmed. Retry with the same instructions to reuse this request, or check image history.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        disabled={disabled}
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <PencilIcon aria-hidden />
        Edit image
      </DialogTrigger>
      <DialogContent
        showCloseButton={!busy}
        className="w-[calc(100%-2rem)] max-w-3xl sm:max-w-3xl font-[family-name:var(--font-geist-sans,Arial,sans-serif)]"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>Edit image</DialogTitle>
          <DialogDescription>
            Describe the changes to this image. An edited version is saved
            separately; the original stays in your library. AI edits may also
            alter other details.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status" className="flex items-center gap-2">
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
            Loading source image...
          </p>
        ) : null}
        {source ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-2">
              <MediaAssetPreview asset={source.asset} controls={false} />
              <p className="break-words text-xs text-muted-foreground">
                {source.asset.title} / {source.size}
              </p>
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={inputId}>What would you like to change?</Label>
                <Textarea
                  id={inputId}
                  value={instructions}
                  maxLength={20000}
                  rows={6}
                  disabled={busy}
                  placeholder="For example: change the background to warm beige and keep the person, clothing and framing."
                  onChange={(event) => {
                    setInstructions(event.target.value);
                    changed();
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={inputId + "-quality"}>Edit quality</Label>
                <FormSelect
                  id={inputId + "-quality"}
                  value={quality}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (
                      value === "low" ||
                      value === "medium" ||
                      value === "high"
                    ) {
                      setQuality(value);
                      changed();
                    }
                  }}
                >
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </FormSelect>
              </div>
            </div>
          </div>
        ) : !loading ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => void loadSource()}
          >
            Retry source image
          </Button>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {review ? (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <p className="font-medium">
              Edit estimate ${(review.estimatedCostCents / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              This is a paid image edit using the source image. The estimate is
              valid for ten minutes. Workspace spending limits apply.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          {review ? (
            <Button
              type="button"
              disabled={busy || disabled}
              onClick={() => void save()}
            >
              {busy ? (
                <Loader2Icon aria-hidden className="animate-spin" />
              ) : null}
              Create edited version
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || disabled || !source || !instructions.trim()}
              onClick={() => void estimate()}
            >
              {busy ? (
                <Loader2Icon aria-hidden className="animate-spin" />
              ) : null}
              Review edit estimate
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
