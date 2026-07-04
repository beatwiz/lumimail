"use client";

import { useState, useCallback } from "react";
import { Plus, Tag, X } from "lucide-react";
import { authFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

type Label = {
	id: string;
	name: string;
	color: string;
	createdAt: string;
};

const PRESET_COLORS = [
	"#6366f1",
	"#ec4899",
	"#f59e0b",
	"#10b981",
	"#3b82f6",
	"#ef4444",
	"#8b5cf6",
	"#14b8a6",
];

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetchLabels(): Promise<Label[]> {
	const res = await authFetch("/api/labels");
	const json = (await res.json()) as { success: boolean; data?: Label[] };
	return json.data ?? [];
}

export default function LabelsPage() {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [color, setColor] = useState(PRESET_COLORS[0]);
	const [formError, setFormError] = useState<string | null>(null);

	const { data: labels = [], isLoading } = useQuery({
		queryKey: ["labels"],
		queryFn: fetchLabels,
	});

	const createMutation = useMutation({
		mutationFn: async () => {
			const res = await authFetch("/api/labels", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.trim(), color }),
			});
			const json = (await res.json()) as { success: boolean; error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to create label");
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["labels"] });
			setName("");
			setColor(PRESET_COLORS[0]);
			setFormError(null);
		},
		onError: (err: Error) => {
			setFormError(err.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			await authFetch(`/api/labels/${id}`, { method: "DELETE" });
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["labels"] });
		},
	});

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			setFormError("Name is required");
			return;
		}
		createMutation.mutate();
	}

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold text-[var(--ink)]">Labels</h2>
				<p className="text-sm text-[var(--ink-muted)]">Organise your messages with custom labels.</p>
			</div>

			<form onSubmit={handleSubmit} className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 space-y-4">
				<h3 className="text-sm font-medium text-[var(--ink)]">New label</h3>

				{formError && (
					<p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">{formError}</p>
				)}

				<div className="flex items-center gap-3">
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Label name"
						className="h-9 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--border-strong)]"
					/>
					<Button type="submit" disabled={createMutation.isPending} className="gap-2">
						<Plus className="h-4 w-4" />
						Create
					</Button>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-xs text-[var(--ink-muted)]">Color:</span>
					{PRESET_COLORS.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => setColor(c)}
							className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
							style={{
								backgroundColor: c,
								borderColor: color === c ? "#1a1a1a" : "transparent",
							}}
						/>
					))}
				</div>
			</form>

			{isLoading ? (
				<p className="text-sm text-[var(--ink-muted)]">Loading...</p>
			) : labels.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] py-12 text-center">
					<Tag className="mb-3 h-8 w-8 text-[var(--ink-faint)]" />
					<p className="text-sm text-[var(--ink-muted)]">No labels yet. Create one above.</p>
				</div>
			) : (
				<div className="space-y-2">
					{labels.map((label) => (
						<div
							key={label.id}
							className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3"
						>
							<div className="flex items-center gap-3">
								<span
									className="h-3 w-3 rounded-full flex-shrink-0"
									style={{ backgroundColor: label.color }}
								/>
								<span className="text-sm font-medium text-[var(--ink)]">{label.name}</span>
							</div>
							<button
								type="button"
								onClick={() => deleteMutation.mutate(label.id)}
								disabled={deleteMutation.isPending}
								className="text-[var(--ink-faint)] hover:text-[var(--danger)]"
								title="Delete label"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
