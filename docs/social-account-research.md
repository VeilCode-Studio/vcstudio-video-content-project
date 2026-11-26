# Facebook and Instagram account research

## Delivery status

Core research, authorization, source recovery and permanent deletion are live. A real Instagram Business Discovery observation has succeeded; this does not establish universal public-content access. On-demand media previews passed local validation with isolated PostgreSQL, mocked Meta responses and browser fixtures; live media availability remains dependent on Meta responses.

The owner chose **Social research with manual refresh**, official Meta APIs first and visible access limits. Marketing Studio remains paused. Its search-based company/competitor research is independent and is not invoked, queried or activated by this feature.

## Workflow

### Organize accounts

Use **Manage categories** to create or rename workspace-shared categories. The initial categories for existing workspaces are **Competitors**, **Inspiration** and **Industry insights**; the same names are available as suggestions in new workspaces. Choose a category while adding an account, or select an existing account, change **Account category**, and click **Save category**. Each account belongs to at most one category. Owner/editor permissions are required for changes; viewers can browse.

**Browse category** filters the complete workspace watchlist before its existing 20-account pagination. All accounts and Uncategorized remain available. Account and observation links preserve the category selection. Removing a category requires confirmation, moves its accounts to Uncategorized and preserves all observations, analysis and account identities. It does not unfollow or delete a research account. Categories are capped at 50 per workspace with case-insensitive unique names and revision checks. Apply migration `20261126005534_social_research_categories` before releasing the web code; no worker, environment or provider permission change is required.

Organization verification (26 November 2026): 687 affected unit/integration tests and 38 distinct browser journeys passed, including tenant/role isolation, stale revisions, database-enforced category limits, preserved observations, category confirmation/errors, responsive Light/Dark platform groups and mounted-watchlist account selection. Formatting, TypeScript, environment validation and the production build passed; lint retains three existing warnings. A production clone validated the migration and preserved exact business-record digests. Production application of this migration requires owner approval.

The owner approved release on 26 November 2026. Migration `20261126005534_social_research_categories` is applied and recorded as journal entry 123; temporary clone `br-green-leaf-aid4va0i` was deleted. The Social platform presentation was subsequently refined to a compact shadcn filter and one grid; research category behavior is unchanged. No worker deployment or environment change is required.

1. Open Social → Account research (`/app/social/research`).
2. An owner separately authorizes **Meta research**. Existing publication credentials, connected destinations, project channel identities and MCP grants are not changed.
3. An owner/editor adds a public Facebook Page by numeric Page ID or an Instagram professional account by username, with a label and learning notes. Adding an account does not fetch data.
4. Select the account. For Instagram, choose one of the workspace’s professional source accounts discovered through the research authorization.
5. Choose **Refresh research**. Progress is visible; at most 25 exposed posts and their available public counts are requested. A successful observation is stored in PostgreSQL with its capture time. A failed attempt reports safe feedback and preserves earlier snapshots.
6. Inspect the original caption, publication time, format and available likes/reactions, comments and shares. Links open the source post; no competitor media is downloaded into R2 or the library.
7. Compare format counts and median likes/reactions + comments, inspect the strongest observed post and compare follower counts between saved observations. Every suggested lesson links to its source evidence. These are descriptive comparisons, not AI-generated facts, causal explanations or guarantees of performance.

The account list is paginated in pages of 20; successful history is paginated in pages of ten. Archiving uses a saved revision and preserves observations. Adding the same platform/identifier again restores an archived account with the same identity/history. Active duplicates are rejected.

## Official API access

### Instagram

The separate Facebook Login research flow requests `pages_show_list`, `pages_read_engagement`, `instagram_basic` and `instagram_manage_insights`. Actual granted permissions are read from `/me/permissions`; requested permissions are not assumed to be granted. Up to two 25-Page discovery pages are read to find professional Instagram sources. If more apply, narrow the Page selection in Meta and reconnect. The response never follows a provider-supplied `paging.next` URL.

Business Discovery uses a server-selected, granted source account and the validated target username. It requests profile id, username, biography, followers and media count, plus up to 25 media records with caption, type/product type, permalink, timestamp, like count and comment count. Instagram consumer/private accounts are outside this integration. Available access depends on Meta permissions, app mode/review, the source account/Page relationship and the target account. A source in the selector is not proof that every competitor can be read.

The existing direct Instagram Login publication flow uses different scopes and stays intact. A publishing connection alone is not sufficient for this research flow.

### Facebook

The Page lookup requests id, name, about and follower count, plus up to 25 Page-authored posts with text, permalink, timestamp, reactions, comment totals, shares and attachment type. Reading competitor Pages can require **Page Public Content Access** and other permissions/features approved by Meta. Authorization by the owner does not bypass App Review. Personal profiles and private content are excluded.

Meta may deny the whole request when one requested field is unavailable. The app reports the failed attempt and retains previous data rather than silently fabricating a partial report or pretending access is universal.

### Deliberate limits

- Missing metrics are `null` and appear as **Unavailable**, never zero. Explicit zero remains zero.
- Facebook reactions occupy the reactions column; they are not presented as Instagram likes. Shares are separate and excluded from the comparable likes/reactions + comments score.
- No competitor private insights, reach, impressions, saves, demographics, conversions or watch time are promised. This version does not request video views.
- No scraping, login automation, browser collection, paid provider, generated media, LLM synthesis, recurring job or new Trigger schedule is used.
- Samples are bounded and may be incomplete. Snapshot comparisons use the same provider identity. No best-posting-time, account-wide posting frequency, growth-rate or causal claims are inferred from incomplete samples.
- The two-snapshot follower comparison is an observed difference; historical counts before the first observation cannot be reconstructed.

## Setup and release

1. Review/apply generated migration `20261114114656_social_account_research`. It adds three independent tables and their tenant/status/identity constraints. No business records or existing OAuth credentials are backfilled or altered. Do not run `drizzle-kit push`.
2. Deploy the web app. No worker deployment is needed.
3. Register `{APP_BASE_URL}/api/social/research/callback` under the existing Facebook app’s valid OAuth redirects. For production this is `https://vcstudio.veilcode.studio/api/social/research/callback`.
4. Configure the required Facebook Login/Instagram research permissions and eligible public-content features in Meta. Request review where required by Meta. Business verification, app access level and account relationships remain provider prerequisites.
5. Set web-only `ENABLE_SOCIAL_RESEARCH=true` after database setup. It defaults to `false`; disabled deployments do not query research tables. Add it to local `.env` and Vercel configuration when enabling. It must not be added to `.env.trigger`.
6. Reuse existing `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `APP_BASE_URL`, `OAUTH_STATE_SECRET`, `OAUTH_STATE_TTL_SECONDS` and `PLATFORM_TOKEN_ENCRYPTION_KEY`. No new key or paid service is needed.
7. An owner authorizes research from the page. Test one eligible professional Instagram target and one Facebook Page the app can read. Record actual success/denial; mocked tests are not evidence of live provider approval.

Setting `ENABLE_SOCIAL_RESEARCH=false` stops new research calls without deleting saved observations. The disabled page does not load history. The separate **Disconnect research** confirmation clears VCStudio’s dedicated stored research token and increments its revision, preserving publishing credentials and history. It does not call app-wide Meta revocation, because that could affect publication grants held by the same Meta app.

## Security and operations

Research requires current workspace membership. Owners/editors can save, refresh and archive research accounts; only owners can change research consent. Queries always scope by authorized workspace and entity. Credentials are AES-GCM encrypted using the existing key and an encrypted envelope binding the purpose and workspace; client projections exclude ciphertext/token fields.

OAuth uses signed, expiring, purpose-specific state tied to current user/workspace, plus an HttpOnly SameSite=Lax browser nonce cookie on the research callback path. The cookie is consumed before code exchange, and Meta authorization codes are single-use. Publication callbacks do not accept research-purpose state.

Manual refresh requires an idempotency UUID bound to the selected account/source. Identical completed requests return their saved operation; changed inputs conflict. A single PostgreSQL statement claims a 90-second account lease and durable operation. A 60-second cooldown prevents immediate repeats. The existing workspace request ceiling also applies under a distinct `social_research` rate key. There are no automatic retries or idle recovery jobs. If a process is interrupted, a later user refresh can proceed after the lease expires; the old running operation remains historical and does not become a fabricated failure/success.

Completion and account status update are atomic. A revoked/replaced consent revision cannot commit a late success. A failure writes a safe message, not raw provider messages, URLs or tokens. Meta requests use only a fixed HTTPS Graph host, validated identifiers/field selections, an eight-second timeout, a 1.5 MB response cap and redirect rejection. Secret-bearing OAuth exchange URLs remain server-side and must never be logged.

## Verification

Run the focused Vitest research suites plus `db/integration/social-research-local.integration.test.ts`, role/connection regression tests, and `npx playwright test --config playwright.mcp.config.ts research.spec.ts`. The database suite applies the generated migration to an isolated in-process PostgreSQL database and checks tenant isolation, encryption, uniqueness, idempotent leases, stale revisions, failed-refresh preservation, archive/restore and revocation.

Browser fixtures use the actual styled components with mocked actions and verify Light/Dark at phone/tablet/desktop sizes, equal-height controls, manual progress, permission errors, add-account flow, viewer restrictions, feature-off feedback and disconnect confirmation. Complete formatting, lint, TypeScript, environment placement and a production build before release.

Local verification on 14 November 2026: 133 focused unit/integration tests and 12 mocked Playwright journeys passed. Changed-file formatting, TypeScript, environment placement and lint passed; lint reports three existing warnings. The first build attempt could not fetch the existing Google fonts; the network-enabled retry passed the complete production build. The owner approved rollout on 14 November: the migration passed a temporary production-clone check, was applied to production and was recorded as journal row 118. Existing project/post/asset/connection counts remained 51/47/147/23 on the clone. Temporary branch br-twilight-morning-ai3agim0 was removed. Web-only ENABLE_SOCIAL_RESEARCH is enabled in production. Commit d83a95f deployed successfully as dpl_DzsonrQWXXUSUPKTwfCSTzcTYMP1, READY on vcstudio.veilcode.studio; no Meta consent or live research request has run.

Official references: [Instagram with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/), [Business Discovery](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery), [Page feed access](https://developers.facebook.com/docs/graph-api/reference/page/feed/), [Page Public Content Access](https://developers.facebook.com/docs/features-reference/page-public-content-access/), [long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/).

## Authorization troubleshooting

Meta?s Instagram picker lists the authorizing user?s eligible source accounts, not the competitor watchlist. This Facebook Login flow discovers professional accounts linked to authorized Facebook Pages. One source can query multiple eligible competitor usernames. VCStudio supports multiple discovered sources (bounded to 50); it cannot add accounts to Meta?s own picker. Check each missing account?s Business/Creator status, Page link and Facebook user access, then review Meta consent. The screenshots alone do not establish which prerequisite is missing.

Failed authorization now displays a destructive shadcn alert, stage-specific recovery advice, an owner-only retry link and a validated support-reference UUID. The callback distinguishes consent, code exchange, token extension, permission verification, account discovery, storage and audit failures. Server diagnostics include only that reference, stage, typed category and optional numeric Meta code and expected schema field names (without received values). Do not log raw errors, response bodies, callback queries or credentials. Older failures discarded their causes and cannot be diagnosed retrospectively; reproduce once after release and correlate the reference. Cancellation and successful authorization use distinct non-error feedback.

Authorization-feedback verification: 81 unit/integration tests and all 15 research browser journeys passed, followed by two Light/Dark checks after the final contrast adjustment. Formatting, TypeScript, environment placement, full lint (three existing warnings), focused final lint and the production build passed. No schema, dependency, environment or worker changes are required.

Release: authorization-feedback fix `37965e2` is live on the canonical domain through deployment `dpl_HJLu3CeUuzPHbCASehhEfi1ddRcx` (READY). A fresh owner consent attempt is required to establish the earlier failure cause; the UI/diagnostic improvement alone does not prove authorization succeeds.

Token-expiry compatibility: reference 1022b726-a04b-485b-b209-30a75e453840 confirmed the live callback rejected the `expires_in` field at token extension, without a Meta error code. The safe log establishes a schema incompatibility; it does not retain the received value. Omitted, null or zero expiry now triggers server-side `/debug_token` inspection using app authentication; token validity and app identity must match. Renewal uses the earliest positive token/data-access deadline and a maximum 60-day local reconnect ceiling. Meta zero-expiry tokens receive that local ceiling, not a fabricated provider expiry. Malformed/invalid/expired metadata still fails closed. Explicit positive numeric expiry (including a numeric string) remains supported without extra inspection. No token or secret is returned to the browser or logs.

Token-expiry fix verification: 95 focused unit/integration checks, 15 research browser journeys, changed-file formatting, TypeScript, environment placement, lint (three existing warnings) and production build passed. The failed callback stored no research token, so a new owner authorization is needed for live acceptance after release.

Token-expiry compatibility fix `07e0725` is released through production deployment `dpl_4EXW2XDYwpDVwz39fhCnrz373eaE` (READY). Full live consent acceptance remains pending a new owner authorization.

## Missing-source recovery

Meta?s Page list can omit assets that are explicitly present in the token?s granular consent. Discovery now reads app-bound, valid token metadata, takes only Instagram IDs from the `instagram_basic` consent targets, and verifies each missing ID with `id,username` using the same research token. Consent IDs alone are never stored as usable sources. Mismatched identities and denied lookups are rejected. Listed and verified sources are merged/deduplicated. Up to 50 Page-linked accounts and 12 missing consent targets (four concurrent requests) are considered; narrow large Meta selections if needed. Optional transport failures retain already-verified listed sources; invalid or wrong-app token metadata fails closed. OAuth reuses its in-request metadata lookup and has a 120-second maximum for bounded discovery. No background job is added.

Owners can click **Find Instagram sources** to rerun discovery with existing consent. The shared workspace request limiter applies. A revision-checked update replaces only the source list and increments its research revision, preserving the credential, permissions and renewal deadline. Revoked/expired or concurrently replaced grants cannot be overwritten. Source refresh does not change publication connections.

Live diagnosis on 14 November: consent included Instagram `17841480605297989` (`veilcodestudio`) and four Pages, while `/me/accounts` returned only Clear Work and Fair Skin Organics. A direct consent-bound Instagram lookup verified the missing account. Its existing grant was repaired with a revision check and audit event. A real refresh of the existing `tipsywealth` watchlist entry succeeded: operation `37a85037-50ff-41d6-b53e-e78ee5e9a70e`, 25 sampled posts, 13,548 observed followers. This is evidence of that specific Business Discovery request, not universal Meta access.

Source-recovery verification: 114 unit/integration tests and 16 mocked browser journeys passed. Tests cover omitted sources, direct identity validation, duplicate grants, wrong-app metadata with/without listed sources, bounded concurrency, cached token inspection, owner-only recovery and tenant/revision-safe source updates. Formatting, TypeScript, environment placement, lint (three existing warnings) and production build passed. Temporary diagnostic bundles were archived outside executable/lint source extensions after the live maintenance check.

Permanent source-recovery fix `11a608a` is live through Vercel deployment `dpl_7zeg1RXwUqi6GqznCSRPq9a2AQ32`, READY on vcstudio.veilcode.studio. Existing VeilCode research consent was repaired and a successful Tipsy Wealth observation is saved; refreshing the page requires no new authorization.

## Permanent account deletion

Owners and editors can choose **Delete** beside the selected research account and confirm **Delete account and all research**. This permanently removes the account name, identifier, notes, status/errors and every observation/refresh record, including completed samples, failed attempts and pending operations. Archive remains available when history should be preserved. An archived identity can be restored by adding the same account, then permanently deleted; the repository also supports deleting archived records directly.

Deletion is a single atomic PostgreSQL statement scoped to the authenticated workspace, account ID and expected version. It locks the account, removes its dependent observations and then the account. Refresh completion uses the same account-before-observation lock order. An in-flight provider response cannot recreate deleted rows. A stale version requires reviewing the latest account; a failed deletion rolls back dependent removals. Re-adding a deleted identity creates a new account with empty history.

A non-identifying security audit event records the permanent removal using the existing disconnection audit category, with no account ID, name, username, notes, post content or per-account metrics. Meta research authorization, publishing connections, other watchlist accounts and the original external platform account are independent and remain available. No R2 files are stored for research, so there are no associated binary assets to clean up. No migration or scheduled cleanup is needed.

Deletion verification: 128 unit/integration tests and all 19 mocked browser journeys passed, plus two final Light/Dark confirmation checks. Coverage includes workspace/role/version guards, rollback, all refresh states, late completion, re-adding with empty history, cancellation, progress and recoverable errors. No production research account was deleted for verification.

Deletion release `e7d2ad6` is live through Vercel `dpl_FLsXVXuPZ2sa1JevRLfFyWLJQta2`, READY on the canonical domain. No migration, environment change or worker deployment accompanied this release.

## On-demand media previews and account profiles

The saved observation already includes Instagram biography or Facebook Page about text when exposed. The profile section displays it with the saved observation time and explicitly labels a missing bio. Select **Load media previews** to fetch the current profile photo and media for matching saved posts. This is a separate, owner/editor-authorized read using the existing research grant, not a new observation or automatic recurring refresh. It does not alter saved counts or bios. Historical posts outside Meta's latest 25 exposed posts may no longer have a preview; the source link remains available.

Images are lazy-loaded directly from Meta CDN hosts, with contain framing. Carousel navigation mounts only the selected slide (up to 20 exposed slides per post). Video files are not loaded by gallery tiles: **Load video** adds a native player with controls and `preload=none`. A cover may be available without playable video; the UI states this and links to the original. Missing/expired images and video errors offer reload/original-post recovery. Reload fetches fresh references rather than retrying expired CDN links indefinitely. Meta may omit media URLs for copyright or account restrictions; availability is never assumed. Business Discovery first requests video thumbnails and retries only once without thumbnail fields on Graph code 100, preserving supported media fields across API versions. Other provider errors are not retried.

Only lightweight, transient metadata travels from the authenticated server action to page memory. No preview URLs or binaries are written to snapshots, PostgreSQL, R2, localStorage or the library. Browser caching of source-CDN media follows the source response's normal cache policy. There is no server media proxy or binary download. Graph reads use the fixed host, no-store, a bounded body/timeout, maximum 25 posts and 20 children. Only matching saved post IDs are returned; a mismatched profile identity is rejected. The service rechecks account existence and current grant revision after the read, discarding results after revocation/replacement/deletion.

HTTPS URLs must belong to Meta's fbcdn.net, cdninstagram.com or fbsbx.com CDN hosts, with no user credentials, nonstandard ports or token/secret query keys. Signed CDN query parameters are preserved for playback but never logged. CSP allows those image/video origins only on `/app/social/research`; site-wide framing, script and connection policies remain unchanged. Research uses no-referrer for external media. No new dependency, migration, environment variable, OAuth scope, callback, scheduled job or worker deployment is required.

No additional Meta use case is configured by this feature. Existing Instagram professional-account research permissions and eligible Facebook public-content access still govern what can be shown. Facebook may expose a video cover without its playable source; do not promise that another use case will unlock competitor video downloads. Official references: [Instagram media fields](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/), [Instagram user/profile fields](https://developers.facebook.com/docs/graph-api/reference/shadow-ig-user), [Facebook attachments](https://developers.facebook.com/docs/graph-api/reference/story-attachment), [Page post source restrictions](https://developers.facebook.com/docs/graph-api/reference/page-post/).

Research tools and media analysis were not part of the preview release. MCP 1.4.0 implements the agreed next phase locally, pending production rollout: analysis is a core capability with independently owner-enabled autonomous analysis per connection/workspace, spending controls and temporary processing only. Existing publishing/generation permissions stay intact. See [MCP research](mcp-research.md).

Preview verification: 159 unit/integration tests and all 22 browser journeys passed, including mobile/desktop Light/Dark, no media requests before loading, lazy carousel navigation, no video fetch before playback, expired-image recovery, viewer denial and provider failure preserving saved research. Screenshots were inspected. Formatting, explicit TypeScript, environment placement, lint (three existing warnings), focused final lint and production build passed. No live media download, production mutation or paid analysis was run for verification.

Preview release `300a1ec` is live via Vercel `dpl_8VpYeh4R3nxfhXnfLbmNxDdATA45`, READY on vcstudio.veilcode.studio. Load previews in an existing saved observation to verify media availability against the current Meta grant; browser tests use mocked media.
