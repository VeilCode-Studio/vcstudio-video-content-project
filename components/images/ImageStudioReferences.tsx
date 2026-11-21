"use client";
import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaPickerDialog } from "@/components/social/MediaPickerDialog";
import { MediaUploadProgress } from "@/components/social/MediaUploadProgress";
import { useMediaUploadQueue } from "@/hooks/useMediaUploadQueue";
import { formatBytes } from "@/lib/format/bytes";
import {
  validateImageReferences,
  validateReferenceFiles,
  IMAGE_REFERENCE_TYPES,
  type ImageReferenceLimits,
} from "@/lib/image-studio/reference-selection";
import type { MediaAssetView } from "@/lib/media/media-asset-view";
import { ImageStudioReferenceCard } from "./ImageStudioReferenceCard";
export function ImageStudioReferences({
  workspaceId,
  references,
  limits,
  disabled,
  onChange,
  onBusyChange,
}: {
  workspaceId: string;
  references: MediaAssetView[];
  limits: ImageReferenceLimits;
  disabled: boolean;
  onChange: (assets: MediaAssetView[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { active, failures, uploadAll } = useMediaUploadQueue({
    workspaceId,
    validateFiles: (files) => validateReferenceFiles(files, references, limits),
    onBusyChange,
    onUploaded: (assets) => {
      const next = [...references, ...assets];
      const invalid = validateImageReferences(next, limits);
      setError(
        invalid
          ? invalid + " Uploaded originals remain in your media library."
          : null,
      );
      if (!invalid) onChange(next);
    },
  });
  const full = references.length >= limits.maxReferences;
  return (
    <section aria-label="Reference images" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Reference images{" "}
          <span className="text-muted-foreground">
            ({references.length}/{limits.maxReferences})
          </span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <MediaPickerDialog
            title="Image references"
            description="Select PNG, JPEG or WebP originals to guide this image, then use your selection."
            triggerLabel="Choose reference images"
            confirmLabel="Use references"
            confirmDescription="Adds these images to your selected references."
            recentAssets={[]}
            attachedIds={references.map((asset) => asset.id)}
            disabled={disabled || full}
            kind="image"
            selectionLimit={Math.max(
              1,
              limits.maxReferences - references.length,
            )}
            onConfirm={async (assets) => {
              const next = [...references, ...assets];
              const invalid = validateImageReferences(next, limits);
              if (invalid) return { ok: false, error: invalid };
              setError(null);
              onChange(next);
              return { ok: true };
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || full}
            onClick={() => fileInput.current?.click()}
          >
            <UploadIcon aria-hidden />
            Upload reference images
          </Button>
          <Input
            aria-label="Upload reference image files"
            type="file"
            accept={IMAGE_REFERENCE_TYPES.join(",")}
            multiple
            className="hidden"
            ref={fileInput}
            disabled={disabled || full}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (disabled || full) return;
              setError(null);
              void uploadAll(files);
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPEG or WebP. Up to{" "}
        {formatBytes(Math.min(limits.maxImageBytes, limits.maxReferenceBytes))}{" "}
        per image and {formatBytes(limits.maxReferenceBytes)} combined. Uploads
        are saved to your private media library and selected here automatically.
      </p>
      {references.length ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {references.map((asset) => (
            <ImageStudioReferenceCard
              key={asset.id}
              asset={asset}
              disabled={disabled}
              onRemove={() => {
                setError(null);
                onChange(references.filter((item) => item.id !== asset.id));
              }}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Choose library images or upload references to see them here.
        </p>
      )}
      {active ? <MediaUploadProgress upload={active} /> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {failures.length ? (
        <ul
          role="alert"
          className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {failures.map((failure, index) => (
            <li className="break-words" key={index}>
              {failure.fileName}: {failure.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
