import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import {buildEarth,buildStarfield} from '../../apps/web/public/cinematic/earth.js';
import {buildSpacecraft} from '../../apps/web/public/cinematic/spacecraft.js';
import {sampleSpacecraft} from '../../apps/web/public/cinematic/timeline.js';
import {TERRAIN_CURVE_DIVISOR,descentCloudHeight,descentSurface,fieldHeight,projectDescentSurface} from '../../apps/web/public/cinematic/descent-surface.js';
import {decodeMeshAsset,loadSurfaceMaps} from '../../apps/web/public/cinematic/mesh-assets.js';

const load=async name=>JSON.parse(await readFile(new URL(`../../apps/web/public/cinematic/models/${name}.mesh.json`,import.meta.url)));
const encode=(values,Type)=>{
 const bytes=new Uint8Array(values.length*Type.BYTES_PER_ELEMENT),view=new DataView(bytes.buffer);
 values.forEach((value,index)=>{
  const offset=index*Type.BYTES_PER_ELEMENT;
  if(Type===Int16Array)view.setInt16(offset,value,true);
  else if(Type===Uint16Array)view.setUint16(offset,value,true);
  else bytes[offset]=value<0?value+256:value;
 });
 return Buffer.from(bytes).toString('base64');
};
const uvFixture={schema:1,generator:'known UV packing fixture',meshes:[{
 name:'Known UV packing fixture',material:{color:[.2,.3,.4],metalness:0,roughness:.8,clearcoat:0},offset:[0,0,0],scale:[1,1,1],
 position:encode([0,0,0,32767,0,0,0,32767,0],Int16Array),normal:encode([0,0,127,0,0,127,0,0,127],Int8Array),index:encode([0,1,2],Uint16Array),uv:encode([512,-256,-16384,258,32767,-32768],Int16Array),
}]};
const decodedUvFixture=decodeMeshAsset(uvFixture).children[0].geometry.attributes.uv;
assert.deepEqual(Array.from(decodedUvFixture.array),[1,-.5,-32,.50390625,32767/512,-64],'Signed packed UVs retain the authored 1/512 range');
assert.throws(()=>decodeMeshAsset({...uvFixture,meshes:[{...uvFixture.meshes[0],uv:encode([1,2,3,4],Int16Array)}]}),/Invalid authored UV count/,'Malformed packed UV counts are rejected');

const spacecraftData=await load('spacecraft');
assert.equal(spacecraftData.conceptual,true);assert.match(spacecraftData.generator,/Blender 4\.5/);assert.equal(spacecraftData.meshes.length,29);
const mapRoles=new Set(spacecraftData.meshes.map(mesh=>mesh.material.surface).filter(Boolean));
assert.deepEqual([...mapRoles].sort(),['metal','solar'],'Current runtime craft exposes only authored metal and solar surface roles');
const loadedTextures=[];
const maps=await loadSurfaceMaps([spacecraftData],{loadAsync:async url=>{
 const texture={url,dispose(){this.disposed=true;},disposed:false};loadedTextures.push(texture);return texture;
}});
assert.equal(loadedTextures.length,mapRoles.size*3,'Current craft loads one color, normal, and roughness map per authored role');
for(const role of mapRoles){
 assert.ok(maps[role].map&&maps[role].normalMap&&maps[role].roughnessMap,`${role} has a complete map set`);
 assert.equal(maps[role].map.colorSpace,THREE.SRGBColorSpace);assert.equal(maps[role].normalMap.colorSpace,THREE.NoColorSpace);assert.equal(maps[role].roughnessMap.colorSpace,THREE.NoColorSpace);
 assert.equal(maps[role].map.wrapS,THREE.RepeatWrapping);assert.equal(maps[role].map.wrapT,THREE.RepeatWrapping);
}
await assert.rejects(loadSurfaceMaps([{variants:[{meshes:[{material:{surface:'unbounded'}}]}]}],{loadAsync:async()=>{throw new Error('loader must not run');}}),/Unsupported authored surface/,'Unknown authored roles fail before a map request');
const failedTextures=[];
await assert.rejects(loadSurfaceMaps([spacecraftData],{loadAsync:async url=>{const texture={url,dispose(){this.disposed=true;},disposed:false};if(url.endsWith('/metal-normal.png'))throw new Error('simulated map failure');failedTextures.push(texture);return texture;}}),/simulated map failure/,'Map loading reports provider failures');
assert.ok(failedTextures.length>0&&failedTextures.every(texture=>texture.disposed),'Partial map loads are disposed after failure');

const spacecraft=buildSpacecraft(spacecraftData,maps);
assert.equal(spacecraft.userData.parts.size,12,'The authored craft retains two wings, two rings, and eight iris pivots');
for(const name of ['Survey / blue-black energy cells','Survey / multispectral glass','Survey / ceramic armour','Survey / brushed titanium','Survey / status gold']){
 const material=spacecraft.getObjectByName(name)?.material,exported=spacecraftData.meshes.find(mesh=>mesh.name===name)?.material;
 assert.ok(material?.isMeshPhysicalMaterial,`${name} remains a physical material`);assert.deepEqual([material.color.r,material.color.g,material.color.b],exported.color,`${name} retains authored color`);assert.equal(material.metalness,exported.metalness);assert.equal(material.roughness,exported.roughness);assert.equal(material.clearcoat,exported.clearcoat);
 if(exported.surface){assert.equal(material.map,maps[exported.surface].map);assert.equal(material.normalMap,maps[exported.surface].normalMap);assert.equal(material.roughnessMap,maps[exported.surface].roughnessMap);}
}
const solar=spacecraft.getObjectByName('Survey / blue-black energy cells').material;
assert.equal(solar.iridescence,.16);assert.equal(solar.envMapIntensity,.35);assert.ok(spacecraft.getObjectByName('Survey / status gold').material.emissiveIntensity>0);
const mechanismState=p=>{spacecraft.userData.apply(sampleSpacecraft(p));spacecraft.updateMatrixWorld(true);return [...spacecraft.userData.parts].map(([name,part])=>[name,...part.matrix.elements]);};
const closed=mechanismState(.55),deployed=mechanismState(.78);assert.notDeepEqual(closed,deployed,'Progress deployment moves authored mechanisms');assert.deepEqual(mechanismState(.55),closed);assert.deepEqual(mechanismState(.78),deployed);
const partMesh=spacecraftData.meshes.find(mesh=>mesh.part);assert.throws(()=>decodeMeshAsset({...spacecraftData,meshes:[{...partMesh,pivot:[0,NaN,0]}]}),/Invalid mechanism pivot/);assert.throws(()=>decodeMeshAsset({...spacecraftData,meshes:[partMesh,{...partMesh,pivot:[999,0,0]}]}),/Inconsistent mechanism pivot/);
console.log('PASS current craft materials: compact asset, map lifecycle, PBR roles, and deterministic deployment');

const earthMaps={day:new THREE.Texture(),clouds:new THREE.Texture(),night:new THREE.Texture()},earth=buildEarth(earthMaps),stars=buildStarfield();
assert.equal(earth.userData.surface.geometry.parameters.radius,40);assert.notEqual(earth.userData.clouds.geometry.parameters.radius,earth.userData.highClouds.geometry.parameters.radius);assert.ok(earth.userData.atmosphere.geometry.parameters.radius>earth.userData.highClouds.geometry.parameters.radius);
assert.equal(earth.userData.highClouds.material.bumpMap,earthMaps.clouds);assert.equal(earth.userData.cloudShadow.material.alphaMap,earthMaps.clouds);assert.equal(stars.geometry.attributes.position.count,2400);assert.ok(stars.material.opacity>0);
assert.match(earth.userData.atmosphere.material.vertexShader,/v=-p\.xyz;/,'Atmosphere interpolates view vectors before normalization');assert.match(earth.userData.atmosphere.material.fragmentShader,/normalize\(v\)/,'Atmosphere normalizes the interpolated vector per fragment');
for(const p of [0,.16,.34,.55,.78,.88,.95,1]){assert.equal(earth.userData.surface.material.opacity,1);assert.equal(earth.userData.atmosphere.material.uniforms.opacity.value,1);assert.ok(Number.isFinite(descentCloudHeight(12,-12,p)));}
console.log('PASS Earth and star authored layers: fixed opacity, distinct clouds, and finite atmosphere');

assert.equal(TERRAIN_CURVE_DIVISOR,1800,'Retained authoring curvature uses the established divisor');
for(const [x,z] of [[0,0],[3.18,-8],[-18.65,3.02],[20,25]])assert.ok(Number.isFinite(fieldHeight(x,z)));
for(const p of [.375,.397,.405,.415,.433,.455,.465,.475]){
 const a=descentSurface(p),b=descentSurface(p);assert.deepEqual(a,b);assert.equal(a.radius/a.scale,900);
 for(const [x,y,z] of [[0,.14,0],[17,.14,-11],[-2.1,.02,2.2]]){
  const [sx,sy,sz]=projectDescentSurface(x,y,z,p),scale=a.scale;assert.deepEqual([sx,sy,sz],[x*scale,y*scale,z*scale]);
 }
 const l=descentSurface(p-1e-7),r=descentSurface(p+1e-7);for(const key of ['radius','scale','detail','reveal']){assert.ok(Math.abs(l[key]-r[key])<.02,`${key} has no transition step at ${p}`);assert.ok(Math.abs((a[key]-l[key])/1e-7-(r[key]-a[key])/1e-7)<1,`${key} remains C1 at ${p}`);}
}
assert.deepEqual(projectDescentSurface(17,.14,-11,.475),[17,.14,-11],'Authored coordinates restore after the retained surface envelope');
console.log('PASS retained authoring surface helper: affine projection, curvature, and C1 transition checks');
