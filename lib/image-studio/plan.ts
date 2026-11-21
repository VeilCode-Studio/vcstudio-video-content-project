import "server-only";
import type { StudioImageRequest } from "@studio/contracts/image-studio";
import { buildStandaloneGenerationPlan } from "@/lib/mcp/standalone-generation-plan";
import { LibraryImageError } from "@/db/commands/library-image-jobs";
export async function studioImagePlan(
  workspaceId: string,
  request: StudioImageRequest,
) {
  const plan = await buildStandaloneGenerationPlan(workspaceId, {
    ...request,
    kind: "image",
    maximumCostCents: 0,
  });
  if (
    plan.kind !== "image" ||
    !plan.configuration.model.startsWith("gpt-image-")
  )
    throw new LibraryImageError(
      "Image Studio needs a configured OpenAI image model.",
    );
  return plan;
}
