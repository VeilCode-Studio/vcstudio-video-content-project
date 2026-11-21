import { task } from "@trigger.dev/sdk";
import { studioImageScopeSchema } from "@studio/contracts/image-studio";
import { runLibraryImage, failLibraryImage } from "@/lib/image-studio/worker";
export const libraryImageGenerationTask = task({
  id: "library-image-generation",
  queue: { name: "image-generation", concurrencyLimit: 2 },
  retry: { maxAttempts: 1 },
  maxDuration: 600,
  run: runLibraryImage,
  onFailure: async ({ payload }) => {
    const p = studioImageScopeSchema.parse(payload);
    await failLibraryImage(p.workspaceId, p.jobId);
  },
});
