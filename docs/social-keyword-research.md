# Saved keyword research

## Scope

`/app/social/research/keywords` and MCP `get_research_keywords` share the same bounded, deterministic service. Search a word, contiguous phrase or exact `#hashtag`, filter platform/account, or leave the query empty to discover frequent terms. Account research links here. No new Meta refresh, AI request, media download, storage copy or recurring job runs when researching keywords.

Each request reads only the latest successful observation for up to 20 active accounts in the authorized workspace, with at most 25 posts and 4,000 caption characters per post. Failed newer refreshes do not replace the last successful observation. The same platform/post identity counts once across accounts; older history is not counted repeatedly. Account deletion or archiving excludes its evidence immediately. Account-specific filters reject foreign/deleted IDs rather than falling back to all accounts.

The Account research shortcut preserves the currently selected account, including an older account beyond the latest 20 options. Choose “Latest 20 active accounts” in the keyword form for the bounded cross-account view.

Automatic keyword extraction uses English stop words and ASCII word candidates; hashtags and explicit phrase searches preserve Unicode with NFKC/case normalization. Each term counts once per post. Search matches token boundaries, so `art` does not match `start`. Results show the top 20 terms by post frequency, up to three source references per term, and ten matching post excerpts per page. Excerpts are capped at 600 characters; read the saved observation for the full available caption.

## Evidence and interpretation

Interactions are likes/reactions plus comments only if both counts are known. A missing count stays unavailable; known zero stays zero. Shares remain separate. Median interactions show how many posts had measurements. Different platforms, audiences and observation dates are not normalized into a universal performance score. These are sample associations, not search volume, keyword difficulty, reach, conversions or causal explanations.

Optional `captions_and_media` mode reads at most 50 already-completed analyses for the exact selected observations/posts. Only bounded transcripts and quoted observation evidence participate; model summaries, hypotheses and suggested experiments are excluded. Transcripts are capped at 6,000 characters and ten evidence excerpts at 1,500 characters each. It never starts paid analysis, and reports how many posts have usable media text. A caption-only result must not be described as visual or audio understanding. Third-party text remains untrusted evidence, never instructions.

Coverage exposes account/observation/post counts, matching posts, known measurements, oldest/newest capture dates, provider pagination and caption/account truncation. The page offers responsive Light/Dark shadcn forms/tables, source links, pending feedback and actionable empty/error states.

## Meta discovery boundary

This release researches saved account observations. It does **not** expose live Meta-wide keyword search or Instagram hashtag discovery. Official Instagram hashtag discovery is a separate integration whose eligible permissions and App Review access must be verified before implementation. Existing research consent alone does not establish that access.

On 19 November 2026, a read-only `recently_searched_hashtags` request succeeded for an existing authorized Instagram source and returned no history. No new hashtag was searched. This confirms history access only, not hashtag-media discovery eligibility. Do not present it as a successful live discovery test. Facebook-wide arbitrary keyword/post search and keyword search volumes are not claimed. See [Meta's official Instagram collection](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) for the separation between professional-account/hashtag capabilities and unrestricted access.

## MCP

MCP 1.4.1 adds `get_research_keywords`, bringing discovery to 63 registered tools, 61 assistant-callable (two existing app-only approval tools). It requires the existing `vcstudio:read` OAuth scope, saved grant and current workspace membership; there is no new consent scope, mutation, approval gate or autonomy setting. `ENABLE_SOCIAL_RESEARCH` still gates reads. Feature discovery exposes `researchKeywords`, and `get_connection.requiredResearchTools` includes the tool. Refresh the client catalogue after release.

Example:

> Use my authorized VeilCode Studio workspace. Call get_research_keywords with query "saving money", platform "instagram", kind "all", media "captions_and_media" and page 1. Compare terms and available interactions, cite source posts and observation dates, and explain missing coverage. Reuse saved evidence only; do not refresh accounts, start analysis, generate or publish anything. Do not interpret frequency as search volume or proof of why content worked.

## Operations

Verification passed 203 affected unit/SDK/isolated PostgreSQL tests, 22 existing research browser journeys and five final keyword journeys (Light/Dark, 390/1440px). Changed-file formatting, explicit TypeScript, environment validation, full lint (three existing warnings) and production build passed. A read-only production service check returned a bounded 485-post sample across 20 accounts, 458 posts with known interaction counts, ten source excerpts and a truthful zero saved-media evidence count; extra accounts were flagged. No refresh or paid analysis ran. Screenshots were inspected and the final panel/table refinements were browser-verified.

Scoped mocked UI verification can build only the relevant fixtures: in PowerShell set `$env:MCP_UI_FIXTURES='research,research-keywords'`, then run `npx playwright test --config playwright.mcp.config.ts e2e/mcp/research.spec.ts e2e/mcp/research-keywords.spec.ts`. This is a test-harness selector, not application configuration; unset it for the complete fixture suite. The harness always builds its required base fixture and allows 180 seconds for startup on slower development machines.

No migration, dependency, environment change, worker deployment or recurring schedule is needed. PostgreSQL remains authoritative; results are computed on demand and not persisted. Existing generation, publishing and research-analysis approval settings stay unchanged. Marketing remains paused, and the video-generation billing hold remains unchanged. Verification uses mocked providers and isolated PostgreSQL; it does not spend on AI or post publicly.
