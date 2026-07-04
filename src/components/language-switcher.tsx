"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { locales, localeLabels, localeFlags, type Locale } from "@/i18n/config";

export function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  function handleChange(locale: Locale) {
    const path = window.location.pathname;
    const segments = path.split("/").filter(Boolean);

    const currentIndex = locales.indexOf(currentLocale);
    if (currentIndex !== -1) {
      segments.shift();
    }

    const newPath = `/${locale}${segments.length ? "/" + segments.join("/") : ""}`;

    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;
    startTransition(() => {
      window.location.href = newPath;
    });
  }

  return (
    <div className="fixed bottom-4 left-4 z-30 hidden md:block">
      <select
        value={currentLocale}
        onChange={(e) => handleChange(e.target.value as Locale)}
        disabled={isPending}
        className="w-32 max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)] shadow-sm transition-colors hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-50 sm:w-auto"
        aria-label="Select language"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {localeFlags[locale]} {localeLabels[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
