import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock, type DbMock } from "../helpers/db";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db", () => ({ getDb: () => h.db }));

const upsertContactFromAddress = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/contacts/service", () => ({
	upsertContactFromAddress: (...args: unknown[]) => upsertContactFromAddress(...args),
}));

import {
	demoCredentials,
	ensureDemoDomain,
	ensureDemoMailboxes,
	ensureDemoUser,
	insertDemoMessages,
} from "@/lib/seed-utils";
import type { SeedMailboxMap } from "@/lib/seed-types";

const env = {} as CloudflareEnv;
let mock: DbMock;

beforeEach(() => {
	mock = createDbMock();
	h.db = mock.db;
	upsertContactFromAddress.mockClear();
});

describe("ensureDemoUser", () => {
	it("returns the existing user without inserting", async () => {
		const existing = { id: "usr_1", email: demoCredentials.email };
		mock.queueSelect([existing]);
		expect(await ensureDemoUser(env)).toEqual(existing);
		expect(mock.inserts).toHaveLength(0);
	});

	it("creates a new user when none exists", async () => {
		const created = { id: "usr_new", email: demoCredentials.email };
		mock.queueSelect([]).queueSelect([created]);
		expect(await ensureDemoUser(env)).toEqual(created);
		expect(mock.inserts).toHaveLength(1);
		const values = mock.inserts[0].values as Record<string, unknown>;
		expect(values.email).toBe(demoCredentials.email);
		expect(typeof values.passwordHash).toBe("string");
		expect(values.id).toMatch(/^usr_/);
	});
});

describe("ensureDemoDomain", () => {
	it("returns the existing domain without inserting", async () => {
		const existing = { id: "dom_1", hostname: "example.com" };
		mock.queueSelect([existing]);
		expect(await ensureDemoDomain(env, "usr_1")).toEqual(existing);
		expect(mock.inserts).toHaveLength(0);
	});

	it("creates a new domain when none exists", async () => {
		const created = { id: "dom_new", hostname: "example.com" };
		mock.queueSelect([]).queueSelect([created]);
		expect(await ensureDemoDomain(env, "usr_1")).toEqual(created);
		expect(mock.inserts).toHaveLength(1);
		const values = mock.inserts[0].values as Record<string, unknown>;
		expect(values.hostname).toBe("example.com");
		expect(values.userId).toBe("usr_1");
		expect(values.id).toMatch(/^dom_/);
	});
});

describe("ensureDemoMailboxes", () => {
	it("returns existing mailboxes without inserting (one select per definition)", async () => {
		// "all already exist" path: each map callback runs a single select, so
		// the queue order is deterministic regardless of Promise.all scheduling.
		const a = { id: "mbx_a", localPart: "x" };
		const b = { id: "mbx_b", localPart: "y" };
		mock.queueSelect([a]).queueSelect([b]);

		const result = await ensureDemoMailboxes(env, "usr_1", "dom_1");

		expect(Object.keys(result).sort()).toEqual(["billing", "support"]);
		// Mapping of key->row depends on scheduling, so assert membership only.
		expect([result.support, result.billing]).toEqual(expect.arrayContaining([a, b]));
		expect(mock.inserts).toHaveLength(0);
	});

	it("creates missing mailboxes", async () => {
		// New-mailbox branch: each callback does select(empty) -> insert -> select(created).
		// Existing-lookups resolve to interchangeable empty arrays and both created
		// rows are asserted by membership, so interleaving does not affect assertions.
		const created1 = { id: "mbx_1", localPart: "support" };
		const created2 = { id: "mbx_2", localPart: "billing" };
		mock
			.queueSelect([])
			.queueSelect([])
			.queueSelect([created1])
			.queueSelect([created2]);

		const result = await ensureDemoMailboxes(env, "usr_1", "dom_1");

		expect(Object.keys(result).sort()).toEqual(["billing", "support"]);
		expect([result.support, result.billing]).toEqual(
			expect.arrayContaining([created1, created2]),
		);
		expect(mock.inserts).toHaveLength(2);
		for (const insert of mock.inserts) {
			const values = insert.values as Record<string, unknown>;
			expect(values.id).toMatch(/^mbx_/);
			expect(values.domainId).toBe("dom_1");
			expect(values.userId).toBe("usr_1");
		}
	});
});

describe("insertDemoMessages", () => {
	const mailboxMap = {
		support: { id: "mbx_support" },
		billing: { id: "mbx_billing" },
	} as unknown as SeedMailboxMap;

	// Each seed row now does a pre-insert SELECT on (userId, providerMessageId)
	// for idempotency. Queue one empty result per seed message (15 total).
	function queueFifteenEmptySelects() {
		for (let i = 0; i < 15; i += 1) mock.queueSelect([]);
	}

	it("inserts every seed message with its body, queued/failed jobs, and contacts", async () => {
		queueFifteenEmptySelects();
		const count = await insertDemoMessages(env, "usr_1", mailboxMap);

		// 15 seed messages on first run.
		expect(count).toBe(15);

		const messageInserts = mock.inserts.filter(
			(i) => (i.values as Record<string, unknown>).direction !== undefined,
		);
		const bodyInserts = mock.inserts.filter(
			(i) => (i.values as Record<string, unknown>).messageId !== undefined
				&& (i.values as Record<string, unknown>).status === undefined,
		);
		const jobInserts = mock.inserts.filter(
			(i) => (i.values as Record<string, unknown>).payload !== undefined,
		);

		// One message + one body per seed message.
		expect(messageInserts).toHaveLength(15);
		expect(bodyInserts).toHaveLength(15);

		// Seed list has 2 queued + 2 failed messages → 4 outbound jobs.
		expect(jobInserts).toHaveLength(4);
		const failedJobs = jobInserts.filter(
			(i) => (i.values as Record<string, unknown>).status === "failed",
		);
		const queuedJobs = jobInserts.filter(
			(i) => (i.values as Record<string, unknown>).status === "queued",
		);
		expect(failedJobs).toHaveLength(2);
		expect(queuedJobs).toHaveLength(2);
		// Error is set on failed jobs, null on queued.
		for (const job of failedJobs) {
			expect((job.values as Record<string, unknown>).error).toBe(
				"Seeded delivery failure for UI and API testing",
			);
		}
		for (const job of queuedJobs) {
			expect((job.values as Record<string, unknown>).error).toBeNull();
		}

		// Contacts upserted once per message, with source/address by direction.
		expect(upsertContactFromAddress).toHaveBeenCalledTimes(15);
		const calls = upsertContactFromAddress.mock.calls.map((c) => c[1]) as unknown as {
			source: string;
			address: string;
		}[];
		const inbound = calls.filter((c) => c.source === "inbound");
		const outbound = calls.filter((c) => c.source === "outbound");
		// 6 inbound seed messages, 9 outbound.
		expect(inbound).toHaveLength(6);
		expect(outbound).toHaveLength(9);
		// Inbound uses fromAddr, outbound uses toAddr.
		expect(inbound.every((c) => c.address.length > 0)).toBe(true);

		// Every seed row carries a stable providerMessageId now.
		const nullProvider = messageInserts.filter(
			(i) => (i.values as Record<string, unknown>).providerMessageId === null,
		);
		expect(nullProvider).toHaveLength(0);

		// threadId is decoupled from the dedup key: the 7 synthetic seeds
		// (`<seed-draft-…>`, `<seed-trash-billing…>`, `<seed-queued-…>`,
		// `<seed-failed-…>`) must write threadId === null so the inbox
		// does not turn them into a "thread of one" on
		// /api/messages/thread/<id>.
		const syntheticIds = [
			"<seed-draft-webhook@example.test>",
			"<seed-draft-renewal@example.test>",
			"<seed-trash-billing@example.test>",
			"<seed-queued-status@example.test>",
			"<seed-queued-receipt@example.test>",
			"<seed-failed-smtp@example.test>",
			"<seed-failed-notice@example.test>",
		];
		const realIds = [
			"<seed-inbox-access@example.test>",
			"<seed-inbox-webhook@example.test>",
			"<seed-inbox-invoice@example.test>",
			"<seed-sent-access@example.test>",
			"<seed-sent-invoice@example.test>",
			"<seed-spam-promo@example.test>",
			"<seed-spam-bank@example.test>",
			"<seed-trash-migration@example.test>",
		];
		const syntheticInserts = messageInserts.filter((i) =>
			syntheticIds.includes((i.values as Record<string, unknown>).providerMessageId as string),
		);
		expect(syntheticInserts).toHaveLength(7);
		for (const insert of syntheticInserts) {
			expect((insert.values as Record<string, unknown>).threadId).toBeNull();
		}
		const realInserts = messageInserts.filter((i) =>
			realIds.includes((i.values as Record<string, unknown>).providerMessageId as string),
		);
		expect(realInserts).toHaveLength(8);
		for (const insert of realInserts) {
			const tid = (insert.values as Record<string, unknown>).threadId;
			const pid = (insert.values as Record<string, unknown>).providerMessageId;
			// Real threads inherit their providerMessageId as threadId (same
			// value the production inbound pipeline records).
			expect(tid).toBe(pid);
		}
	});

	it("is idempotent: re-running with all rows already present inserts nothing", async () => {
		// Pre-insert lookup for every seed row returns a hit → all seeds skipped.
		for (let i = 0; i < 15; i += 1) mock.queueSelect([{ id: "msg_existing" }]);
		const count = await insertDemoMessages(env, "usr_1", mailboxMap);

		expect(count).toBe(0);
		expect(mock.inserts).toHaveLength(0);
		expect(upsertContactFromAddress).not.toHaveBeenCalled();
	});

	it("inserts only the rows the pre-lookup misses", async () => {
		// First five seeds already exist; remaining ten are new.
		for (let i = 0; i < 5; i += 1) mock.queueSelect([{ id: "msg_existing" }]);
		for (let i = 0; i < 10; i += 1) mock.queueSelect([]);

		const count = await insertDemoMessages(env, "usr_1", mailboxMap);

		expect(count).toBe(10);

		const messageInserts = mock.inserts.filter(
			(i) => (i.values as Record<string, unknown>).direction !== undefined,
		);
		const bodyInserts = mock.inserts.filter(
			(i) => (i.values as Record<string, unknown>).messageId !== undefined
				&& (i.values as Record<string, unknown>).status === undefined,
		);
		expect(messageInserts).toHaveLength(10);
		expect(bodyInserts).toHaveLength(10);
		// 10 contacts upserted (one per newly inserted row).
		expect(upsertContactFromAddress).toHaveBeenCalledTimes(10);
	});
});
