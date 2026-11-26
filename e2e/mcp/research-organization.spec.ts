import { expect, test } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  test(`organizes research without browser overflow in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/research.html?theme=${theme}`);
    await page.getByRole("button", { name: "Manage categories" }).click();
    await page
      .getByLabel("New category", { exact: true })
      .fill("Original ideas");
    await page
      .getByRole("button", { name: "Create category", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("research-category-create")),
      )
      .toContain("Original ideas");
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("research-router-refresh")),
      )
      .toBe("true");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("moves an account only after Save category, with its exact revision", async ({
  page,
}) => {
  await page.goto("/research.html");
  await page.getByLabel("Account category", { exact: true }).click();
  await page
    .getByRole("option", { name: "Finance creators", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("research-category-assign"),
    ),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("research-category-assign")),
    )
    .toContain('"version":1');
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("research-category-assign")),
    )
    .toContain("77777777-7777-4777-8777-777777777777");
});
test("removes a category only with confirmation that accounts are preserved", async ({
  page,
}) => {
  await page.goto("/research.html");
  await page.getByRole("button", { name: "Manage categories" }).click();
  await page
    .getByRole("button", { name: "Remove", exact: true })
    .first()
    .click();
  const confirmation = page
    .getByRole("dialog")
    .filter({ hasText: "Remove Competitors?" });
  await expect(confirmation).toContainText("will be preserved");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("research-category-delete"),
    ),
  ).toBeNull();
  await confirmation
    .getByRole("button", { name: "Remove category", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("research-category-delete")),
    )
    .toContain("66666666");
});
test("keeps failed changes visible and allows retry", async ({ page }) => {
  await page.goto("/research.html?categoryFail");
  await page.getByLabel("Account category", { exact: true }).click();
  await page.getByRole("option", { name: "Competitors", exact: true }).click();
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "category changed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save category", exact: true }),
  ).toBeEnabled();
});
test("viewers can browse categories but cannot manage or move accounts", async ({
  page,
}) => {
  await page.goto("/research.html?readonly");
  await expect(page.getByLabel("Browse category")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage categories" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save category" })).toHaveCount(
    0,
  );
});
test("category navigation clears stale account/history filters", async ({
  page,
}) => {
  await page.goto(
    "/research.html?account=11111111-1111-4111-8111-111111111111&historyPage=3",
  );
  await page.getByLabel("Browse category").click();
  await page
    .getByRole("option", { name: "Competitors (0)", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\?category=66666666-6666-4666-8666-666666666666$/,
  );
});
