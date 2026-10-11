import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeMeshAsset} from '../../apps/web/public/cinematic/mesh-assets.js';
import {buildTerrain} from '../../apps/web/public/cinematic/terrain.js';

const load=async name=>JSON.parse(await readFile(new URL(`../../apps/web/public/cinematic/models/${name}.mesh.json`,import.meta.url)));
const spacecraftData=await load('spacecraft');
const spacecraft=decodeMeshAsset(spacecraftData);
for(const name of ['Photovoltaic cells','Recessed optical glass','MLI · champagne gold','Anodized aluminium','Thermal radiator']){
 const material=spacecraft.children.find(mesh=>mesh.name===name)?.material;
 const exported=spacecraftData.meshes.find(mesh=>mesh.name===name)?.material;
 assert.ok(material?.isMeshPhysicalMaterial,`${name} retains Blender PBR material values`);
 assert.equal(material.metalness,exported.metalness,`${name} retains exported metalness`);
 assert.equal(material.roughness,exported.roughness,`${name} retains exported base roughness`);
 assert.equal(typeof material.onBeforeCompile,'function',`${name} receives authored runtime detail`);
 const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>'};
 material.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/authoredSurfacePosition/,name);
 assert.match(shader.fragmentShader,/surfaceNoise/);
 assert.match(shader.fragmentShader,/roughnessFactor/);
}
const [farmland,tree]=await Promise.all([load('farmland'),load('tree')]);
const terrain=buildTerrain({farmland,tree},{day:{},rotation:undefined});
const water=terrain.children.find(mesh=>mesh.name==='Irrigation water');
assert.ok(water?.material.onBeforeCompile,'Terrain water keeps its role material shader');
const shader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>'};
water.material.onBeforeCompile(shader);
assert.match(shader.fragmentShader,/terrainMicroHeight/);
assert.match(shader.fragmentShader,/waterGlint/);
assert.match(shader.fragmentShader,/localDetail/);
const treeMesh=decodeMeshAsset(tree,0);
const foliage=treeMesh.children.find(mesh=>mesh.name==='Tree foliage')?.material;
assert.equal(typeof foliage?.onBeforeCompile,'function','Tree foliage gets a batched canopy shader');
const foliageShader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>'};
foliage.onBeforeCompile(foliageShader);
assert.match(foliageShader.vertexShader,/leafRelief/,'Leaf relief changes the silhouette without adding triangles');
assert.match(foliageShader.fragmentShader,/canopyShade/,'Canopy retains clumped color and roughness variation');
console.log('PASS runtime material pipeline: spacecraft response, terrain grain, canal water and Blender PBR values');
