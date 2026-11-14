import "server-only";
import {
  readResearchTokenMetadata,
  type ResearchTokenMetadata,
} from "./token-metadata";
import { SocialResearchError } from "./errors";

/** Local reconnect ceiling, not a claim that Meta guarantees a 60-day token. */
const MAX_RESEARCH_CONSENT_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export async function resolveResearchTokenDeadline(input: {
  token: string;
  expiresIn?: number | null;
  appId: string;
  appSecret: string;
  version: string;
  inspectToken?: () => Promise<ResearchTokenMetadata>;
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
  const data = await (input.inspectToken
    ? input.inspectToken()
    : readResearchTokenMetadata(input));
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
