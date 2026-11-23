import { beforeEach, describe, expect, it, vi } from "vitest";
import { mcpIds } from "@/lib/test-utils/mcp-fixtures";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  assets: vi.fn(),
  url: vi.fn(),
  quote: vi.fn(),
  start: vi.fn(),
}));
vi.mock("./service", () => ({
  authorizeImageStudio: m.auth,
  quoteStudioImage: m.quote,
  startStudioImage: m.start,
}));
vi.mock("@/db/repositories/library-image-jobs.repository", () => ({
  findLibraryImageJob: m.find,
}));
vi.mock("@/db/repositories/media-assets.repository", () => ({
  findReadyMediaAssets: m.assets,
}));
vi.mock("@/lib/storage/media-asset-storage", () => ({
  createMediaAssetDownloadUrl: m.url,
}));
import {
  getStudioImageSource,
  quoteStudioImageEdit,
  startStudioImageEdit,
} from "./edit-service";
const ws = mcpIds.workspace,
  id = mcpIds.asset;
const edit = {
  sourceJobId: id,
  instructions: "Change only the background to beige.",
  quality: "high",
};
const savedRequest = {
  title: "Original portrait",
  prompt: "Original instructions",
  size: "1024x1536",
  quality: "medium",
  referenceAssetIds: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({
    workspaceId: ws,
    userId: mcpIds.user,
    role: "owner",
  });
  m.find.mockResolvedValue({ id, status: "succeeded", request: savedRequest });
  m.assets.mockResolvedValue([
    {
      id,
      kind: "image",
      contentType: "image/png",
      objectKey: `workspaces/${ws}/library/${id}.png`,
      title: "Portrait",
      altText: "",
      tags: [],
      sizeBytes: 100,
      width: 1024,
      height: 1536,
      durationMilliseconds: null,
      originalFileName: "portrait.png",
      createdAt: new Date(),
    },
  ]);
  m.url.mockResolvedValue("https://private.example/image");
  m.quote.mockResolvedValue({ token: "quote", estimatedCostCents: 9 });
  m.start.mockResolvedValue({ id: mcpIds.operation });
});
describe("Image Studio edit source and cost review", () => {
  it("returns a fresh private image only from the authorized workspace", async () => {
    expect(await getStudioImageSource(ws, id)).toMatchObject({
      asset: { id, kind: "image", previewUrl: "https://private.example/image" },
      size: "1024x1536",
      quality: "medium",
    });
    expect(m.auth).toHaveBeenCalledWith(ws);
    expect(m.find).toHaveBeenCalledWith(ws, id);
    expect(m.assets).toHaveBeenCalledWith({
      workspaceId: ws,
      mediaAssetIds: [id],
    });
  });
  it.each([
    null,
    { id, status: "queued", request: savedRequest },
    { id, status: "failed", request: savedRequest },
  ])("refuses absent or unfinished source %j", async (job) => {
    m.find.mockResolvedValue(job);
    await expect(getStudioImageSource(ws, id)).rejects.toThrow(
      /completed image/,
    );
    expect(m.url).not.toHaveBeenCalled();
  });
  it("refuses deleted originals", async () => {
    m.assets.mockResolvedValue([]);
    await expect(getStudioImageSource(ws, id)).rejects.toThrow(
      /no longer available/,
    );
    expect(m.url).not.toHaveBeenCalled();
  });
  it("does not fetch across workspace boundaries", async () => {
    m.auth.mockRejectedValue(new Error("access denied"));
    await expect(getStudioImageSource(mcpIds.post, id)).rejects.toThrow();
    expect(m.find).not.toHaveBeenCalled();
  });
  it("uses only the selected original, retains its canvas and wraps edit instructions", async () => {
    await quoteStudioImageEdit(ws, edit);
    expect(m.auth).toHaveBeenCalledWith(ws, true);
    expect(m.quote).toHaveBeenCalledWith(
      ws,
      expect.objectContaining({
        title: "Original portrait (edit)",
        size: "1024x1536",
        quality: "high",
        referenceAssetIds: [id],
        prompt: expect.stringContaining("Change only the background to beige."),
      }),
    );
    const request = m.quote.mock.calls[0]![1];
    expect(request.prompt).toContain("Preserve the subject identity");
    expect(request.prompt).not.toContain("Original instructions");
    expect(m.start).not.toHaveBeenCalled();
  });
  it("delegates execution to the existing signed quote and idempotency service", async () => {
    await startStudioImageEdit(ws, {
      edit,
      quote: "signed-quote",
      idempotencyKey: mcpIds.operation,
    });
    expect(m.start).toHaveBeenCalledWith(
      ws,
      expect.objectContaining({
        quote: "signed-quote",
        idempotencyKey: mcpIds.operation,
        request: expect.objectContaining({ referenceAssetIds: [id] }),
      }),
    );
  });
  it("blocks viewer editing before any source query or reservation", async () => {
    m.auth.mockRejectedValue(new Error("role denied"));
    await expect(quoteStudioImageEdit(ws, edit)).rejects.toThrow();
    await expect(
      startStudioImageEdit(ws, {
        edit,
        quote: "quote",
        idempotencyKey: mcpIds.operation,
      }),
    ).rejects.toThrow();
    expect(m.find).not.toHaveBeenCalled();
    expect(m.quote).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });
  it("rejects empty edits without invoking a generation service", async () => {
    await expect(
      quoteStudioImageEdit(ws, { ...edit, instructions: "  " }),
    ).rejects.toThrow();
    expect(m.quote).not.toHaveBeenCalled();
  });
  it("keeps the saved source request unchanged", async () => {
    const before = JSON.stringify(savedRequest);
    await quoteStudioImageEdit(ws, edit);
    expect(JSON.stringify(savedRequest)).toBe(before);
  });
  it("passes repeated keys unchanged for retrying after the source original was removed", async () => {
    m.assets.mockResolvedValue([]);
    const input = {
      edit,
      quote: "old-quote",
      idempotencyKey: mcpIds.operation,
    };
    await startStudioImageEdit(ws, input);
    await startStudioImageEdit(ws, input);
    expect(m.start.mock.calls[0]).toEqual(m.start.mock.calls[1]);
    expect(m.assets).not.toHaveBeenCalled();
  });
});
