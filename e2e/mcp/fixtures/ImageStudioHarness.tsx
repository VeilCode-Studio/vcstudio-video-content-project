import { ImageStudioPage } from "@/components/images/ImageStudioPage";
import { initialImageJobs } from "./MockImageActions";
export function ImageStudioHarness() {
  const mode = new URLSearchParams(location.search).get("mode");
  return (
    <ImageStudioPage
      workspaceId="11111111-1111-4111-8111-111111111111"
      canGenerate={mode !== "viewer"}
      options={{
        enabled: mode !== "disabled",
        model: "gpt-image-1",
        maxReferences: 2,
        maxReferenceBytes: 20 * 1024 * 1024,
        maxImageBytes: 25 * 1024 * 1024,
      }}
      initialJobs={initialImageJobs}
    />
  );
}
