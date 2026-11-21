import { z } from "zod";
import {
  pinterestBoardSchema,
  pinterestBoardQuerySchema,
} from "@studio/contracts/publishing";
const result = z.union([
  z.object({
    ok: z.literal(true),
    page: z.object({
      items: z.array(pinterestBoardSchema),
      bookmark: z.string().nullable(),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export async function getPinterestBoardsAction(raw: unknown) {
  const query = pinterestBoardQuerySchema.parse(raw);
  const response = await fetch(
    `/test-pinterest-boards?${new URLSearchParams({ connectionId: query.connectionId, ...(query.bookmark ? { bookmark: query.bookmark } : {}) })}`,
  );
  return result.parse(await response.json());
}
