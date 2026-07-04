"use client";

import { useTranslations } from "next-intl";
import { ComposeForm } from "@/components/compose/compose-form";

export default function ComposePage() {
	const t = useTranslations("compose");
	return (
		<div className="h-full overflow-auto p-8">
			<div className="mb-6">
				<h1 className="text-2xl font-normal text-[var(--ink)]">{t("pageTitle")}</h1>
				<p className="mt-1 text-sm text-[var(--ink-muted)]">{t("pageDesc")}</p>
			</div>
			<ComposeForm mode="page" />
		</div>
	);
}
