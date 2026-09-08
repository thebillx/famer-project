"use client";

import Link from "next/link";
import type React from "react";
import styles from "./map-workspace.module.css";

export function MapWorkspaceShell({
  children,
  accountLabel = "บัญชีของฉัน",
}: {
  children: React.ReactNode;
  accountLabel?: string;
}) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">ข้ามไปยังพื้นที่ทำงาน</a>
      <header className={styles.header}>
        <Link href="/farms" className={styles.brand} aria-label="AgriScope พื้นที่ทำงานแผนที่">
          <span className={styles.brandMark} aria-hidden="true">⌁</span>
          <span className={styles.brandText}><strong>AgriScope</strong><small>พื้นที่ทำงานแผนที่</small></span>
        </Link>
        <nav className={styles.nav} aria-label="เมนูพื้นที่ทำงาน"><Link href="/farms">ฟาร์ม</Link></nav>
        <div className={styles.account} role="status" aria-label={`บัญชีที่กำลังใช้งาน ${accountLabel}`}><span className={styles.accountDot} aria-hidden="true" />{accountLabel}</div>
      </header>
      <main id="main-content" className={styles.main} tabIndex={-1}>{children}</main>
    </div>
  );
}

export { styles as mapWorkspaceStyles };
