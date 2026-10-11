import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import {decodeMeshAsset,loadSurfaceMaps} from '../../apps/web/public/cinematic/mesh-assets.js';
import {buildTerrain} from '../../apps/web/public/cinematic/terrain.js';

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
 name:'Known UV packing fixture',
 material:{color:[.2,.3,.4],metalness:0,roughness:.8,clearcoat:0},
 offset:[0,0,0],scale:[1,1,1],
 position:encode([0,0,0,32767,0,0,0,32767,0],Int16Array),
 normal:encode([0,0,127,0,0,127,0,0,127],Int8Array),
 index:encode([0,1,2],Uint16Array),
 uv:encode([512,-256,-16384,258,32767,-32768],Int16Array),
}]};
const decodedUvFixture=decodeMeshAsset(uvFixture).children[0].geometry.attributes.uv;
assert.deepEqual(Array.from(decodedUvFixture.array),[1,-.5,-32,.50390625,32767/512,-64],'Signed packed UVs decode with the 1/512 scale and retain the full range');
assert.throws(()=>decodeMeshAsset({...uvFixture,meshes:[{...uvFixture.meshes[0],uv:encode([1,2,3,4],Int16Array)}]}),/Invalid authored UV count/,'Malformed packed UV counts are rejected');
const spacecraftData=await load('spacecraft');
const [farmland,tree]=await Promise.all([load('farmland'),load('tree')]);

const mapRoles=new Set();
for(const data of [spacecraftData,farmland,tree])for(const variant of data.variants||[data])for(const mesh of variant.meshes){
 if(mesh.material.surface)mapRoles.add(mesh.material.surface);
}
assert.deepEqual([...mapRoles].sort(),['crop','foil','leaf','metal','soil','water'],'All exported authored surface roles are known');

const loadedTextures=[];
const maps=await loadSurfaceMaps([spacecraftData,farmland,tree],{loadAsync:async url=>{
 const texture={url,dispose(){this.disposed=true;},disposed:false};
 loadedTextures.push(texture);return texture;
}});
assert.equal(loadedTextures.length,mapRoles.size*3,'Each authored surface loads color, normal, and roughness maps');
for(const role of mapRoles){
 assert.ok(maps[role].map&&maps[role].normalMap&&maps[role].roughnessMap,`${role} has a complete map set`);
 assert.equal(maps[role].map.colorSpace,THREE.SRGBColorSpace,`${role} color map uses sRGB transfer`);
 assert.equal(maps[role].normalMap.colorSpace,THREE.NoColorSpace,`${role} normal map uses linear transfer`);
 assert.equal(maps[role].roughnessMap.colorSpace,THREE.NoColorSpace,`${role} roughness map uses linear transfer`);
 assert.equal(maps[role].map.wrapS,THREE.RepeatWrapping,`${role} color map repeats horizontally`);
 assert.equal(maps[role].map.wrapT,THREE.RepeatWrapping,`${role} color map repeats vertically`);
}

await assert.rejects(
 loadSurfaceMaps([{variants:[{meshes:[{material:{surface:'unbounded'}}]}]}],{loadAsync:async()=>{throw new Error('loader must not run for an unknown role');}}),
 /Unsupported authored surface/,
 'Unknown exported surface roles fail before any map request',
);
const failedTextures=[];
await assert.rejects(
 loadSurfaceMaps([spacecraftData,farmland,tree],{loadAsync:async url=>{
  const texture={url,dispose(){this.disposed=true;},disposed:false};
  if(url.endsWith('/soil-normal.png'))throw new Error('simulated map failure');
  failedTextures.push(texture);
  return texture;
 }}),
 /simulated map failure/,
 'Map loading reports provider failures',
);
assert.ok(failedTextures.length>0&&failedTextures.every(texture=>texture.disposed),'Partially loaded maps are disposed after a loading failure');

const spacecraft=decodeMeshAsset(spacecraftData,0,maps);
for(const name of ['Photovoltaic cells','Recessed optical glass','MLI · champagne gold','Anodized aluminium','Thermal radiator']){
 const material=spacecraft.children.find(mesh=>mesh.name===name)?.material;
 const exported=spacecraftData.meshes.find(mesh=>mesh.name===name)?.material;
 assert.ok(material?.isMeshPhysicalMaterial,`${name} retains Blender PBR material values`);
 assert.deepEqual([material.color.r,material.color.g,material.color.b],exported.color,`${name} retains exported base color`);
 assert.equal(material.metalness,exported.metalness,`${name} retains exported metalness`);
 assert.equal(material.roughness,exported.roughness,`${name} retains exported base roughness`);
 assert.equal(material.clearcoat,exported.clearcoat,`${name} retains exported clearcoat`);
 assert.equal(material.side,exported.doubleSided?THREE.DoubleSide:THREE.FrontSide,`${name} retains exported sidedness`);
 if(exported.surface){
  assert.equal(material.map,maps[exported.surface].map,`${name} receives its authored color map`);
  assert.equal(material.normalMap,maps[exported.surface].normalMap,`${name} receives its authored normal map`);
  assert.equal(material.roughnessMap,maps[exported.surface].roughnessMap,`${name} receives its authored roughness map`);
  assert.equal(material.normalScale.x,exported.normalStrength,`${name} retains authored normal strength`);
 }
}
const solar=spacecraft.children.find(mesh=>mesh.name==='Photovoltaic cells')?.material;
assert.equal(solar?.iridescence,.18,'Solar cells retain an angle-dependent physical response');
assert.equal(solar?.envMapIntensity,1.35,'Solar cells retain a readable orbital reflection');
assert.ok(spacecraft.children.find(mesh=>mesh.name==='MLI · champagne gold')?.material.envMapIntensity>1.3,'Folded foil keeps a controlled orbital reflection');
const terrain=buildTerrain({farmland,tree},{day:{},rotation:undefined});
const water=terrain.children.find(mesh=>mesh.name==='Irrigation water');
const wetBank=terrain.children.find(mesh=>mesh.name==='Wet channel earth');
assert.ok(water?.material.onBeforeCompile,'Terrain water keeps its role material shader');
assert.ok(wetBank?.material.onBeforeCompile,'Wet canal slopes keep their distinct material response');
const shader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>'};
water.material.onBeforeCompile(shader);
assert.equal(shader.uniforms.surfaceKind.value,4,'Irrigation plane uses the view-dependent water branch');
assert.match(shader.fragmentShader,/viewFacing/);
assert.match(shader.fragmentShader,/fresnel/);
assert.match(shader.fragmentShader,/localDetail/);
const wetShader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>'};
wetBank.material.onBeforeCompile(wetShader);
assert.equal(wetShader.uniforms.surfaceKind.value,5,'Channel slopes use the damp-soil branch');
const treeMesh=decodeMeshAsset(tree,0,maps);
const foliage=treeMesh.children.find(mesh=>mesh.name==='Tree foliage')?.material;
assert.equal(foliage?.map,maps.leaf.map,'Tree foliage receives its authored color map');
assert.equal(foliage?.normalMap,maps.leaf.normalMap,'Tree foliage receives its authored normal map');
assert.equal(foliage?.roughnessMap,maps.leaf.roughnessMap,'Tree foliage receives its authored roughness map');
console.log('PASS runtime material pipeline: surface role loading/disposal, spacecraft PBR response, terrain grain, canal water and Blender PBR values');
