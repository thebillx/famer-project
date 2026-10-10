import * as THREE from './vendor.js';

export const SHOTS = [
  {p:0, name:'ORBITAL SILENCE', thai:'จากวงโคจร ถึงแปลงจริง', text:'มองเห็นความเปลี่ยนแปลงของแปลงเกษตร ผ่านภาพถ่ายดาวเทียม Sentinel-2'},
  {p:.10, name:'SOLAR WING', thai:'ทุกการเดินทาง เริ่มจากแสง', text:'พลังงานจากดวงอาทิตย์ ขับเคลื่อนภารกิจสำรวจโลก'},
  {p:.22, name:'SPACECRAFT REVEAL', thai:'อีกมุมมองของโลกใบเดิม', text:'ดาวเทียมสำรวจโลก เก็บภาพซ้ำอย่างต่อเนื่องเพื่อมองเห็นการเปลี่ยนแปลง'},
  {p:.34, name:'INSTRUMENT ORBIT', thai:'รายละเอียด ที่อยู่ไกลออกไป', text:'แสงที่สะท้อนจากพื้นผิว กลายเป็นข้อมูลสำหรับติดตามแปลงเกษตร'},
  {p:.46, name:'PAYLOAD INSPECTION', thai:'อ่านสัญญาณ จากหลายช่วงคลื่น', text:'แสงสีแดงและอินฟราเรดใกล้ ใช้คำนวณดัชนีพืชพรรณ NDVI'},
  {p:.57, name:'THAILAND LOCK', thai:'ประเทศไทย อยู่ในสายตา', text:'เชื่อมข้อมูลจากวงโคจร เข้ากับขอบเขตแปลงที่คุณกำหนด'},
  {p:.65, name:'OBSERVATION PATH', thai:'ตามแสง ลงสู่ผืนดิน', text:'จากภาพพื้นที่กว้าง สู่รายละเอียดของแปลงเกษตร'},
  {p:.75, name:'ATMOSPHERIC DESCENT', thai:'เข้าใกล้ สิ่งที่สำคัญ', text:'เมฆและคุณภาพภาพมีผลต่อข้อมูล ภาพที่ใช้ไม่ได้ควรถูกระบุอย่างชัดเจน'},
  {p:.86, name:'FIELD REVEAL', thai:'รู้ว่าตรงไหน ควรไปดู', text:'ติดตามแนวโน้มของแปลง เพื่อช่วยจัดลำดับการลงพื้นที่ตรวจสอบ'},
  {p:.95, name:'AGRISCOPE HANDOFF', thai:'เริ่มต้น ที่แปลงของคุณ', text:'ขอบเขตแปลง ภาพดาวเทียม และแนวโน้มพืชพรรณ ในมุมมองเดียว'}
];

// Shared world: Earth radius 40, north-facing tangent at y=0; spacecraft at y=13.
// A single C1-continuous Hermite spline, not ten independent camera resets.
// Tangents at shared keys are identical in both adjoining segments.
export const CAMERA_KEYS = [
  {p:0, pos:[13,24,34], target:[-7,9,0], fov:46},
  {p:.10, pos:[7.8,15.5,9], target:[-2.8,13,0], fov:46},
  {p:.18, pos:[8,15.8,13], target:[-2,13,0], fov:47},
  {p:.27, pos:[8,19,23], target:[-3,12.5,0], fov:43},
  {p:.36, pos:[7,16,10], target:[0,13,0], fov:43},
  {p:.46, pos:[2.4,13.8,5.8], target:[0,13.2,1.5], fov:39},
  {p:.51, pos:[1.7,14,5.4], target:[0,12.8,1.5], fov:42},
  {p:.59, pos:[2,17,8], target:[0,.2,0], fov:48},
  {p:.67, pos:[2,11,6], target:[0,0,0], fov:48},
  {p:.76, pos:[3.5,5.8,7], target:[0,0,0], fov:48},
  {p:.86, pos:[5,3.8,7], target:[0,.05,0], fov:46},
  {p:1, pos:[4.5,4.8,6.7], target:[-1,.05,0], fov:46}
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
  const scale=1+portrait*(.60-.30*smooth(.48,.74,p));
  position.sub(target).multiplyScalar(scale).add(target);
  return {position,target,fov:axis('fov',0)+portrait*6};
}
export function seededRandom(seed=41) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
