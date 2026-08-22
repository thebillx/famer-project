import styles from "../../app/landing.module.css";
import { sampleField } from "./landing-content";

export function FarmInsightPreview() {
  return (
    <figure className={styles.preview} aria-labelledby="preview-title">
      <div className={styles.previewTopbar}>
        <span className={styles.previewBrand}>
          <span aria-hidden="true" />
          AgriScope · แผนที่แปลงตัวอย่าง
        </span>
        <span className={styles.previewStatus}>ข้อมูลตัวอย่าง</span>
      </div>

      <div className={styles.previewBody}>
        <div className={styles.mapPanel}>
          <div className={styles.mapLabel}>
            <span>แปลงที่เลือก · SENTINEL-2</span>
            <strong id="preview-title">{sampleField.farmName}</strong>
          </div>
          <div className={styles.mapControls} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <svg
            className={styles.fieldMap}
            viewBox="0 0 560 430"
            role="img"
            aria-label="ภาพจำลองขอบเขตแปลงที่บันทึกไว้"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="field-a" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#21472f" />
                <stop offset=".46" stopColor="#426b3a" />
                <stop offset="1" stopColor="#849353" />
              </linearGradient>
              <linearGradient id="field-b" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#193e2c" />
                <stop offset=".58" stopColor="#537341" />
                <stop offset="1" stopColor="#9b9e5d" />
              </linearGradient>
              <linearGradient id="field-c" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#536e35" />
                <stop offset=".55" stopColor="#718547" />
                <stop offset="1" stopColor="#3f6738" />
              </linearGradient>
              <radialGradient id="terrain-light" cx="61%" cy="31%" r="74%">
                <stop offset="0" stopColor="#f6f1b3" stopOpacity=".2" />
                <stop offset=".48" stopColor="#a9bd72" stopOpacity=".05" />
                <stop offset="1" stopColor="#071e18" stopOpacity=".3" />
              </radialGradient>
              <radialGradient id="terrain-vignette" cx="52%" cy="48%" r="72%">
                <stop offset=".52" stopColor="#09251d" stopOpacity="0" />
                <stop offset="1" stopColor="#061b15" stopOpacity=".52" />
              </radialGradient>
              <linearGradient id="scan-sweep" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff8b4" stopOpacity="0" />
                <stop offset=".72" stopColor="#fff4a1" stopOpacity=".08" />
                <stop offset="1" stopColor="#fffbd0" stopOpacity=".55" />
              </linearGradient>
              <pattern id="crop-lines-a" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(17)">
                <path d="M0 1h10M0 5h10" stroke="#e3e5aa" strokeOpacity=".1" strokeWidth="1" />
              </pattern>
              <pattern id="crop-lines-b" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-13)">
                <path d="M0 1h9" stroke="#f0eab2" strokeOpacity=".12" strokeWidth="1.4" />
              </pattern>
              <pattern id="field-cells" width="42" height="42" patternUnits="userSpaceOnUse">
                <path d="M0 0h42v42H0Z" fill="none" stroke="#dce5ae" strokeOpacity=".055" />
              </pattern>
              <filter id="aerial-grain" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency=".32 .09" numOctaves="2" seed="17" result="grain" />
                <feColorMatrix
                  in="grain"
                  type="matrix"
                  values=".55 0 0 0 .05  0 .7 0 0 .08  0 0 .4 0 .03  0 0 0 .28 0"
                  result="tinted-grain"
                />
                <feBlend in="SourceGraphic" in2="tinted-grain" mode="soft-light" />
              </filter>
              <filter id="boundary-glow" x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="5" result="blurred" />
                <feFlood floodColor="#fff2a6" floodOpacity=".52" result="glow-color" />
                <feComposite in="glow-color" in2="blurred" operator="in" result="soft-glow" />
                <feMerge>
                  <feMergeNode in="soft-glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="560" height="430" fill="#173b2b" />
            <g aria-hidden="true">
              <path d="M-30 58 220-20l46 150L24 188Z" fill="url(#field-a)" />
              <path d="m218-25 250 10 34 155-238-10Z" fill="#376638" />
              <path d="m468-18 125 32-14 183-78-58Z" fill="#789052" />
              <path d="M-22 188 264 130l-18 168L4 339Z" fill="url(#field-c)" />
              <path d="m264 130 237 9 45 138-300 21Z" fill="url(#field-b)" />
              <path d="m4 339 242-41 85 145H-20Z" fill="#426b37" />
              <path d="m246 298 300-21 36 166H331Z" fill="#7b8f51" />
            </g>
            <g className={styles.aerialTexture} data-map-layer="aerial-texture" aria-hidden="true">
              <path d="M-30 58 220-20l46 150L24 188Z" fill="url(#crop-lines-a)" />
              <path d="M-22 188 264 130l-18 168L4 339Z" fill="url(#crop-lines-b)" />
              <path d="m264 130 237 9 45 138-300 21Z" fill="url(#crop-lines-a)" />
              <path d="m4 339 242-41 85 145H-20Z" fill="url(#crop-lines-b)" />
              <rect width="560" height="430" fill="url(#field-cells)" />
              <rect width="560" height="430" fill="#718554" opacity=".18" filter="url(#aerial-grain)" />
            </g>
            <g fill="none" stroke="#e4e7b8" strokeOpacity=".27" strokeWidth="3" aria-hidden="true">
              <path d="M-20 190 264 127l-19 172L3 340" />
              <path d="M219-20 264 130l237 9 48 140" />
              <path d="m247 299 299-22" />
              <path d="M77-6 101 170 79 331 121 442" strokeOpacity=".14" strokeWidth="7" />
            </g>
            <rect width="560" height="430" fill="url(#terrain-light)" aria-hidden="true" />
            <rect width="560" height="430" fill="url(#terrain-vignette)" aria-hidden="true" />
            <g className={styles.mapScan} data-testid="illustrative-map-scan" aria-hidden="true">
              <path d="M292 221 278 82a140 140 0 0 1 125 57Z" fill="url(#scan-sweep)" />
              <path d="M292 221 403 139" fill="none" stroke="#fff9bd" strokeOpacity=".52" strokeWidth="2" />
            </g>
            <g data-map-layer="boundary-radar" filter="url(#boundary-glow)" aria-hidden="true">
              <circle cx="292" cy="221" r="128" fill="#dce67c" fillOpacity=".065" stroke="#fff2a3" strokeWidth="4" />
              <circle cx="292" cy="221" r="94" fill="#d8e27b" fillOpacity=".035" stroke="#ece9a8" strokeDasharray="8 8" strokeWidth="2.2" />
              <circle cx="292" cy="221" r="58" fill="none" stroke="#f0e9a4" strokeDasharray="3 9" strokeOpacity=".58" strokeWidth="1.4" />
              <circle cx="292" cy="221" r="4" fill="#fff7b6" />
              <path d="M292 92a129 129 0 0 1 119 79" fill="none" stroke="#fffbd0" strokeWidth="2" strokeLinecap="round" />
            </g>
          </svg>
          <div className={styles.mapMeta}>
            <span>ภาพล่าสุด</span>
            <strong>{sampleField.acquisitionDate}</strong>
            <i aria-hidden="true" />
          </div>
          <div className={styles.boundaryNote}>
            <span>ขอบเขตตัวอย่าง</span>
            <strong>{sampleField.area}</strong>
          </div>
        </div>

        <div className={styles.previewRail} aria-label="รายละเอียดข้อมูลตัวอย่าง">
          <span className={styles.sampleBadge}>{sampleField.label}</span>
          <div className={styles.previewMetric}>
            <span>พื้นที่อ้างอิง</span>
            <strong>{sampleField.area}</strong>
          </div>
          <div className={`${styles.previewMetric} ${styles.previewMetricStrong}`}>
            <span>ภาพล่าสุด</span>
            <strong>{sampleField.acquisitionDate}</strong>
          </div>
          <div className={`${styles.previewMetric} ${styles.previewMetricWarm}`}>
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
