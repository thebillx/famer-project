import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import { buildTerrain } from '../../apps/web/public/cinematic/terrain.js';

// The highlighted perimeter must remain above the actual rendered field meshes,
// including the raised tracks. This catches the corner-only curve clipping bug.
const asset = name => JSON.parse(readFileSync(new URL(`../../apps/web/public/cinematic/models/${name}.mesh.json`, import.meta.url), 'utf8'));
const terrain = buildTerrain({farmland:asset('farmland'), tree:asset('tree')});
terrain.updateMatrixWorld(true);
const expectedLayers=new Map([
 ['Dry earth','ground'],['Rice rows','crop'],['Field tracks','bank'],
 ['Irrigation water','water'],['Damp channel shoulder','bank'],['Wet channel earth','bank'],['Vegetated sample verge','bank'],
]);
for(const mesh of terrain.children){
 if(mesh.name.startsWith('Rice field'))assert.equal(mesh.userData.terrainLayer,'parcel');
 else if(expectedLayers.has(mesh.name))assert.equal(mesh.userData.terrainLayer,expectedLayers.get(mesh.name));
}
terrain.userData.update(.56);
const materialVersions=new Map(terrain.children.filter(child=>child.userData.terrainLayer).map(mesh=>[mesh.material,mesh.material.version]));
terrain.userData.update(.57);
for(const [material,version] of materialVersions)assert.equal(material.version,version,'Ordinary terrain updates do not invalidate unchanged materials');
terrain.userData.setDebug({layer:'water',wireframe:true});
for(const mesh of terrain.children.filter(child=>child.userData.terrainLayer)){
 assert.equal(mesh.visible,mesh.userData.terrainLayer==='water','QA layer isolation exposes only the requested authored surface');
 assert.equal(mesh.material.wireframe,true,'QA wireframe applies to every authored terrain surface');
}
terrain.userData.update(.58);
assert.equal(terrain.userData.boundary.visible,false,'QA layer isolation persists across later terrain updates');
assert.ok(terrain.children.filter(child=>child.userData.terrainLayer).every(mesh=>mesh.visible===(mesh.userData.terrainLayer==='water')),'Later terrain updates preserve the isolated authored surface');
terrain.userData.setDebug();
assert.ok(terrain.children.filter(child=>child.userData.terrainLayer).every(mesh=>mesh.visible),'QA reset restores every shot-6 terrain surface');
assert.equal(terrain.userData.boundary.visible,true,'QA reset restores the sample boundary at shot 6');
const boundary = terrain.userData.boundary;
assert.equal(boundary.isLineLoop,true,'Sample boundary is a screen-readable information line instead of a physical tube');
const position = boundary.geometry.attributes.position;
const surfaces = terrain.children.filter(mesh => mesh.isMesh && !mesh.isInstancedMesh && mesh.material.isMeshStandardMaterial);
const ray = new THREE.Raycaster();
const vertex = new THREE.Vector3();
let samples = 0;
for (let index = 0; index < position.count; index += 3) {
  vertex.fromBufferAttribute(position,index);
  ray.set(new THREE.Vector3(vertex.x,5,vertex.z),new THREE.Vector3(0,-1,0));
  const ground=ray.intersectObjects(surfaces,false)[0];
  assert.ok(ground,'Perimeter stays over rendered terrain');
  assert.ok(vertex.y>ground.point.y+.006,`Perimeter intersects terrain at point ${index}`);
  samples++;
}
assert.equal(position.count,96,'Four sample-boundary sides retain 24 deterministic points each');
console.log(`PASS: ${samples} information-overlay samples clear rendered field surfaces; LineLoop closes the perimeter`);

// Authored canopy slopes must survive the globe-to-field displacement. Compare
// the generated crop shader's Jacobian with a numerical deformed tangent frame.
const shaded=buildTerrain({farmland:asset('farmland'),tree:asset('tree')},{day:new THREE.Texture()});
const shaderFor=role=>{
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>'};
 shaded.children.find(mesh=>mesh.name===role).material.onBeforeCompile(shader);
 return shader.vertexShader;
};
const cropShader=shaderFor('Rice rows');
assert.ok(cropShader.includes('objectNormal.xz-=2.*position.xz/1800.*fieldFlatten*objectNormal.y;'));
assert.ok(!cropShader.includes('objectNormal.xz*=1.-fieldFlatten;'));
assert.ok(shaderFor('Irrigation water').includes('objectNormal.xz*=1.-fieldFlatten;'),'Accepted water response stays unchanged');
for(const flatten of [0,.3,.7,.92])for(const [x,z] of [[-2,-1],[1.7,2.1],[8,-7]]){
 const point=new THREE.Vector3(x,.08,z),a=new THREE.Vector3(1,.8,.2),b=new THREE.Vector3(.1,-.3,1);
 const normal=a.clone().cross(b).normalize();
 const analytic=normal.clone();analytic.x-=2*x/1800*flatten*normal.y;analytic.z-=2*z/1800*flatten*normal.y;analytic.normalize();
 const deform=p=>new THREE.Vector3(p.x,p.y+(p.x*p.x+p.z*p.z)/1800*flatten,p.z);
 const epsilon=1e-5,origin=deform(point);
 const numerical=deform(point.clone().addScaledVector(a,epsilon)).sub(origin)
  .cross(deform(point.clone().addScaledVector(b,epsilon)).sub(origin)).normalize();
 assert.ok(analytic.distanceTo(numerical)<1e-7,'Crop normal follows the actual deformed tangent plane');
}
console.log('PASS canopy normal transform: numerical tangent plane, four flatten states, water unchanged');
