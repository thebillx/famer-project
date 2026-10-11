import * as THREE from './vendor.js';

export const SHOTS = [
  {p:0, name:'FROM ORBIT TO YOUR FIELD', thai:'จากวงโคจร ถึงแปลงจริง', text:'AgriScope เชื่อมข้อมูลดาวเทียมกับขอบเขตแปลง เพื่อช่วยวางแผนก่อนลงตรวจพื้นที่'},
  {p:.10, name:'EARTH OBSERVATION', thai:'ข้อมูลของโลก ในแต่ละช่วงเวลา', text:'ภาพ Sentinel-2 ต่างวันที่ช่วยให้ติดตามสัญญาณพืชพรรณในพื้นที่เดิม'},
  {p:.22, name:'MULTISPECTRAL INSTRUMENT', thai:'อ่านแสง เพื่อมองการเปลี่ยนแปลง', text:'แสงสีแดงและอินฟราเรดใกล้เป็นข้อมูลสำหรับคำนวณดัชนีพืชพรรณ NDVI'},
  {p:.36, name:'THAILAND', thai:'จากภาพโลก สู่พื้นที่ของคุณ', text:'เลือกขอบเขตในประเทศไทย แล้วติดตามข้อมูลเฉพาะพื้นที่ที่สนใจ'},
  {p:.46, name:'ATMOSPHERIC DESCENT', thai:'เข้าใกล้ แปลงที่สำคัญ', text:'การเดินทางนี้เป็นภาพจำลอง จากมุมมองระดับประเทศสู่พื้นที่เกษตร'},
  {p:.56, name:'YOUR FIELD BOUNDARY', thai:'เริ่มต้น จากขอบเขตที่ชัดเจน', text:'วาดขอบเขตแปลงของคุณ เพื่อใช้พื้นที่เดียวกันในการค้นหาและเปรียบเทียบข้อมูล'},
  {p:.65, name:'DATES AND QUALITY', thai:'ดูวันที่ ก่อนอ่านผล', text:'ข้อมูลต้องใช้ประเมินได้ทั้งสองช่วงเวลา หากข้อมูลไม่พอ ระบบจะบอกอย่างชัดเจน'},
  {p:.76, name:'CHANGE OVER TIME', thai:'เห็นสิ่งที่เปลี่ยน ในแปลงเดียวกัน', text:'เปรียบเทียบ NDVI ต่างวันที่บนพื้นที่ร่วมที่ใช้วัดได้ ตัวอย่างนี้เป็นข้อมูลจำลอง'},
  {p:.86, name:'INSPECTION EVIDENCE', thai:'ใช้หลักฐาน ช่วยวางแผนตรวจ', text:'พื้นที่ที่ค่า NDVI ลดลงช่วยชี้จุดให้ตรวจต่อ แต่ยังไม่ระบุสาเหตุจากดาวเทียมเพียงอย่างเดียว'},
  {p:.95, name:'AGRISCOPE WORKSPACE', thai:'เริ่มติดตาม แปลงของคุณ', text:'สร้างฟาร์ม วาดขอบเขต และกลับมาดูแนวโน้มในพื้นที่ทำงาน AgriScope'}
];

// Shared world: Earth radius 40, north-facing tangent at y=0; spacecraft at y=13.
// A single C1-continuous Hermite spline, not ten independent camera resets.
// Tangents at shared keys are identical in both adjoining segments.
export const CAMERA_KEYS = [
  {p:0, pos:[11,20.8,27], target:[-4.8,9,0], fov:46},
  {p:.10, pos:[7,15.5,10.8], target:[-2.1,13,0], fov:46},
  {p:.22, pos:[3,14.2,6.4], target:[0,13.15,1.2], fov:43},
  {p:.28, pos:[3.5,18,10.5], target:[0,9,0], fov:45},
  {p:.36, pos:[4,26,17], target:[0,-1,0], fov:48},
  {p:.46, pos:[3.5,12,9], target:[0,0,0], fov:48},
  {p:.56, pos:[3.6,5.7,7.6], target:[-.4,.05,0], fov:46},
  {p:.65, pos:[2.8,7,6.8], target:[-.8,.05,0], fov:45},
  {p:.76, pos:[1.5,9.5,5.8], target:[-.8,.05,0], fov:43},
  {p:.86, pos:[1.2,10,5.5], target:[-.8,.05,0], fov:43},
  {p:1, pos:[.6,10.8,5.2], target:[-.9,.05,0], fov:43}
];

export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
export function sampleCamera(p,aspect=1.6) {
  p=clamp(p); let i=0;
  while(i<CAMERA_KEYS.length-2 && p>CAMERA_KEYS[i+1].p) i++;
  const a=CAMERA_KEYS[i],b=CAMERA_KEYS[i+1],span=b.p-a.p,t=clamp((p-a.p)/span);
  function tangent(k,prop,c) {
    const l=CAMERA_KEYS[Math.max(0,k-1)],r=CAMERA_KEYS[Math.min(CAMERA_KEYS.length-1,k+1)];
    const lv=prop==='fov'?l.fov:l[prop][c],rv=prop==='fov'?r.fov:r[prop][c];
    return .65*(rv-lv)/(r.p-l.p);
  }
  function axis(prop,c) {
    const v0=prop==='fov'?a.fov:a[prop][c],v1=prop==='fov'?b.fov:b[prop][c];
    return (2*t**3-3*t*t+1)*v0+(t**3-2*t*t+t)*span*tangent(i,prop,c)+(-2*t**3+3*t*t)*v1+(t**3-t*t)*span*tangent(i+1,prop,c);
  }
  const position=new THREE.Vector3(...[0,1,2].map(c=>axis('pos',c)));
  const target=new THREE.Vector3(...[0,1,2].map(c=>axis('target',c)));
  // Smooth aspect-aware framing across the entire path, including progress .55.
  const portrait=1-smooth(.60,1.60,aspect);
  target.x+=portrait*5*(1-smooth(.05,.22,p));
  const scale=1+portrait*(.48-.20*smooth(.34,.58,p));
  position.sub(target).multiplyScalar(scale).add(target);
  return {position,target,fov:axis('fov',0)+portrait*6};
}
export function seededRandom(seed=41) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
