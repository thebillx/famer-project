import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import {decodeMeshAsset} from '../../apps/web/public/cinematic/mesh-assets.js';
import {buildEvidence,sampleEvidence} from '../../apps/web/public/cinematic/demo-evidence.js';
let totalBytes=0,totalTriangles=0;
const surfaceDir=new URL('../../apps/web/public/cinematic/textures/surfaces/',import.meta.url);
const surfaceFiles=readdirSync(surfaceDir).filter(file=>file.endsWith('.png'));
assert.deepEqual(surfaceFiles.sort(),[
 'crop-color.png','crop-normal.png','crop-roughness.png',
 'foil-color.png','foil-normal.png','foil-roughness.png',
 'leaf-color.png','leaf-normal.png','leaf-roughness.png',
 'metal-color.png','metal-normal.png','metal-roughness.png',
 'soil-color.png','soil-normal.png','soil-roughness.png',
 'solar-color.png','solar-normal.png','solar-roughness.png',
 'water-color.png','water-normal.png','water-roughness.png',
],'Authored surfaces publish complete color, normal, and roughness maps');
const surfaceBytes=surfaceFiles.reduce((total,file)=>total+statSync(new URL(file,surfaceDir)).size,0);
assert.ok(surfaceBytes<=1.85*1024*1024,`Surface maps stay under the 1.85 MiB transfer budget (${surfaceBytes} bytes)`);
for(const name of ['spacecraft','farmland','tree']){
 const url=new URL(`../../apps/web/public/cinematic/models/${name}.mesh.json`,import.meta.url);
 totalBytes+=statSync(url).size;
 const data=JSON.parse(readFileSync(url,'utf8'));
 assert.match(data.generator,/Blender 4\.5/);assert.equal(data.conceptual,true);
 const variants=Array.isArray(data.variants)?data.variants:[data],heights=[];
 for(let variant=0;variant<variants.length;variant++){
  const model=decodeMeshAsset(data,variant),asset=variants[variant];
  assert.ok(model.children.length<=10,'Material batching stays within mobile draw budget');
  let triangles=0;
  for(const mesh of model.children){
   const {position,normal}=mesh.geometry.attributes,index=mesh.geometry.index;
   const uv=mesh.geometry.attributes.uv;
   assert.ok(index.count%3===0);triangles+=index.count/3;
   assert.equal(position.count,normal.count);
   assert.ok(uv,`${name} exports authored UV coordinates for every material batch`);
   assert.equal(uv.count,position.count,'Authored UV count matches decoded vertices');
   for(let i=0;i<uv.array.length;i++)assert.ok(Number.isFinite(uv.array[i]),'Authored UVs decode to finite values');
   for(let i=0;i<position.array.length;i++)assert.ok(Number.isFinite(position.array[i]));
   for(let i=0;i<index.count;i++)assert.ok(index.getX(i)<position.count);
   for(let i=0;i<normal.count;i++){
    const n=new THREE.Vector3().fromBufferAttribute(normal,i);
    assert.ok(n.length()>.98&&n.length()<1.02,'Packed normals preserve unit length');
   }
   if(name==='farmland'&&['Irrigation water','Field tracks','Wet channel earth'].includes(mesh.name)){
    for(let i=0;i<index.count;i+=3){
     const a=new THREE.Vector3().fromBufferAttribute(position,index.getX(i));
     const b=new THREE.Vector3().fromBufferAttribute(position,index.getX(i+1));
     const c=new THREE.Vector3().fromBufferAttribute(position,index.getX(i+2));
     const normal=b.sub(a).cross(c.sub(a));
     assert.ok(normal.y>1e-7,`${mesh.name} triangle ${i/3} must face upward for overhead visibility`);
    }
   }
   if(name==='farmland'&&mesh.name==='Irrigation water'){
    const points=[];
    for(let i=0;i<position.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(position,i));
    assert.ok(points.some(point=>point.x<-6),'Connected irrigation reaches the surrounding northern parcels');
    assert.ok(points.some(point=>point.z<-8),'Connected irrigation reaches the eastern access corridor');
    for(const point of points){
     const northArm=Math.abs(point.z-3.02)<.17&&point.x>-7.6&&point.x<3.4;
     const eastArm=Math.abs(point.x-3.18)<.19&&point.z>-10.7&&point.z<3.25;
     assert.ok(northArm||eastArm,'Water stays in the connected L-shaped channel instead of boxing the sample');
     const surface=-(point.x*point.x+point.z*point.z)/80+.05+Math.sin(point.x*.52)*Math.sin(point.z*.43)*.035;
     assert.ok(Math.abs(point.y-surface+.052)<.002,'Water is consistently recessed below the authored terrain');
    }
   }
  }
  if(name==='farmland'){
   const tracks=model.children.find(mesh=>mesh.name==='Field tracks');
   const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
   const samples=[];
   for(let x=-7.2;x<=3.0;x+=.24)samples.push([x,3.02]);
   for(let z=-10.3;z<=2.8;z+=.24)samples.push([3.18,z]);
   for(const [x,z] of samples){
    ray.set(new THREE.Vector3(x,5,z),down);
    assert.equal(ray.intersectObject(tracks,false).length,0,'Dry access banks must stop at the water edge');
   }
  }
  assert.equal(triangles,asset.triangles);totalTriangles+=triangles;
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.x>0&&size.y>0&&size.z>0,'Every asset has real volume');
  if(name==='spacecraft')assert.ok(size.x>10&&size.x<14&&size.z>2,'Wings and recessed payload retain authored proportions');
  if(name==='tree')heights.push(size.y);
  console.log(`PASS ${name}${variants.length>1?` variant ${variant+1}`:''}: ${triangles} triangles, ${model.children.length} material batches, bounds ${size.toArray().map(v=>v.toFixed(2))}`);
 }
 if(name==='tree')assert.equal(new Set(heights.map(v=>v.toFixed(2))).size,3,'Tree variants preserve visibly different crown heights');
}
assert.ok(totalBytes<=6*1024*1024,`Three complete mesh assets stay under the 6 MiB transfer budget (${totalBytes} bytes)`);
assert.ok(totalTriangles<=175000,'Bounded original geometry budget');
const evidence=buildEvidence();
for(const p of [.65,.76,.86,.95]){
 const valid=sampleEvidence(p);assert.equal(valid.delta,-.26);assert.equal(valid.commonSupport,1);
 const invalid=evidence.apply(p,true);assert.equal(invalid.commonSupport,0);
 for(const key of ['before','after','delta'])assert.equal(invalid[key],null,'No fabricated zero or change when support is missing');
 assert.equal(invalid.status,'NOT_ASSESSABLE');assert.equal(evidence.group.visible,false,'No colored change overlay without shared usable data');
}
console.log(`PASS evidence: supported comparison and insufficient-data outcome; mesh transfer ${(totalBytes/1024/1024).toFixed(2)} MiB across ${totalTriangles} triangles`);
