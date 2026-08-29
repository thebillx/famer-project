"use client";

import Link from "next/link";
import type React from "react";
import styles from "./map-workspace.module.css";

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M18.8 4.8c-6.2.2-11.5 3-13.2 7.7-1.3 3.5.8 7.1 4.5 7.5 3.6.4 6.4-2 6.8-5.4.5-3.6-1.3-6.1 1.9-9.8Z" />
        <path d="M7.2 18.4c2.4-4.3 5.3-7.1 8.8-9" />
      </svg>
    </span>
  );
}

export function MapWorkspaceShell({
  children,
  accountLabel = "บัญชีของฉัน"
}: {
  children: React.ReactNode;
  accountLabel?: string;
}) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        ข้ามไปยังพื้นที่ทำงาน
      </a>
      <header className={styles.header}>
        <Link href="/farms" className={styles.brand} aria-label="AgriScope พื้นที่ทำงานแผนที่">
          <BrandMark />
          <span className={styles.brandText}>
            <strong>AgriScope</strong>
            <small>พื้นที่ทำงานแผนที่</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="เมนูพื้นที่ทำงาน">
          <Link href="/farms" aria-current="page">ฟาร์ม</Link>
        </nav>
        <div className={styles.account} role="status" aria-label={`บัญชีที่กำลังใช้งาน ${accountLabel}`}>
          <span className={styles.accountDot} aria-hidden="true" />
          <span>{accountLabel}</span>
        </div>
      </header>
      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export { styles as mapWorkspaceStyles };
