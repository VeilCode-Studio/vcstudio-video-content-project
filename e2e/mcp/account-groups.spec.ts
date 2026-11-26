import { expect, test } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`compact platform filter preserves recovery in ${theme} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/account-groups.html?theme=${theme}`);
      await expect(
        page
          .getByRole("list", { name: "Connected accounts", exact: true })
          .getByRole("listitem"),
      ).toHaveCount(3);
      const filter = page.getByRole("combobox", {
        name: "Filter accounts by platform",
      });
      await filter.click();
      await page.getByRole("option", { name: /TikTok/ }).click();
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
      await expect(
        page.getByText("Business Page", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("status")).toContainText("2 of 3 accounts");
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(
        page
          .getByRole("list", { name: "Connected accounts", exact: true })
          .getByRole("listitem"),
      ).toHaveCount(3);
      await expect(filter).toContainText("All platforms");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390)
        await page.screenshot({
          path: `.vercel/accounts-filter-${theme}.png`,
          fullPage: true,
        });
    });
  }
}
test("grouped accounts retain disconnect confirmation", async ({ page }) => {
  await page.goto("/account-groups.html");
  await page
    .getByRole("list", { name: "Connected accounts", exact: true })
    .getByRole("button", { name: /Disconnect/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("account-disconnect")),
  ).toBeNull();
});

test("platform selection supports keyboard and does not fetch accounts again", async ({
  page,
}) => {
  await page.goto("/account-groups.html");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const filter = page.getByRole("combobox", {
    name: "Filter accounts by platform",
  });
  await filter.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: /Facebook/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("list", { name: "Facebook accounts" }).getByRole("listitem"),
  ).toHaveCount(1);
  await expect(filter).toBeFocused();
  expect(requests).toEqual([]);
});

test("editors can filter without gaining owner-only controls", async ({
  page,
}) => {
  await page.goto("/account-groups.html?readonly");
  await page
    .getByRole("combobox", { name: "Filter accounts by platform" })
    .click();
  await page.getByRole("option", { name: /TikTok/ }).click();
  await expect(
    page.getByRole("list", { name: "TikTok accounts" }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Reconnect/ })).toHaveCount(0);
});
