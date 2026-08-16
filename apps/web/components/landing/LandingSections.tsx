import Link from "next/link";
import styles from "../../app/landing.module.css";
import {
  featureItems,
  howItWorksSteps,
  landingNavItems,
  sampleField,
  trustPrinciples,
  type LandingFeature,
} from "./landing-content";

function FeatureIcon({ icon }: Pick<LandingFeature, "icon">) {
  const paths: Record<LandingFeature["icon"], React.ReactNode> = {
    boundary: <path d="m5 8 5-3 9 3v11l-9 3-5-3V8Zm5-3v17m9-14-9 4-5-4" />,
    area: <path d="M5 5h6v6H5V5Zm8 8h6v6h-6v-6ZM11 8h5v5M8 11v5h5" />,
    satellite: (
      <>
        <path d="m8 6 10 10m-8 2 8-8M5 13l6-6 6 6-6 6-6-6Z" />
        <path d="M16 5c1.8.4 3.2 1.8 3.6 3.6M18 3c2.7.6 4.8 2.7 5.4 5.4" />
      </>
    ),
    organization: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-1a2.5 2.5 0 1 0 0-5" />
        <path d="M3.5 20v-2.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V20M15 13h1.5a4 4 0 0 1 4 4v2" />
      </>
    ),
  };

  return (
    <span className={styles.featureIcon} aria-hidden="true">
      <svg viewBox="0 0 26 26" focusable="false">
        {paths[icon]}
      </svg>
    </span>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  headingId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  headingId: string;
}) {
  return (
    <div className={styles.sectionIntro}>
      <p className={styles.sectionEyebrow}>{eyebrow}</p>
      <h2 id={headingId}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function LandingSections() {
  return (
    <>
      <section className={styles.section} id="how-it-works" aria-labelledby="how-title">
        <div className={styles.container}>
          <SectionIntro
            headingId="how-title"
            eyebrow="เริ่มต้นอย่างเป็นขั้นตอน"
            title="จากขอบเขตแปลง สู่ข้อมูลที่พร้อมตรวจสอบ"
            description="ขั้นตอนเรียบง่ายที่ทำให้สมาชิกในองค์กรใช้ข้อมูลแปลงชุดเดียวกัน และรู้ที่มาของข้อมูลดาวเทียมที่กำลังดู"
          />
          <ol className={styles.stepsGrid}>
            {howItWorksSteps.map((step) => (
              <li key={step.number} className={styles.stepCard}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.featuresSection}`} id="features" aria-labelledby="features-title">
        <div className={styles.container}>
          <SectionIntro
            headingId="features-title"
            eyebrow="ความสามารถที่มีอยู่วันนี้"
            title="พื้นฐานข้อมูลแปลงที่ตรวจสอบย้อนกลับได้"
            description="AgriScope เชื่อมข้อมูลขอบเขต พื้นที่ และรายการภาพดาวเทียมล่าสุด โดยไม่แต่งเติมข้อสรุปที่ข้อมูลยังรองรับไม่ได้"
          />
          <div className={styles.featuresGrid}>
            {featureItems.map((feature) => (
              <article key={feature.title} className={styles.featureCard}>
                <FeatureIcon icon={feature.icon} />
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.insightSection}`} id="farm-insight" aria-labelledby="insight-title">
        <div className={`${styles.container} ${styles.insightGrid}`}>
          <div className={styles.insightCopy}>
            <p className={styles.sectionEyebrow}>FARM INSIGHT</p>
            <h2 id="insight-title">ดูข้อเท็จจริงสำคัญของแปลงในที่เดียว</h2>
            <p>
              หน้าฟาร์มแสดงขอบเขตที่บันทึกไว้ พื้นที่อ้างอิง และเมทาดาทาภาพล่าสุด เพื่อช่วยตัดสินใจว่าควรตรวจข้อมูลต่อหรือออกไปดูแปลงจริง
            </p>
            <ul>
              <li>ชื่อฟาร์มและขอบเขตแปลงที่องค์กรบันทึก</li>
              <li>วันที่ได้มาของภาพและรหัสรายการ Sentinel-2</li>
              <li>ข้อมูลเมฆปกคลุมเพื่อพิจารณาคุณภาพเบื้องต้น</li>
            </ul>
          </div>

          <div className={styles.insightCard} aria-label="สรุปข้อมูลแปลงตัวอย่าง">
            <div className={styles.insightCardHeader}>
              <div>
                <span>{sampleField.label}</span>
                <h3>{sampleField.farmName}</h3>
              </div>
              <span className={styles.insightDot} aria-hidden="true" />
            </div>
            <dl className={styles.insightMetrics}>
              <div>
                <dt>พื้นที่อ้างอิง</dt>
                <dd>{sampleField.area}</dd>
              </div>
              <div>
                <dt>ภาพล่าสุด</dt>
                <dd>{sampleField.acquisitionDate}</dd>
              </div>
              <div>
                <dt>เมฆปกคลุม</dt>
                <dd>{sampleField.cloudCover}</dd>
              </div>
            </dl>
            <p className={styles.insightSource}>{sampleField.source}</p>
            <p className={styles.insightDisclaimer}>{sampleField.disclaimer}</p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.trustSection}`} id="trust" aria-labelledby="trust-title">
        <div className={styles.container}>
          <SectionIntro
            headingId="trust-title"
            eyebrow="ความน่าเชื่อถือและความปลอดภัย"
            title="ข้อมูลที่ดี ต้องบอกทั้งสิ่งที่รู้และยังไม่รู้"
            description="AgriScope ใช้ภาษาที่ระมัดระวัง แยกข้อมูลแต่ละองค์กร และวางการตรวจภาคสนามไว้เป็นส่วนสำคัญของการตัดสินใจ"
          />
          <div className={styles.trustGrid}>
            {trustPrinciples.map((principle, index) => (
              <article className={styles.trustCard} key={principle.title}>
                <span aria-hidden="true">0{index + 1}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
          <aside className={styles.attribution} aria-label="ที่มาข้อมูลดาวเทียม">
            <strong>ที่มาข้อมูลดาวเทียม</strong>
            <p>
              เมทาดาทาที่กล่าวถึงมาจาก Sentinel-2 Level-2A ผ่าน Copernicus Data Space Ecosystem โดย Sentinel-2 เป็นส่วนหนึ่งของโครงการ Copernicus ของสหภาพยุโรป
            </p>
          </aside>
        </div>
      </section>

      <section className={styles.ctaSection} aria-labelledby="cta-title">
        <div className={`${styles.container} ${styles.ctaPanel}`}>
          <div>
            <p className={styles.sectionEyebrow}>พร้อมเริ่มจัดระเบียบข้อมูลแปลงหรือยัง</p>
            <h2 id="cta-title">เริ่มจากขอบเขตที่ชัดเจน แล้วค่อยดูข้อมูลล่าสุด</h2>
          </div>
          <div className={styles.ctaActions}>
            <Link className={`${styles.button} ${styles.buttonLight} ${styles.buttonLarge}`} href="/login">
              สร้างบัญชีหรือเข้าสู่ระบบ
            </Link>
            <a className={`${styles.button} ${styles.buttonOnDark} ${styles.buttonLarge}`} href="#how-it-works">
              ดูวิธีใช้งานอีกครั้ง
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div>
          <p className={styles.footerBrand}>AgriScope Thailand</p>
          <p>ข้อมูลดาวเทียมเพื่อช่วยวางแผนตรวจแปลง ไม่ใช่การวินิจฉัยสภาพพืช</p>
        </div>
        <nav aria-label="เมนูส่วนท้าย">
          {landingNavItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <p className={styles.footerNote}>© 2026 AgriScope Thailand</p>
      </div>
    </footer>
  );
}
