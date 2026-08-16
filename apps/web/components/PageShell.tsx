import Link from "next/link";
import type React from "react";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="as-shell lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="as-sidebar sticky top-0 hidden h-dvh px-4 py-5 lg:block">
        <Link href="/farms" className="flex items-center gap-3 rounded-2xl px-2 py-2">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[var(--as-primary)] text-sm font-black text-white shadow-[var(--as-shadow-sm)]">
            AS
          </span>
          <span>
            <span className="block text-sm font-bold text-[var(--as-ink)]">AgriScope</span>
            <span className="block text-xs font-medium text-[var(--as-ink-muted)]">Thailand Field Intelligence</span>
          </span>
        </Link>
        <nav className="mt-8 space-y-1 text-sm font-semibold" aria-label="Primary navigation">
          <Link
            href="/farms"
            className="flex min-h-11 items-center justify-between rounded-2xl bg-[var(--as-surface-soft)] px-3 text-[var(--as-primary)]"
            aria-current="page"
          >
            <span>Farms</span>
            <span className="as-dot" aria-hidden="true" />
          </Link>
          <Link
            href="/login"
            className="flex min-h-11 items-center rounded-2xl px-3 text-[var(--as-ink-muted)] transition hover:bg-[var(--as-surface-soft)] hover:text-[var(--as-primary)]"
          >
            Login
          </Link>
        </nav>
        <div className="absolute bottom-5 left-4 right-4 rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-white/70 p-4 shadow-[var(--as-shadow-sm)]">
          <p className="as-kicker">Current release</p>
          <p className="mt-1 font-semibold text-[var(--as-ink)]">Field + Sentinel metadata</p>
          <p className="mt-2 text-sm text-[var(--as-ink-muted)]">
            Map-first workflow, no crop diagnosis claims.
          </p>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="as-topbar sticky top-0 z-30 lg:hidden">
          <div className="flex min-h-16 items-center justify-between px-4">
            <Link href="/farms" className="flex items-center gap-2 font-bold text-[var(--as-ink)]">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--as-primary)] text-xs text-white">
                AS
              </span>
              AgriScope
            </Link>
            <nav className="flex gap-3 text-sm font-semibold text-[var(--as-ink-muted)]">
              <Link href="/farms">Farms</Link>
              <Link href="/login">Login</Link>
            </nav>
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
