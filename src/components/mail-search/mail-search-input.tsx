"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMailSearch } from "./mail-search-context";

export function MailSearchInput() {
	const t = useTranslations("search");
	const { query, setQuery } = useMailSearch();

	return (
		<div className="flex h-12 flex-1 max-w-3xl items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-4 text-[var(--ink-muted)]">
			<Search className="h-5 w-5 shrink-0" />
			<input
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder={t("placeholder")}
				className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
			/>
			{query && (
				<button
					type="button"
					onClick={() => setQuery("")}
					className="rounded-full p-1 text-[var(--ink-muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--ink)]"
					aria-label={t("clearAria")}
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
