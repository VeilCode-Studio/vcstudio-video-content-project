import { expect, it, vi } from "vitest";
import type { GetObjectCommand } from "@aws-sdk/client-s3";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  sign: vi
    .fn<
      (
        client: unknown,
        command: GetObjectCommand,
        options: { expiresIn: number },
      ) => Promise<string>
    >()
    .mockResolvedValue("https://storage.example/signed"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: m.sign }));
vi.mock("@/lib/env/server", () => ({
  getStorageEnvironment: () => ({
    R2_BUCKET_NAME: "private-bucket",
    R2_SIGNED_DOWNLOAD_EXPIRY_SECONDS: 900,
  }),
}));
vi.mock("@/lib/storage/r2-client", () => ({ getR2Client: () => ({}) }));
import { createMediaAssetDownloadUrl } from "./media-asset-storage";
it("signs an attachment response for downloads and preserves inline previews", async () => {
  await createMediaAssetDownloadUrl("private/original", 300, "original.png");
  expect(m.sign.mock.calls[0][1].input).toMatchObject({
    Bucket: "private-bucket",
    Key: "private/original",
    ResponseContentDisposition:
      "attachment; filename=\"original.png\"; filename*=UTF-8''original.png",
  });
  expect(m.sign.mock.calls[0][2]).toEqual({ expiresIn: 300 });
  await createMediaAssetDownloadUrl("private/original");
  expect(m.sign.mock.calls[1][1].input).not.toHaveProperty(
    "ResponseContentDisposition",
  );
});
