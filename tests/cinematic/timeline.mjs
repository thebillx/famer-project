import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import { sampleCamera, sampleSpacecraft, SHOTS, CAMERA_KEYS } from '../../apps/web/public/cinematic/timeline.js';
assert.deepEqual(SHOTS,[
 {p:0,name:'ORBITAL SILENCE',thai:'จากวงโคจร ถึงแปลงจริง',text:'มองเห็นความเปลี่ยนแปลงของแปลงเกษตร ผ่านภาพถ่ายดาวเทียม Sentinel-2'},
 {p:.16,name:'SOLAR WING',thai:'ทุกการเดินทาง เริ่มจากแสง',text:'พลังงานจากดวงอาทิตย์ ขับเคลื่อนภารกิจสำรวจโลก'},
 {p:.34,name:'SPACECRAFT REVEAL',thai:'อีกมุมมองของโลกใบเดิม',text:'ดาวเทียมสำรวจโลก เก็บภาพซ้ำอย่างต่อเนื่องเพื่อมองเห็นการเปลี่ยนแปลง'},
 {p:.55,name:'INSTRUMENT ORBIT',thai:'รายละเอียด ที่อยู่ไกลออกไป',text:'แสงที่สะท้อนจากพื้นผิว กลายเป็นข้อมูลสำหรับติดตามแปลงเกษตร'},
 {p:.78,name:'PAYLOAD INSPECTION',thai:'อ่านสัญญาณ จากหลายช่วงคลื่น',text:'แสงสีแดงและอินฟราเรดใกล้ ใช้คำนวณดัชนีพืชพรรณ NDVI'},
],'The five public shots retain the source-authorized name, Thai copy, and text');
assert.deepEqual(SHOTS.map(shot=>shot.p),[0,.16,.34,.55,.78]);
assert.equal(new Set(SHOTS.map(shot=>shot.name)).size,5,'Every public shot has a unique stable name');
assert.ok(SHOTS.every((shot,index)=>index===0||shot.p>SHOTS[index-1].p),'Public shots stay in strict journey order');
const aspects=[1440/900,1276/1285,390/844,375/667];
let samples=0,boundaries=0;
for(const aspect of aspects){
 for(let i=0;i<=1000;i++){
  const p=i/1000,a=sampleCamera(p,aspect),b=sampleCamera(p,aspect);
  assert.deepEqual(a,b);
  assert.ok([...a.position.toArray(),...a.target.toArray(),a.fov,a.roll].every(Number.isFinite));
  assert.ok(a.position.y>1,'Camera stays above ground');
  assert.ok(a.position.distanceTo(a.target)>1,'Camera stays away from focus');
  assert.ok(a.position.distanceTo({x:0,y:-40,z:0})>40.08,'Camera stays outside globe');
  samples++;
 }
 for(const p of [...CAMERA_KEYS.slice(1,-1).map(k=>k.p),.55]){
  const e=1e-5,l=sampleCamera(p-e,aspect),c=sampleCamera(p,aspect),r=sampleCamera(p+e,aspect);
  for(const prop of ['position','target']){
   assert.ok(l[prop].distanceTo(r[prop])<.04,`No ${prop} jump at ${p}`);
   const lv=c[prop].clone().sub(l[prop]).divideScalar(e),rv=r[prop].clone().sub(c[prop]).divideScalar(e);
   assert.ok(lv.distanceTo(rv)<1,`Continuous ${prop} tangent at ${p}`);
  }
  const left=(c.fov-l.fov)/e,right=(r.fov-c.fov)/e;
  assert.ok(Math.abs(left-right)<1,'Continuous FOV tangent');boundaries++;
 }
}
console.log(`PASS: ${samples} camera samples, ${boundaries} position/focus/FOV boundaries across four aspects`);

// The globe remains a readable part of every authored camera composition.
for(const aspect of aspects){
 for(let i=0;i<=1000;i++){
  const p=i/1000,key=sampleCamera(p,aspect),camera=new THREE.PerspectiveCamera(key.fov,aspect,.08,450);
  camera.position.copy(key.position);camera.lookAt(key.target);camera.rotateZ(key.roll);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  assert.ok(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0,-40,0),40)),`Earth remains in frame at ${p} for aspect ${aspect}`);
 }
}
console.log('PASS Earth sphere remains in frame across the full camera/aspect sweep');

// The authored craft pose is fixed; only deployment and activation derive from scroll.
const craftCheckpoints=[0,.16,.34,.55,.78,.90,1];
for(const p of craftCheckpoints){
 const before=sampleSpacecraft(p);sampleSpacecraft(1);const reverse=sampleSpacecraft(p);
 assert.deepEqual(before,reverse);
 assert.ok(Math.abs(before.quaternion.length()-1)<1e-12);
 assert.deepEqual(before.position.toArray(),[0,13,0]);
 assert.deepEqual(before.quaternion.toArray(),new THREE.Quaternion().setFromEuler(new THREE.Euler(-.18,-.22,-.22)).toArray());
 assert.ok(before.deployment>=0&&before.deployment<=1);
 assert.ok(before.activation>=0&&before.activation<=1);
}
assert.equal(sampleSpacecraft(.55).deployment,0,'Deployment remains closed before the fifth shot');
assert.equal(sampleSpacecraft(.78).deployment,1,'Deployment reaches the fifth-shot checkpoint');
console.log(`PASS ${SHOTS.length} public shots: source copy, fixed craft pose, and reverse-stable progress deployment`);
