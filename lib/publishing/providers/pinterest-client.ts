import "server-only";
import { PublishProviderError } from "@/lib/publishing/video-publish-provider";
export const PINTEREST_API = "https://api.pinterest.com/v5";
/** Fixed host and safe errors; raw Pinterest responses can contain credentials. */
export async function pinterestRequest(
  accessToken: string,
  path: string,
  body?: unknown,
  mayPublish = false,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(PINTEREST_API + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new PublishProviderError({
      category: mayPublish ? "transport_ambiguous" : "network_unreachable",
      safeMessage: mayPublish
        ? "Pinterest did not confirm whether the Pin was created. Check the account before retrying."
        : "Pinterest could not be reached. Try again later.",
      retriable: !mayPublish,
      mayHavePublished: mayPublish,
    });
  }
  if (!response.ok)
    throw new PublishProviderError({
      category:
        response.status === 401
          ? "authorization_expired"
          : response.status === 403
            ? "insufficient_permissions"
            : response.status === 429
              ? "rate_limited"
              : response.status >= 500
                ? "provider_server_error"
                : "invalid_metadata",
      safeMessage:
        response.status === 401
          ? "Reconnect this Pinterest account."
          : response.status === 403
            ? "Pinterest refused access. Check app approval, account permissions and the selected board."
            : "Pinterest could not complete this request. Check Pin settings or try again later.",
      retriable:
        response.status === 429 || (!mayPublish && response.status >= 500),
      mayHavePublished: mayPublish && response.status >= 500,
    });
  return response.json().catch(() => null);
}
