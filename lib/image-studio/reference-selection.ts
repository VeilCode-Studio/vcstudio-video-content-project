import type { MediaAssetView } from "@/lib/media/media-asset-view";
import { formatBytes } from "@/lib/format/bytes";
export const IMAGE_REFERENCE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type ImageReferenceLimits = {
  maxReferences: number;
  maxReferenceBytes: number;
  maxImageBytes: number;
};
export function validateImageReferences(
  assets: MediaAssetView[],
  limits: ImageReferenceLimits,
): string | null {
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length)
    return "This image is already selected.";
  if (assets.length > limits.maxReferences)
    return `Choose at most ${limits.maxReferences} reference images.`;
  if (
    assets.some(
      (asset) =>
        asset.kind !== "image" ||
        asset.inspectionPending ||
        asset.inspectionFailed ||
        !IMAGE_REFERENCE_TYPES.some((type) => type === asset.contentType),
    )
  )
    return "Choose ready PNG, JPEG or WebP reference images.";
  if (
    assets.some(
      (asset) => asset.sizeBytes <= 0 || asset.sizeBytes > limits.maxImageBytes,
    )
  )
    return `Each reference image must be nonempty and no larger than ${formatBytes(limits.maxImageBytes)}.`;
  if (
    assets.reduce((bytes, asset) => bytes + asset.sizeBytes, 0) >
    limits.maxReferenceBytes
  )
    return `Reference images together must not exceed ${formatBytes(limits.maxReferenceBytes)}.`;
  return null;
}
export function validateReferenceFiles(
  files: Pick<File, "name" | "size" | "type">[],
  existing: MediaAssetView[],
  limits: ImageReferenceLimits,
): string | null {
  if (files.length + existing.length > limits.maxReferences)
    return `Choose at most ${limits.maxReferences} reference images in total. Remove a selected image to make room.`;
  for (const file of files) {
    if (!IMAGE_REFERENCE_TYPES.some((type) => type === file.type))
      return `${file.name}: choose a PNG, JPEG or WebP image.`;
    if (file.size <= 0) return `${file.name}: this image is empty.`;
    if (file.size > limits.maxImageBytes)
      return `${file.name}: the image limit is ${formatBytes(limits.maxImageBytes)}.`;
  }
  if (
    existing.reduce((bytes, asset) => bytes + asset.sizeBytes, 0) +
      files.reduce((bytes, file) => bytes + file.size, 0) >
    limits.maxReferenceBytes
  )
    return `Reference images together must not exceed ${formatBytes(limits.maxReferenceBytes)}.`;
  return null;
}
