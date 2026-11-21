"use client";
import { useId, useState } from "react";
import { Loader2Icon, PinIcon } from "lucide-react";
import type {
  PinterestPinSettings,
  PinterestBoard,
} from "@studio/contracts/publishing";
import { getPinterestBoardsAction } from "@/app/(authenticated)/app/social/pinterest-actions";
import { MediaAssetPreview } from "./MediaAssetPreview";
import type { MediaAssetView } from "@/lib/media/media-asset-view";
import { MediaPickerDialog } from "./MediaPickerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
export function PinterestPostSettingsPanel({
  connectionId,
  accountName,
  value,
  onChange,
  disabled,
  hasVideo,
  cover,
  onCoverSelected,
}: {
  connectionId: string;
  accountName: string;
  value: PinterestPinSettings;
  onChange: (value: PinterestPinSettings) => void;
  disabled: boolean;
  hasVideo: boolean;
  cover: MediaAssetView | null;
  onCoverSelected: (asset: MediaAssetView) => void;
}) {
  const id = useId();
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [bookmark, setBookmark] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load(next = false) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPinterestBoardsAction({
        connectionId,
        ...(next && bookmark ? { bookmark } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBoards((current) =>
        next
          ? [
              ...current,
              ...result.page.items.filter(
                (item) => !current.some((existing) => existing.id === item.id),
              ),
            ]
          : result.page.items,
      );
      setBookmark(result.page.bookmark);
    } catch {
      setError(
        "Pinterest boards could not be loaded. Your draft is preserved; try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section
      aria-label={`Pinterest settings for ${accountName}`}
      className="app-panel min-w-0 space-y-4 rounded-xl border"
    >
      <header className="app-heading">
        <h2 className="flex items-center gap-2 font-semibold">
          <PinIcon aria-hidden className="size-4 text-[#e60023]" />
          Pinterest Pin - {accountName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Trial-app Pins are visible only to their creator. One image or video
          per Pin. Board and cover choices are included in your saved draft and
          publication review.
        </p>
      </header>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-board`}>Public board</Label>
          <FormSelect
            id={`${id}-board`}
            value={value.boardId}
            disabled={disabled}
            onValueChange={(boardId) =>
              onChange({
                ...value,
                boardId,
                boardName:
                  boards.find((board) => board.id === boardId)?.name ||
                  value.boardName,
              })
            }
          >
            <SelectItem value="">Choose a board</SelectItem>
            {value.boardId &&
            !boards.some((board) => board.id === value.boardId) ? (
              <SelectItem value={value.boardId}>
                {value.boardName || value.boardId}
              </SelectItem>
            ) : null}
            {boards.map((board) => (
              <SelectItem value={board.id} key={board.id}>
                {board.name}
              </SelectItem>
            ))}
          </FormSelect>
        </div>
        <Button
          type="button"
          className="h-10"
          variant="outline"
          disabled={disabled || loading}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
          ) : null}
          {loading ? "Loading boards..." : "Load boards"}
        </Button>
      </div>
      {bookmark && boards.length < 250 ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          onClick={() => void load(true)}
        >
          Load more boards
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Pin title</Label>
        <Input
          id={`${id}-title`}
          value={value.title}
          maxLength={100}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, title: event.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Pinterest description</Label>
        <Textarea
          id={`${id}-description`}
          value={value.description ?? ""}
          maxLength={800}
          placeholder="Uses your post text while unset"
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
        />
        <Button
          type="button"
          variant="link"
          className="self-start"
          disabled={disabled || value.description === null}
          onClick={() => onChange({ ...value, description: null })}
        >
          Use post text
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-link`}>Destination link (optional)</Label>
        <Input
          id={`${id}-link`}
          type="url"
          value={value.link ?? ""}
          placeholder="https://"
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, link: event.target.value || null })
          }
        />
      </div>
      {hasVideo ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Video cover (required JPEG/PNG)</p>
          {cover ? (
            <div className="max-w-xs">
              <MediaAssetPreview asset={cover} />
              <p className="mt-2 text-sm">{cover.title}</p>
            </div>
          ) : null}
          <p className="break-all text-xs text-muted-foreground">
            {value.videoCoverAssetId
              ? `Selected cover: ${value.videoCoverAssetId}`
              : "Choose an existing library image. It is separate from the video attachment."}
          </p>
          <MediaPickerDialog
            attachedIds={[]}
            disabled={disabled}
            recentAssets={[]}
            kind="image"
            selectionLimit={1}
            triggerLabel="Choose Pinterest cover"
            title="Pinterest video cover"
            confirmLabel="Use this cover"
            confirmDescription="Updates your draft. Save the post to keep this choice."
            onConfirm={async (assets) => {
              const asset = assets[0];
              if (
                !asset ||
                !["image/jpeg", "image/png"].includes(asset.contentType) ||
                asset.sizeBytes > 20 * 1024 * 1024
              )
                return {
                  ok: false,
                  error: "Choose a JPEG/PNG image up to 20 MB.",
                };
              onCoverSelected(asset);
              onChange({ ...value, videoCoverAssetId: asset.id });
              return { ok: true };
            }}
          />
        </div>
      ) : null}
      {disabled ? (
        <p className="text-xs text-muted-foreground">
          Cancel a saved schedule before changing its approved Pin settings.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Use Save draft above to keep changes. Connecting an account and saving
          a draft do not publish a Pin.
        </p>
      )}
    </section>
  );
}
