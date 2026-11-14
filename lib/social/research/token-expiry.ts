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
  }),
});

/** Local reconnect ceiling, not a claim that Meta guarantees a 60-day token. */
const MAX_RESEARCH_CONSENT_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export async function resolveResearchTokenDeadline(input: {
  token: string;
  expiresIn?: number | null;
  appId: string;
  appSecret: string;
  version: string;
}): Promise<Date> {
  const now = Date.now();
  const localDeadline = now + MAX_RESEARCH_CONSENT_AGE_MS;
  if (
    input.expiresIn !== undefined &&
    input.expiresIn !== null &&
    input.expiresIn > 0
  ) {
    return new Date(Math.min(localDeadline, now + input.expiresIn * 1000));
  }
  // Some valid token-exchange responses omit expires_in. Inspect the returned
  // token rather than guessing its provider expiry or persisting unknown access.
  const { data } = metadataSchema.parse(
    await metaResearchRequest({
      version: input.version,
      path: "debug_token",
      token: `${input.appId}|${input.appSecret}`,
      query: { input_token: input.token },
    }),
  );
  if (!data.is_valid || data.app_id !== input.appId) {
    throw new SocialResearchError(
      "access",
      "Meta could not verify this research token for the configured app.",
    );
  }
  // Meta uses zero for tokens without a scheduled expiry. They still receive
  // our finite local reconnect deadline and remain subject to provider revocation.
  const deadlines = [data.expires_at, data.data_access_expires_at]
    .filter((value): value is number => value !== undefined && value > 0)
    .map((value) => value * 1000);
  if (deadlines.some((value) => value <= now)) {
    throw new SocialResearchError(
      "expired",
      "Meta research access has expired. Start a fresh authorization.",
    );
  }
  return new Date(Math.min(localDeadline, ...deadlines));
}
