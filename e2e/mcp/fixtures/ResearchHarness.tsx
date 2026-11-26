import {
  ResearchWorkspace,
  type ResearchWorkspaceProps,
} from "@/components/social/research/ResearchWorkspace";
import { researchAuthorizationFailureSchema } from "@studio/contracts/social-research";

export function ResearchHarness() {
  const query = new URLSearchParams(location.search);
  const readonly = query.has("readonly");
  const props: ResearchWorkspaceProps = {
    enabled: !query.has("disabled"),
    canManage: !readonly,
    canResearch: !readonly,
    connection: {
      connected: !query.has("disconnected"),
      expiresAt: "2027-01-01T00:00:00Z",
      sources: [{ id: "42", username: "veilcode.studio" }],
      scopes: [
        "instagram_basic",
        "instagram_manage_insights",
        "pages_read_engagement",
      ],
    },
    accounts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        platform: "instagram",
        identifier: "example.studio",
        name: "A thoughtful business account with a deliberately long name to check responsive wrapping",
        notes: "Study useful how-to posts and original perspectives.",
        version: 1,
        refreshedAt: "2026-11-14T09:00:00Z",
        lastError: null,
      },
    ],
    categories: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Competitors",
        version: 1,
        accountCount: 0,
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Finance creators",
        version: 1,
        accountCount: 0,
      },
    ],
    selected: null,
    snapshots: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-11-14T09:00:00Z",
        data: {
          platform: "instagram",
          externalAccountId: "789",
          name: "Example studio",
          profileUrl: "https://www.instagram.com/example.studio/",
          biography: "Useful work, shared consistently.",
          followers: 1024,
          totalPosts: 250,
          posts: [
            {
              id: "1",
              url: "https://www.instagram.com/p/example/",
              publishedAt: "2026-11-12T08:00:00Z",
              text: "What did we learn from shipping this week? Here are three practical lessons.",
              format: "reel",
              likes: 100,
              comments: 12,
              shares: null,
            },
            {
              id: "2",
              url: "https://www.instagram.com/p/another/",
              publishedAt: "2026-11-10T08:00:00Z",
              text: "A concise image post.",
              format: "image",
              likes: null,
              comments: 3,
              shares: null,
            },
          ],
          hasMore: true,
          warnings: [
            "Private insights are not available. Missing counts are unknown, not zero.",
          ],
        },
      },
    ],
    observationId: null,
    page: 0,
    historyPage: 0,
    hasMoreAccounts: false,
    hasMoreSnapshots: false,
    authorization: query.has("authFailed")
      ? "failed"
      : query.has("authConnected")
        ? "connected"
        : null,
    authorizationFailure:
      researchAuthorizationFailureSchema.safeParse(query.get("failure")).data ??
      null,
    authorizationReference: query.has("authFailed")
      ? "33333333-3333-4333-8333-333333333333"
      : null,
  };
  if (query.has("media"))
    props.snapshots[0]!.data.posts.push({
      id: "3",
      url: "https://www.instagram.com/p/carousel/",
      publishedAt: null,
      text: "A useful carousel",
      format: "carousel",
      likes: 50,
      comments: 4,
      shares: null,
    });
  props.accounts.push({
    ...props.accounts[0]!,
    id: "55555555-5555-4555-8555-555555555555",
    name: "Second research account",
    identifier: "second.studio",
  });
  props.selected = props.accounts[0]!;
  return <ResearchWorkspace {...props} />;
}
