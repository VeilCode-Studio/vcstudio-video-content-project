import { expect, test } from "@playwright/test";

test("library download saves the original without opening the detail sheet", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/media/**/download?*", (route) => {
    requests++;
    return route.fulfill({
      json: { url: "https://media.example/original.png" },
    });
  });
  await page.context().route("https://media.example/original.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "Content-Disposition": 'attachment; filename="original.png"' },
      body: "mock original file",
    }),
  );
  await page.goto("/media-library.html?downloads");
  expect(requests).toBe(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Library image one", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("original.png");
  expect(requests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/media-library/);
});

test("copies unsaved post text and preserves it when a download fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) =>
          localStorage.setItem("copied-post-text", text),
      },
    });
  });
  await page.route("**/api/media/**/download?*", (route) =>
    route.fulfill({ status: 403, json: { error: "Denied" } }),
  );
  await page.goto("/post-composer.html?pinterest");
  const editor = page.getByLabel("Post body");
  await editor.fill("An unsaved lesson.\nA second line.");
  await page
    .getByRole("button", { name: "Copy post text", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "post text copied", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("copied-post-text")),
  ).toContain("An unsaved lesson.");
  await page
    .getByRole("button", { name: "Download Library image one", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Download unavailable");
  await expect(editor).toContainText("An unsaved lesson.");
});

test("post viewer downloads use the current asset and render source", async ({
  page,
}) => {
  await page.route("**/api/media/**/download?*", (route) =>
    route.fulfill({ status: 404, json: { error: "Unavailable" } }),
  );
  await page.goto("/post-media-viewer.html");
  await page
    .getByRole("button", { name: "Preview Landscape", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Download Landscape", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Next slide" }).click();
  const request = page.waitForRequest((request) =>
    request.url().includes("/api/media/video/download?"),
  );
  await dialog
    .getByRole("button", { name: "Download Finished video", exact: true })
    .click();
  const url = new URL((await request).url());
  expect(url.searchParams.get("source")).toBe("render");
  expect(url.searchParams.get("postId")).toBe(
    "11111111-1111-4111-8111-111111111111",
  );
  await expect(dialog.getByRole("alert")).toContainText("Download unavailable");
  await dialog.getByRole("button", { name: "Next slide" }).click();
  await expect(
    dialog.getByRole("button", { name: "Download Pending video", exact: true }),
  ).toBeDisabled();
});
