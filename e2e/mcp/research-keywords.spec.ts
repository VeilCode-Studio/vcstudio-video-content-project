import { test, expect } from "@playwright/test";

for (const theme of ["light", "dark"])
  for (const width of [390, 1440]) {
    test(`saved keyword evidence is accessible and bounded in ${theme} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const external: string[] = [];
      page.on("request", (request) => {
        if (!request.url().startsWith("http://127.0.0.1:"))
          external.push(request.url());
      });
      await page.goto(`/research-keywords.html?theme=${theme}`);
      await expect(
        page.getByRole("heading", { name: "Keyword research", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "#épargne", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: /^Unavailable/ }).first(),
      ).toBeVisible();
      await expect(page.getByText(/No search volume/)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const input = await page.getByLabel("Keyword or phrase").boundingBox();
      const select = await page
        .getByRole("combobox", { name: "Term type" })
        .boundingBox();
      expect(input?.height).toBe(select?.height);
      expect(
        await page
          .getByRole("button", { name: "Next", exact: true })
          .getAttribute("href"),
      ).toContain("page=2");
      await page.getByRole("combobox", { name: "Term type" }).click();
      await page.getByRole("option", { name: "Hashtags", exact: true }).click();
      await page.getByLabel("Keyword or phrase").fill("#Finance");
      await page
        .getByRole("button", { name: "Research keywords", exact: true })
        .click();
      await expect(page).toHaveURL(/kind=hashtags/);
      await expect(page).toHaveURL(/query=%23Finance/);
      expect(external).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`keywords-${theme}-${width}.png`),
        fullPage: true,
      });
    });
  }
test("empty and failed reads provide an actionable state", async ({ page }) => {
  await page.goto("/research-keywords.html?empty=1");
  await expect(page.getByText(/No matching terms yet/)).toBeVisible();
  await page.goto("/research-keywords.html?error=1");
  await expect(page.getByRole("alert")).toContainText(
    "Research could not be loaded",
  );
  await expect(
    page.getByRole("link", { name: "Reset filters and try again" }),
  ).toBeVisible();
});
