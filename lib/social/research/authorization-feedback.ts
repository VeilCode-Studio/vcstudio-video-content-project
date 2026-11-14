import type { ResearchAuthorizationFailure } from "@studio/contracts/social-research";

export const researchAuthorizationMessages: Record<
  ResearchAuthorizationFailure,
  { title: string; detail: string; action: string }
> = {
  configuration: {
    title: "Research setup could not be loaded",
    detail:
      "VCStudio could not load the server configuration for Meta research.",
    action:
      "The app owner should check the Meta app configuration before retrying.",
  },
  consent: {
    title: "Meta did not complete authorization",
    detail:
      "Meta returned an authorization error before providing research access.",
    action:
      "Try again and review the selected Pages, Instagram accounts and permissions in Meta.",
  },
  token_exchange: {
    title: "Meta sign-in could not be completed",
    detail: "VCStudio could not exchange Meta’s authorization code for access.",
    action:
      "Start a fresh authorization. If it fails again, check the exact callback URL and Meta app credentials.",
  },
  token_extension: {
    title: "Research access could not be secured",
    detail: "VCStudio could not obtain and validate longer-lived Meta access.",
    action:
      "Start a fresh authorization. If this repeats, share the reference below so the token response can be investigated safely.",
  },
  permissions: {
    title: "Research permissions could not be verified",
    detail:
      "Meta research permissions could not be read or the required Page read permission was not granted.",
    action:
      "Retry and grant Page read access. The Meta app may also need the relevant permissions approved; selecting accounts alone does not grant them.",
  },
  account_discovery: {
    title: "Authorized accounts could not be loaded",
    detail:
      "VCStudio could not read the Pages and linked professional Instagram accounts returned by Meta.",
    action:
      "Check Page access, professional Instagram links and research permissions, then retry. This does not mean that you have only one account.",
  },
  save_connection: {
    title: "Research access could not be saved",
    detail: "The research credential could not be saved in VCStudio.",
    action:
      "Try again. If it repeats, share the reference below with the app owner.",
  },
  audit: {
    title: "Research activity could not be recorded",
    detail:
      "Research access was saved, but its activity record could not be written.",
    action:
      "Check the access status below before reconnecting and share the reference with the app owner.",
  },
  session: {
    title: "Authorization session expired or changed",
    detail:
      "VCStudio could not verify that this return from Meta belongs to your current owner session and workspace.",
    action:
      "Stay signed in to the same VCStudio workspace and start authorization again. Avoid reusing an old callback tab.",
  },
};
