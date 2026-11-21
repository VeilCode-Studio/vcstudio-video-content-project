import { ImageStudioPage } from "@/components/images/ImageStudioPage";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { can } from "@/lib/policies/workspace-policy";
import {
  imageStudioOptions,
  imageStudioHistory,
} from "@/lib/image-studio/service";
export default async function ImagesPage() {
  const ctx = await getAuthenticatedWorkspaceContext();
  if (!ctx) return null;
  return (
    <ImageStudioPage
      workspaceId={ctx.activeMembership.workspaceId}
      options={imageStudioOptions()}
      canGenerate={can(ctx.activeMembership.role, "generateSceneImages")}
      initialJobs={await imageStudioHistory(ctx.activeMembership.workspaceId)}
    />
  );
}
