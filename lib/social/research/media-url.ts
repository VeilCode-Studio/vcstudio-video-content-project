/** Only Meta CDN media may load in research. Never return token-bearing URLs. */
export function researchMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["fbcdn.net", "cdninstagram.com", "fbsbx.com"].some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      ) ||
      [...url.searchParams.keys()].some((key) =>
        /token|secret|authorization/i.test(key),
      )
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
