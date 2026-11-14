import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  enabled: vi.fn(),
  accounts: vi.fn(),
  connection: vi.fn(),
  account: vi.fn(),
  snapshots: vi.fn(),
}));
vi.mock("@/lib/auth/workspace-context", () => ({
  getAuthenticatedWorkspaceContext: mocks.context,
}));
vi.mock("./environment", () => ({ isSocialResearchEnabled: mocks.enabled }));
vi.mock("@/db/repositories/social-research.repository", () => ({
  listResearchAccounts: mocks.accounts,
  getResearchConnection: mocks.connection,
  findResearchAccount: mocks.account,
  listResearchSnapshots: mocks.snapshots,
}));
vi.mock("@/components/social/research/ResearchWorkspace", () => ({
  ResearchWorkspace: () => null,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import Page from "@/app/(authenticated)/app/social/research/page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(false);
  mocks.context.mockResolvedValue({
    user: { id: "user" },
    activeMembership: { workspaceId: "workspace", role: "owner" },
  });
  mocks.accounts.mockResolvedValue([]);
  mocks.connection.mockResolvedValue(null);
  mocks.account.mockResolvedValue(null);
});
describe("research route loading", () => {
  it("disabled deployments never query new tables or start external work", async () => {
    const page = await Page({ searchParams: Promise.resolve({}) });
    expect(page.props.enabled).toBe(false);
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.snapshots).not.toHaveBeenCalled();
  });
  it("scopes selected-account lookup to current membership and handles a forged id", async () => {
    mocks.enabled.mockReturnValue(true);
    const id = "11111111-1111-4111-8111-111111111111";
    const page = await Page({
      searchParams: Promise.resolve({ account: id, workspaceId: "forged" }),
    });
    expect(mocks.account).toHaveBeenCalledWith("workspace", id);
    expect(page.props.selected).toBeNull();
    expect(mocks.snapshots).not.toHaveBeenCalled();
  });
  it("ignores malformed pagination instead of failing the page", async () => {
    mocks.enabled.mockReturnValue(true);
    await Page({
      searchParams: Promise.resolve({
        page: "-1",
        historyPage: "999999999999",
        account: "bad",
      }),
    });
    expect(mocks.accounts).toHaveBeenCalledWith("workspace", 0);
  });
});
