export class SocialResearchError extends Error {
  constructor(
    public readonly code:
      | "access"
      | "expired"
      | "rate_limit"
      | "unavailable"
      | "conflict"
      | "configuration",
    message: string,
  ) {
    super(message);
    this.name = "SocialResearchError";
  }
}
