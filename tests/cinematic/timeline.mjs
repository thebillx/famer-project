import assert from 'node:assert/strict';
import { sampleCamera, CAMERA_KEYS } from '../../apps/web/public/cinematic/timeline.js';
const aspects=[1440/900,1276/1285,390/844,375/667];
let samples=0,boundaries=0;
for(const aspect of aspects){
 for(let i=0;i<=1000;i++){
  const p=i/1000,a=sampleCamera(p,aspect),b=sampleCamera(p,aspect);
  assert.deepEqual(a,b);
  assert.ok([...a.position.toArray(),...a.target.toArray(),a.fov].every(Number.isFinite));
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
