import { z } from "zod";

export const DEFAULT_RESEARCH_CATEGORIES = [
  "Competitors",
  "Inspiration",
  "Industry insights",
] as const;
export const researchCategoryFilterSchema = z.union([
  z.literal("all"),
  z.literal("uncategorized"),
  z.uuid(),
]);
export type ResearchCategoryFilter = z.infer<
  typeof researchCategoryFilterSchema
>;
export const researchCategoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(80);
export const createResearchCategorySchema = z.object({
  name: researchCategoryNameSchema,
});
export const editResearchCategorySchema = createResearchCategorySchema.extend({
  categoryId: z.uuid(),
  version: z.number().int().positive(),
});
export const deleteResearchCategorySchema = editResearchCategorySchema.omit({
  name: true,
});
export const assignResearchCategorySchema = z.object({
  accountId: z.uuid(),
  version: z.number().int().positive(),
  categoryId: z.uuid().nullable(),
});
export type ResearchCategoryView = {
  id: string;
  name: string;
  version: number;
  accountCount: number;
};
export type ResearchCategoryActionResult =
  { ok: true; id?: string } | { ok: false; error: string };
