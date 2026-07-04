import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ seedDemoData: vi.fn() }));
const envState = vi.hoisted(() => ({ SEED_SECRET: undefined as string | undefined }));

vi.mock("@/lib/cloudflare", () => ({ getEnv: () => envState }));
vi.mock("@/lib/seed", () => ({ seedDemoData: m.seedDemoData }));
vi.mock("@/lib/seed-utils", () => ({ demoCredentials: { email: "demo@x.test", password: "pw" } }));

import { POST } from "@/app/api/seed/route";

beforeEach(() => {
	m.seedDemoData.mockReset();
	envState.SEED_SECRET = undefined;
});

afterEach(() => {
	vi.unstubAllEnvs();
});

function makeRequest(headers: Record<string, string> = {}): NextRequest {
	return new NextRequest("http://localhost/api/seed", { method: "POST", headers });
}

describe("POST /api/seed", () => {
	it("returns 403 in production without a secret bound", async () => {
		vi.stubEnv("NODE_ENV", "production");
		envState.SEED_SECRET = undefined;
		const res = await POST(makeRequest({ "x-seed-secret": "anything" }));
		expect(res.status).toBe(403);
		expect((await res.json()) as any).toEqual({ error: "Not available in production" });
		expect(m.seedDemoData).not.toHaveBeenCalled();
	});

	it("returns 403 in production with the wrong secret", async () => {
		vi.stubEnv("NODE_ENV", "production");
		envState.SEED_SECRET = "the-real-secret";
		const res = await POST(makeRequest({ "x-seed-secret": "guess" }));
		expect(res.status).toBe(403);
		expect((await res.json()) as any).toEqual({ error: "Not available in production" });
		expect(m.seedDemoData).not.toHaveBeenCalled();
	});

	it("returns 403 in production even if the secret headers are missing", async () => {
		vi.stubEnv("NODE_ENV", "production");
		envState.SEED_SECRET = "the-real-secret";
		const res = await POST(makeRequest());
		expect(res.status).toBe(403);
		expect(m.seedDemoData).not.toHaveBeenCalled();
	});

	it("seeds in production when the matching secret is supplied", async () => {
		vi.stubEnv("NODE_ENV", "production");
		envState.SEED_SECRET = "the-real-secret";
		m.seedDemoData.mockResolvedValue({ messageCount: 15 });
		const res = await POST(makeRequest({ "x-seed-secret": "the-real-secret" }));
		expect(res.status).toBe(200);
		expect((await res.json()) as any).toEqual({
			ok: true,
			credentials: { email: "demo@x.test", password: "pw" },
			seeded: { messageCount: 15 },
		});
	});

	it("seeds demo data outside production", async () => {
		vi.stubEnv("NODE_ENV", "development");
		m.seedDemoData.mockResolvedValue({ messageCount: 15 });
		const res = await POST(makeRequest());
		expect(res.status).toBe(200);
		expect((await res.json()) as any).toEqual({
			ok: true,
			credentials: { email: "demo@x.test", password: "pw" },
			seeded: { messageCount: 15 },
		});
	});
});
