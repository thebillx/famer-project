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
          <h1 id="landing-title">{heroContent.title}</h1>
          <p className={styles.heroDescription}>{heroContent.description}</p>

          <div className={styles.heroActions} aria-label="เริ่มต้นใช้งาน AgriScope">
            <Link className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonLarge}`} href="/login">
              สมัครใช้งาน
              <span aria-hidden="true">→</span>
            </Link>
            <a className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonLarge}`} href="#farm-insight">
              ดูตัวอย่างข้อมูล
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
