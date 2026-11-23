import { test, expect } from "@playwright/test";
import { videoImageAsset } from "./fixtures/video-data";
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
  const references = page.getByRole("region", {
    name: "Reference images",
    exact: true,
  });
  await expect(references.getByRole("img")).toHaveCount(2);
  await expect(references.getByRole("img").first()).toBeVisible();
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

for (const theme of ["light", "dark"])
  test(`reference upload previews retain library selection in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: theme === "dark" ? 390 : 1440,
      height: 1000,
    });
    await page.addInitScript(
      (t) =>
        document.addEventListener("DOMContentLoaded", () =>
          document.documentElement.classList.toggle("dark", t === "dark"),
        ),
      theme,
    );
    const uploaded = {
      ...videoImageAsset,
      id: "77777777-7777-4777-8777-777777777777",
      title: "Uploaded reference.png",
    };
    let completed: () => Promise<void> = async () => {
      throw new Error("Completion not requested");
    };
    let completeRequested = false;
    await page.route("**/api/workspaces/**/media/upload", (route) =>
      route.fulfill({
        json: {
          mediaAssetId: uploaded.id,
          objectKey: "fixture/uploaded.png",
          uploadUrl: "http://127.0.0.1:38173/test-media-storage",
        },
      }),
    );
    await page.route("**/api/workspaces/**/media/complete", (route) => {
      completeRequested = true;
      completed = () => route.fulfill({ json: { asset: uploaded } });
    });
    await page.goto("/image-studio.html");
    await page
      .getByRole("button", { name: "Choose reference images", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Product reference", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Use references (1)", exact: true })
      .click();
    await page
      .getByLabel("Prompt", { exact: true })
      .fill("A tree using my references");
    await page
      .getByRole("button", { name: "Review estimate", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Generate image", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Upload reference image files", { exact: true })
      .setInputFiles({
        name: "Uploaded reference.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await expect.poll(() => completeRequested).toBe(true);
    await expect(
      page.getByRole("region", { name: "File upload progress" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate image", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Review estimate", exact: true }),
    ).toBeDisabled();
    await completed();
    const refs = page.getByRole("region", {
      name: "Reference images",
      exact: true,
    });
    await expect(refs.getByRole("img")).toHaveCount(2);
    await expect(refs.getByRole("img").last()).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Remove reference Uploaded reference.png",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Upload reference images",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`references-${theme}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Review estimate", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Generate image", exact: true })
      .click();
    await expect(page.getByText("queued", { exact: true })).toBeVisible();
    const input = JSON.parse(
      (await page.evaluate(() => localStorage.getItem("imageStarted")))!,
    );
    expect(input.request.referenceAssetIds).toEqual([
      videoImageAsset.id,
      uploaded.id,
    ]);
    await page
      .getByRole("button", {
        name: "Remove reference Uploaded reference.png",
        exact: true,
      })
      .click();
    await expect(refs.getByRole("img")).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: "Upload reference images",
        exact: true,
      }),
    ).toBeEnabled();
  });
test("unsupported references are rejected before any upload request", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/media/upload")) requests++;
  });
  await page.goto("/image-studio.html");
  await page
    .getByLabel("Upload reference image files", { exact: true })
    .setInputFiles({
      name: "not-an-image.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("video"),
    });
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG or WebP");
  expect(requests).toBe(0);
});
test("upload errors preserve selected references and allow the same file to retry", async ({
  page,
}) => {
  const uploaded = {
    ...videoImageAsset,
    id: "77777777-7777-4777-8777-777777777777",
    title: "Retry reference.png",
  };
  let attempts = 0;
  await page.route("**/api/workspaces/**/media/upload", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: { error: "Upload temporarily unavailable" },
        })
      : route.fulfill({
          json: {
            mediaAssetId: uploaded.id,
            objectKey: "fixture/retry.png",
            uploadUrl: "http://127.0.0.1:38173/test-media-storage",
          },
        });
  });
  await page.route("**/api/workspaces/**/media/complete", (route) =>
    route.fulfill({ json: { asset: uploaded } }),
  );
  await page.goto("/image-studio.html");
  await page
    .getByRole("button", { name: "Choose reference images", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Product reference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use references (1)", exact: true })
    .click();
  const file = {
    name: "Retry reference.png",
    mimeType: "image/png",
    buffer: Buffer.from("test-image"),
  };
  await page
    .getByLabel("Upload reference image files", { exact: true })
    .setInputFiles(file);
  await expect(page.getByRole("alert")).toContainText(
    "Upload temporarily unavailable",
  );
  await expect(
    page.getByRole("button", {
      name: "Remove reference Product reference",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Upload reference image files", { exact: true })
    .setInputFiles(file);
  await expect(
    page.getByRole("button", {
      name: "Remove reference Retry reference.png",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

for (const theme of ["light", "dark"])
  test(`created image viewer and edit preserve originals in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: theme === "dark" ? 390 : 1440,
      height: 900,
    });
    await page.addInitScript(
      (t) =>
        document.addEventListener("DOMContentLoaded", () =>
          document.documentElement.classList.toggle("dark", t === "dark"),
        ),
      theme,
    );
    await page.goto("/image-studio.html?ready=1");
    expect(
      await page.evaluate(() => localStorage.getItem("imageSourceReads")),
    ).toBeNull();
    const view = page.getByRole("button", {
      name: "View image Studio original",
      exact: true,
    });
    await view.focus();
    await page.keyboard.press("Enter");
    const viewer = page.getByRole("dialog", {
      name: "Studio original",
      exact: true,
    });
    await expect(viewer).toBeVisible();
    const image = viewer.getByRole("img", {
      name: "Studio original",
      exact: true,
    });
    await expect(image).toBeVisible();
    expect(await image.evaluate((el) => getComputedStyle(el).objectFit)).toBe(
      "contain",
    );
    expect((await viewer.boundingBox())!.width).toBeGreaterThan(
      theme === "dark" ? 300 : 1000,
    );
    await viewer
      .getByRole("button", { name: "Edit image", exact: true })
      .click();
    const edit = page.getByRole("dialog", { name: "Edit image", exact: true });
    await expect(edit).toBeVisible();
    await expect(edit.getByRole("img")).toBeVisible();
    await edit
      .getByLabel("What would you like to change?", { exact: true })
      .fill("Change only the background to beige.");
    await edit
      .getByRole("button", { name: "Review edit estimate", exact: true })
      .click();
    await expect(
      edit.getByText("Edit estimate $0.08", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("imageEditAttempts")),
    ).toBeNull();
    const bounds = await edit.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901);
    await page.screenshot({
      path: testInfo.outputPath(`image-edit-${theme}.png`),
      fullPage: true,
    });
    await edit
      .getByRole("button", { name: "Create edited version", exact: true })
      .click();
    await expect(edit).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Studio original", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Studio original (edit)",
        exact: true,
      }),
    ).toBeVisible();
    const attempt = JSON.parse(
      (await page.evaluate(() => localStorage.getItem("imageEditAttempts")))!,
    )[0];
    expect(attempt.edit.sourceJobId).toBe(videoImageAsset.id);
    expect(attempt.edit.instructions).toBe(
      "Change only the background to beige.",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("viewer Escape returns focus and opens no paid request", async ({
  page,
}) => {
  await page.goto("/image-studio.html?ready=1");
  const trigger = page.getByRole("button", {
    name: "View image Studio original",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("imageEditQuoted")),
  ).toBeNull();
});
test("editing instructions invalidate a quote and failed execution reuses its key", async ({
  page,
}) => {
  await page.goto("/image-studio.html?ready=1");
  await page.getByRole("button", { name: "Edit image", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit image", exact: true });
  await edit
    .getByLabel("What would you like to change?", { exact: true })
    .fill("Make the sky blue");
  await edit
    .getByRole("button", { name: "Review edit estimate", exact: true })
    .click();
  await expect(
    edit.getByRole("button", { name: "Create edited version", exact: true }),
  ).toBeVisible();
  await edit
    .getByLabel("What would you like to change?", { exact: true })
    .fill("Make the sky orange");
  await expect(
    edit.getByRole("button", { name: "Create edited version", exact: true }),
  ).toHaveCount(0);
  await edit
    .getByRole("button", { name: "Review edit estimate", exact: true })
    .click();
  await page.evaluate(() => localStorage.setItem("edit-save-error", "true"));
  await edit
    .getByRole("button", { name: "Create edited version", exact: true })
    .click();
  await expect(edit.getByRole("alert")).toContainText("Retry the same request");
  await expect(
    edit.getByLabel("What would you like to change?", { exact: true }),
  ).toHaveValue("Make the sky orange");
  await page.evaluate(() => localStorage.removeItem("edit-save-error"));
  await edit
    .getByRole("button", { name: "Create edited version", exact: true })
    .click();
  await expect(edit).toHaveCount(0);
  const calls = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("imageEditAttempts")))!,
  );
  expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
});
test("missing source keeps editing blocked with useful feedback", async ({
  page,
}) => {
  await page.goto("/image-studio.html?ready=1&source-error=1");
  await page.getByRole("button", { name: "Edit image", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit image", exact: true });
  await expect(edit.getByRole("alert")).toContainText("no longer available");
  await expect(
    edit.getByRole("button", { name: "Review edit estimate", exact: true }),
  ).toBeDisabled();
});
test("viewers can enlarge images but cannot edit them", async ({ page }) => {
  await page.goto("/image-studio.html?ready=1&mode=viewer");
  await expect(
    page.getByRole("button", { name: "Edit image", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "View image Studio original", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Edit image", exact: true }),
  ).toBeDisabled();
});

test("a failed viewer preview refreshes its private URL without generation", async ({
  page,
}) => {
  await page.route("https://missing.example/studio.png", (route) =>
    route.fulfill({ status: 403, body: "expired" }),
  );
  await page.goto("/image-studio.html?ready=1&preview-error=1");
  await page
    .getByRole("button", { name: "View image Studio original", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Studio original",
    exact: true,
  });
  await expect(viewer.getByRole("alert")).toContainText("could not load");
  await viewer
    .getByRole("button", { name: "Retry preview", exact: true })
    .click();
  await expect(viewer.getByRole("alert")).toHaveCount(0);
  await expect(viewer.getByRole("img")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("imageEditAttempts")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("imageSourceReads")),
  ).toBe("1");
});
