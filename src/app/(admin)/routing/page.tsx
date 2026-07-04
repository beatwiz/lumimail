"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/auth/client";

type RoutingRule = {
	id: string;
	pattern: string;
	action: "store" | "forward" | "reject";
	mailboxId: string | null;
	forwardTo: string | null;
	priority: number;
	domainId: string;
};

type Domain = { id: string; hostname: string };
type Mailbox = { id: string; localPart: string; domainId: string; displayName: string | null };

export default function RoutingPage() {
	const qc = useQueryClient();
	const [pattern, setPattern] = useState("*");
	const [domainId, setDomainId] = useState("");
	const [action, setAction] = useState<"store" | "forward" | "reject">("store");
	const [mailboxId, setMailboxId] = useState("");
	const [forwardTo, setForwardTo] = useState("");
	const [priority, setPriority] = useState(10);

	const domains = useQuery({
		queryKey: ["domains"],
		queryFn: async () => {
			const res = await authFetch("/api/domains");
			return (await res.json()) as { domains: Domain[] };
		},
	});

	const mailboxes = useQuery({
		queryKey: ["mailboxes"],
		queryFn: async () => {
			const res = await authFetch("/api/mailboxes");
			return (await res.json()) as { mailboxes: Mailbox[] };
		},
	});

	const rules = useQuery({
		queryKey: ["routing-rules"],
		queryFn: async () => {
			const res = await authFetch("/api/routing-rules");
			return (await res.json()) as { rules: RoutingRule[] };
		},
	});

	const create = useMutation({
		mutationFn: async () => {
			const body: Record<string, unknown> = { domainId, pattern, action, priority };
			if (action === "store" && mailboxId) body.mailboxId = mailboxId;
			if (action === "forward" && forwardTo) body.forwardTo = forwardTo;
			const res = await authFetch("/api/routing-rules", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error("Failed to create rule");
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["routing-rules"] });
			setPattern("*");
			setMailboxId("");
			setForwardTo("");
		},
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const res = await authFetch(`/api/routing-rules/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Failed");
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["routing-rules"] }),
	});

	const domainHostname = (id: string) =>
		domains.data?.domains.find((d) => d.id === id)?.hostname ?? "";

	const actionLabel = (rule: RoutingRule) => {
		if (rule.action === "store" && rule.mailboxId) return `→ mailbox`;
		if (rule.action === "forward" && rule.forwardTo) return `→ ${rule.forwardTo}`;
		return rule.action;
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<h1 className="text-2xl font-semibold">Routing rules</h1>
			<p className="text-sm text-[var(--ink-muted)]">
				Rules are evaluated in priority order. Incoming email for a domain is matched against each rule&apos;s pattern.
			</p>

			<Card>
				<CardHeader>
					<CardTitle>Add rule</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Domain</Label>
							<select
								className="w-full h-10 rounded-md border border-[var(--border)] px-3 text-sm"
								value={domainId}
								onChange={(e) => setDomainId(e.target.value)}
							>
								<option value="">Select domain</option>
								{(domains.data?.domains ?? []).map((d) => (
									<option key={d.id} value={d.id}>{d.hostname}</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label>Pattern</Label>
							<Input
								placeholder="* or user@domain.com"
								value={pattern}
								onChange={(e) => setPattern(e.target.value)}
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Action</Label>
							<select
								className="w-full h-10 rounded-md border border-[var(--border)] px-3 text-sm"
								value={action}
								onChange={(e) => setAction(e.target.value as "store" | "forward" | "reject")}
							>
								<option value="store">Store in mailbox</option>
								<option value="forward">Forward to address</option>
								<option value="reject">Reject</option>
							</select>
						</div>
						<div className="space-y-2">
							<Label>Priority</Label>
							<Input
								type="number"
								value={priority}
								onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
							/>
						</div>
					</div>

					{action === "store" && (
						<div className="space-y-2">
							<Label>Target mailbox</Label>
							<select
								className="w-full h-10 rounded-md border border-[var(--border)] px-3 text-sm"
								value={mailboxId}
								onChange={(e) => setMailboxId(e.target.value)}
							>
								<option value="">Select mailbox</option>
								{(mailboxes.data?.mailboxes ?? []).map((m) => (
									<option key={m.id} value={m.id}>
										{m.localPart}@{domainHostname(m.domainId)}
									</option>
								))}
							</select>
						</div>
					)}

					{action === "forward" && (
						<div className="space-y-2">
							<Label>Forward to</Label>
							<Input
								type="email"
								placeholder="destination@example.com"
								value={forwardTo}
								onChange={(e) => setForwardTo(e.target.value)}
							/>
						</div>
					)}

					<Button
						onClick={() => create.mutate()}
						disabled={!domainId || !pattern || create.isPending}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add rule
					</Button>
					{create.isError && (
						<p className="text-sm text-[var(--danger)]">Failed to create rule</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Active rules</CardTitle>
				</CardHeader>
				<CardContent>
					{(rules.data?.rules ?? []).length === 0 ? (
						<p className="text-sm text-[var(--ink-faint)]">No routing rules yet.</p>
					) : (
						<ul className="divide-y divide-[var(--border)]">
							{(rules.data?.rules ?? [])
								.sort((a, b) => a.priority - b.priority)
								.map((r) => (
									<li key={r.id} className="flex items-center justify-between py-3">
										<div className="flex items-center gap-3 text-sm">
											<GitBranch className="h-4 w-4 text-[var(--ink-faint)]" />
											<div>
												<div className="font-medium">
													<span className="font-mono">{r.pattern}</span>
													{" "}on{" "}
													<span className="font-mono">{domainHostname(r.domainId)}</span>
												</div>
												<div className="text-xs text-[var(--ink-muted)]">
													{actionLabel(r)} · priority {r.priority}
												</div>
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => remove.mutate(r.id)}
											className="text-[var(--danger)] hover:opacity-80"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</li>
								))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
