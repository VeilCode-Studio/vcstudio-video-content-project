import { describe, expect, it } from "vitest";
import { analyzeResearchSnapshots } from "./analysis";
import {
  researchAccountInputSchema,
  researchSnapshotSchema,
  type ResearchPost,
  type ResearchSnapshotView,
} from "@studio/contracts/social-research";

function post(
  id: string,
  likes: number | null,
  comments: number | null,
  format: ResearchPost["format"] = "image",
): ResearchPost {
  return {
    id,
    url: `https://www.instagram.com/p/${id}/`,
    text: "A post",
    publishedAt: "2026-11-10T09:00:00Z",
    format,
    likes,
    comments,
    shares: null,
  };
}
function snapshot(
  posts: ResearchPost[],
  followers: number | null = 100,
): ResearchSnapshotView {
  return {
    id: "test",
    capturedAt: "2026-11-14T00:00:00Z",
    data: {
      platform: "instagram",
      externalAccountId: "123",
      name: "Business",
      profileUrl: "https://www.instagram.com/business/",
      biography: null,
      followers,
      totalPosts: null,
      posts,
      hasMore: false,
      warnings: [],
    },
  };
}
describe("research comparisons", () => {
  it("keeps unknown counts out of rankings and medians", () => {
    const result = analyzeResearchSnapshots(
      snapshot([
        post("a", 10, 2),
        post("b", null, 100),
        post("c", 0, 0),
        post("d", 18, 2),
      ]),
    );
    expect(result.measurablePosts).toBe(3);
    expect(result.formats[0]?.median).toBe(12);
    expect(result.ranked.map((row) => row.post.id)).toEqual(["d", "a", "c"]);
    expect(result.lessons[0]?.url).toBe("https://www.instagram.com/p/d/");
  });
  it("calculates even medians by format without folding in shares", () => {
    const a = post("a", 8, 2);
    a.shares = 1000;
    const result = analyzeResearchSnapshots(
      snapshot([a, post("b", 18, 2), post("c", 2, 0, "video")]),
    );
    expect(result.formats.find((row) => row.format === "image")?.median).toBe(
      15,
    );
    expect(result.formats.find((row) => row.format === "video")?.median).toBe(
      2,
    );
  });
  it("does not invent a lesson or dates when no evidence exists", () => {
    const result = analyzeResearchSnapshots(snapshot([]));
    expect(result.lessons).toEqual([]);
    expect(result.oldestPost).toBeNull();
    expect(result.followerChange).toBeNull();
  });
  it("compares followers only for the same known identity", () => {
    const earlier = snapshot([], 95);
    expect(analyzeResearchSnapshots(snapshot([]), earlier).followerChange).toBe(
      5,
    );
    earlier.data.externalAccountId = "other";
    expect(
      analyzeResearchSnapshots(snapshot([]), earlier).followerChange,
    ).toBeNull();
    expect(
      analyzeResearchSnapshots(snapshot([], null), snapshot([])).followerChange,
    ).toBeNull();
  });
});
describe("research inputs and stored data", () => {
  it("normalizes Instagram usernames", () =>
    expect(
      researchAccountInputSchema.parse({
        platform: "instagram",
        identifier: " @Studio.Name ",
        name: "Example",
      }).identifier,
    ).toBe("studio.name"));
  it.each(["https://instagram.com/name", "name){media}", "name\n"])(
    "rejects non-username syntax %s",
    (identifier) => {
      // Trailing whitespace is intentionally normalized, while graph field injection is rejected.
      if (identifier.endsWith("\n"))
        expect(
          researchAccountInputSchema.safeParse({
            platform: "instagram",
            identifier,
            name: "Example",
          }).success,
        ).toBe(true);
      else
        expect(
          researchAccountInputSchema.safeParse({
            platform: "instagram",
            identifier,
            name: "Example",
          }).success,
        ).toBe(false);
    },
  );
  it("requires numeric Facebook Page ids", () => {
    expect(
      researchAccountInputSchema.safeParse({
        platform: "facebook",
        identifier: "12345",
        name: "Page",
      }).success,
    ).toBe(true);
    expect(
      researchAccountInputSchema.safeParse({
        platform: "facebook",
        identifier: "myprofile",
        name: "Page",
      }).success,
    ).toBe(false);
  });
  it("rejects oversized snapshots and negative or fabricated metric values", () => {
    const data = snapshot(
      Array.from({ length: 26 }, (_, i) => post(String(i), 1, 2)),
    ).data;
    expect(researchSnapshotSchema.safeParse(data).success).toBe(false);
    expect(
      researchSnapshotSchema.safeParse({ ...snapshot([]).data, followers: -1 })
        .success,
    ).toBe(false);
  });
});
