import { NextResponse } from "next/server";
import { getAuthenticatedWorkspaceContext } from "@/lib/auth/workspace-context";
import { mediaDownloadSchema } from "@studio/contracts/media-download";
import { mediaDownloadUrl } from "@/lib/media/media-download";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  let workspace;
  try {
    workspace = await getAuthenticatedWorkspaceContext();
  } catch {
    return NextResponse.json(
      { error: "Sign in to download media." },
      { status: 403, headers },
    );
  }
  if (!workspace)
    return NextResponse.json(
      { error: "Workspace access is required." },
      { status: 403, headers },
    );
  const params = new URL(request.url).searchParams;
  const parsed = mediaDownloadSchema.safeParse({
    ...(await context.params),
    source: params.get("source") ?? undefined,
    postId: params.get("postId") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid media download." },
      { status: 400, headers },
    );
  try {
    const url = await mediaDownloadUrl(
      workspace.activeMembership.workspaceId,
      parsed.data,
    );
    if (!url)
      return NextResponse.json(
        { error: "This media is unavailable for download." },
        { status: 404, headers },
      );
    return NextResponse.json({ url }, { headers });
  } catch (error) {
    console.error("MEDIA_DOWNLOAD_FAILED", {
      assetId: parsed.data.assetId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "The download could not start. Please try again." },
      { status: 500, headers },
    );
  }
}
