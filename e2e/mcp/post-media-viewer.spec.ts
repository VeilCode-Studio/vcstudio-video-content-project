import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/viewer-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#136452"/></svg>',
    }),
  );
});
for (const theme of ["light", "dark"])
  for (const width of [390, 1440]) {
    test(`large viewer and carousel in ${theme} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/post-media-viewer.html");
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      await page
        .getByRole("button", { name: "Preview Landscape", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "Landscape" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("status", { name: "Media position" }),
      ).toHaveText("2 of 4");
      await expect(dialog.locator("img")).toHaveCount(1);
      expect(
        await dialog
          .locator("img")
          .evaluate((image) => getComputedStyle(image).objectFit),
      ).toBe("contain");
      const bounds = await dialog.boundingBox();
      expect(bounds!.width).toBeGreaterThan(width * 0.7);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await dialog.getByRole("button", { name: "Previous slide" }).click();
      await expect(
        dialog.getByRole("status", { name: "Media position" }),
      ).toHaveText("1 of 4");
      await expect(
        dialog.getByRole("button", { name: "Previous slide" }),
      ).toBeDisabled();
      await dialog.getByRole("button", { name: "Next slide" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        dialog.getByRole("status", { name: "Media position" }),
      ).toHaveText("2 of 4");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Preview Landscape", exact: true }),
      ).toBeFocused();
    });
  }
test("videos mount only on active slide, never autoplay, and stop when leaving", async ({
  page,
}) => {
  let downloads = 0;
  await page.route("**/viewer-*.mp4", (route) => {
    downloads++;
    return route.fulfill({ status: 404 });
  });
  await page.goto("/post-media-viewer.html?readonly");
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview Finished video" }).click();
  const video = page.getByRole("dialog").locator("video");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("autoplay");
  expect(downloads).toBe(0);
  await page.getByRole("button", { name: "Previous slide" }).click();
  await expect(page.locator("video")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(downloads).toBe(0);
});
test("single image has no navigation and errors offer retry", async ({
  page,
}) => {
  await page.route("**/viewer-portrait.svg", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/post-media-viewer.html?single");
  await page.getByRole("button", { name: "Preview Portrait" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Next slide" })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole("alert")).toContainText("could not be loaded");
  await page.unroute("**/viewer-portrait.svg");
  await dialog.getByRole("button", { name: "Retry preview" }).click();
  await expect(dialog.getByRole("img")).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});
test("pending verification cannot expose a player", async ({ page }) => {
  await page.goto("/post-media-viewer.html");
  await page.getByRole("button", { name: "Preview Pending video" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "verification is in progress",
  );
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next slide" })).toBeDisabled();
});
test("viewing leaves attachment order and remove controls intact", async ({
  page,
}) => {
  await page.goto("/post-media-viewer.html");
  await page.getByRole("button", { name: "Move Landscape earlier" }).click();
  await expect(page.locator("li").first()).toContainText("Landscape");
  await page
    .getByRole("button", { name: "Preview Landscape", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("status", { name: "Media position" }),
  ).toHaveText("1 of 4");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove Landscape" }).click();
  await expect(page.locator("li")).toHaveCount(3);
});

test("dragging slides navigates the preview", async ({ page }) => {
  await page.goto("/post-media-viewer.html");
  await page
    .getByRole("button", { name: "Preview Portrait", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const box = await dialog
    .locator('[data-slot="carousel-content"]')
    .boundingBox();
  if (!box) throw new Error("Carousel viewport was not rendered");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(
    dialog.getByRole("status", { name: "Media position" }),
  ).toHaveText("2 of 4");
});
