import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import {decodeMeshAsset} from '../../apps/web/public/cinematic/mesh-assets.js';
import {buildEvidence,sampleEvidence} from '../../apps/web/public/cinematic/demo-evidence.js';
import {fieldHeight,TERRAIN_CURVE_DIVISOR} from '../../apps/web/public/cinematic/terrain.js';
let totalBytes=0,totalTriangles=0;
const channelCenterline=[
 [-32.65,3.02],[-24,3.02],[-18.65,3.02],[-14,3.02],[-9.4,3.02],[-5.2,3.02],[-3,3.02],[-.8,3.02],
 [1.2,3.02],[3.18,3.02],[3.18,1.1],[3.18,-1],[3.18,-3.2],[3.18,-5.5],
 [3.18,-8],[3.18,-12],[3.18,-16],[3.18,-24],[3.18,-32.65],
];
const secondaryChannels=[
 [[-18.65,3.02],[-18.9,6.8],[-19.7,10.8],[-20.8,16.4]],
 [[3.18,-12],[7.4,-12.6],[12.1,-13.5],[18.2,-15.1]],
];
const pointSegmentDistance=(point,a,b)=>{
 const dx=b[0]-a[0],dz=b[1]-a[1],lengthSquared=dx*dx+dz*dz;
 const t=Math.max(0,Math.min(1,((point.x-a[0])*dx+(point.z-a[1])*dz)/lengthSquared));
 return Math.hypot(point.x-(a[0]+dx*t),point.z-(a[1]+dz*t));
};
const channelDistance=point=>Math.min(...channelCenterline.slice(0,-1).map((a,index)=>pointSegmentDistance(point,a,channelCenterline[index+1])));
const secondaryChannelDistance=point=>Math.min(...secondaryChannels.flatMap(path=>path.slice(0,-1).map((a,index)=>pointSegmentDistance(point,a,path[index+1]))));
const groundDatum=point=>fieldHeight(point.x,point.z)-.012-.026*Math.max(0,Math.min(1,(.38-channelDistance(point))/.28));
const deformedY=(point,flatten)=>point.y+(point.x*point.x+point.z*point.z)/TERRAIN_CURVE_DIVISOR*flatten;
function assertParcelChannelEdge(model){
 const parcels=model.children.filter(mesh=>mesh.name.startsWith('Rice field'));
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),rightCanalSamples=[];
 for(let z=-17.5;z<=2;z+=.13){
  let firstHit=null;
  for(let clearance=.54;clearance<=.76;clearance+=.002){
   ray.set(new THREE.Vector3(3.18+clearance,5,z),down);
   if(ray.intersectObjects(parcels,false).length){firstHit=clearance;break;}
  }
  if(firstHit!==null)rightCanalSamples.push(firstHit);
 }
 assert.ok(rightCanalSamples.length>=130,'Right-hand canal has representative parcel-edge samples');
 assert.ok(Math.min(...rightCanalSamples)>=.56,'Parcel silhouette preserves the authored bank clearance');
 const discardedCellSteps=rightCanalSamples.filter(clearance=>clearance>.59&&clearance<.70);
 assert.ok(discardedCellSteps.length<=8,
  `Right-hand parcel edge follows the clipped contour instead of repeated discarded-cell teeth (${discardedCellSteps.length} stepped samples)`);
 for(const mesh of parcels){
  const position=mesh.geometry.attributes.position,index=mesh.geometry.index,byPoint=new Map(),triangles=[];
  const pointKey=point=>point.toArray().map(value=>value.toFixed(4)).join(',');
  for(let offset=0;offset<index.count;offset+=3){
   const points=[0,1,2].map(step=>new THREE.Vector3().fromBufferAttribute(position,index.getX(offset+step)));
   const triangle={points,keys:points.map(pointKey),area:Math.abs(
    (points[1].x-points[0].x)*(points[2].z-points[0].z)-(points[1].z-points[0].z)*(points[2].x-points[0].x)
   )/2};
   triangles.push(triangle);
   for(const key of triangle.keys){if(!byPoint.has(key))byPoint.set(key,[]);byPoint.get(key).push(triangle);}
  }
  const seen=new Set();
  for(const start of triangles){
   if(seen.has(start))continue;
   const pending=[start];seen.add(start);let area=0;
   while(pending.length){
    const triangle=pending.pop();area+=triangle.area;
    for(const key of triangle.keys)for(const neighbor of byPoint.get(key))if(!seen.has(neighbor)){seen.add(neighbor);pending.push(neighbor);}
   }
   assert.ok(area>=.01,`Parcel clipping must not leave an isolated surface fleck (${area} scene²)`);
  }
 }
 console.log(`PASS parcel canal silhouette: ${rightCanalSamples.length} samples, ${discardedCellSteps.length} local junction transitions`);
}
const triangleInteriorSamples=vertices=>[
 [.34,.33,.33],[.60,.20,.20],[.20,.60,.20],[.20,.20,.60],
].map(weights=>new THREE.Vector3(
 vertices.reduce((sum,point,index)=>sum+point.x*weights[index],0),
 vertices.reduce((sum,point,index)=>sum+point.y*weights[index],0),
 vertices.reduce((sum,point,index)=>sum+point.z*weights[index],0),
));
function surfaceHeightSampler(mesh,flatten){
 const position=mesh.geometry.attributes.position,index=mesh.geometry.index,cell=.5,buckets=new Map();
 for(let offset=0;offset<index.count;offset+=3){
  const sourceVertices=[0,1,2].map(step=>new THREE.Vector3().fromBufferAttribute(position,index.getX(offset+step)));
  // The land export batches distant brown stems with the soil material. Only
  // the continuous near-ground triangles define the clearance datum.
  if(mesh.name==='Dry earth'&&!sourceVertices.every(point=>Math.abs(point.y-groundDatum(point))<.003))continue;
  const vertices=sourceVertices.map(point=>point.clone());
  for(const point of vertices)point.y=deformedY(point,flatten);
  const bounds={
   minX:Math.min(...vertices.map(point=>point.x)),maxX:Math.max(...vertices.map(point=>point.x)),
   minZ:Math.min(...vertices.map(point=>point.z)),maxZ:Math.max(...vertices.map(point=>point.z)),
  };
  const triangle={vertices,index:offset/3};
  for(let x=Math.floor(bounds.minX/cell);x<=Math.floor(bounds.maxX/cell);x++){
   for(let z=Math.floor(bounds.minZ/cell);z<=Math.floor(bounds.maxZ/cell);z++){
    const key=`${x},${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(triangle);
   }
  }
 }
 return (x,z)=>{
  let top=null;
  for(const triangle of buckets.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)||[]){
   const [a,b,c]=triangle.vertices;
   const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
   if(Math.abs(denominator)<1e-10)continue;
   const wa=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/denominator;
   const wb=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/denominator;
   const wc=1-wa-wb;
   if(wa>=-1e-7&&wb>=-1e-7&&wc>=-1e-7){
    const y=wa*a.y+wb*b.y+wc*c.y;
    if(!top||y>top.y)top={y,triangle:triangle.index};
   }
  }
  return top;
 };
}
function assertTerrainSurfaceContinuity(model){
 const ground=model.children.find(mesh=>mesh.name==='Dry earth');
 const surfaces=[
  {label:'parcel',minimum:.006,meshes:model.children.filter(mesh=>mesh.name.startsWith('Rice field'))},
  {label:'crop',minimum:.006,meshes:model.children.filter(mesh=>mesh.name.startsWith('Rice rows'))},
  {label:'water',minimum:.006,meshes:model.children.filter(mesh=>mesh.name==='Irrigation water')},
  {label:'bank',minimum:.006,meshes:model.children.filter(mesh=>['Field tracks','Damp channel shoulder','Wet channel earth','Vegetated sample verge'].includes(mesh.name))},
 ];
 for(const flatten of [0,.785,.92]){
  const groundHeight=surfaceHeightSampler(ground,flatten);
  for(const surface of surfaces){
   let minimum=Infinity,minimumDetail=null,samples=0;
   for(const mesh of surface.meshes){
    const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let offset=0;offset<index.count;offset+=3){
     const sourceVertices=[0,1,2].map(step=>new THREE.Vector3().fromBufferAttribute(position,index.getX(offset+step)));
     // Low-growth and verge material batches also contain elevated leaf cards.
     // Surface continuity concerns the authored land at the terrain datum.
     if(!sourceVertices.every(point=>point.y-fieldHeight(point.x,point.z)<.06))continue;
     const vertices=sourceVertices.map(point=>point.clone());
     for(const point of vertices)point.y=deformedY(point,flatten);
     for(const point of triangleInteriorSamples(vertices)){
      const groundPoint=groundHeight(point.x,point.z);if(!groundPoint)continue;
      const clearance=point.y-groundPoint.y;
      if(clearance<minimum){minimum=clearance;minimumDetail={mesh:mesh.name,triangle:offset/3,x:point.x,z:point.z,groundTriangle:groundPoint.triangle};}
      samples++;
     }
    }
   }
   assert.ok(samples>0,`${surface.label} has interior samples over the continuous ground footprint`);
   assert.ok(minimum>=surface.minimum,`${surface.label} clears runtime-deformed ground inside triangles at flatten ${flatten}: ${minimum} at ${JSON.stringify(minimumDetail)}`);
   console.log(`PASS terrain continuity ${surface.label}: ${samples} interior samples, ${(minimum*1000).toFixed(2)} mm minimum clearance at flatten ${flatten}`);
  }
 }
}
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
  const materialBatchBudget=name==='farmland'?13:10;
  assert.ok(model.children.length<=materialBatchBudget,'Material batching stays within the bounded mobile draw budget');
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
   if(name==='farmland'&&(['Irrigation water','Field tracks','Damp channel shoulder','Wet channel earth','Vegetated sample verge'].includes(mesh.name)||mesh.name.startsWith('Rice rows')||mesh.name.startsWith('Rice field'))){
    for(let i=0;i<index.count;i+=3){
     const a=new THREE.Vector3().fromBufferAttribute(position,index.getX(i));
     const b=new THREE.Vector3().fromBufferAttribute(position,index.getX(i+1));
     const c=new THREE.Vector3().fromBufferAttribute(position,index.getX(i+2));
     // Distant foliage reuses the low-growth and verge surface materials to
     // preserve the material-batch budget.  Keep checking every terrain-level
     // triangle while excluding only leaf cards that sit clearly above the
     // authored ground and are intentionally visible from both sides.
     const terrainSurface=[a,b,c].every(point=>point.y-fieldHeight(point.x,point.z)<.06);
     if(!terrainSurface)continue;
     const normal=b.sub(a).cross(c.sub(a));
     assert.ok(normal.y>1e-7,`${mesh.name} triangle ${i/3} must face upward for overhead visibility`);
    }
   }
   if(name==='farmland'&&mesh.name==='Irrigation water'){
    const points=[];
    for(let i=0;i<position.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(position,i));
    assert.ok(points.some(point=>point.x<-18.5),'Connected irrigation leaves the northern landscape without visible bank endpoints');
    assert.ok(points.some(point=>point.z<-18.5),'Connected irrigation leaves the eastern landscape without visible bank endpoints');
   const primaryWaterRelief=[];
    for(const point of points){
     const primaryDistance=channelDistance(point),secondaryDistance=secondaryChannelDistance(point);
     const surface=fieldHeight(point.x,point.z),lift=point.y-surface;
     const primary=primaryDistance<=Math.SQRT2*.15+.004&&Math.abs(lift+.025)<.004;
     const secondary=secondaryDistance<=.074&&Math.abs(lift-.002)<.004;
     assert.ok(primary||secondary,'Every irrigation-water vertex belongs to the connected primary route or an authored secondary ditch');
     if(primary){
      const relief=lift+.025;primaryWaterRelief.push(relief);
      assert.ok(point.y<surface-.021,'Primary irrigation remains recessed below the authored terrain');
     }
    }
   assert.ok(Math.min(...primaryWaterRelief)<-.003&&Math.max(...primaryWaterRelief)>.003,'Water includes restrained multi-directional surface shape instead of a perfectly flat ribbon');
   }
   if(name==='farmland'&&(mesh.name.startsWith('Rice field')||mesh.name.startsWith('Rice rows'))){
    for(let i=0;i<position.count;i++){
     const point=new THREE.Vector3().fromBufferAttribute(position,i);
     assert.ok(channelDistance(point)>=.55,'Parcel and crop geometry must clear the complete connected irrigation bank');
     assert.ok(secondaryChannelDistance(point)>=.245,'Parcel and crop geometry must clear the authored secondary ditches');
    }
   }
  }
  if(name==='farmland'){
   const tracks=model.children.find(mesh=>mesh.name==='Field tracks');
   const profileMeshes=Object.fromEntries(['Irrigation water','Wet channel earth','Damp channel shoulder','Vegetated sample verge'].map(meshName=>[meshName,model.children.find(mesh=>mesh.name===meshName)]));
   for(const [meshName,mesh] of Object.entries(profileMeshes))assert.ok(mesh,`${meshName} remains an authored channel-profile surface`);
   const distances=(mesh,{straight=false,maximumDistance=Infinity,accept=()=>true}={})=>{
    const position=mesh.geometry.attributes.position,values=[];
    for(let i=0;i<position.count;i++){
     const point=new THREE.Vector3().fromBufferAttribute(position,i);
     if(!accept(point))continue;
     if(channelDistance(point)>maximumDistance)continue;
     if(straight&&Math.hypot(point.x-3.18,point.z-3.02)<=.9)continue;
     values.push(channelDistance(point));
    }
    return {minimum:Math.min(...values),maximum:Math.max(...values)};
   };
   const lift=point=>point.y-fieldHeight(point.x,point.z);
   const isSampleVergePoint=point=>(point.x>=-2.9&&point.x<=3.4&&point.z>=2.28&&point.z<=2.67)
    ||(point.x>=2.46&&point.x<=2.82&&point.z>=-2.7&&point.z<=3.3);
   // Primary and secondary channel surfaces intentionally share material
   // batches. Their authored elevation separates the recessed hero channel
   // from the shallow distant branches without relying on export order.
   const waterProfile=distances(profileMeshes['Irrigation water'],{straight:true,maximumDistance:.22,accept:point=>lift(point)<-.015});
   const wetProfile=distances(profileMeshes['Wet channel earth'],{straight:true,maximumDistance:.24,accept:point=>lift(point)<-.005});
   const dampProfile=distances(profileMeshes['Damp channel shoulder'],{straight:true,maximumDistance:.31});
   const vergeProfile=distances(profileMeshes['Vegetated sample verge'],{straight:true,maximumDistance:.71,accept:isSampleVergePoint});
   const waterCorner=distances(profileMeshes['Irrigation water'],{maximumDistance:.22,accept:point=>lift(point)<-.015});
   assert.ok(Math.abs(waterProfile.minimum-.15)<.003&&Math.abs(waterProfile.maximum-.15)<.003,'Accepted water half-width remains 0.15 scene units');
   assert.ok(wetProfile.minimum>=.147&&wetProfile.maximum<=.233,'Wet soil is localized to the compact 0.15–0.23 channel slope');
   assert.ok(dampProfile.minimum>=.227&&dampProfile.maximum<=.303,'Damp soil is localized to the compact 0.23–0.30 transition');
   assert.ok(vergeProfile.minimum>=.377&&vergeProfile.maximum<=.703,'The low vegetated sample verge occupies only the localized 0.38–0.70 profile');
   assert.ok(waterCorner.maximum<=Math.SQRT2*.15+.003,'The accepted water footprint keeps only the intentional miter extension at the 90-degree junction');
   assert.ok(.38-.15<waterProfile.maximum*2,'One visible soil bank is narrower than the accepted water surface');
   const vergePosition=profileMeshes['Vegetated sample verge'].geometry.attributes.position;
   let sampleVergeVertices=0;
   for(let i=0;i<vergePosition.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(vergePosition,i);
    if(isSampleVergePoint(point))sampleVergeVertices++;
   }
   assert.ok(sampleVergeVertices>=80,'Vegetated sample verge retains the localized sample-facing L within the shared landscape material batch');
   const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
   const samples=[];
   for(let x=-18.4;x<=3.0;x+=.24)samples.push([x,3.02]);
   for(let z=-18.4;z<=2.8;z+=.24)samples.push([3.18,z]);
   for(const [x,z] of samples){
    ray.set(new THREE.Vector3(x,5,z),down);
    assert.equal(ray.intersectObject(tracks,false).length,0,'Dry access banks must stop at the water edge');
   }
   assertTerrainSurfaceContinuity(model);
   assertParcelChannelEdge(model);
  }
  assert.equal(triangles,asset.triangles);totalTriangles+=triangles;
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.x>0&&size.y>0&&size.z>0,'Every asset has real volume');
  if(name==='spacecraft')assert.ok(size.x>10&&size.x<14&&size.z>2,'Wings and recessed payload retain authored proportions');
  if(name==='tree')heights.push(size.y);
  console.log(`PASS ${name}${variants.length>1?` variant ${variant+1}`:''}: ${triangles} triangles, ${model.children.length} material batches, bounds ${size.toArray().map(v=>v.toFixed(2))}`);
 }
 if(name==='tree')assert.equal(new Set(heights.map(v=>v.toFixed(2))).size,4,'Broadleaf and palm variants preserve visibly different crown heights');
}
assert.ok(totalBytes<=6*1024*1024,`Three complete mesh assets stay under the 6 MiB transfer budget (${totalBytes} bytes)`);
assert.ok(totalTriangles<=175000,'Bounded original geometry budget');
const evidence=buildEvidence();
const evidenceMesh=evidence.group.children[0],evidencePosition=evidenceMesh.geometry.attributes.position,fullFlatten=.92;
assert.match(evidenceMesh.material.vertexShader,new RegExp(`/\\s*${TERRAIN_CURVE_DIVISOR}\\.`),'Dated NDVI overlay shader uses the terrain curvature invariant');
for(let index=0;index<evidencePosition.count;index+=17){
 const x=evidencePosition.getX(index),z=evidencePosition.getZ(index),authoredY=evidencePosition.getY(index);
 const lift=(x*x+z*z)/TERRAIN_CURVE_DIVISOR*fullFlatten;
 assert.ok(Math.abs((authoredY+lift)-(fieldHeight(x,z)+.045+lift))<1e-6,
  `Dated NDVI overlay stays aligned with the sample parcel at full flatten (vertex ${index})`);
}
for(const p of [.65,.76,.86,.95]){
 const valid=sampleEvidence(p);assert.equal(valid.delta,-.26);assert.equal(valid.commonSupport,1);
 const invalid=evidence.apply(p,true);assert.equal(invalid.commonSupport,0);
 for(const key of ['before','after','delta'])assert.equal(invalid[key],null,'No fabricated zero or change when support is missing');
 assert.equal(invalid.status,'NOT_ASSESSABLE');assert.equal(evidence.group.visible,false,'No colored change overlay without shared usable data');
}
console.log(`PASS evidence: supported comparison and insufficient-data outcome; mesh transfer ${(totalBytes/1024/1024).toFixed(2)} MiB across ${totalTriangles} triangles`);
