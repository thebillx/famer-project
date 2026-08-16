import styles from "../../app/landing.module.css";
import { sampleField } from "./landing-content";

export function FarmInsightPreview() {
  return (
    <figure className={styles.preview} aria-labelledby="preview-title">
      <div className={styles.previewTopbar}>
        <span className={styles.previewBrand}>
          <span aria-hidden="true" />
          AgriScope · แผนที่แปลง
        </span>
        <span className={styles.previewStatus}>ข้อมูลตัวอย่าง</span>
      </div>

      <div className={styles.previewBody}>
        <div className={styles.mapPanel}>
          <div className={styles.mapLabel}>
            <span>แปลงที่เลือก</span>
            <strong id="preview-title">{sampleField.farmName}</strong>
          </div>
          <svg
            className={styles.fieldMap}
            viewBox="0 0 560 390"
            role="img"
            aria-label="ภาพจำลองขอบเขตแปลงที่บันทึกไว้"
            preserveAspectRatio="xMidYMid slice"
          >
            <rect width="560" height="390" fill="#315b3b" />
            <path d="M-30 77 174-20l66 118L30 183Z" fill="#6f8954" />
            <path d="m190-15 235 1 24 135-218 28Z" fill="#4f773e" />
            <path d="m446-28 150 54-14 152-134-55Z" fill="#78905c" />
            <path d="M-28 185 194 104l42 137L11 310Z" fill="#879957" />
            <path d="m236 148 214-26 72 126-251 46Z" fill="#66854e" />
            <path d="m11 313 224-68 76 158H-25Z" fill="#53773e" />
            <path d="m273 296 253-49 67 153-288 6Z" fill="#7e9358" />
            <g fill="none" stroke="#c8d4aa" strokeOpacity=".35" strokeWidth="3">
              <path d="m-16 184 220-87 38 145L8 319" />
              <path d="m177-13 66 165 212-29 91 143" />
              <path d="M270 295 237 146" />
              <path d="m307 403-37-108 257-49" />
            </g>
            <path
              d="M167 91c49-31 136-21 184 16 47 36 59 114 27 164-35 55-123 72-182 42-60-30-85-109-58-166 8-19 17-38 29-56Z"
              fill="#b7d273"
              fillOpacity=".22"
              stroke="#f7f1ba"
              strokeWidth="5"
            />
            <path
              d="M181 113c42-25 112-17 151 13 39 31 49 94 23 136-29 45-100 58-149 34-49-25-70-89-48-136 7-16 14-32 23-47Z"
              fill="none"
              stroke="#d9e6a8"
              strokeDasharray="7 7"
              strokeWidth="2"
            />
          </svg>
          <div className={styles.boundaryNote}>
            <span>ขอบเขตที่บันทึกไว้</span>
            <strong>{sampleField.area}</strong>
          </div>
        </div>

        <div className={styles.previewRail} aria-label="รายละเอียดข้อมูลตัวอย่าง">
          <span className={styles.sampleBadge}>{sampleField.label}</span>
          <div className={styles.previewMetric}>
            <span>พื้นที่อ้างอิง</span>
            <strong>{sampleField.area}</strong>
          </div>
          <div className={styles.previewMetric}>
            <span>ภาพ Sentinel-2 ล่าสุด</span>
            <strong>{sampleField.acquisitionDate}</strong>
          </div>
          <div className={`${styles.previewMetric} ${styles.previewMetricAccent}`}>
            <span>เมฆปกคลุม</span>
            <strong>{sampleField.cloudCover}</strong>
            <small>ค่าจากเมทาดาทา</small>
          </div>
        </div>
      </div>
      <figcaption className={styles.previewCaption}>{sampleField.disclaimer}</figcaption>
    </figure>
  );
}
