import { describe, expect, it } from "vitest";
import {
  validateImageReferences,
  validateReferenceFiles,
} from "./reference-selection";
import type { MediaAssetView } from "@/lib/media/media-asset-view";
const limits = { maxReferences: 2, maxImageBytes: 100, maxReferenceBytes: 150 };
const asset: MediaAssetView = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "image",
  title: "Reference",
  altText: "",
  tags: [],
  contentType: "image/png",
  sizeBytes: 50,
  width: 4,
  height: 4,
  durationMilliseconds: null,
  originalFileName: "ref.png",
  createdAt: "2026-11-22T00:00:00Z",
  previewUrl: "https://example.invalid/ref",
};
const file = { name: "ref.png", type: "image/png", size: 50 };
describe("Image Studio reference selection", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])(
    "allows %s originals",
    (contentType) => {
      expect(
        validateImageReferences([{ ...asset, contentType }], limits),
      ).toBeNull();
      expect(
        validateReferenceFiles([{ ...file, type: contentType }], [], limits),
      ).toBeNull();
    },
  );
  it("keeps library and uploaded references within one limit", () => {
    expect(validateReferenceFiles([file, file], [asset], limits)).toContain(
      "at most 2",
    );
  });
  it("rejects unsupported files before requesting upload", () => {
    expect(
      validateReferenceFiles([{ ...file, type: "video/mp4" }], [], limits),
    ).toContain("PNG, JPEG or WebP");
    expect(
      validateReferenceFiles([{ ...file, type: "image/gif" }], [], limits),
    ).toContain("PNG, JPEG or WebP");
  });
  it("rejects empty and oversized originals", () => {
    expect(
      validateReferenceFiles([{ ...file, size: 0 }], [], limits),
    ).toContain("empty");
    expect(
      validateReferenceFiles([{ ...file, size: 101 }], [], limits),
    ).toContain("image limit");
  });
  it("accounts for already selected bytes", () => {
    expect(
      validateReferenceFiles(
        [{ ...file, size: 100 }],
        [{ ...asset, sizeBytes: 51 }],
        limits,
      ),
    ).toContain("together");
  });
  it("rejects duplicate selections", () => {
    expect(validateImageReferences([asset, asset], limits)).toContain(
      "already selected",
    );
  });
  it("rejects excessive selected count", () => {
    expect(
      validateImageReferences(
        [asset, { ...asset, id: "b" }, { ...asset, id: "c" }],
        limits,
      ),
    ).toContain("at most");
  });
  it.each([
    { kind: "video" as const },
    { inspectionPending: true },
    { inspectionFailed: true },
    { contentType: "image/gif" },
  ])("rejects unusable library references %j", (change) => {
    expect(
      validateImageReferences([{ ...asset, ...change }], limits),
    ).toContain("ready PNG");
  });
  it("checks actual completion bytes before selection", () => {
    expect(
      validateImageReferences([{ ...asset, sizeBytes: 101 }], limits),
    ).toContain("no larger");
    expect(
      validateImageReferences([asset, { ...asset, id: "b", sizeBytes: 100 }], {
        ...limits,
        maxReferenceBytes: 149,
      }),
    ).toContain("together");
  });
});
