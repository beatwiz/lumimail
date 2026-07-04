import type { AuthShellProps } from "./types";

export function AuthShell({ icon: Icon, title, description, children, footer, steps }: AuthShellProps) {
	return (
		<div className="min-h-dvh bg-[var(--surface-subtle)] p-4 text-[var(--ink)] sm:p-6">
			<div className="mx-auto flex min-h-[calc(100dvh-32px)] max-w-6xl items-center sm:min-h-[calc(100dvh-48px)]">
				<div className="mx-auto bg-[var(--surface-raised)] overflow-hidden rounded-4xl shadow-lg">

					<section className="flex flex-col justify-between p-6 sm:p-10">
						<div>
							<div className="mb-8">
							
								<h1 className="max-w-sm text-4xl font-semibold leading-tight tracking-tight text-[var(--ink)]">
									{title}
								</h1>
								{description && <p className="mt-4 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{description}</p>}
							</div>
							{steps && (
								<div className="mb-8 flex gap-2 text-xs font-semibold">
									{steps.map((step, index) => (
										<span key={step.label} className="flex items-center gap-2">
											<span className={step.active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
												{index + 1} {step.label}
											</span>
											{index < steps.length - 1 && <span className="text-[var(--ink-faint)]">/</span>}
										</span>
									))}
								</div>
							)}
							{children}
						</div>
						<div className="mt-8 text-sm font-medium text-[var(--accent)]">{footer}</div>
					</section>
				</div>
			</div>
		</div>
	);
}
