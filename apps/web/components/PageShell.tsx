import Link from "next/link";
import type React from "react";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="border-b border-[#d7decc] bg-[#173f35] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/farms" className="text-lg font-semibold">
            AgriScope Thailand
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/farms">Farms</Link>
            <Link href="/login">Login</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </main>
  );
}
