# Homepage Cinematic v1 Contract

Status: implementation contract for the owner-approved ten-scene homepage recovery.

## Source of truth

The narrative and beat values below are copied from:

- `apps/web/public/cinematic/timeline.js` at commit `a118c28140d513334263747cd3cefb5455d0eb51` (`a118c28`)
- `apps/web/components/cinematic/cinematic.css` at the same commit for landing scroll height

The contract distinguishes **10 narrative panels** from **19 motion beats**. A motion beat is choreography inside or at the boundary of a panel; it is not an additional scene.

## Exact source excerpt

```js
export const SHOTS = [
  {p:0, name:'FROM ORBIT TO YOUR FIELD', thai:'จากวงโคจร ถึงแปลงจริง', text:'AgriScope เชื่อมข้อมูลดาวเทียมกับขอบเขตแปลง เพื่อช่วยวางแผนก่อนลงตรวจพื้นที่'},
  {p:.10, name:'EARTH OBSERVATION', thai:'ข้อมูลของโลก ในแต่ละช่วงเวลา', text:'ภาพ Sentinel-2 ต่างวันที่ช่วยให้ติดตามสัญญาณพืชพรรณในพื้นที่เดิม'},
  {p:.22, name:'MULTISPECTRAL INSTRUMENT', thai:'อ่านแสง เพื่อมองการเปลี่ยนแปลง', text:'แสงสีแดงและอินฟราเรดใกล้เป็นข้อมูลสำหรับคำนวณดัชนีพืชพรรณ NDVI'},
  {p:.36, name:'THAILAND', thai:'จากภาพโลก สู่พื้นที่ของคุณ', text:'เลือกขอบเขตในประเทศไทย แล้วติดตามข้อมูลเฉพาะพื้นที่ที่สนใจ'},
  {p:.46, name:'ATMOSPHERIC DESCENT', thai:'เข้าใกล้ แปลงที่สำคัญ', text:'การเดินทางนี้เป็นภาพจำลอง จากมุมมองระดับประเทศสู่พื้นที่เกษตร'},
  {p:.56, name:'YOUR FIELD BOUNDARY', thai:'เริ่มต้น จากขอบเขตที่ชัดเจน', text:'วาดขอบเขตแปลงของคุณ เพื่อใช้พื้นที่เดียวกันในการค้นหาและเปรียบเทียบข้อมูล'},
  {p:.65, name:'DATES AND QUALITY', thai:'ดูวันที่ ก่อนอ่านผล', text:'ข้อมูลต้องใช้ประเมินได้ทั้งสองช่วงเวลา หากข้อมูลไม่พอ ระบบจะบอกอย่างชัดเจน'},
  {p:.76, name:'CHANGE OVER TIME', thai:'เห็นสิ่งที่เปลี่ยน ในแปลงเดียวกัน', text:'เปรียบเทียบ NDVI ต่างวันที่บนพื้นที่ร่วมที่ใช้วัดได้ ตัวอย่างนี้เป็นข้อมูลจำลอง'},
  {p:.86, name:'INSPECTION EVIDENCE', thai:'ผลนี้ควรตรวจแปลงต่อ', text:'ค่า NDVI ลดลงในแปลงตัวอย่าง จึงควรวางแผนตรวจต่อ แต่ข้อมูลดาวเทียมอย่างเดียวไม่บอกสาเหตุ'},
  {p:.95, name:'AGRISCOPE WORKSPACE', thai:'เริ่มติดตามแปลงของคุณ', text:'สร้างฟาร์มและวาดขอบเขต เพื่อเริ่มติดตามพื้นที่ของคุณใน AgriScope'}
];

export const BEATS = [
 ['earth-limb',0],['approach',.045],['flyby',.095],['chase',.135],
 ['wing-traverse',.18],['payload',.22],['alignment',.265],['corridor',.30],
 ['departure',.33],['thailand',.36],['multispectral',.39],['regional-tile',.42],
 ['descent',.46],['field-approach',.51],['boundary',.56],
 ['dates-quality',.65],['ndvi',.76],['inspection-limits',.86],['workspace',.95]
].map(([id,p])=>({id,p}));
```

## Panel contract: 10 panels

| # | p | English name | Thai copy | User-visible intent | Beat range |
|---:|---:|---|---|---|---|
| 1 | 0.00 | FROM ORBIT TO YOUR FIELD | จากวงโคจร ถึงแปลงจริง | Establish the orbit-to-field promise and first orbital approach. | earth-limb → flyby |
| 2 | 0.10 | EARTH OBSERVATION | ข้อมูลของโลก ในแต่ละช่วงเวลา | Show repeated Earth observation and temporal coverage. | chase → wing-traverse |
| 3 | 0.22 | MULTISPECTRAL INSTRUMENT | อ่านแสง เพื่อมองการเปลี่ยนแปลง | Explain the instrument/payload and spectral signal. | payload → departure |
| 4 | 0.36 | THAILAND | จากภาพโลก สู่พื้นที่ของคุณ | Transition from orbital view to Thailand and regional tile. | thailand → regional-tile |
| 5 | 0.46 | ATMOSPHERIC DESCENT | เข้าใกล้ แปลงที่สำคัญ | Descend from country/region toward agricultural land. This is explicitly a simulation. | descent → field-approach |
| 6 | 0.56 | YOUR FIELD BOUNDARY | เริ่มต้น จากขอบเขตที่ชัดเจน | Establish the field boundary used for search and comparison. | boundary |
| 7 | 0.65 | DATES AND QUALITY | ดูวันที่ ก่อนอ่านผล | Explain date pairing and data quality/assessability. | dates-quality |
| 8 | 0.76 | CHANGE OVER TIME | เห็นสิ่งที่เปลี่ยน ในแปลงเดียวกัน | Show NDVI comparison between dates. This is explicitly sample/demo data. | ndvi |
| 9 | 0.86 | INSPECTION EVIDENCE | ผลนี้ควรตรวจแปลงต่อ | Explain that a change can guide inspection, but satellite data alone does not identify the cause. | inspection-limits |
| 10 | 0.95 | AGRISCOPE WORKSPACE | เริ่มติดตามแปลงของคุณ | Hand off truthfully to workspace creation and field tracking. | workspace |

Panel 2 begins at `p=.10`, between `flyby (.095)` and `chase (.135)`. Panel transitions must not be implemented as a lookup that only fires when a beat ID changes.

## Beat-to-panel mapping: 19 motion beats

| Beat | p | Covering panel | Role |
|---|---:|---:|---|
| earth-limb | 0.000 | 1 | Opening Earth limb composition |
| approach | 0.045 | 1 | Orbital approach |
| flyby | 0.095 | 1 | Flyby composition immediately before panel 2 |
| chase | 0.135 | 2 | Follow/observation continuation |
| wing-traverse | 0.180 | 2 | Spacecraft wing traversal |
| payload | 0.220 | 3 | Instrument/payload reveal |
| alignment | 0.265 | 3 | Payload alignment |
| corridor | 0.300 | 3 | Orbital corridor passage |
| departure | 0.330 | 3 | Departure toward geographic target; panel 4 does not begin until `p=.36` |
| thailand | 0.360 | 4 | Thailand focus |
| multispectral | 0.390 | 4 | Spectral/data layer cue |
| regional-tile | 0.420 | 4 | Regional tile transition |
| descent | 0.460 | 5 | Atmospheric descent begins |
| field-approach | 0.510 | 5 | Approach to agricultural field |
| boundary | 0.560 | 6 | Field boundary becomes the primary object |
| dates-quality | 0.650 | 7 | Date/quality panel |
| ndvi | 0.760 | 8 | NDVI comparison |
| inspection-limits | 0.860 | 9 | Inspection evidence and limitation |
| workspace | 0.950 | 10 | Workspace handoff |

## Camera and scroll contract

The source camera path has 17 keys. They are **not** required to equal the 19 beat checkpoints; the camera sampler interpolates between keys. Values below are copied from `timeline.js@a118c28`; `pos` is camera position, `target` is look target, `fov` is degrees, and `roll` is radians.

The four beats without an exact camera key use interpolation:

- `multispectral (.39)`: between camera keys `.36` and `.40`
- `regional-tile (.42)`: between camera keys `.40` and `.46`
- `field-approach (.51)`: between camera keys `.46` and `.56`
- `workspace (.95)`: between camera keys `.86` and `1.00`

The `.40` key is an intentional regional/data transition key inside panel 4; it is not an extra beat. The `1.00` key is the terminal camera key for the final panel hold; it is not an extra scene.

| p | position | target | fov | roll |
|---:|---|---|---:|---:|
| 0.000 | [14,12,57] | [-9,-17,0] | 46 | -0.14 |
| 0.045 | [10,17,32] | [5,9,-4] | 46 | -0.10 |
| 0.095 | [-5,21,12] | [0,12.2,0] | 48 | 0.09 |
| 0.135 | [3,18.5,9] | [0,12.8,0] | 46 | 0.14 |
| 0.180 | [4.7,11.2,4.5] | [0.4,13,0] | 49 | 0.07 |
| 0.220 | [2.7,14.1,5.8] | [0,13.1,1] | 43 | 0 |
| 0.265 | [3.8,17,7] | [0,12.8,0] | 46 | -0.08 |
| 0.300 | [5.8,21,11] | [1,7,-1] | 48 | -0.12 |
| 0.330 | [6,25,16] | [0,1,0] | 48 | -0.08 |
| 0.360 | [4,26,17] | [0,-1,0] | 48 | 0 |
| 0.400 | [4,21,14] | [0,0,0] | 48 | 0.035 |
| 0.460 | [3.5,12,9] | [0,0,0] | 48 | 0 |
| 0.560 | [3.6,5.7,7.6] | [-0.4,0.05,0] | 46 | 0 |
| 0.650 | [2.8,7,6.8] | [-0.8,0.05,0] | 45 | 0 |
| 0.760 | [1.5,9.5,5.8] | [-0.8,0.05,0] | 43 | 0 |
| 0.860 | [1.2,10,5.5] | [-0.8,0.05,0] | 43 | 0 |
| 1.000 | [0.6,10.8,5.2] | [-0.9,0.05,0] | 43 | 0 |

Landing scroll height at the source commit is `750svh` (`.cinematic #journey`). The source also contains a mobile override of `600svh`; the lab has separate heights and is not the landing contract. The recovery must preserve the landing contract unless a new responsive decision is explicitly reviewed.

### Progress calculation and viewport changes

The source does **not** calculate `p` directly from the numeric `svh` value. In `main.js@a118c28`, progress is normalized from measured pixels:

```js
const range = () => Math.max(1, $('journey').offsetHeight - innerHeight);
const getProgress = () => clamp((scrollY - root.offsetTop) / range());
```

The 750svh/600svh values determine layout height, while `offsetHeight - innerHeight` determines the runtime scroll range. A recovery must retain measured pixels but must not allow an address-bar resize to change `p` at the same user-visible point during an active scroll. The implementation must snapshot the current normalized progress before a viewport resize, debounce the resize, recompute the new range, and re-anchor the scroll position to the snapshot progress before resuming camera/panel updates. Orientation changes may intentionally re-anchor; ordinary iOS address-bar collapse must not cause a visible scene jump.

### Final hold

The `.95 → 1.0` interval is intentional. Panel 10 begins at `p=.95`; the final 5% holds the `AGRISCOPE WORKSPACE` narrative, CTA, final camera framing, and readable handoff long enough for the user to act. It is not an omitted scene or an unimplemented transition.

## Long intervals without a new beat

These intervals are deliberate reading/transition candidates, not permission for a blank or frozen experience:

- `.56 → .65`: field boundary remains visible while the user reads the boundary explanation before dates/quality.
- `.65 → .76`: dates and quality remain readable before the comparison appears.
- `.76 → .86`: comparison remains visible while the user reads the change-over-time explanation.
- `.86 → .95`: inspection limitation remains visible before the workspace handoff.

Implementation must provide continuous camera/panel state, visible narrative, and no blank frame throughout each interval. Any added micro-transition requires an update to this contract and review.

## Required disclaimers

1. Scene 5: `การเดินทางนี้เป็นภาพจำลอง` — the descent is a simulation.
2. Scene 8: `ตัวอย่างนี้เป็นข้อมูลจำลอง` — the comparison uses sample/demo data.
3. Scene 9: `ข้อมูลดาวเทียมอย่างเดียวไม่บอกสาเหตุ` — satellite data alone does not identify the cause.

These statements must remain in the rendered journey, static fallback, and accessible narrative path.

## Validation terminology

The current `main` baseline report's `28 position/focus/FOV boundaries` is not `19 beats + 17 camera keys`. It comes from the five-shot baseline test: `CAMERA_KEYS.slice(1,-1)` contains 6 interior camera-key checkpoints, plus the extra `.55` payload checkpoint, tested across 4 aspect ratios: `(6 + 1) × 4 = 28`. The 10-scene recovery must report its own beat/key coverage separately.

## Acceptance

- Contract reviewed against the source commit with no paraphrase-only values.
- Main-vs-PR19 implementation gap is recorded in the companion matrix issue.
- Any deviation requires a dated contract update and owner review before scene implementation proceeds.
