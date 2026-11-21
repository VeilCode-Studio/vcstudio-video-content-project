import {
  studioImageStartSchema,
  type StudioImageJob,
} from "@studio/contracts/image-studio";
import { videoImageAsset } from "./video-data";
const jobs: StudioImageJob[] = [];
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
  const id = crypto.randomUUID();
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
