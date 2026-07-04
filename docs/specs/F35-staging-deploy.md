# F35 — Persistent staging via Cloudflare Workers Builds

> Status: `Draft`
> Owner area: `wrangler.staging.jsonc`, `package.json` (scripts), `src/app/api/seed/route.ts`, `src/lib/seed-utils.ts`, `src/lib/api/auth.ts`

## 1. Problem & User Job

PRV-133 exposed that every PR created an ephemeral preview worker with
empty D1/R2/queues and zero demo data — the demo login had to be re-seeded
by hand on each preview, and previews diverged from each other because the
intl routing fix only landed in PR #46.

We need a single, persistent, always-on staging environment that:

- deploys automatically on every push to `main`, with no manual steps;
- keeps its D1/R2/queues/draft state across deploys;
- has the demo login available without anyone clicking "seed";
- does not expose its seed endpoint publicly.

Operators (maintainer, future contributors) need a stable URL to validate
any change in one place.

## 2. User Stories & Acceptance Criteria

- As the owner, I push to `main` and a staging URL becomes up-to-date
  within a couple of minutes, with `/` returning `200` (not `404`).
- As anyone, I can hit the staging URL and log in with the demo credentials.
- As a deploy pipeline, I can call `POST /api/seed` after deploy without
  exposing it publicly.
- As the repo, re-running the pipeline N times does **not** duplicate
  seeded messages, bodies, jobs, or contacts.
- As the owner, I receive short instructions for what to do once in the
  Cloudflare dashboard (no per-iteration manual work).

## 3. Scope Boundaries

**In scope:**

- New `wrangler.staging.jsonc` referencing persistent resources.
- New npm scripts (`deploy:staging`, `db:migrate:staging`, `seed:staging`).
- Idempotent `insertDemoMessages` (SELECT-then-insert by `providerMessageId`).
- `POST /api/seed` secret-gated production path.
- `verifySharedSecret` helper in `src/lib/api/auth.ts`.
- Owner-facing staging doc.

**Out of scope:**

- PR #46 / PR #48 routing/visual work (owner sequence).
- CF dashboard connection itself (owner performs).
- Self-hosted `wrangler.jsonc` flow (untouched).
- Per-PR preview deployments (toggle in dashboard, not in code).

## 4. Data Model

Reads/writes the existing schema (`src/db/schema/index.ts`) — no new
columns or migrations.

| Table                              | Behaviour change |
|------------------------------------|------------------|
| `users`, `domains`, `mailboxes`    | Unchanged — `ensure*` helpers already idempotent. |
| `messages`                         | `providerMessageId` is now set on every seed row, including draft/queued/failed/trash (synthetic `<seed-...>` ids). `insertDemoMessages` selects on `(userId, providerMessageId)` before inserting. |
| `message_bodies`                   | Insert follows message insertion; skipped on hit. |
| `outbound_jobs`                    | Insert follows message insertion for queued/failed rows. |

## 5. API Contract

| Method | Route | Auth | Request | Response | Errors |
|--------|-------|------|---------|----------|--------|
| `POST` | `/api/seed` | `x-seed-secret` header in production (`SEED_SECRET` env var) | empty | `{ ok, credentials, seeded }` | `403` if `NODE_ENV=production` and secret missing or wrong, or no `SEED_SECRET` bound |
| `POST` | `/api/seed` | none outside production | empty | `{ ok, credentials, seeded }` | — |

## 6. UI/UX

None — server-only change.

## 7. Test Plan

| Layer | File | What it covers |
|-------|------|-----------------|
| Unit | `tests/unit/lib/seed-utils.test.ts` | `insertDemoMessages` inserts all 15 on first run; re-run with hits inserts 0; mixed run inserts only the misses. |
| Unit | `tests/unit/lib/api/auth.test.ts` | `verifySharedSecret`: equal, different, different-length, null/undefined on either side, empty-vs-empty refused. |
| Unit | `tests/unit/app/api/seed/route.test.ts` | `POST` with prod + secret-bound: 403 if no secret / wrong secret / missing header, 200 if matches; non-prod: 200 unconditional. |

Coverage target: 100% for touched files.

## 8. Current Behavior

- `/api/seed` → `403` in production, no path to seed.
- `insertDemoMessages` always inserts everything; running twice duplicates
  the demo dataset (won on the user's data, lost the demo, or simply
  bloats the row count).
- No persistent staging — only ephemeral per-PR previews.

## 9. Error States

| Condition | User-visible message | HTTP status | Logged? |
|-----------|----------------------|--------------|---------|
| Production + wrong secret | `Not available in production` | 403 | yes (deploy log) |
| Production + no secret bound | `Not available in production` | 403 | yes (deploy log) |
| Seed-staging script: network error | printed text | exit 1 | yes |
| Seed-staging script: STAGING_URL/SEED_SECRET unset | printed text | exit 0 (skipped) | yes |

## 10. Edge Cases

- First push before `STAGING_URL` is known → `seed-staging.mjs` skips
  cleanly and exits 0; deploy still succeeds; second push retries.
- Owner puts wrong `SEED_SECRET` in Workers Builds env vars →
  `seed-staging.mjs` exits 1 so the deploy is flagged; subsequent push
  (corrected secret) flips back to exit 0.
- Asset directory missing at deploy time → `wrangler deploy` fails fast
  before `seed-staging.mjs` runs. `deploy:staging` mandates
  `opennextjs-cloudflare build` first, so the directory always exists.

## 11. Permissions & Security

- The demo seed endpoint is reachable publicly only on non-production
  deploys (existing dev-time behavior).
- In production (staging worker), only callers presenting the matching
  `x-seed-secret` succeed; the secret is bound via `wrangler secret put`
  and not committed.
- `verifySharedSecret` uses `crypto.timingSafeEqual` after a length check
  to avoid both length-based leaks and throws on mismatched lengths.
- The staging config uses resource names prefixed `lumimail-staging` so a
  same-account `lumimail` (production self-host) install cannot collide.
- Self-hosting flow is unchanged: `wrangler.jsonc` is still
  `.gitignore`d, the staging config is a separate committed file.

## 12. Open Questions / Decisions

- **Seed strategy: chosen (a) `SEED_SECRET`-protected endpoint, not (b) raw SQL via `wrangler d1 execute`.**
  The endpoint reuses the same TS logic already under test, so no
  duplicated schema/business SQL.
   - Cost: build env needs `STAGING_URL` set after the first deploy (the
     workers.dev subdomain is not knowable from repo config).
   - Mitigation: owner pastes it on the second push; the script also
     degrades gracefully (exits 0, logs a warning) on the first.
   - Date: 2026-07-04.
- **Idempotency key:** `providerMessageId` (already a column on `messages`).
  - No new column / new migration needed.
  - Synthetic ids for draft/queued/failed/trash rows are clearly prefixed
    `<seed-...>` so they don't impersonate real provider ids.
   - Date: 2026-07-04.

## 13. Bug / Change Log

### 2026-07-04 — Persistent staging via Workers Builds

Type: `Feature | Infrastructure`

Summary:
- New `wrangler.staging.jsonc` (persistent staging worker, dedicated D1 /
  R2 / queues, identical-compatibility config to production).
- New npm scripts: `deploy:staging`, `db:migrate:staging`, `seed:staging`.
- `insertDemoMessages` is now idempotent; synthetic seed ids cover the
  previously `null` rows.
- `POST /api/seed` accepts `x-seed-secret` in production and is gated by
  `SEED_SECRET` via `verifySharedSecret` (`crypto.timingSafeEqual`).
- `verifySharedSecret` helper added to `src/lib/api/auth.ts`.
- `SEED_SECRET` bound in `CloudflareEnv` type and `package.json#cloudflare.bindings`.
- `docs/STAGING.md` (owner runbook) + this spec.

Reason:
- Per-PR previews were disposable and required manual seeding each time;
  PRV-133 escalated the waste.

Impact:
- Self-hosting flow unchanged.
- Build-pipeline users (Workers Builds) get a single command string to
  paste.

Tests:
- `tests/unit/lib/seed-utils.test.ts` — first / all-exist / mixed insert
  counts.
- `tests/unit/lib/api/auth.test.ts` — `verifySharedSecret` matrices.
- `tests/unit/app/api/seed/route.test.ts` — 403/200 prod vs non-prod gate.

Notes:
- `--config` forwarding from `opennextjs-cloudflare build/deploy` to
  `wrangler` was source-traced through the installed CLI and validated
  by `wrangler deploy --dry-run --config wrangler.staging.jsonc`.
- An actual end-to-end deploy was not exercised (no CF account in this
  sandbox); the surface exposed by the new script and config was
  validated as far as possible without one.
