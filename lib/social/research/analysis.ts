import type {
  ResearchPost,
  ResearchSnapshotView,
} from "@studio/contracts/social-research";

function engagement(post: ResearchPost): number | null {
  return post.likes === null || post.comments === null
    ? null
    : post.likes + post.comments;
}

/** Descriptive comparisons only: incomplete counts never become zeros or claims of causality. */
export function analyzeResearchSnapshots(
  current: ResearchSnapshotView,
  previous?: ResearchSnapshotView,
) {
  const posts = current.data.posts;
  const ranked = posts
    .flatMap((post) => {
      const score = engagement(post);
      return score === null ? [] : [{ post, score }];
    })
    .sort((a, b) => b.score - a.score || a.post.id.localeCompare(b.post.id));
  const formats = [...new Set(posts.map((post) => post.format))].map(
    (format) => {
      const matching = posts.filter((post) => post.format === format);
      const scores = matching
        .flatMap((post) => {
          const score = engagement(post);
          return score === null ? [] : [score];
        })
        .sort((a, b) => a - b);
      const middle = Math.floor(scores.length / 2);
      const median =
        scores.length === 0
          ? null
          : scores.length % 2 === 1
            ? scores[middle]!
            : (scores[middle - 1]! + scores[middle]!) / 2;
      return {
        format,
        count: matching.length,
        measuredCount: scores.length,
        median,
      };
    },
  );
  const dates = posts
    .flatMap((post) =>
      post.publishedAt === null ? [] : [Date.parse(post.publishedAt)],
    )
    .sort((a, b) => a - b);
  const sameAccount =
    previous?.data.platform === current.data.platform &&
    previous.data.externalAccountId === current.data.externalAccountId;
  const followerChange =
    sameAccount &&
    current.data.followers !== null &&
    previous.data.followers !== null
      ? current.data.followers - previous.data.followers
      : null;
  const top = ranked[0];
  return {
    ranked,
    formats,
    followerChange,
    measurablePosts: ranked.length,
    oldestPost: dates.length ? new Date(dates[0]!).toISOString() : null,
    newestPost: dates.length
      ? new Date(dates[dates.length - 1]!).toISOString()
      : null,
    lessons: top
      ? [
          {
            title: "Study the strongest observed post",
            detail: `This ${top.post.format} has ${top.score.toLocaleString("en-US")} observed ${current.data.platform === "facebook" ? "reactions" : "likes"} + comments, the highest among ${ranked.length} posts with both counts available in this sample. Compare its opening, subject and format before testing your own variation. This does not establish why it performed well.`,
            url: top.post.url,
          },
        ]
      : [],
  };
}
