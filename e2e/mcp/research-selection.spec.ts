import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`keeps accounts mounted while observations change in ${theme}`, async ({
    page,
  }) => {
    await page.goto(`/research.html?theme=${theme}`);
    const accounts = page.getByRole("complementary", {
      name: "Saved research accounts",
    });
    await accounts.evaluate((node) =>
      node.setAttribute("data-mount-check", "original"),
    );
    await accounts
      .getByRole("link", { name: /Second research account/ })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Loading account observations" }),
    ).toBeVisible();
    await expect(accounts).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Account research", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Second research account",
        exact: true,
      }),
    ).toBeVisible();
    await expect(accounts).toHaveAttribute("data-mount-check", "original");
    await expect(page).toHaveURL(/account=55555555/);
    await page.goBack();
    await expect(
      page.getByRole("heading", {
        name: "First research account",
        exact: true,
      }),
    ).toBeVisible();
    await expect(accounts).toHaveAttribute("data-mount-check", "original");
  });
}
test("ignores a slow earlier account response", async ({ page }) => {
  await page.goto("/research.html");
  const accounts = page.getByRole("navigation", { name: "Research accounts" });
  await accounts.getByRole("link", { name: /Second research account/ }).click();
  await accounts.getByRole("link", { name: /A thoughtful business/ }).click();
  await expect(
    page.getByRole("heading", { name: "First research account", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(700);
  await expect(
    page.getByRole("heading", { name: "First research account", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/account=11111111/);
});
test("preserves the watchlist and previous data after a failed selection", async ({
  page,
}) => {
  await page.goto("/research.html?selectionFail");
  const accounts = page.getByRole("navigation", { name: "Research accounts" });
  await accounts.getByRole("link", { name: /Second research account/ }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Account observations could not load/ }),
  ).toBeVisible();
  await expect(accounts.getByRole("link")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: /A thoughtful business/ }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/account=55555555/);
});
