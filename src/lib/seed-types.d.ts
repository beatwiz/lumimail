import type { mailboxes } from "@/db/schema";

export type SeedMailboxKey = "support" | "billing";

export type SeedMailboxMap = Record<SeedMailboxKey, typeof mailboxes.$inferSelect>;

export type SeedMessageStatus =
	| "received"
	| "sent"
	| "draft"
	| "trash"
	| "spam"
	| "queued"
	| "failed";

export type SeedMessageDefinition = {
	mailbox: SeedMailboxKey;
	direction: "inbound" | "outbound";
	status: SeedMessageStatus;
	fromAddr: string;
	toAddr: string;
	subject: string;
	textBody: string;
	read?: boolean;
	minutesAgo: number;
	/**
	 * Stable provider-message key used to dedupe seeds across deploys.
	 * Required so a seed that lacks it is a TS error — the messages table
	 * has no unique constraint on `providerMessageId` so dedup is
	 * app-level.
	 */
	providerMessageId: string;
	/**
	 * Real-provider thread id (only meaningful for rows that actually came
	 * from an inbound SMTP/IMAP stream, i.e. rows whose `status` is
	 * `received` / `spam` / `trash` from the `inbound` side, or a `sent`
	 * outbound that the provider has tracked). Kept SEPARATE from the
	 * synthetic dedup key above so demo-only states (drafts / queued /
	 * failed / trash-outbound) explicitly stay `null` and the inbox does
	 * not turn them into a "thread of one".
	 */
	threadId?: string | null;
};
