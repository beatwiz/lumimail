import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { verifySharedSecret } from "@/lib/api/auth";
import { seedDemoData } from "@/lib/seed";
import { demoCredentials } from "@/lib/seed-utils";

export async function POST(request: NextRequest) {
	const env = getEnv();
	const isProduction = process.env.NODE_ENV === "production";

	if (isProduction) {
		// Public seeding stays off in production; the pipeline-only path lets
		// the deploy hook call this with a shared secret bound via
		// `wrangler secret put SEED_SECRET --config wrangler.staging.jsonc`.
		const provided = request.headers.get("x-seed-secret");
		if (!env.SEED_SECRET) {
			return NextResponse.json({ error: "Not available in production" }, { status: 403 });
		}
		if (!verifySharedSecret(provided, env.SEED_SECRET)) {
			return NextResponse.json({ error: "Not available in production" }, { status: 403 });
		}
	}

	const result = await seedDemoData(env);
	return NextResponse.json({
		ok: true,
		credentials: demoCredentials,
		seeded: result,
	});
}
