import type { Metadata } from "next";
import { CinematicJourney } from "../../components/cinematic/CinematicJourney";

export const metadata: Metadata = {
  title: "Cinematic Lab | AgriScope Thailand",
  description: "ต้นแบบการเดินทางแบบโต้ตอบจากวงโคจรสู่แปลงสาธิต AgriScope",
};

export default function CinematicLabPage() {
  return (
    <main id="main-content">
      <CinematicJourney mode="lab" />
    </main>
  );
}
