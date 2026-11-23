import {
  studioImageStartSchema,
  studioImageEditSchema,
  studioImageEditStartSchema,
  type StudioImageJob,
} from "@studio/contracts/image-studio";
import { videoImageAsset } from "./video-data";
const jobs: StudioImageJob[] = new URLSearchParams(location.search).has("ready")
  ? [
      {
        id: videoImageAsset.id,
        title: "Studio original",
        prompt: "Original image",
        status: "succeeded",
        estimatedCostCents: 8,
        actualCostCents: 7,
        error: null,
        createdAt: "2026-11-23T00:00:00Z",
        previewUrl: new URLSearchParams(location.search).has("preview-error")
          ? "https://missing.example/studio.png"
          : videoImageAsset.previewUrl,
        canRetry: false,
      },
    ]
  : [];
export const initialImageJobs = [...jobs];
const keys = new Map<string, string>();
export async function quoteImageAction() {
  await new Promise((resolve) => setTimeout(resolve, 180));
  return {
    ok: true as const,
    value: {
      token: "mock-quote",
      estimatedCostCents: 8,
      model: "gpt-image-1",
      dailyBudgetCents: 100,
      monthlyBudgetCents: 1000,
    },
  };
}
export async function startImageAction(_ws: unknown, value: unknown) {
  const input = studioImageStartSchema.parse(value);
  localStorage.setItem("imageStarted", JSON.stringify(input));
  const existing = keys.get(input.idempotencyKey);
  if (existing) return { ok: true as const, value: { id: existing } };
  const id = crypto.randomUUID();
  keys.set(input.idempotencyKey, id);
  jobs.unshift({
    id,
    title: input.request.title || "Generated image",
    prompt: input.request.prompt,
    status: "queued",
    estimatedCostCents: 8,
    actualCostCents: null,
    error: new URLSearchParams(location.search).has("queue-error")
      ? "Retry queue to confirm the saved request."
      : null,
    createdAt: new Date().toISOString(),
    previewUrl: null,
    canRetry: true,
  });
  return { ok: true as const, value: { id } };
}
export async function imageHistoryAction() {
  return { ok: true as const, value: jobs };
}
export async function retryImageQueueAction(_ws: unknown, id: string) {
  localStorage.setItem("imageRetry", id);
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.status = "succeeded";
    job.actualCostCents = 7;
    job.error = null;
    job.canRetry = false;
    job.previewUrl = videoImageAsset.previewUrl;
  }
  return { ok: true as const, value: { id } };
}
export async function getMediaLibraryPageAction() {
  localStorage.setItem("imageLibraryOpened", "true");
  return {
    ok: true as const,
    view: {
      assets: [
        videoImageAsset,
        {
          ...videoImageAsset,
          id: "66666666-6666-4666-8666-666666666666",
          title: "Second reference",
        },
      ],
      pageSize: 24,
      kind: "image",
      nextCursor: null,
    },
  };
}

export async function imageSourceAction(_ws: unknown, id: string) {
  localStorage.setItem(
    "imageSourceReads",
    String(Number(localStorage.getItem("imageSourceReads") ?? "0") + 1),
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  const job = jobs.find((job) => job.id === id && job.status === "succeeded");
  if (!job || new URLSearchParams(location.search).has("source-error"))
    return {
      ok: false as const,
      error: "This image is no longer available in the media library.",
    };
  return {
    ok: true as const,
    value: {
      asset: { ...videoImageAsset, id, title: job.title },
      size: "1024x1024" as const,
      quality: "medium" as const,
    },
  };
}
export async function quoteImageEditAction(_ws: unknown, value: unknown) {
  const edit = studioImageEditSchema.parse(value);
  localStorage.setItem("imageEditQuoted", JSON.stringify(edit));
  return quoteImageAction();
}
export async function startImageEditAction(ws: unknown, value: unknown) {
  const input = studioImageEditStartSchema.parse(value);
  const attempts = JSON.parse(
    localStorage.getItem("imageEditAttempts") ?? "[]",
  ) as unknown[];
  attempts.push(input);
  localStorage.setItem("imageEditAttempts", JSON.stringify(attempts));
  if (localStorage.getItem("edit-save-error") === "true")
    return {
      ok: false as const,
      error: "Queue response unavailable. Retry the same request.",
    };
  return startImageAction(ws, {
    request: {
      title: "Studio original (edit)",
      prompt: input.edit.instructions,
      size: "1024x1024",
      quality: input.edit.quality,
      referenceAssetIds: [input.edit.sourceJobId],
    },
    quote: input.quote,
    idempotencyKey: input.idempotencyKey,
  });
}
