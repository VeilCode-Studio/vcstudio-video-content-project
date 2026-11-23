import { renderImageEditInstructions } from "@studio/prompts";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mcpIds } from "@/lib/test-utils/mcp-fixtures";
import { createOAuthState } from "@/lib/publishing/oauth-state";
import { fingerprint } from "@/lib/mcp/fingerprint";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  user: vi.fn(),
  member: vi.fn(),
  plan: vi.fn(),
  budget: vi.fn(),
  reserve: vi.fn(),
  find: vi.fn(),
  byKey: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  trigger: vi.fn(),
  audit: vi.fn(),
  rate: vi.fn(),
  assets: vi.fn(),
  url: vi.fn(),
}));
vi.mock("@/lib/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: m.user,
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  requireWorkspaceMembership: m.member,
}));
vi.mock("./plan", () => ({ studioImagePlan: m.plan }));
vi.mock("@/lib/budgets/workspace-budget", () => ({
  loadEffectiveWorkspaceBudget: m.budget,
}));
vi.mock("@/db/commands/library-image-jobs", async (original) => ({
  ...(await original<typeof import("@/db/commands/library-image-jobs")>()),
  reserveLibraryImage: m.reserve,
  updateLibraryImage: m.update,
}));
vi.mock("@/db/repositories/library-image-jobs.repository", () => ({
  findLibraryImageJob: m.find,
  findLibraryImageByKey: m.byKey,
  listLibraryImageJobs: m.list,
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: m.trigger } }));
vi.mock("@/lib/audit/record-audit-event", () => ({
  recordAuditEvent: m.audit,
}));
vi.mock("@/lib/rate-limit/enforce-rate-limit", () => ({
  enforceRateLimit: m.rate,
}));
vi.mock("@/db/repositories/media-assets.repository", () => ({
  findReadyMediaAssets: m.assets,
}));
vi.mock("@/lib/storage/media-asset-storage", () => ({
  createMediaAssetDownloadUrl: m.url,
}));
vi.mock("@/lib/env/server", () => ({
  getMediaLibraryEnvironment: () => ({ MAX_MEDIA_IMAGE_BYTES: 26214400 }),
  getPublishingWebEnvironment: () => ({
    OAUTH_STATE_SECRET: "test-only-secret-at-least-thirty-two-characters",
  }),
  getSceneImageEnvironment: () => ({
    ENABLE_SCENE_IMAGE_GENERATION: true,
    OPENAI_IMAGE_MODEL: "gpt-image-1",
    MAX_REFERENCE_ASSETS_PER_GENERATION: 16,
  }),
}));
import {
  authorizeImageStudio,
  quoteStudioImage,
  startStudioImage,
  dispatchStudioImage,
  imageStudioHistory,
} from "./service";
const ws = mcpIds.workspace,
  user = mcpIds.user,
  id = mcpIds.operation;
const request = {
  title: "Test",
  prompt: "A tree",
  size: "1024x1024",
  quality: "low",
  referenceAssetIds: [],
};
const plan = {
  kind: "image",
  estimatedCostCents: 8,
  configuration: { model: "gpt-image-1" },
};
const payload = () => ({
  request,
  idempotencyKey: id,
  quote: createOAuthState({
    workspaceId: ws,
    userId: user,
    platform: "image-studio:" + fingerprint({ request, plan }),
    secret: "test-only-secret-at-least-thirty-two-characters",
  }),
});
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: user });
  m.member.mockResolvedValue({ role: "owner" });
  m.plan.mockResolvedValue(plan);
  m.budget.mockResolvedValue({
    dailyBudgetCents: 100,
    monthlyBudgetCents: 1000,
  });
  m.reserve.mockResolvedValue(id);
  m.byKey.mockResolvedValue(null);
  m.find.mockResolvedValue({
    id,
    userId: user,
    status: "queued",
    attemptCount: 0,
    createdAt: new Date(),
  });
  m.trigger.mockResolvedValue({ id: "run-test" });
  m.update.mockResolvedValue({});
  m.assets.mockResolvedValue([]);
  m.list.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
describe("browser Image Studio authorization and signed cost review", () => {
  it.each(["owner", "editor"])(
    "permits %s without requiring an MCP connection",
    async (role) => {
      m.member.mockResolvedValue({ role });
      expect((await quoteStudioImage(ws, request)).estimatedCostCents).toBe(8);
      expect(m.member).toHaveBeenCalledWith({ workspaceId: ws, userId: user });
    },
  );
  it("prevents viewer spending", async () => {
    m.member.mockResolvedValue({ role: "viewer" });
    await expect(quoteStudioImage(ws, request)).rejects.toThrow();
    expect(m.plan).not.toHaveBeenCalled();
  });
  it("requires current membership for reads too", async () => {
    m.member.mockRejectedValue(new Error("denied"));
    await expect(imageStudioHistory(ws)).rejects.toThrow("denied");
    expect(m.list).not.toHaveBeenCalled();
  });
  it("rejects malformed workspace identifiers", async () => {
    await expect(authorizeImageStudio("bad")).rejects.toThrow();
    expect(m.user).not.toHaveBeenCalled();
  });
  it("reserves and queues once after a valid quote", async () => {
    expect(await startStudioImage(ws, payload())).toEqual({ id });
    expect(m.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ws,
        userId: user,
        cost: 8,
        daily: 100,
        monthly: 1000,
      }),
    );
    expect(m.trigger).toHaveBeenCalledWith(
      "library-image-generation",
      { workspaceId: ws, jobId: id },
      { idempotencyKey: "library-image:" + id },
    );
  });
  it.each(["prompt", "model", "tamper", "user", "workspace", "expiry"])(
    "refuses a %s change without reserving",
    async (kind) => {
      const input = payload();
      if (kind === "prompt") input.request = { ...request, prompt: "Changed" };
      if (kind === "model")
        m.plan.mockResolvedValue({
          ...plan,
          configuration: { model: "gpt-image-other" },
        });
      if (kind === "tamper") input.quote += "invalid";
      if (kind === "user") m.user.mockResolvedValue({ id: mcpIds.asset });
      if (kind === "workspace")
        input.quote = createOAuthState({
          workspaceId: mcpIds.asset,
          userId: user,
          platform: "image-studio:" + fingerprint({ request, plan }),
          secret: "test-only-secret-at-least-thirty-two-characters",
        });
      if (kind === "expiry") {
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 601000);
      }
      await expect(startStudioImage(ws, input)).rejects.toThrow(/estimate/);
      expect(m.reserve).not.toHaveBeenCalled();
    },
  );
  it("reuses a saved request even if its original quote expired", async () => {
    m.byKey.mockResolvedValue({ id, request });
    await startStudioImage(ws, { ...payload(), quote: "expired" });
    expect(m.plan).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled();
  });
  it("rejects changed inputs on the same idempotency key", async () => {
    m.byKey.mockResolvedValue({
      id,
      request: { ...request, prompt: "Different" },
    });
    await expect(startStudioImage(ws, payload())).rejects.toThrow(
      /different inputs/,
    );
    expect(m.trigger).not.toHaveBeenCalled();
  });
  it("keeps an uncertain handoff retryable under the same worker key", async () => {
    m.trigger.mockRejectedValue(new Error("network secret"));
    await startStudioImage(ws, payload());
    expect(m.update).toHaveBeenCalledWith(
      ws,
      id,
      ["queued"],
      expect.objectContaining({
        safeErrorMessage: expect.stringContaining("Retry queue"),
      }),
    );
    await dispatchStudioImage(ws, id);
    expect(m.trigger).toHaveBeenCalledTimes(2);
    expect(m.reserve).toHaveBeenCalledTimes(1);
  });
  it.each(["other-user", "expired", "running"])(
    "does not dispatch %s jobs",
    async (kind) => {
      m.find.mockResolvedValue({
        id,
        userId: kind === "other-user" ? mcpIds.asset : user,
        status: kind === "running" ? "running" : "queued",
        attemptCount: 0,
        createdAt: new Date(Date.now() - (kind === "expired" ? 901000 : 0)),
      });
      if (kind === "running") await dispatchStudioImage(ws, id);
      else await expect(dispatchStudioImage(ws, id)).rejects.toThrow();
      expect(m.trigger).not.toHaveBeenCalled();
    },
  );
  it("does not sign missing/deleted library originals", async () => {
    m.list.mockResolvedValue([
      {
        id,
        userId: user,
        request,
        status: "succeeded",
        attemptCount: 1,
        estimatedCostCents: 8,
        actualCostCents: 7,
        safeErrorMessage: null,
        createdAt: new Date(),
      },
    ]);
    expect((await imageStudioHistory(ws))[0]).toMatchObject({
      previewUrl: null,
      canRetry: false,
    });
    expect(m.url).not.toHaveBeenCalled();
  });
});

it("tracks an unfinished request after it leaves the latest history page", async () => {
  m.find.mockResolvedValue({
    id,
    userId: user,
    request,
    status: "running",
    attemptCount: 1,
    estimatedCostCents: 8,
    actualCostCents: null,
    safeErrorMessage: null,
    createdAt: new Date(),
  });
  expect((await imageStudioHistory(ws, undefined, [id]))[0]).toMatchObject({
    id,
    status: "running",
  });
  expect(m.find).toHaveBeenCalledWith(ws, id);
});
it("bounds explicit status tracking to queue capacity", async () => {
  await expect(
    imageStudioHistory(ws, undefined, Array(5).fill(id)),
  ).rejects.toThrow();
  expect(m.find).not.toHaveBeenCalled();
});

it("shows requested edit text without exposing internal prompt instructions", async () => {
  const prompt = renderImageEditInstructions("Change the sky to orange.");
  const saved = { ...request, prompt, referenceAssetIds: [id] };
  m.list.mockResolvedValue([
    {
      id,
      userId: user,
      request: saved,
      status: "succeeded",
      attemptCount: 1,
      estimatedCostCents: 8,
      actualCostCents: 7,
      safeErrorMessage: null,
      createdAt: new Date(),
    },
  ]);
  expect((await imageStudioHistory(ws))[0]!.prompt).toBe(
    "Change the sky to orange.",
  );
  expect(saved.prompt).toBe(prompt);
});
