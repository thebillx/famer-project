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
  {p:.86, name:'INSPECTION EVIDENCE', thai:'ผลนี้ควรตรวจแปลงต่อ', text:'ค่า NDVI ลดลงในแปลงตัวอย่าง จึงควรวางแผนตรวจต่อ แต่ข้อมูลดาวเทียมอย่างเดียวไม่บอกสาเหตุ'},
  {p:.95, name:'AGRISCOPE WORKSPACE', thai:'เริ่มติดตามแปลงของคุณ', text:'สร้างฟาร์มและวาดขอบเขต เพื่อเริ่มติดตามพื้นที่ของคุณใน AgriScope'}
];

// Visual beats are finer than the product chapters. The product/assessment
// checkpoints remain stable while the orbital approach has its own choreography.
export const BEATS = [
 ['earth-limb',0],['approach',.045],['flyby',.095],['chase',.135],
 ['wing-traverse',.18],['payload',.22],['alignment',.265],['corridor',.30],
 ['departure',.33],['thailand',.36],['multispectral',.39],['regional-tile',.42],
 ['descent',.46],['field-approach',.51],['boundary',.56],
 ['dates-quality',.65],['ndvi',.76],['inspection-limits',.86],['workspace',.95]
].map(([id,p])=>({id,p}));

// A shared C1 Hermite path; roll uses the same interpolation as focus and FOV.
// Coordinates stay in the existing Earth/tangent world. No key resets a camera.
export const CAMERA_KEYS = [
 {p:0,pos:[14,12,57],target:[-9,-17,0],fov:46,roll:-.14},
 {p:.045,pos:[10,17,32],target:[5,9,-4],fov:46,roll:-.10},
 {p:.095,pos:[-5,21,12],target:[0,12.2,0],fov:48,roll:.09},
 {p:.135,pos:[3,18.5,9],target:[0,12.8,0],fov:46,roll:.14},
 {p:.18,pos:[4.7,11.2,4.5],target:[.4,13,0],fov:49,roll:.07},
 {p:.22,pos:[2.7,14.1,5.8],target:[0,13.1,1],fov:43,roll:0},
 {p:.265,pos:[3.8,17,7],target:[0,12.8,0],fov:46,roll:-.08},
 {p:.30,pos:[5.8,21,11],target:[1,7,-1],fov:48,roll:-.12},
 {p:.33,pos:[6,25,16],target:[0,1,0],fov:48,roll:-.08},
 {p:.36,pos:[4,26,17],target:[0,-1,0],fov:48,roll:0},
 {p:.40,pos:[4,21,14],target:[0,0,0],fov:48,roll:.035},
 {p:.46,pos:[3.5,12,9],target:[0,0,0],fov:48,roll:0},
 {p:.56,pos:[3.6,5.7,7.6],target:[-.4,.05,0],fov:46,roll:0},
 {p:.65,pos:[2.8,7,6.8],target:[-.8,.05,0],fov:45,roll:0},
 {p:.76,pos:[1.5,9.5,5.8],target:[-.8,.05,0],fov:43,roll:0},
 {p:.86,pos:[1.2,10,5.5],target:[-.8,.05,0],fov:43,roll:0},
 {p:1,pos:[.6,10.8,5.2],target:[-.9,.05,0],fov:43,roll:0}
];

// The craft approaches, holds for the flyby, then slews toward the tangent
// destination. Absolute progress also drives the deployment, including reverse.
export function sampleSpacecraft(p) {
 const arrival=1-smooth(0,.095,p),departure=smooth(.265,.38,p);
 const position=new THREE.Vector3(19*arrival+9*departure,13+4*arrival+2*departure,-18*arrival-6*departure);
 const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.12,-.22,-.12));
 const aim=new THREE.Vector3(0,.12,0).sub(position).normalize();
 const nadir=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),aim);
 quaternion.slerp(nadir,smooth(.235,.30,p));
 return {position,quaternion,deployment:smooth(.20,.27,p),activation:smooth(.245,.29,p)};
}

export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
export function sampleCamera(p,aspect=1.6) {
  p=clamp(p); let i=0;
  while(i<CAMERA_KEYS.length-2 && p>CAMERA_KEYS[i+1].p) i++;
  const a=CAMERA_KEYS[i],b=CAMERA_KEYS[i+1],span=b.p-a.p,t=clamp((p-a.p)/span);
  function tangent(k,prop,c) {
    const l=CAMERA_KEYS[Math.max(0,k-1)],r=CAMERA_KEYS[Math.min(CAMERA_KEYS.length-1,k+1)];
    const lv=typeof l[prop]==='number'?l[prop]:l[prop][c],rv=typeof r[prop]==='number'?r[prop]:r[prop][c];
    return .65*(rv-lv)/(r.p-l.p);
  }
  function axis(prop,c) {
    const v0=typeof a[prop]==='number'?a[prop]:a[prop][c],v1=typeof b[prop]==='number'?b[prop]:b[prop][c];
    return (2*t**3-3*t*t+1)*v0+(t**3-2*t*t+t)*span*tangent(i,prop,c)+(-2*t**3+3*t*t)*v1+(t**3-t*t)*span*tangent(i+1,prop,c);
  }
  const position=new THREE.Vector3(...[0,1,2].map(c=>axis('pos',c)));
  const target=new THREE.Vector3(...[0,1,2].map(c=>axis('target',c)));
  // Smooth aspect-aware framing across the entire path, including progress .55.
  const portrait=1-smooth(.60,1.60,aspect);
  target.x+=portrait*2*(1-smooth(.025,.095,p));
  const scale=1+portrait*(.48-.20*smooth(.34,.58,p));
  position.sub(target).multiplyScalar(scale).add(target);
  return {position,target,fov:axis('fov',0)+portrait*6,roll:axis('roll',0)*(1-.5*portrait)};
}
export function seededRandom(seed=41) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
