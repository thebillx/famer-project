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
 ['Irrigation water','water'],['Wet channel earth','bank'],
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
const position = terrain.userData.boundary.geometry.attributes.position;
const surfaces = terrain.children.filter(mesh => mesh.isMesh && !mesh.isInstancedMesh && mesh.material.isMeshStandardMaterial);
const ray = new THREE.Raycaster();
const vertex = new THREE.Vector3();
let samples = 0;
for (let ring = 0; ring <= 256; ring += 8) {
  for (let side = 0; side <= 6; side++) {
    vertex.fromBufferAttribute(position, ring * 7 + side);
    ray.set(new THREE.Vector3(vertex.x, 5, vertex.z), new THREE.Vector3(0, -1, 0));
    const ground = ray.intersectObjects(surfaces, false)[0];
    assert.ok(ground, 'Perimeter stays over rendered terrain');
    assert.ok(vertex.y > ground.point.y + .006, `Perimeter intersects terrain at ring ${ring}, side ${side}`);
    samples++;
  }
}
for (let side = 0; side <= 6; side++) {
  const first = new THREE.Vector3().fromBufferAttribute(position, side);
  const last = new THREE.Vector3().fromBufferAttribute(position, 256 * 7 + side);
  assert.ok(first.distanceTo(last) < 1e-6, 'Perimeter closes without a seam');
}
console.log(`PASS: ${samples} perimeter vertices clear rendered field surfaces; closed seam`);
