import * as THREE from './vendor.js';

export const SHOTS = [
  {p:0, name:'ORBITAL SILENCE', thai:'จากวงโคจร ถึงแปลงจริง', text:'มองเห็นความเปลี่ยนแปลงของแปลงเกษตร ผ่านภาพถ่ายดาวเทียม Sentinel-2'},
  {p:.16, name:'SOLAR WING', thai:'ทุกการเดินทาง เริ่มจากแสง', text:'พลังงานจากดวงอาทิตย์ ขับเคลื่อนภารกิจสำรวจโลก'},
  {p:.34, name:'SPACECRAFT REVEAL', thai:'อีกมุมมองของโลกใบเดิม', text:'ดาวเทียมสำรวจโลก เก็บภาพซ้ำอย่างต่อเนื่องเพื่อมองเห็นการเปลี่ยนแปลง'},
  {p:.55, name:'INSTRUMENT ORBIT', thai:'รายละเอียด ที่อยู่ไกลออกไป', text:'แสงที่สะท้อนจากพื้นผิว กลายเป็นข้อมูลสำหรับติดตามแปลงเกษตร'},
  {p:.78, name:'PAYLOAD INSPECTION', thai:'อ่านสัญญาณ จากหลายช่วงคลื่น', text:'แสงสีแดงและอินฟราเรดใกล้ ใช้คำนวณดัชนีพืชพรรณ NDVI'},
];

// One shared C1 Hermite path through the five orbital compositions and handoff.
// The final key continues the payload view while the field panel becomes visible.
export const CAMERA_KEYS = [
  {p:0, pos:[13,24,34], target:[-7,9,0], fov:46, roll:0},
  {p:.16, pos:[7.8,15.5,9], target:[-2.8,11.8,0], fov:46, roll:0},
  {p:.275, pos:[8,15.8,13], target:[-2,11.8,0], fov:47, roll:0},
  {p:.43, pos:[8,19,23], target:[-3,10.8,0], fov:43, roll:0},
  {p:.587, pos:[7,16,10], target:[0,11.8,0], fov:43, roll:0},
  {p:.78, pos:[7.2,14.6,9.9], target:[1.7,11.4,0], fov:48, roll:0},
  {p:.90, pos:[6.5,15.8,10.7], target:[1.7,11.4,0], fov:48, roll:0},
  {p:1, pos:[5.8,17,12], target:[1.5,10.5,0], fov:46, roll:0}
];

// The spacecraft stays in the orbital world while its payload opens with scroll.
export function sampleSpacecraft(p) {
  return {
    position: new THREE.Vector3(0,13,0),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(-.18,-.22,-.22)),
    deployment: smooth(.55,.78,p),
    activation: smooth(.74,.83,p),
  };
}

export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
export function sampleCameraFromKeys(keys,p,aspect=1.6) {
  p=clamp(p); let i=0;
  while(i<keys.length-2 && p>keys[i+1].p) i++;
  const a=keys[i],b=keys[i+1],span=b.p-a.p,t=clamp((p-a.p)/span);
  function tangent(k,prop,c) {
    const l=keys[Math.max(0,k-1)],r=keys[Math.min(keys.length-1,k+1)];
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
export function sampleCamera(p,aspect=1.6) {
 return sampleCameraFromKeys(CAMERA_KEYS,p,aspect);
}
export function seededRandom(seed=41) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
