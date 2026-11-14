import "server-only";
import { z } from "zod";
import type { ResearchAuthorizationFailure } from "@studio/contracts/social-research";
import { SocialResearchError } from "./errors";

export class ResearchAuthorizationError extends SocialResearchError {
  public readonly validationFields: string[];
  constructor(
    public readonly stage: ResearchAuthorizationFailure,
    error: unknown,
  ) {
    super(
      error instanceof SocialResearchError ? error.code : "unavailable",
      "Research authorization could not finish.",
      error instanceof SocialResearchError ? error.providerCode : undefined,
    );
    // Schema paths name our expected fields; no received values or raw messages.
    this.validationFields =
      error instanceof z.ZodError
        ? error.issues.slice(0, 5).map((issue) => issue.path.join("."))
        : [];
  }
}
