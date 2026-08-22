"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type React from "react";

function BrandMark() {
  return (
    <span className="as-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M24.8 6.5C16.9 6.7 10.2 10.2 7.7 16c-1.8 4.2.6 8.9 5.2 9.6 4.7.7 8.2-2.4 9-6.5.9-4.5-1.2-7.9 2.9-12.6Z" />
        <path d="M9.2 23.4c3.2-5.8 6.9-9.4 11.5-12.1M12.1 17.4c1.9.1 3.8.5 5.6 1.2M15.6 13.2c-.1 1.7.1 3.2.6 4.7" />
      </svg>
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="as-app-brand" href="/farms" aria-label="AgriScope พื้นที่ทำงานฟาร์ม">
      <BrandMark />
      <span>
        <strong>AgriScope</strong>
        {compact ? null : <small>THAILAND · FARM INTELLIGENCE</small>}
      </span>
    </Link>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const farmsActive = pathname === "/farms" || pathname.startsWith("/farms/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };

    closeAtDesktop();
    desktop.addEventListener("change", closeAtDesktop);
    window.addEventListener("resize", closeAtDesktop);
    return () => {
      desktop.removeEventListener("change", closeAtDesktop);
      window.removeEventListener("resize", closeAtDesktop);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      requestAnimationFrame(() => menuToggleRef.current?.focus());
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="as-shell">
      <a className="as-skip-link" href="#main-content">
        ข้ามไปยังเนื้อหา
      </a>

      <header className="as-app-header">
        <Brand compact />
        <button
          ref={menuToggleRef}
          type="button"
          className="as-menu-toggle"
          aria-label={menuOpen ? "ปิดเมนูนำทาง" : "เปิดเมนูนำทาง"}
          aria-expanded={menuOpen}
          aria-controls="app-navigation-panel"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>

      <aside
        id="app-navigation-panel"
        className="as-sidebar"
        data-mobile-open={menuOpen ? "true" : "false"}
        aria-label="พื้นที่นำทางของแอป"
      >
        <div className="as-sidebar-brand">
          <Brand />
        </div>
        <nav className="as-app-nav" aria-label="เมนูหลัก">
          <Link
            href="/farms"
            className="as-app-nav-link"
            aria-current={farmsActive ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M4 20V9.5L12 4l8 5.5V20M8 20v-6h8v6M7 10h.01M17 10h.01" />
            </svg>
            <span>ฟาร์ม</span>
          </Link>
        </nav>
        <div className="as-sidebar-note">
          <p className="as-kicker">พื้นที่ทำงานภาคสนาม</p>
          <p>จัดเก็บขอบเขตแปลงและตรวจข้อมูลเมทาดาทา Sentinel-2 ตามคำขอ</p>
        </div>
      </aside>

      <main id="main-content" className="as-app-main" tabIndex={-1}>
        <div className="as-app-content">{children}</div>
      </main>
    </div>
  );
}
