import type { ResearchPost } from "@studio/contracts/social-research";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { researchDate } from "@/lib/social/research/view";

export function ResearchPostCard({
  post,
  index,
  facebook,
}: {
  post: ResearchPost;
  index: number;
  facebook: boolean;
}) {
  return (
    <article className="app-panel flex min-w-0 flex-col gap-4 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary">{post.format}</Badge>
        <span className="text-xs text-muted-foreground">
          {post.publishedAt
            ? researchDate(post.publishedAt)
            : "Publication time unavailable"}
        </span>
      </div>
      <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm">
        {post.text || "No caption was exposed by Meta."}
      </p>
      <dl className="mt-auto grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">
            {facebook ? "Reactions" : "Likes"}
          </dt>
          <dd className="mt-1 font-semibold">
            {post.likes?.toLocaleString("en-US") ?? "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comments</dt>
          <dd className="mt-1 font-semibold">
            {post.comments?.toLocaleString("en-US") ?? "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Shares</dt>
          <dd className="mt-1 font-semibold">
            {post.shares?.toLocaleString("en-US") ?? "Unavailable"}
          </dd>
        </div>
      </dl>
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
        aria-label={`Open source post ${index + 1}`}
      >
        View original post
        <ExternalLinkIcon className="size-3.5" />
      </a>
    </article>
  );
}
