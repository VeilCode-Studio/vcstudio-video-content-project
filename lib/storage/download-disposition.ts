/** Keep filenames usable without allowing header injection or path components. */
export function downloadDisposition(fileName: string): string {
  const name =
    Array.from(fileName.toWellFormed().replace(/[\x00-\x1f\x7f/\\]/g, "_"))
      .slice(0, 180)
      .join("") || "download";
  const fallback = name.replace(/[^a-zA-Z0-9 ._-]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (value) => "%" + value.charCodeAt(0).toString(16),
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
