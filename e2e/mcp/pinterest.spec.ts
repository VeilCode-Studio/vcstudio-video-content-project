import { expect, test } from "@playwright/test";
for (const theme of ["light", "dark"])
  for (const width of [390, 1440])
    test(`Pinterest board selection and saved Pin settings in ${theme} at ${width}px`, async ({
      page,
    }) => {
      let reads = 0;
      await page.route("**/test-pinterest-boards?*", (route) => {
        reads++;
        return route.fulfill({
          json: {
            ok: true,
            page: {
              items: [{ id: "42", name: "Business ideas", privacy: "PUBLIC" }],
              bookmark: null,
            },
          },
        });
      });
      await page.setViewportSize({ width, height: 950 });
      await page.goto("/post-composer.html?pinterest");
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      const panel = page.getByRole("region", {
        name: "Pinterest settings for Studio Pinterest",
      });
      await expect(panel).toBeVisible();
      expect(reads).toBe(0);
      await panel
        .getByRole("button", { name: "Load boards", exact: true })
        .click();
      await panel.getByRole("combobox", { name: "Public board" }).click();
      await page.getByRole("option", { name: "Business ideas" }).click();
      await panel
        .getByRole("textbox", { name: "Pin title", exact: true })
        .fill("Original business lesson");
      await panel
        .getByRole("textbox", { name: "Pinterest description" })
        .fill("Exact Pinterest copy");
      await panel
        .getByRole("textbox", { name: "Destination link (optional)" })
        .fill("https://veilcode.studio/");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .first()
        .click();
      await expect(page.getByText(/Saved at/).first()).toBeVisible();
      await page.reload();
      await expect(
        panel.getByRole("combobox", { name: "Public board" }),
      ).toContainText("Business ideas");
      await expect(
        panel.getByRole("textbox", { name: "Pin title", exact: true }),
      ).toHaveValue("Original business lesson");
      await expect(
        panel.getByRole("textbox", { name: "Pinterest description" }),
      ).toHaveValue("Exact Pinterest copy");
      expect(reads).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
test("Pinterest board failures retain edits and support bounded pagination", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/test-pinterest-boards?*", (route) => {
    reads++;
    if (reads === 1)
      return route.fulfill({
        json: { ok: false, error: "Reconnect the Pinterest account." },
      });
    const next = new URL(route.request().url()).searchParams.has("bookmark");
    return route.fulfill({
      json: {
        ok: true,
        page: {
          items: [
            {
              id: next ? "43" : "42",
              name: next ? "Second board" : "First board",
              privacy: "PUBLIC",
            },
          ],
          bookmark: next ? null : "next-page",
        },
      },
    });
  });
  await page.goto("/post-composer.html?pinterest");
  const panel = page.getByRole("region", {
    name: "Pinterest settings for Studio Pinterest",
  });
  await panel
    .getByRole("textbox", { name: "Pin title", exact: true })
    .fill("Keep this title");
  await panel.getByRole("button", { name: "Load boards", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Reconnect");
  await expect(
    panel.getByRole("textbox", { name: "Pin title", exact: true }),
  ).toHaveValue("Keep this title");
  await panel.getByRole("button", { name: "Load boards", exact: true }).click();
  await panel
    .getByRole("button", { name: "Load more boards", exact: true })
    .click();
  await panel.getByRole("combobox", { name: "Public board" }).click();
  await expect(page.getByRole("option", { name: "First board" })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Second board" }),
  ).toBeVisible();
});
