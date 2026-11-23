export const IMAGE_EDIT_INSTRUCTIONS_VERSION = "image-edit-instructions-v1";
const prefix =
  [
    `Image edit instructions (${IMAGE_EDIT_INSTRUCTIONS_VERSION}).`,
    "Edit the supplied source image. Treat it as the existing image to modify, not merely a style reference.",
    "Apply only the requested changes. Preserve the subject identity, composition, framing, text, colors, lighting and other details unless a change to them is explicitly requested or strictly necessary for the requested edit.",
    "Keep the original canvas and produce one edited image.",
    "Requested changes:",
  ].join("\n\n") + "\n\n";
export function renderImageEditInstructions(instructions: string): string {
  return prefix + instructions.trim();
}
export function readImageEditInstructions(prompt: string): string | null {
  return prompt.startsWith(prefix) ? prompt.slice(prefix.length) : null;
}
