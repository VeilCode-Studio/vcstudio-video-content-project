import { expect, it } from "vitest";
import { downloadDisposition } from "./download-disposition";
it("preserves Unicode filenames with a safe attachment header", () => {
  expect(downloadDisposition("my image caf\u00e9.png")).toContain(
    "filename*=UTF-8''my%20image%20caf%C3%A9.png",
  );
});
it("removes path separators, quotes and header injection", () => {
  const header = downloadDisposition('../a\\b"\r\n.png');
  expect(header).not.toContain("\r");
  expect(header).not.toContain("\n");
  expect(header).not.toContain('b"');
  expect(header).toMatch(/^attachment;/);
});
it("handles empty names and long Unicode without broken surrogate pairs", () => {
  expect(downloadDisposition("")).toContain('filename="download"');
  expect(() => downloadDisposition("\u{1f600}".repeat(200))).not.toThrow();
});
