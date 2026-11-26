import type { ResearchCategoryActionResult } from "@studio/contracts/research-categories";
async function result(
  kind: string,
  input: unknown,
): Promise<ResearchCategoryActionResult> {
  sessionStorage.setItem(`research-category-${kind}`, JSON.stringify(input));
  await new Promise((resolve) => setTimeout(resolve, 350));
  return new URLSearchParams(location.search).has("categoryFail")
    ? { ok: false, error: "The category changed. Refresh and try again." }
    : { ok: true, id: "77777777-7777-4777-8777-777777777777" };
}
export async function createResearchCategoryAction(input: unknown) {
  return result("create", input);
}
export async function renameResearchCategoryAction(input: unknown) {
  return result("rename", input);
}
export async function deleteResearchCategoryAction(input: unknown) {
  return result("delete", input);
}
export async function assignResearchCategoryAction(input: unknown) {
  return result("assign", input);
}
