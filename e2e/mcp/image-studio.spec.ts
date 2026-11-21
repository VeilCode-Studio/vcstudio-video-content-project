import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"])
  for (const width of [390, 1440])
    test(`Image Studio cost review and queue at ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (t) =>
          document.addEventListener("DOMContentLoaded", () =>
            document.documentElement.classList.toggle("dark", t === "dark"),
          ),
        theme,
      );
      await page.goto("/image-studio.html");
      await expect(
        page.getByRole("heading", { name: "Image Studio", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => localStorage.getItem("imageLibraryOpened")),
      ).toBeNull();
      await page
        .getByLabel("Image name (optional)")
        .fill("Standalone illustration");
      await page
        .getByLabel("Prompt", { exact: true })
        .fill("A green tree in morning light");
      await page
        .getByRole("button", { name: "Review estimate", exact: true })
        .click();
      await expect(
        page.getByText("Estimated cost $0.08", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => localStorage.getItem("imageStarted")),
      ).toBeNull();
      await page
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      await expect(page.getByText("queued", { exact: true })).toBeVisible();
      const request = JSON.parse(
        (await page.evaluate(() => localStorage.getItem("imageStarted")))!,
      );
      expect(request.request.prompt).toBe("A green tree in morning light");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`images-${theme}-${width}.png`),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
test("changing settings invalidates the reviewed estimate", async ({
  page,
}) => {
  await page.goto("/image-studio.html");
  await page.getByLabel("Prompt", { exact: true }).fill("A tree");
  await page
    .getByRole("button", { name: "Review estimate", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate image", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Canvas", { exact: true }).click();
  await page
    .getByRole("option", { name: "Portrait (1024 x 1536)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate image", exact: true }),
  ).toHaveCount(0);
});
test("references load only when opened and save their exact IDs", async ({
  page,
}) => {
  await page.goto("/image-studio.html");
  await page
    .getByRole("button", { name: "Choose reference images", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Product reference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Second reference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use references (2)", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Prompt", { exact: true })
    .fill("A tree using these colors");
  await page
    .getByRole("button", { name: "Review estimate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate image", exact: true })
    .click();
  await expect(page.getByText("queued", { exact: true })).toBeVisible();
  const payload = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("imageStarted")))!,
  );
  expect(payload.request.referenceAssetIds).toHaveLength(2);
});
for (const mode of ["viewer", "disabled"])
  test(`does not offer generation for ${mode}`, async ({ page }) => {
    await page.goto(`/image-studio.html?mode=${mode}`);
    await expect(
      page.getByRole("button", { name: "Review estimate", exact: true }),
    ).toBeDisabled();
  });
test("queue retry uses the existing job and displays its result", async ({
  page,
}) => {
  await page.goto("/image-studio.html?queue-error=1");
  await page.getByLabel("Prompt", { exact: true }).fill("Tree");
  await page
    .getByRole("button", { name: "Review estimate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate image", exact: true })
    .click();
  await page.getByRole("button", { name: "Retry queue", exact: true }).click();
  await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Generated image", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("imageRetry")),
  ).toBeTruthy();
});
