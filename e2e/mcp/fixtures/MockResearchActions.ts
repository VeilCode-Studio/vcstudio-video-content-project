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
