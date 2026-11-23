import { describe, it, expect } from "vitest";
import {
  renderImageEditInstructions,
  readImageEditInstructions,
  IMAGE_EDIT_INSTRUCTIONS_VERSION,
} from "./image-edit";
describe("image edit instructions", () => {
  it("uses an existing source while retaining unrequested details", () => {
    const prompt = renderImageEditInstructions(
      "  Change the blue jacket to red.  ",
    );
    expect(prompt).toContain(IMAGE_EDIT_INSTRUCTIONS_VERSION);
    expect(prompt).toContain("Edit the supplied source image");
    expect(prompt).toContain("Preserve the subject identity");
    expect(prompt).toContain("Keep the original canvas");
    expect(prompt).toMatch(/Change the blue jacket to red\.$/);
  });
  it("keeps the maximum supported instructions within the existing request bound", () => {
    expect(renderImageEditInstructions("x".repeat(20000)).length).toBeLessThan(
      24000,
    );
  });
});

it("displays only requested changes while keeping ordinary prompts intact", () => {
  const instructions = "Change the background.\nKeep all text.";
  expect(
    readImageEditInstructions(renderImageEditInstructions(instructions)),
  ).toBe(instructions);
  expect(
    readImageEditInstructions("An ordinary prompt with Requested changes:"),
  ).toBeNull();
});
