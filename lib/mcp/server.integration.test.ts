import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  connection: vi.fn(),
  grants: vi.fn(),
  memberships: vi.fn(),
  prepare: vi.fn(),
  confirm: vi.fn(),
  execute: vi.fn(),
  previewOrigin: vi.fn(),
  mediaPreviews: vi.fn(),
  generationPrepare: vi.fn(),
  generationExecute: vi.fn(),
  generationConfirm: vi.fn(),
  generationStatus: vi.fn(),
  researchAccount: vi.fn(),
  researchObservation: vi.fn(),
  researchSummaries: vi.fn(),
  researchAnalyses: vi.fn(),
  keywords: vi.fn(),
}));
vi.mock("@/lib/mcp/context", () => ({ authorizeMcp: m.authorize }));
vi.mock("@/lib/social/research/keyword-service", () => ({
  loadResearchKeywords: m.keywords,
}));
vi.mock("@/lib/mcp/rate-limit", () => ({ enforceMcpRateLimit: vi.fn() }));
vi.mock("@/lib/env/server", () => ({
  getMcpEnvironment: () => ({
    ENABLE_MCP: true,
    APP_BASE_URL: "https://vcstudio.example",
  }),
  getPublishingEnvironment: () => ({ ENABLE_SOCIAL_POSTING: true }),
  getSceneImageEnvironment: () => ({ ENABLE_SCENE_IMAGE_GENERATION: true }),
  getSceneAudioEnvironment: () => ({ ENABLE_SCENE_AUDIO_GENERATION: true }),
  getMediaLibraryEnvironment: () => ({
    MAX_MEDIA_IMAGE_BYTES: 25 * 1024 * 1024,
    MAX_MEDIA_VIDEO_BYTES: 512 * 1024 * 1024,
  }),
}));
vi.mock("@/db/repositories/mcp.repository", () => ({
  ensureMcpConnection: m.connection,
  listMcpGrants: m.grants,
}));
vi.mock("@/db/repositories/workspaces.repository", () => ({
  listWorkspaceMemberships: m.memberships,
}));
vi.mock("@/lib/mcp/publishing-service", () => ({
  prepareMcpPublication: m.prepare,
  approveMcpPublication: m.confirm,
  executeMcpPublication: m.execute,
}));
vi.mock("@/lib/mcp/media-previews", () => ({
  loadMcpMediaPreviews: m.mediaPreviews,
  getMcpMediaPreviewOrigin: m.previewOrigin,
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("<!doctype html><title>Review</title>"),
}));
vi.mock("@/lib/mcp/import-service", () => ({ startMcpImport: vi.fn() }));
vi.mock("@/lib/mcp/generation-service", () => ({
  prepareMcpGeneration: m.generationPrepare,
  executeMcpGeneration: m.generationExecute,
  approveMcpGeneration: m.generationConfirm,
  getMcpGenerationStatus: m.generationStatus,
}));
vi.mock("@/lib/social/research/environment", () => ({
  isSocialResearchEnabled: () => true,
}));
vi.mock("@/db/repositories/social-research.repository", () => ({
  findResearchAccount: m.researchAccount,
  findResearchOperation: m.researchObservation,
  listResearchObservationSummaries: m.researchSummaries,
  listResearchAccounts: vi.fn(),
  getResearchConnection: vi.fn(),
  addResearchAccount: vi.fn(),
  claimResearchRefresh: vi.fn(),
  finishResearchRefresh: vi.fn(),
}));
vi.mock("@/db/repositories/research-analysis.repository", () => ({
  listResearchAnalysisOperations: m.researchAnalyses,
  consumeResearchAnalysis: vi.fn(),
  listResearchAnalysisRecovery: vi.fn(),
}));
import { Client } from "@modelcontextprotocol/client";
import {
  createMcpHandler,
  InMemoryTransport,
} from "@modelcontextprotocol/server";
import { createVcStudioMcpServer } from "./server";
import {
  mcpContextFixture,
  mcpIds,
  mcpOperationFixture,
} from "@/lib/test-utils/mcp-fixtures";
import { publicOperation } from "./operations";
import { MCP_SERVER_VERSION } from "@studio/contracts/mcp-upload";
import { McpError, McpScopeError } from "./errors";
const ctx = mcpContextFixture();
const clients: Client[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  m.authorize.mockResolvedValue(ctx);
  m.connection.mockResolvedValue(ctx.connection);
  m.grants.mockResolvedValue([ctx.grant]);
  m.memberships.mockResolvedValue([ctx.membership]);
  m.previewOrigin.mockResolvedValue(
    "https://studio.account.r2.cloudflarestorage.com",
  );
  m.mediaPreviews.mockResolvedValue([]);
  m.prepare.mockResolvedValue({
    operation: publicOperation(mcpOperationFixture()),
    preview: {
      postId: mcpIds.post,
      version: 1,
      text: "Human-approved copy",
      media: [],
      destinations: [
        {
          id: mcpIds.destination,
          platform: "linkedin",
          name: "My profile",
          text: "Human-approved copy",
        },
      ],
      scheduledAt: null,
      timezone: "UTC",
    },
    uiProof: "private-ui-proof-not-for-the-model-123456",
  });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});
async function client() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createVcStudioMcpServer(ctx.principal);
  await server.connect(b);
  const instance = new Client({ name: "VCStudio test host", version: "1.0.0" });
  clients.push(instance);
  await instance.connect(a);
  return instance;
}
describe("real MCP SDK interoperability", () => {
  it("authorizes saved keyword reads with Read only and forwards bounded filters without execution", async () => {
    m.keywords.mockResolvedValue({
      terms: [],
      hashtagDiscovery: "not_configured",
    });
    const api = await client();
    const result = await api.callTool({
      name: "get_research_keywords",
      arguments: {
        workspaceId: mcpIds.workspace,
        query: "saving money",
        media: "captions_and_media",
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { terms: [], hashtagDiscovery: "not_configured" },
    });
    expect(m.authorize).toHaveBeenCalledWith(
      ctx.principal,
      mcpIds.workspace,
      "vcstudio:read",
    );
    expect(m.keywords).toHaveBeenCalledWith(
      mcpIds.workspace,
      expect.objectContaining({
        query: "saving money",
        page: 1,
        media: "captions_and_media",
      }),
    );
    m.keywords.mockClear();
    const invalid = await api.callTool({
      name: "get_research_keywords",
      arguments: {
        workspaceId: mcpIds.workspace,
        accountId: "foreign-or-malformed",
      },
    });
    expect(invalid.isError).toBe(true);
    expect(m.keywords).not.toHaveBeenCalled();
  });
  it("does not invoke keyword reads when current workspace authorization fails", async () => {
    m.authorize.mockRejectedValue(new McpScopeError("vcstudio:read"));
    const result = await (
      await client()
    ).callTool({
      name: "get_research_keywords",
      arguments: { workspaceId: mcpIds.workspace },
    });
    expect(result.isError).toBe(true);
    expect(m.keywords).not.toHaveBeenCalled();
  });
  it("pages research captions and reads an exact post without duplicating captions in rankings", async () => {
    m.researchAccount.mockResolvedValue({ id: mcpIds.asset });
    const posts = Array.from({ length: 25 }, (_, i) => ({
      id: `post-${i + 1}`,
      url: `https://www.instagram.com/p/${i + 1}/`,
      publishedAt: null,
      text: `Caption ${i + 1}`,
      format: "image",
      likes: i,
      comments: 1,
      shares: null,
    }));
    m.researchObservation.mockResolvedValue({
      id: mcpIds.post,
      accountId: mcpIds.asset,
      status: "succeeded",
      createdAt: new Date(),
      completedAt: new Date(),
      data: {
        platform: "instagram",
        externalAccountId: "789",
        name: "Account",
        profileUrl: "https://www.instagram.com/account/",
        biography: null,
        followers: 100,
        totalPosts: 30,
        posts,
        hasMore: true,
        warnings: [],
      },
    });
    const api = await client();
    const result = await api.callTool({
      name: "get_research_observation",
      arguments: {
        workspaceId: mcpIds.workspace,
        snapshotId: mcpIds.post,
        postPage: 2,
      },
    });
    const parsed = JSON.parse(
      result.content.find((item) => item.type === "text")!.text,
    ).data;
    expect(parsed.data.posts).toHaveLength(10);
    expect(parsed.data.posts[0].id).toBe("post-11");
    expect(parsed.pagination.hasMore).toBe(true);
    expect(JSON.stringify(parsed.comparison)).not.toContain("Caption");
    const single = await api.callTool({
      name: "get_research_observation",
      arguments: {
        workspaceId: mcpIds.workspace,
        snapshotId: mcpIds.post,
        postId: "post-25",
      },
    });
    expect(
      JSON.parse(single.content.find((item) => item.type === "text")!.text).data
        .data.posts,
    ).toHaveLength(1);
    const invalid = await api.callTool({
      name: "get_research_observation",
      arguments: {
        workspaceId: mcpIds.workspace,
        snapshotId: mcpIds.post,
        postId: "forged",
      },
    });
    expect(invalid.isError).toBe(true);
    expect(m.researchObservation).toHaveBeenCalledWith(
      mcpIds.workspace,
      mcpIds.post,
    );
  });
  it("returns database-projected research history/analysis summaries without loading whole snapshots", async () => {
    m.researchAccount.mockResolvedValue({
      id: mcpIds.asset,
      platform: "instagram",
      identifier: "business",
      name: "Account",
      notes: "Notes",
      version: 1,
      refreshedAt: null,
      lastError: null,
    });
    m.researchSummaries.mockResolvedValue([
      {
        id: mcpIds.post,
        capturedAt: new Date(),
        followers: 100,
        sampledPosts: 25,
        hasMore: true,
      },
    ]);
    m.researchAnalyses.mockResolvedValue([
      {
        id: mcpIds.operation,
        status: "succeeded",
        updatedAt: new Date(),
        result: {
          summary: "Visual hook",
          coverage: { items: 1 },
          source: { postId: "post-1" },
        },
      },
    ]);
    const result = await (
      await client()
    ).callTool({
      name: "get_research_account",
      arguments: {
        workspaceId: mcpIds.workspace,
        accountId: mcpIds.asset,
        page: 1,
      },
    });
    const parsed = JSON.parse(
      result.content.find((item) => item.type === "text")!.text,
    ).data;
    expect(parsed.observations[0].sampledPosts).toBe(25);
    expect(parsed.observations[0]).not.toHaveProperty("data");
    expect(parsed.analyses[0].summary).toBe("Visual hook");
    expect(parsed.analyses[0]).not.toHaveProperty("findings");
    expect(m.researchObservation).not.toHaveBeenCalled();
    expect(m.researchAnalyses).toHaveBeenCalledWith(
      mcpIds.workspace,
      mcpIds.asset,
      true,
    );
  });

  it("publishes explicit OAuth metadata for all 64 tools without exposing UI approvals to the model", async () => {
    const tools = (await (await client()).listTools()).tools;
    expect(tools).toHaveLength(64);
    expect(
      tools.filter(
        (tool) =>
          tool._meta?.ui &&
          typeof tool._meta.ui === "object" &&
          "visibility" in tool._meta.ui,
      ),
    ).toHaveLength(2);
    for (const tool of tools) {
      expect(tool._meta?.securitySchemes).toEqual([
        { type: "oauth2", scopes: expect.any(Array) },
      ]);
    }
    for (const name of [
      "prepare_research_analysis",
      "execute_research_analysis",
    ])
      expect(
        tools.find((tool) => tool.name === name)?._meta?.securitySchemes,
      ).toEqual([{ type: "oauth2", scopes: ["vcstudio:generate"] }]);
    for (const name of [
      "get_research_keywords",
      "list_research_accounts",
      "get_research_account",
      "get_research_observation",
      "get_research_analysis_status",
    ])
      expect(
        tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint,
      ).toBe(true);
    expect(
      tools.some((tool) => tool.name === "approve_research_analysis"),
    ).toBe(false);
    for (const name of [
      "get_generation_options",
      "prepare_generation",
      "execute_generation",
      "confirm_generation",
    ])
      expect(
        tools.find((tool) => tool.name === name)?._meta?.securitySchemes,
      ).toEqual([{ type: "oauth2", scopes: ["vcstudio:generate"] }]);
    for (const name of [
      "prepare_publication",
      "execute_publication",
      "confirm_publication",
    ])
      expect(
        tools.find((tool) => tool.name === name)?._meta?.securitySchemes,
      ).toEqual([{ type: "oauth2", scopes: ["vcstudio:publish"] }]);
    expect(
      tools.find((tool) => tool.name === "open_media_upload")?._meta
        ?.securitySchemes,
    ).toEqual([{ type: "oauth2", scopes: ["vcstudio:media"] }]);
    expect(
      tools.find((tool) => tool.name === "review_scene_audio")?._meta
        ?.securitySchemes,
    ).toEqual([{ type: "oauth2", scopes: ["vcstudio:review"] }]);
    expect(
      tools.find((tool) => tool.name === "get_generation_status")?._meta
        ?.securitySchemes,
    ).toEqual([{ type: "oauth2", scopes: ["vcstudio:read"] }]);
  });
  it("keeps generation tools discoverable with an old token and prompts consent without starting work", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const principal = { ...ctx.principal, scopes: ["vcstudio:read"] };
    const server = createVcStudioMcpServer(principal);
    await server.connect(b);
    const api = new Client({ name: "Old OAuth client", version: "1" });
    clients.push(api);
    await api.connect(a);
    expect((await api.listTools()).tools.map((tool) => tool.name)).toContain(
      "execute_generation",
    );
    const connection = await api.callTool({
      name: "get_connection",
      arguments: {},
    });
    expect(connection.structuredContent).toMatchObject({
      data: {
        oauthScopes: ["vcstudio:read"],
        missingOAuthScopes: expect.arrayContaining(["vcstudio:generate"]),
      },
    });
    m.authorize.mockRejectedValueOnce(
      new McpScopeError("vcstudio:generate", ["vcstudio:read"]),
    );
    const args = {
      workspaceId: mcpIds.workspace,
      operationId: mcpIds.operation,
      idempotencyKey: "old-client-consent-123",
    };
    const result = await api.callTool({
      name: "execute_generation",
      arguments: args,
    });
    expect(result.isError).toBe(true);
    expect(result._meta?.["mcp/www_authenticate"]).toEqual([
      expect.stringContaining('error="insufficient_scope"'),
    ]);
    expect(m.generationExecute).not.toHaveBeenCalled();
    m.authorize.mockRejectedValueOnce(
      new McpError("permission_denied", "Workspace access was revoked."),
    );
    const denied = await api.callTool({
      name: "execute_generation",
      arguments: args,
    });
    expect(denied.isError).toBe(true);
    expect(denied._meta?.["mcp/www_authenticate"]).toBeUndefined();
    expect(m.generationExecute).not.toHaveBeenCalled();
  });
  it("advertises focused generation tools with UI-only confirmation and private proof metadata", async () => {
    const api = await client();
    const tools = await api.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "get_generation_options",
        "prepare_generation",
        "execute_generation",
        "get_generation_status",
        "review_scene_audio",
      ]),
    );
    expect(
      tools.tools.find((tool) => tool.name === "confirm_generation")?._meta,
    ).toMatchObject({ ui: { visibility: ["app"] } });
    m.generationPrepare.mockResolvedValue({
      operation: publicOperation(
        mcpOperationFixture({ kind: "generate_media" }),
      ),
      preview: { kind: "image", estimatedCostCents: 5 },
      approvalMode: "manual",
      uiProof: "private-generation-proof-1234567890123456",
    });
    const result = await api.callTool({
      name: "prepare_generation",
      arguments: {
        workspaceId: mcpIds.workspace,
        idempotencyKey: "prepare-generation-123",
        request: {
          kind: "image",
          prompt: "A useful image",
          size: "1024x1024",
          quality: "low",
          maximumCostCents: 20,
        },
      },
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { approvalMode: "manual" },
    });
    expect(result._meta?.approvalProof).toBe(
      "private-generation-proof-1234567890123456",
    );
    expect(
      JSON.stringify([result.structuredContent, result.content]),
    ).not.toContain("private-generation-proof");
    expect(m.authorize).toHaveBeenCalledWith(
      ctx.principal,
      mcpIds.workspace,
      "vcstudio:generate",
    );
    const resource = await api.readResource({
      uri: "ui://vcstudio/generation-review.html",
    });
    expect(resource.contents[0]._meta).toMatchObject({
      ui: { csp: { connectDomains: [], resourceDomains: [] } },
    });
    const confirmation = await api.callTool({
      name: "confirm_generation",
      arguments: {
        workspaceId: mcpIds.workspace,
        operationId: mcpIds.operation,
        confirmed: true,
      },
    });
    expect(confirmation.isError).toBe(true);
    expect(m.generationConfirm).not.toHaveBeenCalled();
  });
  it("advertises the new transfer/version tools and serves an upload app with no network origins", async () => {
    const connection = await client(),
      tools = await connection.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "open_media_upload",
        "start_media_upload",
        "append_media_upload",
        "complete_media_upload",
        "get_media_upload",
        "cancel_media_upload",
        "execute_publication",
      ]),
    );
    for (const name of [
      "start_media_upload",
      "append_media_upload",
      "complete_media_upload",
    ])
      expect(
        tools.tools.find((tool) => tool.name === name)?.annotations,
      ).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(
      tools.tools.find((tool) => tool.name === "cancel_media_upload")
        ?.annotations?.destructiveHint,
    ).toBe(true);
    const opened = await connection.callTool({
      name: "open_media_upload",
      arguments: { workspaceId: mcpIds.workspace },
    });
    expect(opened.structuredContent).toMatchObject({
      ok: true,
      data: {
        workspaceId: mcpIds.workspace,
        serverVersion: MCP_SERVER_VERSION,
        limits: { chunkBytes: 512 * 1024 },
      },
    });
    expect(m.authorize).toHaveBeenCalledWith(
      ctx.principal,
      mcpIds.workspace,
      "vcstudio:media",
    );
    const resource = await connection.readResource({
      uri: "ui://vcstudio/media-upload.html",
    });
    expect(resource.contents[0]._meta).toMatchObject({
      ui: { csp: { connectDomains: [], resourceDomains: [] } },
    });
  });
  it("advertises the effective approval mode without enabling autonomy", async () => {
    const result = await (
      await client()
    ).callTool({
      name: "get_capabilities",
      arguments: { workspaceId: mcpIds.workspace },
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { publicationApprovalMode: "manual" },
    });
  });
  it("exposes explicit agent execution with its preparation idempotency key", async () => {
    m.execute.mockResolvedValue(
      publicOperation(mcpOperationFixture({ status: "succeeded" })),
    );
    const connection = await client();
    const args = {
      workspaceId: mcpIds.workspace,
      operationId: mcpIds.operation,
      idempotencyKey: "execute-key-123",
    };
    const result = await connection.callTool({
      name: "execute_publication",
      arguments: args,
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { status: "succeeded" },
    });
    expect(m.authorize).toHaveBeenCalledWith(
      ctx.principal,
      mcpIds.workspace,
      "vcstudio:publish",
    );
    expect(m.execute).toHaveBeenCalledWith(
      ctx,
      mcpIds.operation,
      args.idempotencyKey,
    );
    m.execute.mockClear();
    expect(
      (
        await connection.callTool({
          name: "execute_publication",
          arguments: {
            workspaceId: mcpIds.workspace,
            operationId: mcpIds.operation,
            confirmed: true,
          },
        })
      ).isError,
    ).toBe(true);
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("allows the actual signed media origin in the review resource's narrow CSP", async () => {
    const result = await (
      await client()
    ).readResource({
      uri: "ui://vcstudio/publication-review.html",
    });
    expect(result.contents[0]._meta).toMatchObject({
      ui: {
        csp: {
          connectDomains: [],
          resourceDomains: ["https://studio.account.r2.cloudflarestorage.com"],
        },
      },
    });
  });
  it("negotiates the protocol and exposes focused v1 tools, native file metadata and app-only approval", async () => {
    const tools = (await (await client()).listTools()).tools;
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "get_connection",
        "save_script_draft",
        "import_chat_file",
        "assign_scene_image",
        "save_post",
        "prepare_publication",
        "confirm_publication",
      ]),
    );
    expect(
      tools.find((t) => t.name === "import_chat_file")?._meta?.[
        "openai/fileParams"
      ],
    ).toEqual(["file"]);
    expect(
      tools.find((t) => t.name === "confirm_publication")?._meta?.ui,
    ).toEqual(expect.objectContaining({ visibility: ["app"] }));
    expect(
      tools.some((t) =>
        /marketing|generate|delete_project|sql|shell/.test(t.name),
      ),
    ).toBe(false);
    const file = tools.find((t) => t.name === "import_chat_file");
    expect(JSON.stringify(file?.inputSchema)).toContain("download_url");
  });
  it("keeps the approval proof outside content and structured model data", async () => {
    m.mediaPreviews.mockResolvedValue([
      {
        id: mcpIds.asset,
        kind: "image",
        url: "https://studio.account.r2.cloudflarestorage.com/preview.png?X-Amz-Signature=private-media-signature",
      },
    ]);
    const result = await (
      await client()
    ).callTool({
      name: "prepare_publication",
      arguments: {
        workspaceId: mcpIds.workspace,
        idempotencyKey: "prepare-1234",
        postId: mcpIds.post,
        expectedVersion: 1,
        connectionIds: [mcpIds.destination],
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result._meta?.approvalProof).toBe(
      "private-ui-proof-not-for-the-model-123456",
    );
    expect(
      JSON.stringify([result.content, result.structuredContent]),
    ).not.toContain("private-ui-proof");
    expect(result._meta?.mediaPreviews).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: mcpIds.asset })]),
    );
    expect(
      JSON.stringify([result.content, result.structuredContent]),
    ).not.toContain("private-media-signature");
    expect(m.confirm).not.toHaveBeenCalled();
  });
  it("does not treat a model's confirmed boolean as approval", async () => {
    const result = await (
      await client()
    ).callTool({
      name: "confirm_publication",
      arguments: {
        workspaceId: mcpIds.workspace,
        operationId: mcpIds.operation,
        confirmed: true,
      },
    });
    expect(result.isError).toBe(true);
    expect(m.confirm).not.toHaveBeenCalled();
  });
  it("serves legacy Streamable HTTP requests statelessly through the actual SDK handler", async () => {
    const handler = createMcpHandler(
      () => createVcStudioMcpServer(ctx.principal),
      { legacy: "stateless", responseMode: "json" },
    );
    const response = await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("VCStudio");
    await handler.close();
  });
});
