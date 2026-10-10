import type { Metadata } from "next";
import { CinematicJourney } from "../components/cinematic/CinematicJourney";
import { LandingFooter, LandingSections } from "../components/landing/LandingSections";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "AgriScope Thailand | จากวงโคจรถึงแปลงจริง",
  description: "มองเห็นความเปลี่ยนแปลงของแปลงเกษตร ผ่านภาพถ่ายดาวเทียม Sentinel-2 เพื่อช่วยจัดลำดับการลงพื้นที่ตรวจสอบ",
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      <main id="main-content">
        <CinematicJourney />
        <LandingSections />
      </main>
      <LandingFooter />
    </div>
  );
}
