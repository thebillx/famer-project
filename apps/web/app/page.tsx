import type { Metadata } from "next";
import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingFooter, LandingSections } from "../components/landing/LandingSections";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "AgriScope Thailand | เข้าใจข้อมูลแปลงก่อนลงพื้นที่",
  description:
    "บันทึกขอบเขตแปลง ดูพื้นที่อ้างอิง และตรวจสอบเมทาดาทาภาพ Sentinel-2 ล่าสุด เพื่อช่วยวางแผนตรวจแปลงอย่างปลอดภัย",
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      <LandingHeader />
      <main id="main-content">
        <LandingHero />
        <LandingSections />
      </main>
      <LandingFooter />
    </div>
  );
}
