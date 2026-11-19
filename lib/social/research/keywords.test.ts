import { describe, it, expect } from "vitest";
import {
  researchKeywordInputSchema,
  type ResearchKeywordSample,
} from "@studio/contracts/social-research";
import { researchKeywords } from "./keywords";

const accountId = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
export function keywordSample(): ResearchKeywordSample {
  return {
    accountId,
    accountName: "Page",
    platform: "facebook",
    snapshotId,
    observedAt: "2026-11-19T10:00:00Z",
    hasMore: false,
    posts: [
      {
        id: "1",
        url: "https://www.facebook.com/1",
        text: "Saving saving money with the #Finance #Épargne",
        format: "image",
        publishedAt: null,
        likes: 10,
        comments: 2,
        shares: null,
        textTruncated: false,
      },
      {
        id: "2",
        url: "https://www.facebook.com/2",
        text: "Saving money #Finance",
        format: "video",
        publishedAt: null,
        likes: null,
        comments: 2,
        shares: 5,
        textTruncated: false,
      },
    ],
  };
}
const filters = (input: unknown = {}) =>
  researchKeywordInputSchema.parse(input);
describe("saved research keywords", () => {
  it("counts a term once per post, preserves Unicode hashtags and excludes stop words", () => {
    const report = researchKeywords(filters(), [keywordSample()]);
    expect(report.terms.find((t) => t.term === "saving")).toMatchObject({
      postCount: 2,
      measuredPostCount: 1,
      medianInteractions: 12,
    });
    expect(report.terms.find((t) => t.term === "#épargne")).toBeDefined();
    expect(report.terms.some((t) => ["the", "with"].includes(t.term))).toBe(
      false,
    );
    expect(report.coverage).toMatchObject({
      posts: 2,
      matchedPosts: 2,
      measuredPosts: 1,
    });
  });
  it("requires exact tokens or a contiguous phrase, not substring matches", () => {
    expect(
      researchKeywords(filters({ query: "art" }), [keywordSample()]).posts,
    ).toHaveLength(0);
    expect(
      researchKeywords(filters({ query: "saving money" }), [keywordSample()])
        .posts,
    ).toHaveLength(2);
    expect(
      researchKeywords(filters({ query: "money saving" }), [keywordSample()])
        .posts,
    ).toHaveLength(0);
    expect(
      researchKeywords(filters({ query: "#FINANCE", kind: "hashtags" }), [
        keywordSample(),
      ]).terms.every((t) => t.kind === "hashtag"),
    ).toBe(true);
    expect(
      researchKeywords(filters({ query: "!!!" }), [keywordSample()]).posts,
    ).toHaveLength(0);
  });
  it("deduplicates platform/post IDs across accounts and keeps missing values unknown", () => {
    const sample = keywordSample();
    sample.posts[0].likes = 0;
    sample.posts[0].comments = 0;
    const report = researchKeywords(filters(), [
      sample,
      { ...sample, accountId: snapshotId },
    ]);
    expect(report.coverage.posts).toBe(2);
    expect(report.posts.map((p) => p.interactions)).toEqual([0, null]);
  });
  it("reuses only explicitly supplied factual evidence when requested", () => {
    const evidence = [
      {
        operationId: accountId,
        snapshotId,
        postId: "1",
        transcript: "Grow tomatoes",
        evidence: ["#Gardening"],
      },
    ];
    expect(
      researchKeywords(
        filters({ query: "tomatoes" }),
        [keywordSample()],
        evidence,
      ).posts,
    ).toHaveLength(0);
    const report = researchKeywords(
      filters({ query: "tomatoes", media: "captions_and_media" }),
      [keywordSample()],
      evidence,
    );
    expect(report.posts[0]).toMatchObject({
      matchedIn: ["media"],
      mediaOperationId: accountId,
    });
    expect(report.coverage.mediaPosts).toBe(1);
    expect(report.terms.find((t) => t.term === "tomatoes")).toMatchObject({
      captionPostCount: 0,
      mediaPostCount: 1,
    });
  });
  it("supports explicit non-English searches and normalizes compatibility characters", () => {
    const sample = keywordSample();
    sample.posts[0].text = "Épargne ＦＩＮＡＮＣＥ";
    expect(
      researchKeywords(filters({ query: "épargne" }), [sample]).posts,
    ).toHaveLength(1);
    expect(
      researchKeywords(filters({ query: "finance" }), [sample]).posts,
    ).toHaveLength(2);
  });
  it("bounds accounts, terms, excerpts and source pagination and reports truncation", () => {
    const sample = keywordSample();
    sample.posts = Array.from({ length: 25 }, (_, i) => ({
      ...sample.posts[0],
      id: String(i),
      text: "saving ".repeat(200),
      textTruncated: true,
    }));
    sample.hasMore = true;
    const report = researchKeywords(
      filters({ page: 2 }),
      Array.from({ length: 21 }, () => sample),
    );
    expect(report.posts).toHaveLength(10);
    expect(report.hasMore).toBe(true);
    expect(report.posts.every((p) => p.post.text.length <= 600)).toBe(true);
    expect(report.coverage).toMatchObject({
      accounts: 20,
      accountsTruncated: true,
      captionsTruncated: true,
      providerHasMore: true,
    });
    expect(report.terms.length).toBeLessThanOrEqual(20);
  });
  it("returns an honest empty report with access limits", () => {
    const report = researchKeywords(filters(), []);
    expect(report.terms).toEqual([]);
    expect(report.coverage.oldestObservation).toBeNull();
    expect(report.hashtagDiscovery).toBe("not_configured");
    expect(report.limitations.join(" ")).toContain("No search volume");
  });
});
