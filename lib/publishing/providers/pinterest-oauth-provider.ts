import "server-only";
import { z } from "zod";
import type {
  PlatformOAuthProvider,
  PlatformTokens,
} from "@/lib/publishing/platform-oauth-provider";
import { PublishProviderError } from "@/lib/publishing/video-publish-provider";
import { PINTEREST_API, pinterestRequest } from "./pinterest-client";
export const PINTEREST_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "pins:read",
  "pins:write",
] as const;
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive().max(31_536_000),
  scope: z.string().min(1),
});
const accountSchema = z.object({
  id: z.string().regex(/^\d{1,32}$/),
  username: z.string().regex(/^[A-Za-z0-9_]{1,100}$/),
  business_name: z.string().optional().nullable(),
});
export class PinterestOAuthProvider implements PlatformOAuthProvider {
  readonly platform = "pinterest" as const;
  readonly accountLabel = "Pinterest account";
  constructor(
    private readonly credentials: { clientId: string; clientSecret: string },
  ) {}
  createAuthorizationUrl(input: { state: string; redirectUri: string }) {
    const url = new URL("https://www.pinterest.com/oauth/");
    url.search = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: PINTEREST_SCOPES.join(","),
      state: input.state,
    }).toString();
    return url.toString();
  }
  private async tokens(
    params: Record<string, string>,
  ): Promise<PlatformTokens> {
    const response = await fetch(PINTEREST_API + "/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
      cache: "no-store",
    });
    const parsed = tokenSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!response.ok || !parsed.success)
      throw new PublishProviderError({
        category: "authorization_expired",
        safeMessage:
          "Pinterest authorization could not be completed. Check app access and reconnect.",
        retriable: false,
        mayHavePublished: false,
      });
    const scopes = parsed.data.scope.split(/[ ,]+/).filter(Boolean);
    if (!PINTEREST_SCOPES.every((scope) => scopes.includes(scope)))
      throw new PublishProviderError({
        category: "insufficient_permissions",
        safeMessage:
          "Authorize all required Pinterest board and Pin permissions.",
        retriable: false,
        mayHavePublished: false,
      });
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000),
      scopes,
    };
  }
  async exchangeCode(input: { code: string; redirectUri: string }) {
    const tokens = await this.tokens({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
    });
    const account = accountSchema.safeParse(
      await pinterestRequest(tokens.accessToken, "/user_account"),
    );
    if (!account.success)
      throw new PublishProviderError({
        category: "provider_error",
        safeMessage: "Pinterest did not return a valid account identity.",
        retriable: false,
        mayHavePublished: false,
      });
    return {
      tokens,
      account: {
        externalAccountId: account.data.id,
        externalAccountName:
          account.data.business_name || account.data.username,
        externalAccountUrl: `https://www.pinterest.com/${account.data.username}/`,
      },
    };
  }
  refreshTokens(input: { refreshToken: string }) {
    return this.tokens({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    });
  }
}
