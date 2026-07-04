"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Save } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchMailbox, getMailboxAddress, updateMailboxName } from "./utils";

export default function MailboxSettingsPage() {
	const params = useParams<{ id: string }>();
	const mailboxId = params.id;
	const qc = useQueryClient();
	const [displayName, setDisplayName] = useState("");

	const mailbox = useQuery({
		queryKey: ["mailbox", mailboxId],
		queryFn: () => fetchMailbox(mailboxId),
		enabled: !!mailboxId,
	});

	useEffect(() => {
		if (mailbox.data) setDisplayName(mailbox.data.displayName ?? "");
	}, [mailbox.data]);

	const updateName = useMutation({
		mutationFn: () => updateMailboxName(mailboxId, displayName),
		onSuccess: (updatedMailbox) => {
			qc.setQueryData(["mailbox", mailboxId], updatedMailbox);
			qc.invalidateQueries({ queryKey: ["mailboxes"] });
		},
	});

	const address = mailbox.data ? getMailboxAddress(mailbox.data) : "";

	return (
		<div className="max-w-3xl space-y-6">
			<div className="flex items-center gap-3">
				<Button asChild variant="ghost" size="sm">
					<Link href="/mailboxes">
						<ArrowLeft className="h-4 w-4" />
						Mailboxes
					</Link>
				</Button>
			</div>

			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="truncate text-2xl font-semibold text-[var(--ink)]">
						{mailbox.data?.displayName || mailbox.data?.localPart || "Mailbox"}
					</h1>
					<p className="mt-1 truncate font-mono text-sm text-[var(--ink-muted)]">
						{address || "Loading mailbox..."}
					</p>
				</div>
				{mailbox.data?.isPrimary && <Badge variant="secondary">Primary</Badge>}
			</div>

			{mailbox.isError && (
				<p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
					{mailbox.error instanceof Error ? mailbox.error.message : "Failed to load mailbox"}
				</p>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Settings</CardTitle>
					<CardDescription>
						Update the mailbox label shown in selectors and mailbox lists.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="displayName">Name</Label>
						<Input
							id="displayName"
							value={displayName}
							onChange={(event) => setDisplayName(event.target.value)}
							placeholder={mailbox.data?.localPart ?? "Mailbox name"}
							disabled={mailbox.isLoading || updateName.isPending}
						/>
					</div>
					{updateName.isError && (
						<p className="text-sm text-[var(--danger)]">
							{updateName.error instanceof Error
								? updateName.error.message
								: "Failed to update mailbox"}
						</p>
					)}
					{updateName.isSuccess && (
						<p className="text-sm text-[var(--success)]">Mailbox settings saved</p>
					)}
					<Button
						onClick={() => updateName.mutate()}
						disabled={mailbox.isLoading || updateName.isPending}
					>
						<Save className="h-4 w-4" />
						{updateName.isPending ? "Saving..." : "Save changes"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Address</CardTitle>
					<CardDescription>
						The email address, username, and domain are managed as routing resources.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Email</p>
						<p className="truncate font-mono text-sm text-[var(--ink)]">{address || "-"}</p>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Username</p>
						<p className="truncate font-mono text-sm text-[var(--ink)]">
							{mailbox.data?.localPart ?? "-"}
						</p>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Domain</p>
						<p className="truncate font-mono text-sm text-[var(--ink)]">
							{mailbox.data?.hostname ?? "-"}
						</p>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Routing</p>
						<p className="flex items-center gap-2 text-sm text-[var(--ink)]">
							<Mail className="h-4 w-4 text-[var(--ink-faint)]" />
							Cloudflare Email Routing
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
