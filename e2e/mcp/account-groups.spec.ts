import { expect, test } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`groups accounts with working collapse and recovery in ${theme} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/account-groups.html?theme=${theme}`);
      const tiktok = page.getByRole("list", {
        name: "TikTok accounts",
        exact: true,
      });
      await expect(tiktok.getByRole("listitem")).toHaveCount(2);
      await expect(tiktok).toContainText("First TikTok");
      await expect(tiktok).toContainText("Second TikTok");
      await expect(
        tiktok.getByRole("link", { name: "Reconnect Second TikTok (TikTok)" }),
      ).toHaveAttribute("href", "/api/tiktok/authorize");
      await page
        .getByRole("button", { name: /TikTok 2 accounts 1 need attention/ })
        .click();
      await expect(tiktok).not.toBeVisible();
      await expect(
        page.getByRole("list", { name: "Facebook accounts" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /TikTok 2 accounts 1 need attention/ })
        .click();
      await expect(tiktok).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}
test("grouped accounts retain disconnect confirmation", async ({ page }) => {
  await page.goto("/account-groups.html");
  await page
    .getByRole("list", { name: "TikTok accounts" })
    .getByRole("button", { name: /Disconnect/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("account-disconnect")),
  ).toBeNull();
});
