# Pinterest connections and Pins

## Delivery state

Implemented locally on 21 November 2026; production release is pending. The owner supplied the client secret and confirmed Trial access. Local web/worker mirrors are synchronized for ENABLE_PINTEREST=true and PINTEREST_ACCESS_TIER=trial. Code/example defaults remain off/pending. Production synchronization follows the approved migration and release. No live Pinterest authorization, upload or Pin creation is claimed.

This uses the existing Social draft, scheduling, publication worker, token encryption, workspace permissions and MCP approval modes. It does not enable Marketing Studio, internal generation or another recurring task. Pinterest is a Social destination; project render uploads use the existing Share as post workflow, not a second project publishing adapter.

## Developer setup

Keep the owner's existing variable names:

```dotenv
ENABLE_PINTEREST="false"
PINTEREST_ACCESS_TIER="pending"
PINTEREST_API_ID=""
PINTEREST_API_SECRET=""
```

The ID is Pinterest's App ID and the secret is its client secret. These are server-only. `.env` is the local superset; web OAuth needs them in Vercel, and publishing/token rotation needs the same values in Trigger.dev. Do not put them in `NEXT_PUBLIC_*` variables or enter them in a connection dialog. Missing credentials do not break other platforms.

Register this exact redirect URI in the Pinterest app:

`https://vcstudio.veilcode.studio/api/pinterest/callback`

For local testing, register the exact callback for the configured `APP_BASE_URL` separately. VCStudio derives the URI from that server setting; it does not trust a browser-supplied callback.

After approval, add the secret and set `PINTEREST_ACCESS_TIER` to the access actually granted (`trial` or `standard`) in both runtimes. Only then explicitly set `ENABLE_PINTEREST=true`. A missing secret, pending tier or disabled switch blocks connection and publishing. Changing a prepared/scheduled target's access tier requires fresh preparation rather than silently changing its audience.

Trial Pins are visible only to their creator. A public board does not turn a Trial Pin into an ordinarily visible public Pin. Standard access is a separate Pinterest approval. The composer and MCP preview explain this restriction; an API success records a created Pin, not a promise of public reach.

Required Pinterest OAuth scopes: `user_accounts:read`, `boards:read`, `pins:read`, `pins:write`. No ads, catalog, private-board, board-creation or account-administration scope is requested.

## Browser workflow

1. An owner opens Accounts & connections. Pending setup shows a disabled Pinterest action and a colored status badge, with no provider request.
2. Once ready, Connect Pinterest opens Pinterest's own consent. The signed state expires and binds the real signed-in owner, user and active workspace. Reconnection upserts the same external account without replacing other accounts. Disconnect clears local credentials while retaining publication history; it does not claim to revoke Pinterest-side consent.
3. Create/open a Social draft with exactly one image or video. Select the intended Pinterest account.
4. In that account's Pin settings, explicitly load a page of public boards. The picker fetches 50 per request, supports bounded pagination and preserves entered text on failure. No boards are fetched while the page is idle. Secret/protected boards are excluded.
5. Choose a board, title (up to 100 characters), optional Pinterest description (up to 800; otherwise shared copy) and optional HTTPS destination link. A video Pin also requires a separate ready library JPEG/PNG cover. Save draft preserves these settings per connection and across refreshes. A scheduled target keeps its immutable settings; cancel before editing them.
6. Publish or schedule through the normal Social controls. Exact board access, media readiness and cover ownership are rechecked before dispatch. Outcomes remain separate per destination.

## Supported media

- One JPEG/PNG image up to 20 MB, with original full content preserved.
- One inspected H.264 MP4/MOV video, 4 seconds to 15 minutes, up to 500 MB. Choose an explicit ready JPEG/PNG cover up to 20 MB.
- No text-only, audio-only, multi-image or mixed-media Pins in this release. Incompatible requests fail instead of dropping attachments or creating multiple Pins. There is no automatic cropping, paid conversion or generation.

Pinterest's video flow registers media, uploads through its documented AWS host, checks bounded processing status and then creates the Pin. Uploads stream private R2 bytes with verified length bounds; they do not buffer a whole large video in memory. Upload host/redirect checks prevent forwarding credentials or media to an arbitrary destination. Temporary upload credentials reuse the encrypted provider checkpoint field and are cleared by the existing settlement path.

A durable checkpoint is saved before Pin creation. A lost response or server-side ambiguity blocks automatic replay, so retries cannot blindly create duplicate Pins. Definitive rejections can reuse a safe retry checkpoint; completed Pin IDs are reused without sending again. The existing worker retry/concurrency limits still apply.

Pin covers are included in delete-post media previews and optional media deletion; shared covers referenced by other drafts/targets are preserved. The library original is not replaced by its use as a cover.

## MCP

MCP server version 1.5.0 adds `get_pinterest_boards` (Read), bringing discovery to 64 registered tools / 62 assistant-visible tools. Existing `save_post`, `get_post`, `prepare_publication`, `execute_publication` and status/calendar tools carry Pinterest through the normal flow. Existing workspace Read/Edit/Publish scopes and saved per-connection approval mode apply; there is no new OAuth scope or extra mandatory approval gate. Refresh client tool discovery after release.

`save_post.pinterestSettings` is a map keyed by VCStudio connection UUID. Each entry has `boardId`, `boardName`, `title`, optional `description`, `link` and `videoCoverAssetId`. Omission preserves settings; null clears them. Board names are verified against Pinterest before publication. Settings cannot reference another workspace's account or cover. `get_post` returns saved Pin settings and target snapshots.

Preparation freezes the exact per-account board/title/description/link, access tier, cover identity/ETag, attached media, permissions and schedule. A changed preview requires a new operation. Manual mode still uses authenticated human review; an owner-authorized autonomous connection can prepare and execute end to end. Approved schedules use the existing Social scheduler; cancellation uses the same MCP cancellation operation as other destinations. Costs remain advisory for MCP under the owner's existing policy.

Suggested assistant request after activation:

> List my connected Pinterest accounts and public boards. Use my selected account and board to create a new Social draft with this exact copy and one existing ready image. Set the Pin title and HTTPS destination link. Read the draft back, prepare the exact publication preview, and follow this connection's saved publishing approval mode. Do not generate media, guess a board, or publish to another account.

## Persistence and release

Generated, unapplied migrations:

- `20261121051458_pinterest_publishing`: adds the platform enum value and nullable draft/target Pin settings.
- `20261121051858_pinterest_settings_constraints`: validates JSON object shapes and requires Pin settings only on Pinterest targets. Text comparison keeps enum addition and constraints safe in one PostgreSQL transaction.

Apply both migrations before releasing the new web/worker code because the new database projections include the nullable columns. Deploy matching publishing worker code and then the web app. Release with the owner-confirmed Trial tier and supplied secret synchronized to both runtimes. Trial Pins remain creator-visible only. Standard access later requires Pinterest approval and an explicit tier change, not another schema change. Preserve private access, existing MCP grants, the Google generation hold, Marketing's pause and all current recovery frequencies.

## Verification

Provider tests use mocked Pinterest responses. Isolated PostgreSQL runs the generated migrations and verifies existing-data preservation and constraints. Browser fixtures use mocked board actions and storage. Final counts and production-clone results are recorded after release checks; no live Pin, paid operation or new scheduled job is part of verification.

## Official references

- [OAuth requirements and refresh](https://developer.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- [Access tiers and Trial visibility](https://developer.pinterest.com/docs/key-concepts/access-tiers/)
- [Public board listing](https://developer.pinterest.com/docs/api/v5/boards-list/)
- [Image and video Pin creation](https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/)

## Release verification

The 128-file affected regression suite passed all 1,116 tests; the corrected media-validation cases passed again. Explicit TypeScript, environment placement and the production build passed. All 22 final browser journeys passed (Light/Dark, 390px/1440px, Pinterest and existing Social video/media flows). Full lint passed with three existing warnings; changed-file formatting passed. No dependency was added. Provider and worker tests use mocks; no live Pin or paid generation ran.

The combined migrations passed on temporary Neon branch `br-polished-mouse-ai6fqkke`. Both constraints validated; existing 59 posts, 53 delivery targets and 23 connections matched production counts and full-record digests, excluding only the new null columns. Production remains unchanged pending explicit migration/branch-cleanup approval.
