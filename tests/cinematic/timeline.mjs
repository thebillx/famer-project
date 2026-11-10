import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import { sampleCamera, sampleSpacecraft, BEATS, CAMERA_KEYS } from '../../apps/web/public/cinematic/timeline.js';
assert.equal(BEATS.length,19,'The ten narrative scenes retain exactly 19 internal beats');
assert.equal(new Set(BEATS.map(beat=>beat.id)).size,19,'Every internal beat has a unique stable identifier');
assert.equal(new Set(BEATS.map(beat=>beat.p)).size,19,'Every internal beat occupies a distinct scroll checkpoint');
assert.ok(BEATS.every((beat,index)=>index===0||beat.p>BEATS[index-1].p),'Internal beats stay in strict journey order');
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

// All articulated state is a pure function of scroll, including reversed visits.
for(const beat of BEATS){
 const before=sampleSpacecraft(beat.p);sampleSpacecraft(1);const reverse=sampleSpacecraft(beat.p);
 assert.deepEqual(before,reverse);
 assert.ok(Math.abs(before.quaternion.length()-1)<1e-12);
 assert.ok(before.deployment>=0&&before.deployment<=1);
 if(beat.p>=.30){
  const axis=new THREE.Vector3(0,0,1).applyQuaternion(before.quaternion);
  const target=new THREE.Vector3(0,.12,0).sub(before.position).normalize();
  assert.ok(axis.distanceTo(target)<1e-10,'Activated payload aims at the geographic destination');
 }
}
console.log(`PASS ${BEATS.length} authored beats: reverse-stable deployment and geographic payload aim`);
