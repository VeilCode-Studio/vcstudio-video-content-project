import type { MediaAssetView } from "@/lib/media/media-asset-view";
import type { StudioImageRequest } from "@studio/contracts/image-studio";
export type ImageStudioSourceView = {
  asset: MediaAssetView;
  size: StudioImageRequest["size"];
  quality: StudioImageRequest["quality"];
};
