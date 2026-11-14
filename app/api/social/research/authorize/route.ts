import { NextResponse } from "next/server";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { can } from "@/lib/policies/workspace-policy";
import {
  getPublishingEnvironment,
  getPublishingWebEnvironment,
} from "@/lib/env/server";
import { createOAuthState } from "@/lib/publishing/oauth-state";
import { isSocialResearchEnabled } from "@/lib/social/research/environment";
import {
  createResearchAuthorizationUrl,
  RESEARCH_OAUTH_COOKIE,
  RESEARCH_OAUTH_PATH,
  RESEARCH_OAUTH_PURPOSE,
  RESEARCH_PATH,
} from "@/lib/social/research/oauth";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isSocialResearchEnabled())
    return new NextResponse(null, { status: 404, headers });
  const context = await getAuthenticatedWorkspaceContext();
  if (!context || !can(context.activeMembership.role, "manageSettings"))
    return new NextResponse(null, { status: 403, headers });
  const web = getPublishingWebEnvironment();
  try {
    const environment = getPublishingEnvironment();
    const state = createOAuthState({
      workspaceId: context.activeMembership.workspaceId,
      userId: context.user.id,
      platform: RESEARCH_OAUTH_PURPOSE,
      secret: web.OAUTH_STATE_SECRET,
    });
    const response = NextResponse.redirect(
      createResearchAuthorizationUrl({
        appId: web.FACEBOOK_APP_ID,
        version: environment.FACEBOOK_GRAPH_API_VERSION,
        baseUrl: web.APP_BASE_URL,
        state,
      }),
      { status: 307, headers },
    );
    response.cookies.set(RESEARCH_OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: RESEARCH_OAUTH_PATH,
      maxAge: web.OAUTH_STATE_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.redirect(
      new URL(
        `${RESEARCH_PATH}?authorization=failed&failure=configuration`,
        web.APP_BASE_URL,
      ),
      { status: 307, headers },
    );
  }
}
