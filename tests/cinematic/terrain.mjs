import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import { buildTerrain } from '../../apps/web/public/cinematic/terrain.js';

// The highlighted perimeter must remain above the actual rendered field meshes,
// including the raised tracks. This catches the corner-only curve clipping bug.
const asset = name => JSON.parse(readFileSync(new URL(`../../apps/web/public/cinematic/models/${name}.mesh.json`, import.meta.url), 'utf8'));
const terrain = buildTerrain({farmland:asset('farmland'), tree:asset('tree')});
terrain.updateMatrixWorld(true);
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
