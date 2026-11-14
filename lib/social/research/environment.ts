import "server-only";
import { z } from "zod";

export const socialResearchEnvironmentSchema = z.object({
  ENABLE_SOCIAL_RESEARCH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export function isSocialResearchEnabled(): boolean {
  return socialResearchEnvironmentSchema.parse(process.env)
    .ENABLE_SOCIAL_RESEARCH;
}
