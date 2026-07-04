# Staging on Cloudflare Workers Builds

This repo ships a **persistent staging worker** that deploys automatically on
every push to `staging`. The Cloudflare dashboard handles the Git integration;
the repo is set up so that connection "just works" once the one-time resources
below are created.

> Looking for self-hosted production deploys? See
> [`docs/SELF_HOSTING.md`](./SELF_HOSTING.md) — staging here uses a separate
> `wrangler.staging.jsonc` and never touches your self-hosted config.

## What you get

- Worker name: **`lumimail-staging`**
- URL: `https://lumimail-staging.<your-cf-subdomain>.workers.dev`
- Bindings: dedicated D1 / R2 / queues scoped to staging so deploys never
  destroy demo data.
- Demo login: `admin@example.com` / `demo-password-change-me` (seeded on every
  deploy, idempotent — safe to redeploy).
- Push to `staging` → `npm run typecheck` → remote D1 migrations → OpenNext
  build → deploy → seed. No manual steps.

## One-time setup

These resources are referenced by `wrangler.staging.jsonc` and need to exist
**before** the first Workers Builds deploy.

### 1. Create the persistent D1 database

```bash
wrangler d1 create lumimail-staging
```

Copy the `database_id` into `wrangler.staging.jsonc` in place of the
`REPLACE_WITH_STAGING_D1_DATABASE_ID` placeholder.

### 2. Create the persistent R2 bucket

```bash
wrangler r2 bucket create lumimail-staging-raw
```

### 3. Create the persistent queues

```bash
wrangler queues create lumimail-staging-inbound
wrangler queues create lumimail-staging-outbound
```

### 4. Bind the seed secret

This secret gates the in-production `POST /api/seed` call that the build
pipeline fires after every deploy so the demo login is always available.

```bash
wrangler secret put SEED_SECRET --config wrangler.staging.jsonc
```

Use any high-entropy string (e.g. `openssl rand -hex 32`). The build
pipeline reads this exact value.

### 5. Connect the repo to Cloudflare from the dashboard

1. Workers & Pages → **Create application** → Workers → **Connect to Git**.
2. Select this repo (`cschanhniem/lumimail`).
3. **Production branch:** `staging`.
4. Set **both** build commands explicitly:
   - **Build command:** `npm run deploy:staging`
     (does typecheck → D1 migrate → OpenNext build → `wrangler deploy` → seed).
   - **Deploy command:** `echo skip`
     (the build command already deploys via `opennextjs-cloudflare deploy`;
     the deploy command is a no-op).

   > **Never leave the Deploy command at its default (`npx wrangler deploy`).**
   > Cloudflare's default generates a minimal `wrangler.jsonc` with no `main`
   > entry point and no `assets` directory, so the deploy fails with
   > `Missing entry-point to Worker script or to assets directory`. Always set
   > Build = `npm run deploy:staging` and Deploy = `echo skip`.
5. **Build environment variables** (first deploy):
   - `STAGING_URL` — **leave empty on the very first push**; we learn it
     from the deploy output and paste it back in step 6.b below.
   - `SEED_SECRET` = the same value you put via `wrangler secret put`
     above.
   - `SEED_REQUIRED` — **do not set yet** on the first push (default
     behaviour skips the seed silently so the bootstrap deploy doesn't
     paint itself red).
6. Save and deploy.

### 6. Bootstrap the demo login (second deploy)

After the first deploy succeeds:

a. Copy the staging URL the Workers Builds run output shows (looks like
   `https://lumimail-staging.<your-cf-subdomain>.workers.dev`).
b. In the project's **Settings → Builds → Environment variables**, set:
   - `STAGING_URL` = the URL from (a).
   - `SEED_REQUIRED` = `1`. From this point on, a missing
     `STAGING_URL` / `SEED_SECRET` (e.g. an accidentally-deleted env var
     or a botched secret rotation) **fails the build** instead of
     producing a green deploy without the demo user.
c. Push any commit (or re-trigger the build). The pipeline now:
   - deploys the worker;
   - POSTs to `${STAGING_URL}/api/seed` with the `x-seed-secret` header;
   - the seed endpoint runs the demo idempotent insert;
   - the demo login (`admin@example.com` / `demo-password-change-me`)
     is available.

If the second deploy fails with `SEED_REQUIRED=1` complaining about a
missing var, fix the env var and re-push — that is exactly the
"deploy verde sem login demo" guard kicking in.

### Optional — preview versions per PR

Cloudflare can spin up a preview worker per non-`staging` branch. Toggle the
"Preview deployments" switch in the project's **Settings → Builds** tab.
The owner decides whether this is wanted — staging above works either way.

## What runs on every push

```
npm run deploy:staging
  └─ npm run typecheck
  └─ wrangler d1 migrations apply DB --remote --config wrangler.staging.jsonc
  └─ opennextjs-cloudflare build --config wrangler.staging.jsonc
  └─ opennextjs-cloudflare deploy --config wrangler.staging.jsonc
  └─ node scripts/seed-staging.mjs
       └─ POST $STAGING_URL/api/seed  (with header x-seed-secret: $SEED_SECRET)
```

`seed-staging.mjs` behaviour on missing env vars:

| `SEED_REQUIRED` | `STAGING_URL` / `SEED_SECRET` missing | Result |
| --- | --- | --- |
| unset (default) | missing | logs a warning, **exit 0** — bootstrap mode, deploy still green |
| set to `1` (post-bootstrap) | missing | logs an error, **exit 1** — build goes red until fixed |
| either | present | POST runs the seed; non-2xx / network error → exit 1 |

The flag is the linchpin: until the owner flips it to `1`, the first
deploy can succeed without a live demo user (because at that point we
don't yet know the deployed URL); once flipped, every subsequent deploy
is required to seed. Set `SEED_REQUIRED=1` only after step 6 above.

## Why a separate config file

- `wrangler.jsonc` is `.gitignore`d by design — every self-hosted install
  commits its own copy with real IDs. Staging could not use that path.
- `wrangler.staging.jsonc` is committed, references **its own** resource
  names (`lumimail-staging.*`), and never collides with a self-hosted
  install under the same Cloudflare account.
- The `.gitignore` rule `wrangler.jsonc` is an exact filename match, so the
  staging config is not accidentally ignored.

## How idempotency works

`insertDemoMessages` (in `src/lib/seed-utils.ts`) is idempotent: every seed
row carries a stable `providerMessageId` (synthetic ones for draft/queued/
failed/trash rows are prefixed `<seed-...>` so it's clear they aren't real
provider ids). Re-deploying the pipeline does not duplicate seeded messages,
bodies, jobs, or contacts.

The secret-gated demo user `admin@example.com` is created by
`ensureDemoUser` (already idempotent — checks by email before insert).

## Out of scope

- Per-PR preview worker URLs (toggle in dashboard).
- Changing the production self-host deploy flow.
- Visual / routing work in PRV-133 / PR #46 / PR #48.
