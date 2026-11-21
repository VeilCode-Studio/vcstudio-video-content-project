# Independent Image Studio

Image Studio lives at `/app/images` and saves standalone images to the private media library. It reuses the configured OpenAI image model, versioned standalone prompt, quality/size pricing and reference validation used by MCP. A project or AI-client connection is unnecessary. Existing MCP generation permissions and advisory budgets continue to use their own path.

Owners and editors can enter a prompt, choose square/landscape/portrait and low/medium/high quality, select ready PNG/JPEG/WebP references, review a signed ten-minute estimate and explicitly generate one image. Results can be downloaded, attached to Social drafts or reused in a project scene through the existing library flow. Project scene review still applies when an image is assigned.

The browser flow checks current identity, workspace membership and generation permission, enforces existing workspace daily/monthly budgets, reserves estimated usage atomically and records actual usage. Quote signatures bind the user, workspace, exact request, model, references and pricing. A saved idempotency key returns the existing job; a changed request conflicts. Queue handoff retries target the existing job and never automatically repeat provider work. Each job has one provider attempt. Uncertain submission costs retain the recorded or conservative estimate.

`library_image_jobs` holds requests, frozen plans/prompts, provider request IDs, status and cost. `usage_reservations.library_image_job_id` is a tenant-constrained optional link. The existing operation invariant still requires exactly one operation identity. Marketing data is not used. The existing 30-minute recovery pass settles expired browser-image reservations. No recurring schedule is added or made more frequent.

Generated migration `20261121163013_independent_image_studio` is unapplied pending production approval. Apply it before deploying the matching `library-image-generation` worker and web app. Existing scene-image flags, provider keys, model and pricing settings are reused. No environment variable or dependency is added. Google video and ElevenLabs visual access holds apply independently.

Initial Image Studio supports the configured OpenAI image model and one output per request. ElevenLabs visual API access remains subject to the existing subscription/licensing controls. History is workspace scoped, paginated and polls only while this page shows unfinished jobs. Provider and worker verification uses mocks without paid generation.

## Verification and release status (2026-11-21)

93 affected unit/integration tests passed, including eight isolated PostgreSQL migration/reservation/completion cases. 21 Playwright journeys passed across Image Studio and existing Social attachments/downloads. Formatting, lint, TypeScript, environment placement and the production build passed; lint retains three pre-existing warnings. Provider and worker calls were mocked and no paid image was generated.

Neon prepared migration `23e42dfa-5956-4059-83a2-fe916f259bdd` on temporary branch `br-delicate-thunder-aiadtnnd`, cloned from production `br-orange-fog-aiank0jx` in project `purple-mouse-51587409`. Full-record digests matched for 52 projects, 175 library assets, 62 Social posts, two MCP connections and 589 usage reservations (excluding the added nullable reservation field). The prepared SQL is exactly the generated migration file. Production is unchanged. Applying the migration, recording its journal hash, deleting this temporary branch and deploying matching worker/web code await owner approval.
