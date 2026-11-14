import "server-only";
import { z } from "zod";
import { SocialResearchError } from "./errors";

const errorSchema = z.object({
  error: z.object({ code: z.number().optional() }),
});

/** Fixed host/paths, bounded body and timeout. Never follow provider paging URLs or log tokens. */
export async function metaResearchRequest(input: {
  version: string;
  path: string;
  token?: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  if (
    !/^v\d+\.\d+$/.test(input.version) ||
    !/^[a-zA-Z0-9_\-/]+$/.test(input.path)
  )
    throw new SocialResearchError(
      "configuration",
      "Meta research is not configured correctly.",
    );
  const url = new URL(
    `https://graph.facebook.com/${input.version}/${input.path}`,
  );
  url.search = new URLSearchParams(input.query).toString();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: input.token
        ? { Authorization: `Bearer ${input.token}` }
        : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const reader = response.body?.getReader();
    if (!reader)
      throw new SocialResearchError(
        "unavailable",
        "Meta returned an empty response. Try again later.",
      );
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > 1500000) {
          await reader.cancel();
          throw new Error("RESPONSE_LIMIT");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const error = errorSchema.safeParse(value);
    if (!response.ok || error.success) {
      const code = error.success ? error.data.error.code : null;
      if (code === 190)
        throw new SocialResearchError(
          "expired",
          "Meta research authorization has expired. Ask the workspace owner to reconnect research access.",
          code,
        );
      if (response.status === 429 || [4, 17, 32, 613].includes(code ?? -1))
        throw new SocialResearchError(
          "rate_limit",
          "Meta has limited research requests. Keep the saved snapshot and try again later.",
          code ?? undefined,
        );
      if ([10, 100, 200, 803].includes(code ?? -1) || response.status === 403)
        throw new SocialResearchError(
          "access",
          "Meta could not expose this account. Check its identifier, professional/Page status, granted permissions and public-content App Review access. Reconnecting cannot bypass Meta approval.",
          code ?? undefined,
        );
      throw new SocialResearchError(
        "unavailable",
        "Meta research is temporarily unavailable. Your previous snapshot is preserved.",
        code ?? undefined,
      );
    }
    return value;
  } catch (error) {
    if (error instanceof SocialResearchError) throw error;
    throw new SocialResearchError(
      "unavailable",
      "Meta research could not finish. Your previous snapshot is preserved; try again later.",
    );
  }
}
