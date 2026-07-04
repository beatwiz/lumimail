#!/usr/bin/env node
// Post-deploy seeder for the Cloudflare Workers Builds -> staging pipeline.
// Reads the deployed staging URL and a shared secret from the build env,
// then calls the secret-gated production `POST /api/seed` endpoint so the
// demo login (`admin@example.com` / `demo-password-change-me`) is always
// available.
//
// Bootstrap behaviour:
//   - First deploy (owner has not yet pasted STAGING_URL into the Workers
//     Builds env): STAGING_URL / SEED_SECRET are unset. We skip seeding and
//     log it. Default (SEED_REQUIRED not set) → exit 0 so the first push
//     is not painted red.
//   - After bootstrap: owner flips SEED_REQUIRED=1. From that point on,
//     any missing STAGING_URL / SEED_SECRET is a real misconfiguration
//     (e.g. secret rotated, env var deleted) and the build is painted red
//     — exit 1 with a clear log line.
//
//  Protocol always:
//   - Network error / non-2xx response → exit 1.
const url = process.env.STAGING_URL;
const secret = process.env.SEED_SECRET;
const strict = process.env.SEED_REQUIRED === "1";

if (!url || !secret) {
	const missing = [
		!url ? "STAGING_URL" : null,
		!secret ? "SEED_SECRET" : null,
	].filter((v) => v !== null);
	if (strict) {
		// After bootstrap the owner enables strict mode so a slipped
		// rotation or a missed env-var paste shows up as a red build
		// instead of a green one that lost the demo user.
		console.error(
			`[seed-staging] SEED_REQUIRED=1 but ${missing.join(" / ")} not set; failing the build. Re-paste the missing var(s) in the Workers Builds environment.`,
		);
		process.exit(1);
	}
	console.log(
		`[seed-staging] ${missing.join(" / ")} not set; skipping seed. ` +
			`Bootstrap mode: first deploy before STAGING_URL is pasted. ` +
			`Set SEED_REQUIRED=1 in build env after bootstrap to fail-fast on future misconfiguration.`,
	);
	process.exit(0);
}

const endpoint = `${url.replace(/\/$/, "")}/api/seed`;

(async () => {
	let res;
	try {
		res = await fetch(endpoint, {
			method: "POST",
			headers: { "x-seed-secret": secret },
		});
	} catch (err) {
		console.error(`[seed-staging] network error calling ${endpoint}:`, err);
		process.exit(1);
	}

	const body = await res.text();
	if (!res.ok) {
		// 403 here = wrong secret / secret not yet bound on the worker; surface
		// it loudly so the owner can fix the env var on the next push.
		console.error(`[seed-staging] POST ${endpoint} -> ${res.status} ${res.statusText}`);
		console.error(`[seed-staging] response: ${body}`);
		process.exit(1);
	}

	console.log(`[seed-staging] POST ${endpoint} -> ${res.status}`);
	console.log(body);
})();
