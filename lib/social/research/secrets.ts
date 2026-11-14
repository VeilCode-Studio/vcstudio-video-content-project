import "server-only";
import { z } from "zod";
import { openSecret, sealSecret } from "@/lib/crypto/secret-box";

const secretSchema = z.object({
  purpose: z.literal("social-research"),
  workspaceId: z.uuid(),
  token: z.string().min(1),
});
export function sealResearchToken(input: {
  workspaceId: string;
  token: string;
  key: string;
}): string {
  return sealSecret({
    plaintext: JSON.stringify({
      purpose: "social-research",
      workspaceId: input.workspaceId,
      token: input.token,
    }),
    key: input.key,
  });
}
export function openResearchToken(input: {
  workspaceId: string;
  sealed: string;
  key: string;
}): string {
  const value = secretSchema.parse(
    JSON.parse(openSecret({ sealed: input.sealed, key: input.key })) as unknown,
  );
  if (value.workspaceId !== input.workspaceId)
    throw new Error("RESEARCH_TOKEN_TENANT_MISMATCH");
  return value.token;
}
