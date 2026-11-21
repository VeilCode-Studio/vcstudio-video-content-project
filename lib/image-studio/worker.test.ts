import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import OpenAI from "openai";
import { ImageGenerationProviderResponseError } from "@/lib/openai/image-generation-provider";
import type { libraryImageJobs } from "@/db/schema";
import type { StandaloneGenerationPlan } from "@/lib/mcp/standalone-generation-plan";
import { mcpIds } from "@/lib/test-utils/mcp-fixtures";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  claim: vi.fn(),
  find: vi.fn(),
  actor: vi.fn(),
  expired: vi.fn(),
  update: vi.fn(),
  settle: vi.fn(),
  complete: vi.fn(),
  member: vi.fn(),
  plan: vi.fn(),
  generate: vi.fn(),
  refs: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/db/repositories/library-image-jobs.repository", () => ({
  findLibraryImageJob: m.find,
  findLibraryImageActor: m.actor,
  expiredLibraryImageJobs: m.expired,
}));
vi.mock("@/db/commands/library-image-jobs", async (original) => ({
  ...(await original<typeof import("@/db/commands/library-image-jobs")>()),
  claimLibraryImage: m.claim,
  updateLibraryImage: m.update,
  settleLibraryImage: m.settle,
  completeLibraryImage: m.complete,
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  requireWorkspaceMembership: m.member,
}));
vi.mock("./plan", () => ({ studioImagePlan: m.plan }));
vi.mock("@/lib/openai/openai-image-generation-provider", () => ({
  OpenAiImageGenerationProvider: class {
    generate = m.generate;
  },
}));
vi.mock("@/lib/storage/scene-image-storage", () => ({
  downloadSceneImageReferences: m.refs,
}));
vi.mock("@/lib/storage/media-asset-storage", () => ({
  putGeneratedMediaAsset: m.put,
}));
vi.mock("@/lib/env/server", () => ({
  getSceneImageEnvironment: () => ({
    OPENAI_API_KEY: "test-only",
    OPENAI_REQUEST_TIMEOUT_SECONDS: 5,
    MAX_REFERENCE_BYTES_PER_GENERATION: 1000000,
  }),
  getMediaLibraryEnvironment: () => ({ MAX_MEDIA_IMAGE_BYTES: 1000000 }),
}));
import {
  runLibraryImage,
  failLibraryImage,
  recoverLibraryImages,
} from "./worker";
const input = { workspaceId: mcpIds.workspace, jobId: mcpIds.operation };
let job: typeof libraryImageJobs.$inferSelect;
let plan: StandaloneGenerationPlan;
beforeEach(async () => {
  vi.clearAllMocks();
  plan = {
    kind: "image",
    estimatedCostCents: 8,
    promptTemplateVersion: "standalone-image-v1",
    configuration: {
      model: "gpt-image-1",
      prompt: "A tree",
      quality: "low",
      size: "1024x1024",
      outputFormat: "png",
      outputCompression: 100,
      background: "opaque",
    },
    references: [],
    rates: {
      textInputCostPerMillionCents: 100,
      imageInputCostPerMillionCents: 100,
      outputCostPerMillionCents: 100,
    },
  };
  job = {
    id: input.jobId,
    workspaceId: input.workspaceId,
    userId: mcpIds.user,
    idempotencyKey: "key",
    requestHash: "hash",
    request: {
      prompt: "A tree",
      title: "Tree",
      size: "1024x1024",
      quality: "low",
      referenceAssetIds: [],
    },
    plan,
    status: "queued",
    estimatedCostCents: 8,
    actualCostCents: null,
    providerSubmitted: false,
    attemptCount: 0,
    triggerRunId: null,
    providerRequestId: null,
    usage: null,
    safeErrorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  m.claim.mockImplementation(async () => {
    if (job.status !== "queued") return null;
    job = { ...job, status: "running", attemptCount: 1 };
    return job;
  });
  m.find.mockImplementation(async () => job);
  m.update.mockImplementation(async (_ws, _id, states, values) => {
    if (!states.includes(job.status)) return null;
    job = { ...job, ...values };
    return job;
  });
  m.actor.mockResolvedValue({ clerkUserId: "user-test" });
  m.member.mockResolvedValue({ role: "owner" });
  m.plan.mockResolvedValue(plan);
  m.refs.mockResolvedValue([]);
  m.expired.mockResolvedValue([]);
  m.complete.mockImplementation(async () => {
    job = { ...job, status: "succeeded" };
  });
  m.generate.mockResolvedValue({
    bytes: await sharp({
      create: { width: 4, height: 3, channels: 3, background: "green" },
    })
      .png()
      .toBuffer(),
    mimeType: "image/png",
    requestId: "req-test",
    usage: null,
  });
});
describe("independent image worker", () => {
  it("saves a private ready original and never repeats a paid attempt", async () => {
    expect(await runLibraryImage(input)).toEqual({
      status: "succeeded",
      assetId: input.jobId,
    });
    expect(m.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 4,
        height: 3,
        contentType: "image/png",
        cost: 8,
        userId: mcpIds.user,
      }),
    );
    expect(m.put).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: `workspaces/${input.workspaceId}/library/${input.jobId}.png`,
      }),
    );
    await runLibraryImage(input);
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect(m.settle).toHaveBeenCalledTimes(1);
  });
  it.each(["deleted", "viewer", "membership"])(
    "rechecks %s access before spending",
    async (kind) => {
      if (kind === "deleted") m.actor.mockResolvedValue(null);
      if (kind === "viewer") m.member.mockResolvedValue({ role: "viewer" });
      if (kind === "membership")
        m.member.mockRejectedValue(new Error("revoked"));
      expect(await runLibraryImage(input)).toEqual({ status: "failed" });
      expect(m.generate).not.toHaveBeenCalled();
      expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 0);
    },
  );
  it("refuses changed references/configuration after queueing", async () => {
    m.plan.mockResolvedValue({ ...plan, estimatedCostCents: 9 });
    await runLibraryImage(input);
    expect(m.generate).not.toHaveBeenCalled();
    expect(job.safeErrorMessage).toContain("changed");
  });
  it("decodes reference bytes before a provider call", async () => {
    m.refs.mockResolvedValue([{ bytes: Buffer.from("not an image") }]);
    await runLibraryImage(input);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 0);
  });
  it("checks permissions again after downloading references", async () => {
    m.member
      .mockResolvedValueOnce({ role: "editor" })
      .mockResolvedValueOnce({ role: "viewer" });
    await runLibraryImage(input);
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("retains conservative cost for ambiguous submission failures", async () => {
    m.generate.mockRejectedValue(new Error("network private-secret"));
    await runLibraryImage(input);
    await runLibraryImage(input);
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect(job.safeErrorMessage).not.toContain("private-secret");
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 8);
  });
  it("releases definite rejected provider requests", async () => {
    m.generate.mockRejectedValue(
      new OpenAI.APIError(400, { message: "rejected" }, "bad", new Headers()),
    );
    await runLibraryImage(input);
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 0);
  });
  it("records actual token usage before storage", async () => {
    m.generate.mockResolvedValue({
      bytes: await sharp({
        create: { width: 4, height: 3, channels: 3, background: "green" },
      })
        .png()
        .toBuffer(),
      mimeType: "image/png",
      requestId: "req-test",
      usage: {
        inputTextTokens: 100,
        inputImageTokens: 200,
        outputTokens: 10000,
        totalTokens: 10300,
      },
    });
    await runLibraryImage(input);
    expect(m.complete).toHaveBeenCalledWith(
      expect.objectContaining({ cost: 2, requestId: "req-test" }),
    );
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 2);
  });
  it("blocks disguised output but accounts for completed provider work", async () => {
    m.generate.mockResolvedValue({
      bytes: Buffer.from("bad-file"),
      mimeType: "image/png",
      requestId: "req-test",
      usage: null,
    });
    await runLibraryImage(input);
    expect(m.put).not.toHaveBeenCalled();
    expect(m.complete).not.toHaveBeenCalled();
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 8);
  });
  it("recovers an unsubmitted abandoned request without a paid retry", async () => {
    m.expired.mockResolvedValue([{ job }]);
    await recoverLibraryImages();
    expect(job.status).toBe("failed");
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 0);
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("settles an already completed job after a worker exit", async () => {
    job = { ...job, status: "succeeded", actualCostCents: 3 };
    await failLibraryImage(input.workspaceId, input.jobId);
    expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 3);
    expect(m.update).not.toHaveBeenCalled();
  });
});

it("retains usage and request ID from an unusable provider response", async () => {
  m.generate.mockRejectedValue(
    new ImageGenerationProviderResponseError({
      code: "bad_dimensions",
      requestId: "req-invalid",
      usage: {
        inputTextTokens: 100,
        inputImageTokens: 200,
        outputTokens: 10000,
        totalTokens: 10300,
      },
    }),
  );
  await runLibraryImage(input);
  expect(job.providerRequestId).toBe("req-invalid");
  expect(job.usage).toMatchObject({
    errorCode: "invalid_provider_response",
    outputTokens: 10000,
  });
  expect(m.settle).toHaveBeenCalledWith(input.workspaceId, input.jobId, 2);
});
