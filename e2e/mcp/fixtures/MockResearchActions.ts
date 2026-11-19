export async function addResearchAccountAction(input: unknown) {
  sessionStorage.setItem("research-added", JSON.stringify(input));
  return { ok: true, id: "33333333-3333-4333-8333-333333333333" };
}
export async function refreshResearchAccountAction(input: unknown) {
  sessionStorage.setItem("research-refreshed", JSON.stringify(input));
  const fails = new URLSearchParams(location.search).has("fail");
  await new Promise((resolve) => setTimeout(resolve, 500));
  return fails
    ? {
        ok: false,
        error:
          "Meta App Review access is required. Your previous snapshot is preserved.",
      }
    : { ok: true, id: "44444444-4444-4444-8444-444444444444" };
}
export async function archiveResearchAccountAction(input: unknown) {
  sessionStorage.setItem("research-archived", JSON.stringify(input));
  return { ok: true };
}
export async function disconnectResearchAction() {
  sessionStorage.setItem("research-disconnected", "true");
  return { ok: true };
}
export async function refreshResearchSourcesAction() {
  sessionStorage.setItem("research-sources-checked", "true");
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { ok: true, sourceCount: 1 };
}
export async function deleteResearchAccountAction(input: unknown) {
  sessionStorage.setItem("research-delete-request", JSON.stringify(input));
  await new Promise((resolve) => setTimeout(resolve, 500));
  return new URLSearchParams(location.search).has("deleteFail")
    ? {
        ok: false,
        error:
          "This research account changed. Refresh the page before deleting.",
      }
    : { ok: true };
}

export async function loadResearchPreviewsAction(input: unknown) {
  sessionStorage.setItem("research-preview-request", JSON.stringify(input));
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (new URLSearchParams(location.search).has("previewFail"))
    return {
      ok: false,
      error:
        "Meta could not expose previews. Your saved research is unchanged.",
    };
  const base = "https://scontent.xx.fbcdn.net/";
  return {
    ok: true,
    data: {
      fetchedAt: "2026-11-14T12:00:00.000Z",
      profileImageUrl: base + "profile.jpg",
      posts: [
        {
          postId: "1",
          items: [
            {
              kind: "video",
              url: base + "clip.mp4",
              posterUrl: base + "cover.jpg",
            },
          ],
          hasMore: false,
        },
        {
          postId: "2",
          items: [{ kind: "image", url: base + "image.jpg", posterUrl: null }],
          hasMore: false,
        },
        {
          postId: "3",
          items: [
            { kind: "image", url: base + "slide-one.jpg", posterUrl: null },
            { kind: "image", url: base + "slide-two.jpg", posterUrl: null },
            { kind: "video", url: null, posterUrl: base + "cover.jpg" },
          ],
          hasMore: false,
        },
      ],
    },
  };
}

export async function loadResearchSelectionAction(
  input: unknown,
): Promise<
  import("@studio/contracts/social-research").ResearchSelectionResult
> {
  const parsed = (
    await import("@studio/contracts/social-research")
  ).researchSelectionInputSchema.parse(input);
  const second = parsed.accountId.startsWith("5555");
  await new Promise((resolve) => setTimeout(resolve, second ? 600 : 100));
  if (new URLSearchParams(location.search).has("selectionFail"))
    return {
      ok: false,
      error:
        "Account observations could not load. Select the account again to retry.",
    };
  return {
    ok: true,
    data: {
      selected: {
        id: parsed.accountId,
        platform: "instagram",
        identifier: second ? "second.studio" : "example.studio",
        name: second ? "Second research account" : "First research account",
        notes: "",
        version: 1,
        refreshedAt: null,
        lastError: null,
      },
      snapshots: [],
      historyPage: parsed.historyPage,
      hasMoreSnapshots: false,
      observationId: parsed.observationId ?? null,
    },
  };
}
