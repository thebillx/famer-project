import Link from "next/link";
import styles from "../../app/landing.module.css";
import { FarmInsightPreview } from "./FarmInsightPreview";
import { heroContent } from "./landing-content";

export function LandingHero() {
  return (
    <section className={styles.hero} aria-labelledby="landing-title">
      <div className={styles.heroOrbit} aria-hidden="true" />
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" />
            {heroContent.eyebrow}
          </p>
          <h1 id="landing-title">
            {heroContent.titleLines.map((line, index) => (
              <span key={line}>
                {line}
                {index === 0 ? " " : null}
              </span>
            ))}
          </h1>
          <p className={styles.heroDescription}>{heroContent.description}</p>

          <div className={styles.heroActions} aria-label="เริ่มต้นใช้งาน AgriScope">
            <Link
              aria-label="สมัครใช้งาน"
              className={`${styles.button} ${styles.buttonPrimary} ${styles.heroIconButton}`}
              href="/login"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 18.5V13m4.6 5.5V8.8m4.8 9.7V11m4.6 7.5V5.5" />
              </svg>
            </Link>
            <a
              aria-label="ดูตัวอย่างข้อมูล"
              className={`${styles.button} ${styles.buttonSecondary} ${styles.heroIconButton}`}
              href="#farm-insight"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="4.5" y="5.5" width="15" height="14" rx="2" />
                <path d="M8 3.8v3.4m8-3.4v3.4M4.5 9.5h15m-11 3.4h2.2m2.6 0h2.2m-7 3.2h2.2" />
              </svg>
            </a>
          </div>

          <ul className={styles.heroFacts} aria-label="หลักการของ AgriScope">
            {heroContent.facts.map((fact) => (
              <li key={fact}>
                <span aria-hidden="true">✓</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.heroPreview}>
          <FarmInsightPreview />
        </div>
      </div>
    </section>
  );
}
