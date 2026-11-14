# Facebook and Instagram account research

## Delivery status

Implemented locally on 14 November 2026. Production migration, deployment and real Meta authorization are pending. Local tests use isolated PostgreSQL, mocked Meta responses and browser fixtures; they do not establish that the production Meta app has public-content access.

The owner chose **Social research with manual refresh**, official Meta APIs first and visible access limits. Marketing Studio remains paused. Its search-based company/competitor research is independent and is not invoked, queried or activated by this feature.

## Workflow

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
