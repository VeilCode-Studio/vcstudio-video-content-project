# MCP account research and media analysis

## Saved keyword extension — 19 November 2026

Version 1.4.1 adds `get_research_keywords` (63 registered tools/61 assistant-callable). This read-only shared service analyzes the latest saved captions and optionally completed factual media evidence, without refreshing Meta or charging for analysis. Existing Read consent and workspace access apply. See [keyword research and limits](social-keyword-research.md); live hashtag discovery remains unconfigured. Historical release verification below refers to 1.4.0.

## Delivery state

Released to production on 15 November 2026 as implementation commit `f9255a0`. MCP server version 1.4.0 exposes 62 registered tools, of which 60 are assistant-callable. Existing generation/publication approvals remain app-only tools; analysis cannot be approved by an ordinary model-supplied Boolean. The manual analysis review uses the signed-in browser fallback. An autonomous analysis grant completes prepare/execute/status through MCP with no browser step.

## Tools

| Tool                           | Permission              | Behavior                                                                                                                                   |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_research_accounts`       | Read                    | Saved watchlist, bounded paging, research source identities and connection state                                                           |
| `get_research_account`         | Read                    | Account details, ten observation summaries per page and ten recent analysis summaries; no repeated captions/transcripts                    |
| `get_research_observation`     | Read                    | One exact observation, ten posts per page (25 sampled total) or one requested post ID, captions, dates, counts and descriptive comparisons |
| `add_research_account`         | Edit                    | Save a validated Page ID or professional Instagram username; fetches nothing                                                               |
| `refresh_research_account`     | Edit                    | Explicit official-Meta refresh using an authorized source; reuses an idempotency key                                                       |
| `get_research_media`           | Media + Read            | Fresh transient CDN references; URLs are not an analysis of media                                                                          |
| `prepare_research_analysis`    | Generate + Read + Media | One post, exact saved observation, goal, conservative quote and explicit maximum cost                                                      |
| `execute_research_analysis`    | Generate + Read + Media | Owner-authorized autonomous execution with the prepared operation ID and same key                                                          |
| `get_research_analysis_status` | Read                    | Workspace analysis status, coverage, findings, transcript where available, evidence and safe errors                                        |

Every call specifies its workspace and resolves current membership, connection state, grants and OAuth scopes. Research refresh/processing requires owner/editor capabilities; viewers can read saved research only. Meta credentials remain separate from AI-client grants. MCP cannot authorize Meta, change its scopes, enable Marketing or grant itself autonomy. Third-party captions, images, transcripts and analysis text are untrusted evidence, never instructions to execute.

Saved findings are workspace research: authorized Read clients can retrieve completed findings through summary reads in `get_research_account` and full findings in `get_research_analysis_status`, including findings produced by another authorized connection. Operation execution remains bound to the creating connection/user. Completed findings/status are readable as workspace research with Read permission. Returned workspace findings omit operation inputs, credential material and private authorization fingerprints.

## Approval and budgets

AI connections → workspace permissions → **Research analysis approval** has two modes. New grants default to **Require my approval**. Only an owner with Read, Media and Generate can enable **Autonomous research analysis**. Generation and publishing approval settings are independent and are preserved. Saving permissions starts no work.

Preparation fixes the source observation/post, goal, model/rates, authority revisions, Meta grant revision, maximum cost and a ten-minute expiry. Manual approval is an authenticated same-origin browser action, single-use and bound to that operation. Autonomous execution requires the owner's current setting; `confirmed: true` cannot bypass manual mode. Changed grants, membership, connection, Meta revision or pricing invalidate execution. Repeated identical keys return existing state; changed inputs conflict.

Before dispatch, the existing workspace advisory-lock transaction reserves the conservative quote against daily/monthly limits and the caller's maximum. The dedicated `research_analysis` usage category uses the existing operation-owned reservation relation. A worker can claim an approved/queued operation only once and only with a pending, unexpired reservation. The dedicated on-demand queue has concurrency one and one attempt. No automatic paid retries occur.

The default conservative ceiling is **17 cents** for at most 128,000 input tokens and 8,192 output/thinking tokens, using configured upper rates across modalities. An actual-media token count runs before paid submission with an additional system/accounting margin. Smaller successful requests settle against returned usage at the conservative configured rates; cache hits release the reservation. Missing/uncertain usage retains the quote, clearly recorded as uncertain. This accounting does not promise free-tier billing or exact invoice parity. Review rates when changing models or provider pricing. Google quota/billing/model access can still block execution; the video-generation billing hold remains independent and unchanged.

## Media and findings

The worker fetches fresh media only for the selected saved post, validates profile identity and current Meta source/grant, and downloads from allowed Meta CDN hosts. Every redirect must remain on the allowlist; existing public-DNS pinning rejects private destinations and rebinding. Streaming has a **12 MB total** ceiling. Images must decode as JPEG/PNG/WebP/GIF, preserve the full image and fit within 1024px; animated images use the first frame. Video signatures and local FFprobe streams/duration must validate, with **120 seconds total** per post. Up to 20 exposed carousel items are accepted; incomplete carousels and missing video sources stop without caption-only substitution or silent truncation.

Google's native multimodal analysis receives actual images/videos inline, including audio streams where present. It returns structured observations, approximate media evidence positions, speech transcript where available, hypotheses, experiments and limitations. Video uses provider-native sampling, so findings do not claim every frame was examined. Silent/image-only inputs cannot retain an invented transcript; out-of-range evidence positions and unsupported audio claims are rejected. Public engagement counts and observation dates are attached separately. Neither raw likes/comments nor model opinions prove causality, conversions, retention or organic-only performance.

Source media may have changed since the saved engagement observation. Analysis describes media retrieved during execution; counts/captions retain their saved observation provenance. Media that is withheld, expired, too large, too long, malformed, outside the recent API sample or inaccessible cannot be analyzed. Covers alone are insufficient for video analysis. No scraper, Chrome automation or private-content bypass is provided.

Only normalized media hashes, small findings/transcripts, coverage, model/request identifiers, token/cost records, prompt/version, dates and source evidence persist. CDN URLs, API keys, binary/base64 media and temporary files are not saved in PostgreSQL or R2. Worker payloads contain workspace/operation IDs only. Temporary files are removed in `finally`; worker-local storage is ephemeral after process loss. No provider-managed file upload is created. Provider request retention follows its API terms.

Exact matching media hashes, caption/goal/coverage and model/prompt configuration can reuse a recent completed analysis without another paid request. Retrieval still verifies current media access and actual content before accepting a cache hit. Saved research is lightweight; competitor media is never added automatically to the library.

## Deletion and recovery

Permanent research-account deletion atomically removes observations and clears linked MCP research inputs/results, including completed findings/transcripts, queued work and approvals. Only anonymous operation/usage/audit facts remain for financial reconciliation. The account-first result lock prevents a late worker from restoring deleted content. Other workspaces, ordinary Social records, Meta credentials and other research accounts stay independent.

Status reads can reconcile a terminal worker. The existing 30-minute recovery handles stopped analysis reservations without resubmitting paid work; no sweeper or frequency increase is added. Known actual usage is preserved; uncertain post-submission cost retains the quote; pre-submission failures release it. Revocation prevents new calls and worker submission and drops late findings when detected. Already-approved ordinary Social schedules retain their existing behavior.

## Configuration and rollout

Shared validated web/worker configuration:

| Variable                                          | Default                     | Purpose                                                                        |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `ENABLE_SOCIAL_RESEARCH`                          | existing deployment setting | Research reads/Meta access; now also required by the on-demand analysis worker |
| `ENABLE_RESEARCH_MEDIA_ANALYSIS`                  | `false`                     | Independently enables analysis after completed release                         |
| `RESEARCH_ANALYSIS_MODEL`                         | `gemini-3.5-flash-lite`     | Native multimodal analysis model                                               |
| `RESEARCH_ANALYSIS_INPUT_COST_PER_MILLION_CENTS`  | `100`                       | Conservative maximum across input modalities                                   |
| `RESEARCH_ANALYSIS_OUTPUT_COST_PER_MILLION_CENTS` | `500`                       | Conservative output/thinking rate                                              |
| `GOOGLE_AI_VIDEO_GENERATION_API_KEY`              | existing secret             | Reused server-side Google API credential; no new key or generation activation  |
| `FFPROBE_PATH`                                    | existing worker default     | Actual video inspection                                                        |

The generated migration `20261114215623_mcp_research_analysis` adds the default-manual grant column, its mode/scope constraints and the usage enum/ownership constraint extension. It adds no table, media storage or automatic backfill. Existing generation/publication approval modes are unchanged. Do not run schema push or apply it to production without the prepared migration's approval.

The owner-approved rollout applied/recorded the migration and removed only temporary branch `br-blue-sun-ai9zlxfb`. Matching worker `20261114.1` and web deployment `dpl_HXJEfMrhow7Dy5Q5jN6iY6TrJL2U` are live. Web and worker analysis/research flags are enabled with the documented model/rates and existing Google key; Marketing remains disabled. The two existing ChatGPT/Claude owner grants have autonomous research analysis, with generation/publication permissions preserved and audited. New grants remain manual. Local development and `.env.example` retain the default-disabled analysis flag. Refresh client tool discovery. Existing clients with Read/Media/Generate consent need no new Clerk scope. A separate, explicitly cost-bounded real analysis remains the next provider/client acceptance check; no paid analysis ran during rollout.

## Verification

The affected regression run passed 497 tests and 44 browser journeys, including SDK discovery, scoped authorization, schema validation, quotes, manual/autonomous modes, atomic reservation/settlement, single-use approval, real image decoding, malformed/oversized/redirect cases, cache reuse, silent-media behavior, stale authority, deletion and recovery. Light/Dark mobile review screenshots were inspected. Formatting, lint (three existing warnings), explicit TypeScript, environment placement and the final production build passed, including the bounded-read changes. Client-side tool permission prompts remain controlled by ChatGPT/Claude independently of VCStudio approval settings.

The production-clone migration test preserves business counts and both existing grants default to manual analysis approval. Actual ChatGPT/Claude tool refresh and live Google/Meta media analysis remain client/provider acceptance checks; mocked tests do not establish universal media access.

Official references: [Google video understanding](https://ai.google.dev/gemini-api/docs/video-understanding), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [token counting](https://ai.google.dev/gemini-api/docs/tokens), [pricing](https://ai.google.dev/gemini-api/docs/pricing).

Live read-only verification confirms version 1.4.0, all six effective scopes, `socialResearch: true`, `researchMediaAnalysis: true` and autonomous research/generation/publication for the existing ChatGPT connection. Independent database reads confirm both approved grants and audit records. Google model metadata returned 200 for the configured model without a billable request. The landing page returns 200, private settings redirect to sign-in, and anonymous MCP POST returns 401 with an OAuth challenge.
