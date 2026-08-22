export type LandingNavItem = {
  readonly label: string;
  readonly href: `#${string}`;
};

export type LandingStep = {
  readonly number: string;
  readonly title: string;
  readonly description: string;
};

export type LandingFeature = {
  readonly icon: "boundary" | "area" | "satellite" | "organization";
  readonly title: string;
  readonly description: string;
};

export const landingNavItems: readonly LandingNavItem[] = [
  { label: "วิธีใช้งาน", href: "#how-it-works" },
  { label: "ความสามารถ", href: "#features" },
  { label: "ข้อมูลแปลง", href: "#farm-insight" },
  { label: "ความน่าเชื่อถือ", href: "#trust" },
];

export const heroContent = {
  eyebrow: "ข้อมูลดาวเทียมเพื่อเกษตรไทย",
  titleLines: ["เห็นข้อมูลแปลงชัดขึ้น", "ก่อนออกไปดูพื้นที่จริง"],
  description:
    "ติดตามข้อมูลแปลงจากภาพดาวเทียม พร้อมขอบเขตและเมทาดาทาที่ตรวจสอบได้ เพื่อช่วยวางแผนก่อนลงพื้นที่จริง",
  facts: ["ข้อมูลแปลงแยกตามองค์กร", "ใช้ถ้อยคำที่เน้นการตรวจภาคสนาม"],
} as const;

export const howItWorksSteps: readonly LandingStep[] = [
  {
    number: "01",
    title: "บันทึกขอบเขตแปลง",
    description: "สร้างฟาร์ม วาดรูปแปลงบนแผนที่ และเก็บขอบเขตไว้เป็นข้อมูลอ้างอิงขององค์กร",
  },
  {
    number: "02",
    title: "ค้นหาภาพล่าสุด",
    description: "ค้นหาเมทาดาทาภาพ Sentinel-2 Level-2A ล่าสุดที่ครอบคลุมขอบเขตแปลงที่บันทึกไว้",
  },
  {
    number: "03",
    title: "พิจารณาก่อนลงพื้นที่",
    description: "ดูวันถ่ายภาพและเมฆปกคลุม แล้วใช้ข้อมูลเป็นส่วนประกอบในการวางแผนตรวจแปลงจริง",
  },
];

export const featureItems: readonly LandingFeature[] = [
  {
    icon: "boundary",
    title: "ขอบเขตแปลงที่บันทึกได้",
    description: "วาดและเก็บรูปแปลงเพื่อใช้เป็นขอบเขตเดียวกันระหว่างสมาชิกในองค์กร",
  },
  {
    icon: "area",
    title: "พื้นที่อ้างอิงจาก geometry",
    description: "พื้นที่แปลงคำนวณจากขอบเขตที่ระบบตรวจสอบและจัดเก็บฝั่งเซิร์ฟเวอร์",
  },
  {
    icon: "satellite",
    title: "เมทาดาทา Sentinel-2 ล่าสุด",
    description: "ดูวันถ่ายภาพ รหัสรายการ และเปอร์เซ็นต์เมฆปกคลุมจากรายการล่าสุดที่ค้นพบ",
  },
  {
    icon: "organization",
    title: "ข้อมูลแยกตามองค์กร",
    description: "การเข้าถึงฟาร์มและแปลงอยู่ภายใต้สมาชิกและสิทธิ์ของแต่ละองค์กร",
  },
];

export const sampleField = {
  label: "ตัวอย่างข้อมูล",
  farmName: "แปลงข้าวหอมมะลิ A",
  area: "12.8 ไร่*",
  acquisitionDate: "30 ก.ค. 2569*",
  cloudCover: "12.4%*",
  source: "Sentinel-2 Level-2A · Copernicus Data Space Ecosystem",
  disclaimer: "* ตัวเลขและชื่อแปลงทั้งหมดเป็นข้อมูลสมมติเพื่ออธิบายหน้าจอ",
} as const;

export const trustPrinciples = [
  {
    title: "ช่วยชี้ข้อมูล ไม่วินิจฉัย",
    description:
      "ข้อมูลดาวเทียมใช้ประกอบการตรวจแปลงภาคสนาม ไม่ยืนยันโรคพืช ศัตรูพืช การขาดธาตุอาหาร หรือการใช้สารเคมี",
  },
  {
    title: "คุณภาพไม่พอ ต้องบอกตรงไปตรงมา",
    description: "เมื่อข้อมูลมีคุณภาพไม่เพียงพอ ระบบต้องแสดงว่า “ข้อมูลไม่เพียงพอ” ไม่ใช่ “ไม่พบปัญหา”",
  },
  {
    title: "ตัวอย่างไม่ใช่ข้อมูลลูกค้า",
    description: "หน้าสาธารณะนี้ไม่อ่านข้อมูลผู้ใช้ พิกัดจริง ข้อมูลผู้เช่า หรือเรียก API ของระบบ",
  },
] as const;
