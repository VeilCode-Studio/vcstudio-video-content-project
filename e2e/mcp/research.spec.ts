import { expect, test } from "@playwright/test";

test("owners can rediscover source accounts without another OAuth flow", async ({
  page,
}) => {
  await page.goto("/research.html");
  await page.getByRole("button", { name: "Find Instagram sources" }).click();
  await expect(
    page.getByRole("button", { name: "Checking sources…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").getByText(/Found 1 Instagram source account/),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("research-sources-checked"),
    ),
  ).toBe("true");
  await expect(page).toHaveURL(/research.html$/);
  await page.goto("/research.html?readonly=1");
  await expect(
    page.getByRole("button", { name: "Find Instagram sources" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`authorization failure has a visible recovery alert in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(
      `/research.html?theme=${theme}&authFailed=1&failure=account_discovery&disconnected=1`,
    );
    const alert = page.getByRole("alert");
    await expect(
      alert.getByRole("heading", {
        name: "Authorized accounts could not be loaded",
      }),
    ).toBeVisible();
    await expect(alert.getByText(/Check Page access/)).toBeVisible();
    await expect(alert.getByText(/Support reference:/)).toBeVisible();
    await expect(
      alert.getByRole("link", { name: "Try authorization again" }),
    ).toHaveAttribute("href", "/api/social/research/authorize");
    expect(
      await alert.evaluate((el) => getComputedStyle(el).borderLeftWidth),
    ).toBe("4px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`research-auth-error-${theme}.png`),
      fullPage: true,
    });
  });
}
test("authorization success is distinct from errors and viewers cannot retry", async ({
  page,
}) => {
  await page.goto("/research.html?authConnected=1");
  await expect(
    page
      .getByRole("status")
      .getByRole("heading", { name: "Research access authorized" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto("/research.html?authFailed=1&readonly=1");
  await expect(
    page
      .getByRole("alert")
      .getByRole("heading", { name: "Research authorization failed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Try authorization again" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"])
  for (const width of [390, 768, 1440]) {
    test(`research is responsive and usable in ${theme} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/research.html?theme=${theme}`);
      await expect(
        page.getByRole("heading", { name: "Account research", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Format comparison" }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Private insights are not available. Missing counts are unknown, not zero.",
        ),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const select = await page
        .getByRole("combobox", { name: "Your authorized Instagram source" })
        .boundingBox();
      const refresh = await page
        .getByRole("button", { name: "Refresh research", exact: true })
        .boundingBox();
      expect(select?.height).toBe(40);
      expect(refresh?.height).toBe(40);
      if (width >= 640)
        expect(Math.abs(select!.y - refresh!.y)).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`research-${theme}-${width}.png`),
        fullPage: true,
      });
    });
  }
test("manual refresh shows progress and sends the exact selected source", async ({
  page,
}) => {
  await page.goto("/research.html");
  await page
    .getByRole("button", { name: "Refresh research", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Refreshing research…" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Observation saved. Comparisons now use this snapshot."),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("research-refreshed")!),
    ),
  ).toMatchObject({
    accountId: "11111111-1111-4111-8111-111111111111",
    sourceId: "42",
  });
});
test("access failure preserves the previous observations and gives feedback", async ({
  page,
}) => {
  await page.goto("/research.html?fail=1");
  await page
    .getByRole("button", { name: "Refresh research", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Meta App Review access is required",
  );
  await expect(
    page.getByText("Useful work, shared consistently."),
  ).toBeVisible();
});
test("add-account dialog saves the Facebook Page id with clear manual-refresh semantics", async ({
  page,
}) => {
  await page.goto("/research.html");
  await page.getByRole("button", { name: "Add research account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Adding an account does not fetch data");
  await dialog.getByRole("combobox", { name: "Platform" }).click();
  await page.getByRole("option", { name: "Facebook", exact: true }).click();
  await dialog.getByLabel("Account label").fill("Business Page");
  await dialog.getByLabel("Numeric Facebook Page ID").fill("12345");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("research-added")!),
    ),
  ).toMatchObject({
    platform: "facebook",
    identifier: "12345",
    name: "Business Page",
  });
});
test("viewer has no authorization, add or archive mutation controls", async ({
  page,
}) => {
  await page.goto("/research.html?readonly=1");
  await expect(
    page.getByRole("button", { name: "Add research account" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh research", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Reconnect Meta research" }),
  ).toHaveCount(0);
});
test("research disconnect requires its own confirmation and keeps publishing distinct", async ({
  page,
}) => {
  await page.goto("/research.html");
  await page
    .getByRole("button", { name: "Disconnect research", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("publishing connections stay available");
  await dialog.getByRole("button", { name: "Keep connected" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("research-disconnected")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Disconnect research", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Disconnect research", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("research-disconnected")),
  ).toBe("true");
});
test("disabled deployment explains setup and prevents research actions", async ({
  page,
}) => {
  await page.goto("/research.html?disabled=1");
  await expect(
    page.getByText(/Social research is not enabled on this deployment/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh research", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Reconnect Meta research" }),
  ).toHaveCount(0);
});
