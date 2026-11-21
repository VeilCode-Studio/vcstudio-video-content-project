import { useState } from "react";
import { PostMediaAttachments } from "@/components/social/PostMediaAttachments";
import type { PostAttachmentView } from "@/lib/social/social-post-view";
import { libraryImage } from "./social-draft-data";
const items: PostAttachmentView[] = [
  {
    source: "library",
    unavailable: false,
    asset: {
      ...libraryImage,
      title: "Portrait",
      altText: "Whole portrait",
      previewUrl: "/viewer-portrait.svg",
    },
  },
  {
    source: "library",
    unavailable: false,
    asset: {
      ...libraryImage,
      id: "second",
      title: "Landscape",
      altText: "Whole landscape",
      previewUrl: "/viewer-landscape.svg",
    },
  },
  {
    source: "render",
    unavailable: false,
    asset: {
      ...libraryImage,
      id: "video",
      kind: "video",
      title: "Finished video",
      previewUrl: "/viewer-video.mp4",
    },
  },
  {
    source: "library",
    unavailable: true,
    asset: {
      ...libraryImage,
      id: "pending",
      kind: "video",
      title: "Pending video",
      inspectionPending: true,
      previewUrl: "/viewer-pending.mp4",
    },
  },
];
export function PostMediaViewerHarness() {
  const [attachments, setAttachments] = useState(
    new URLSearchParams(location.search).has("single")
      ? items.slice(0, 1)
      : items,
  );
  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1>Post media</h1>
      <PostMediaAttachments
        postId="11111111-1111-4111-8111-111111111111"
        attachments={attachments}
        editable={!new URLSearchParams(location.search).has("readonly")}
        onMove={(id, direction) =>
          setAttachments((current) => {
            const next = [...current];
            const index = next.findIndex((item) => item.asset.id === id);
            [next[index], next[index + direction]] = [
              next[index + direction],
              next[index],
            ];
            return next;
          })
        }
        onRemove={(id) =>
          setAttachments((current) =>
            current.filter((item) => item.asset.id !== id),
          )
        }
        onCheck={() => {}}
        checkingId={null}
      />
    </main>
  );
}
