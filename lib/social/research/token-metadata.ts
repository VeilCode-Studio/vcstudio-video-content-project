import "server-only";
import { z } from "zod";
import { metaResearchRequest } from "./meta-client";
import { SocialResearchError } from "./errors";

const metadataSchema = z.object({
  data: z.object({
    app_id: z.string().min(1),
    is_valid: z.boolean(),
    expires_at: z.number().int().nonnegative(),
    data_access_expires_at: z.number().int().nonnegative().optional(),
    granular_scopes: z
      .array(
        z.object({
          scope: z.string().max(200),
          target_ids: z
            .array(z.string().regex(/^\d{1,40}$/))
            .max(1000)
            .optional(),
        }),
      )
      .max(100)
      .default([]),
  }),
});
export type ResearchTokenMetadata = z.infer<typeof metadataSchema>["data"];

export async function readResearchTokenMetadata(input: {
  token: string;
  appId: string;
  appSecret: string;
  version: string;
}): Promise<ResearchTokenMetadata> {
  const { data } = metadataSchema.parse(
    await metaResearchRequest({
      version: input.version,
      path: "debug_token",
      token: `${input.appId}|${input.appSecret}`,
      query: { input_token: input.token },
    }),
  );
  if (!data.is_valid || data.app_id !== input.appId)
    throw new SocialResearchError(
      "access",
      "Meta could not verify this research token for the configured app.",
    );
  const deadlines = [data.expires_at, data.data_access_expires_at].filter(
    (value): value is number => value !== undefined && value > 0,
  );
  if (deadlines.some((value) => value * 1000 <= Date.now()))
    throw new SocialResearchError(
      "expired",
      "Meta research access has expired. Start a fresh authorization.",
    );
  return data;
}
