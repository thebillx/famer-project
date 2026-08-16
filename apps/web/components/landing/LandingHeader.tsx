import Link from "next/link";
import styles from "../../app/landing.module.css";
import { landingNavItems } from "./landing-content";

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M24.8 6.5C16.9 6.7 10.2 10.2 7.7 16c-1.8 4.2.6 8.9 5.2 9.6 4.7.7 8.2-2.4 9-6.5.9-4.5-1.2-7.9 2.9-12.6Z" />
        <path d="M9.2 23.4c3.2-5.8 6.9-9.4 11.5-12.1M12.1 17.4c1.9.1 3.8.5 5.6 1.2M15.6 13.2c-.1 1.7.1 3.2.6 4.7" />
      </svg>
    </span>
  );
}

export function LandingHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.skipLink} href="#main-content">
        ข้ามไปยังเนื้อหา
      </a>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Link className={styles.brand} href="/" aria-label="AgriScope Thailand หน้าหลัก">
          <BrandMark />
          <span>
            <strong>AgriScope</strong>
            <small>THAILAND · FARM INTELLIGENCE</small>
          </span>
        </Link>

        <nav className={styles.headerNav} aria-label="เมนูหลัก">
          {landingNavItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link className={`${styles.button} ${styles.buttonQuiet}`} href="/login">
            เข้าสู่ระบบ
          </Link>
          <Link className={`${styles.button} ${styles.buttonPrimary} ${styles.headerPrimary}`} href="/login">
            เริ่มใช้งาน
          </Link>
        </div>
      </div>
    </header>
  );
}
