import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { can } from "@/lib/policies/workspace-policy";
import {
  getPublishingEnvironment,
  getPublishingWebEnvironment,
} from "@/lib/env/server";
import {
  OAuthStateError,
  verifyOAuthState,
} from "@/lib/publishing/oauth-state";
import { safeEquals } from "@/lib/crypto/secret-box";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import { sealResearchToken } from "@/lib/social/research/secrets";
import { saveResearchConnection } from "@/db/repositories/social-research.repository";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import {
  exchangeResearchConsent,
  RESEARCH_OAUTH_COOKIE,
  RESEARCH_OAUTH_PATH,
  RESEARCH_OAUTH_PURPOSE,
  RESEARCH_PATH,
} from "@/lib/social/research/oauth";

export const maxDuration = 60;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isSocialResearchEnabled())
    return new NextResponse(null, { status: 404, headers });
  const web = getPublishingWebEnvironment();
  function finish(status: "connected" | "failed" | "cancelled" | "invalid") {
    const response = NextResponse.redirect(
      new URL(`${RESEARCH_PATH}?authorization=${status}`, web.APP_BASE_URL),
      { status: 307, headers },
    );
    response.cookies.set(RESEARCH_OAUTH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: RESEARCH_OAUTH_PATH,
      maxAge: 0,
    });
    return response;
  }
  try {
    const query = new URL(request.url).searchParams;
    const state = query.get("state");
    const cookie = (await cookies()).get(RESEARCH_OAUTH_COOKIE)?.value;
    if (!state || state.length > 4000 || !cookie || !safeEquals(state, cookie))
      return finish("invalid");
    const payload = verifyOAuthState({
      state,
      platform: RESEARCH_OAUTH_PURPOSE,
      secret: web.OAUTH_STATE_SECRET,
      ttlSeconds: web.OAUTH_STATE_TTL_SECONDS,
    });
    const context = await getAuthenticatedWorkspaceContext();
    if (
      !context ||
      !can(context.activeMembership.role, "manageSettings") ||
      payload.workspaceId !== context.activeMembership.workspaceId ||
      payload.userId !== context.user.id
    )
      return finish("invalid");
    if (query.has("error")) return finish("cancelled");
    const code = query.get("code");
    if (!code || code.length > 4000) return finish("invalid");
    // Consume the browser nonce before exchange; reloads/replayed callbacks cannot save another grant.
    (await cookies()).set(RESEARCH_OAUTH_COOKIE, "", {
      path: RESEARCH_OAUTH_PATH,
      maxAge: 0,
    });
    const environment = getPublishingEnvironment();
    const consent = await exchangeResearchConsent({
      code,
      appId: web.FACEBOOK_APP_ID,
      appSecret: web.FACEBOOK_APP_SECRET,
      version: environment.FACEBOOK_GRAPH_API_VERSION,
      baseUrl: web.APP_BASE_URL,
    });
    await saveResearchConnection({
      workspaceId: context.activeMembership.workspaceId,
      connectedByUserId: context.user.id,
      accessTokenSealed: sealResearchToken({
        workspaceId: context.activeMembership.workspaceId,
        token: consent.token,
        key: environment.PLATFORM_TOKEN_ENCRYPTION_KEY,
      }),
      expiresAt: consent.expiresAt,
      scopes: consent.scopes,
      sources: consent.sources,
    });
    await recordAuditEvent({
      workspaceId: context.activeMembership.workspaceId,
      actorUserId: context.user.id,
      action: "platform_connected",
      targetType: "social_research_connection",
      metadata: { purpose: "research", sourceCount: consent.sources.length },
    });
    return finish("connected");
  } catch (error) {
    return finish(error instanceof OAuthStateError ? "invalid" : "failed");
  }
}
