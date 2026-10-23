import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import {buildSpacecraft} from '../../apps/web/public/cinematic/spacecraft.js';
import {sampleSpacecraft,sampleCamera} from '../../apps/web/public/cinematic/timeline.js';
import {descentSurface,projectDescentSurface,descentCloudHeight} from '../../apps/web/public/cinematic/descent-surface.js';
import {buildSurveyCorridor} from '../../apps/web/public/cinematic/survey-corridor.js';
import {decodeMeshAsset,loadSurfaceMaps} from '../../apps/web/public/cinematic/mesh-assets.js';
import {bindTerrainEnvironment,buildTerrain} from '../../apps/web/public/cinematic/terrain.js';
import {buildScene4Regional} from '../../apps/web/public/cinematic/scene4-regional.js';
import {buildScene4Hero} from '../../apps/web/public/cinematic/scene4-hero.js';
import {buildDescentAtmosphere} from '../../apps/web/public/cinematic/descent-atmosphere.js';

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
const [farmland,tree,scene4RegionalData,scene4HeroData]=await Promise.all([load('farmland'),load('tree'),load('scene4-regional'),load('scene4-hero')]);

const mapRoles=new Set();
for(const data of [spacecraftData,farmland,tree,scene4RegionalData,scene4HeroData])for(const variant of data.variants||[data])for(const mesh of variant.meshes){
 if(mesh.material.surface)mapRoles.add(mesh.material.surface);
}
assert.deepEqual([...mapRoles].sort(),['crop','leaf','metal','soil','solar','water'],'All exported authored surface roles are known');

const loadedTextures=[];
const maps=await loadSurfaceMaps([spacecraftData,farmland,tree,scene4RegionalData,scene4HeroData],{loadAsync:async url=>{
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
 loadSurfaceMaps([spacecraftData,farmland,tree,scene4RegionalData,scene4HeroData],{loadAsync:async url=>{
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
for(const name of ['Survey / blue-black energy cells','Survey / multispectral glass','Survey / ceramic armour','Survey / brushed titanium','Survey / status gold']){
 const material=spacecraft.getObjectByName(name)?.material;
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
const solar=spacecraft.getObjectByName('Survey / blue-black energy cells')?.material;
assert.equal(solar?.map,maps.solar.map,'Solar cells receive their authored color response');
assert.equal(solar?.normalMap,maps.solar.normalMap,'Solar cells receive restrained micro-surface normals');
assert.equal(solar?.roughnessMap,maps.solar.roughnessMap,'Solar cells receive authored reflection roughness');
assert.equal(solar?.iridescence,.16,'Solar cells retain a restrained angle-dependent physical response');
assert.equal(solar?.envMapIntensity,.35,'Solar cells retain a readable orbital reflection');
assert.ok(spacecraft.getObjectByName('Survey / status gold').material.emissiveIntensity>0,'Gold status bars retain authored emission');
const terrain=buildTerrain({farmland,tree},{day:{},rotation:undefined,surfaceMaps:maps});
const water=terrain.children.find(mesh=>mesh.name==='Irrigation water');
const shallowWet=terrain.children.find(mesh=>mesh.name==='Rice field · shallow wet');
const dampBank=terrain.children.find(mesh=>mesh.name==='Damp channel shoulder');
const wetBank=terrain.children.find(mesh=>mesh.name==='Wet channel earth');
assert.ok(water?.material.onBeforeCompile,'Terrain water keeps its role material shader');
assert.equal(water?.material.transparent,true,'Irrigation water retains a restrained view into the recessed bed');
assert.equal(water?.material.opacity,.94,'Irrigation water keeps the authored reflection legible over the recessed bed');
assert.ok(dampBank?.material.onBeforeCompile,'Damp canal shoulders keep their distinct material response');
assert.ok(wetBank?.material.onBeforeCompile,'Wet canal slopes keep their distinct material response');
assert.equal(shallowWet?.material.userData.surface,'water','Decoded shallow wet paddy retains its authored semantic surface role');
const fieldEnvironment={name:'focused terrain environment fixture'};
bindTerrainEnvironment(terrain,fieldEnvironment);
assert.equal(shallowWet.material.envMap,fieldEnvironment,'Shallow wet paddy receives the agricultural environment');
assert.equal(shallowWet.material.envMapIntensity,1.65,'Shallow wet paddy reaches the semantic water environment branch');
const shader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>\n#include <opaque_fragment>'};
water.material.onBeforeCompile(shader);
assert.equal(shader.uniforms.surfaceKind.value,4,'Irrigation plane uses the physical water material branch');
assert.doesNotMatch(shader.fragmentShader,/reflectionBand|reflectedBand|bandedReflection|waterRipple|flowWave|crossWave/,'Water no longer paints a periodic reflection pattern in either shader stage');
assert.match(shader.fragmentShader,/diffuseColor\.rgb\*=vec3\(\.78,\.90,\.92\)/,'Water retains only a restrained absorption tint before native physical lighting');
assert.equal(water.material.ior,1.333,'Irrigation water uses a physical index of refraction');
assert.ok(water.material.normalMap,'Irrigation water variation is driven by the authored normal map');
assert.ok(water.material.envMapIntensity>1,'Irrigation water retains a restrained environment response');
assert.match(shader.vertexShader,/objectNormal\.xz\*=1\.-\.82\*localDetail/,'Local water normals suppress relief tessellation bands before the authored normal map is applied');
assert.doesNotMatch(shader.fragmentShader,/bankShadow|canalAxis|3\.12|2\.95/,'Water response is no longer tied to the removed rectangular moat coordinates');
assert.match(shader.vertexShader,/agriculturalViewNormal=normalize\(normalMatrix\*objectNormal\)/,'Water view response uses the flattened authored surface normal');
assert.doesNotMatch(shader.fragmentShader,/normalize\(agriculturalViewNormal\)|normalize\(normal\)/,'Water color does not duplicate the physical material Fresnel calculation');
assert.match(shader.fragmentShader,/localDetail/);
const shallowWetShader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>'};
shallowWet.material.onBeforeCompile(shallowWetShader);
assert.equal(shallowWetShader.uniforms.surfaceKind.value,4,'Shallow wet paddy reaches the semantic water roughness and tint branch');
const wetShader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>'};
wetBank.material.onBeforeCompile(wetShader);
assert.equal(wetShader.uniforms.surfaceKind.value,6,'Channel slopes use the wet-soil branch');
const dampShader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_begin>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <color_fragment>'};
dampBank.material.onBeforeCompile(dampShader);
assert.equal(dampShader.uniforms.surfaceKind.value,5,'Channel shoulders use the damp-soil branch');
const treeMesh=decodeMeshAsset(tree,0,maps);
const foliage=treeMesh.children.find(mesh=>mesh.name==='Tree foliage')?.material;
assert.equal(foliage?.map,maps.leaf.map,'Tree foliage receives its authored color map');
assert.equal(foliage?.normalMap,maps.leaf.normalMap,'Tree foliage receives its authored normal map');
assert.equal(foliage?.roughnessMap,maps.leaf.roughnessMap,'Tree foliage receives its authored roughness map');
console.log('PASS runtime material pipeline: surface role loading/disposal, spacecraft PBR response, terrain grain, canal water and Blender PBR values');

const articulated=buildSpacecraft(spacecraftData,maps);
assert.equal(articulated.userData.parts.size,12,'Two wings, two rings and eight iris blades have authored pivots');
const mechanismState=p=>{
 articulated.userData.apply(sampleSpacecraft(p));articulated.updateMatrixWorld(true);
 return [...articulated.userData.parts].map(([name,part])=>[name,...part.matrix.elements]);
};
const closed=mechanismState(0),deployed=mechanismState(.30);
assert.notDeepEqual(closed,deployed,'Deployment moves the authored mechanisms');
assert.deepEqual(mechanismState(0),closed,'Reverse traversal returns every mechanism to its exact closed transform');
assert.deepEqual(mechanismState(.30),deployed,'Revisiting deployment is deterministic');
const partMesh=spacecraftData.meshes.find(mesh=>mesh.part);
assert.throws(()=>decodeMeshAsset({...spacecraftData,meshes:[{...partMesh,pivot:[0,NaN,0]}]}),/Invalid mechanism pivot/);
assert.throws(()=>decodeMeshAsset({...spacecraftData,meshes:[partMesh,{...partMesh,pivot:[999,0,0]}]}),/Inconsistent mechanism pivot/);
const corridor=buildSurveyCorridor();
const corridorState=p=>{
 const craft=sampleSpacecraft(p),payload=new THREE.Vector3(0,0,1.44).applyQuaternion(craft.quaternion).add(craft.position);
 corridor.userData.apply(p,payload,.5);corridor.updateMatrixWorld(true);
 const state=[];corridor.traverse(object=>{state.push([object.name,object.visible,...object.matrix.elements]);
  if(object.geometry?.attributes.position)assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite));
 });return state;
};
const open=corridorState(.39);corridorState(.95);assert.deepEqual(corridorState(.39),open);
assert.equal(corridor.userData.beam.material.uniforms.spectral.value>0,true,'Spectral passage exists only during the authored corridor beat');
corridorState(.56);assert.equal(corridor.userData.beam.visible,false,'Data volume ends before product assessment');
console.log('PASS articulated pivots, reverse deployment, authored emission, finite survey footprint and spectral passage');

const regionalEnvironment={name:'Scene 4 environment fixture'};
const scene4Regional=buildScene4Regional(scene4RegionalData,{environment:regionalEnvironment,surfaceMaps:maps});
const regionalMaterials=scene4Regional.children.map(mesh=>mesh.material);
const regionalState=p=>{
 const applied=scene4Regional.userData.apply(p);
 return {applied,visible:scene4Regional.visible,scale:scene4Regional.scale.toArray(),opacities:regionalMaterials.map(material=>material.opacity)};
};
const regionalHidden=regionalState(.42),regionalVisible=regionalState(.47);
assert.equal(regionalHidden.visible,false,'Scene 4 continuation stays absent before the local transition');
assert.equal(regionalVisible.visible,true,'Scene 4 continuation arrives with the atmospheric descent');
assert.equal(regionalVisible.applied.triangles,42234);assert.equal(regionalVisible.applied.batches,6);
assert.ok(regionalVisible.opacities.every(opacity=>opacity>0),'Every regional broad-form batch participates in the selected descent');
assert.equal(regionalState(.70).visible,true,'Scene 4 continuation supports the boundary and quality chapters');
assert.equal(regionalState(.80).visible,false,'Scene 4 continuation clears before the comparison settles');
assert.deepEqual(regionalState(.47),regionalVisible,'Scene 4 continuation restores exact visibility, scale, and material opacity in reverse');
for(const material of regionalMaterials)assert.equal(material.envMap,regionalEnvironment,'Regional materials share the bounded agricultural environment');
const regionalGround=scene4Regional.getObjectByName('Scene 4 regional · regional-ground');
const regionalShader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
regionalGround.material.onBeforeCompile(regionalShader);
assert.match(regionalShader.fragmentShader,/float regionalHandoff=max\(abs\(regionalPosition\.x\),abs\(regionalPosition\.z\)\)\+sin\(regionalPosition\.x\*\.19\)\*\.55\+sin\(regionalPosition\.z\*\.14\)\*\.45/,'Regional derivative follows the broad authored box edge without a circular stage seam');
assert.match(regionalShader.fragmentShader,/float shell=smoothstep\(8\.,12\.,regionalHandoff\)/,'Regional ground underpaint closes the warm-sky gap below the Hero feather');
assert.match(regionalShader.fragmentShader,/if\(shell<\.012\)discard/,'Regional derivative does not cover the Scene 4 Hero core');
const regionalCanopy=scene4Regional.getObjectByName('Scene 4 regional · regional-canopy');
const regionalCanopyShader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
regionalCanopy.material.onBeforeCompile(regionalCanopyShader);
assert.match(regionalCanopyShader.fragmentShader,/float shell=smoothstep\(12\.,31\.5,regionalHandoff\)/,'Regional forms above the underpaint still meet the Hero asset across the selected broad feather');

const heroEnvironment={name:'Hero Field environment fixture'};
const scene4Hero=buildScene4Hero(scene4HeroData,{environment:heroEnvironment,surfaceMaps:maps});
const heroMaterials=scene4Hero.children.map(mesh=>mesh.material);
const heroState=(p,flatten=0)=>{
 const applied=scene4Hero.userData.apply(p,flatten);
 return {applied,visible:scene4Hero.visible,position:scene4Hero.position.toArray(),rotation:scene4Hero.rotation.toArray(),scale:scene4Hero.scale.toArray(),opacities:heroMaterials.map(material=>material.opacity)};
};
const heroHidden=heroState(.42),heroVisible=heroState(.47);
assert.equal(heroHidden.visible,false,'Scene 4 Hero derivative stays absent before the local transition');
assert.equal(heroVisible.visible,true,'Scene 4 Hero derivative replaces the legacy local landscape during descent');
assert.equal(heroVisible.applied.triangles,98743);assert.equal(heroVisible.applied.batches,12);
assert.deepEqual(heroVisible.position,[0,0,0],'Hero Field remains at its authored registration origin');
assert.deepEqual(heroVisible.rotation,[0,0,0,'XYZ'],'Hero Field does not rotate away from its sample registration');
assert.ok(heroVisible.opacities.every(opacity=>opacity>0),'Every Hero material batch participates in the selected descent');
assert.equal(heroState(.70).visible,true,'Hero Field remains through the settled product chapters');
assert.equal(heroState(1).visible,true,'Hero Field remains through the application handoff');
assert.deepEqual(heroState(.47),heroVisible,'Hero visibility, scale, registration, and material opacity restore exactly in reverse');
for(const material of heroMaterials){
 assert.equal(material.envMap,heroEnvironment,'Hero materials share the bounded agricultural environment');
 assert.equal(material.transparent,true,'Hero materials retain a deterministic transition envelope');
 assert.ok(['crop','soil','water'].includes(material.userData.surface),'Hero batches retain their exported semantic surface roles');
}
const heroGround=scene4Hero.getObjectByName('Scene 4 hero · hero-ground');
const heroShader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
heroGround.material.onBeforeCompile(heroShader);
assert.match(heroShader.vertexShader,/uniform float fieldFlatten;/,'Hero materials receive the terrain-owned flatten value');
assert.match(heroShader.vertexShader,/transformed\.y\+=dot\(position\.xz,position\.xz\)\/1800\.\*fieldFlatten;/,'Hero vertices use the exact legacy terrain, sample-boundary, and NDVI curvature displacement');
assert.match(heroShader.fragmentShader,/float heroHandoff=max\(abs\(heroPosition\.x\),abs\(heroPosition\.z\)\)\+sin\(heroPosition\.x\*\.19\)\*\.55\+sin\(heroPosition\.z\*\.14\)\*\.45/,'Hero derivative follows the same broad authored box edge as the regional shell');
assert.match(heroShader.fragmentShader,/float heroFeather=1\.-smoothstep\(12\.,31\.5,heroHandoff\)/,'Hero derivative uses the exact complement of the regional join');
assert.match(heroShader.fragmentShader,/if\(heroFeather<\.012\)discard/,'Hero derivative releases its outer extent to the regional shell');
const registeredHero=heroState(.53,.37);
heroState(.70,.92);
assert.deepEqual(heroState(.53,.37),registeredHero,'Hero scale, opacity, registration, and flatten restore exactly after reverse traversal');
assert.equal(heroShader.uniforms.fieldFlatten.value,.37,'Hero apply owns the current flatten uniform without accumulating displacement');

const cloudState=(atmosphere,p)=>{
 const applied=atmosphere.userData.apply(p);
 const banks=atmosphere.children.filter(child=>child.material.uniforms.warmEdge);
 const sky=atmosphere.children.find(child=>!child.material.uniforms.warmEdge);
 return {applied,visible:atmosphere.visible,scale:atmosphere.scale.toArray(),skyOpacity:sky.material.uniforms.opacity.value,opacities:banks.map(bank=>bank.material.uniforms.opacity.value),warmEdges:banks.map(bank=>bank.material.uniforms.warmEdge.value)};
};
const desktopAtmosphere=buildDescentAtmosphere(),mobileAtmosphere=buildDescentAtmosphere({mobile:true});
assert.equal(desktopAtmosphere.children.length,7,'Atmosphere owns one sky shell plus six cloud banks');assert.equal(desktopAtmosphere.userData.asset.banks,6);assert.equal(desktopAtmosphere.userData.asset.samples,14);
assert.equal(mobileAtmosphere.children.length,7,'Mobile retains the same sky and cloud composition');assert.equal(mobileAtmosphere.userData.asset.banks,6);assert.equal(mobileAtmosphere.userData.asset.samples,10);
const cloudsBefore=cloudState(desktopAtmosphere,.395),cloudsOpen=cloudState(desktopAtmosphere,.47);
assert.equal(cloudsBefore.visible,false,'Separate Scene 4 atmosphere stays absent before its authored passage');
assert.equal(cloudsOpen.visible,true,'Six near/middle/far cloud banks frame the local descent');
assert.ok(cloudsOpen.opacities.every(opacity=>opacity>0),'Every cloud bank receives a bounded opacity inside the passage');
assert.ok(cloudState(desktopAtmosphere,.60).opacities.every(opacity=>opacity===0),'Scene 4 cloud banks clear for the Hero Field reveal');
assert.equal(cloudState(desktopAtmosphere,.70).visible,false,'The atmospheric sky shell clears after the passage');
assert.deepEqual(cloudState(desktopAtmosphere,.47),cloudsOpen,'Cloud bank visibility, scale, opacity, and edge light restore exactly in reverse');
assert.deepEqual(cloudState(mobileAtmosphere,.47).opacities,cloudsOpen.opacities,'Mobile changes sample cost without changing authored cloud hierarchy');
console.log('PASS deterministic Scene 4 regional shell and six-bank desktop/mobile atmosphere');

// The corrective visual contract: no enclosing cone or screen-sized plane,
// exact reverse state for the dynamic geometry as well as object matrices.
const corridorGeometryState=p=>{
 corridorState(p);
 const state=[];corridor.traverse(object=>{
  if(object.geometry){assert.notEqual(object.geometry.type,'CylinderGeometry');assert.notEqual(object.geometry.type,'PlaneGeometry');state.push([object.name,...object.geometry.attributes.position.array]);}
 });return state;
};
for(const p of [.30,.36,.39,.42,.46]){
 const before=corridorGeometryState(p);corridorGeometryState(.95);
 assert.deepEqual(corridorGeometryState(p),before,`All packet and overlay coordinates reverse exactly at ${p}`);
}
// A fixed curve must retain its tube normals when only packet/ring phase changes.
const fixedPayload=new THREE.Vector3(2,13,-1);
const routeNormals=p=>{
 corridor.userData.apply(p,fixedPayload,0);
 const result=[];corridor.traverse(object=>{
  if(object.geometry?.attributes.routeNormal)result.push([object.name,...object.geometry.attributes.routeNormal.array]);
 });return result;
};
const fixedNormals=routeNormals(.39);
assert.equal(fixedNormals.length,2,'Both core and sleeve normals are checked');
assert.deepEqual(routeNormals(.40),fixedNormals,'Ring phase cannot overwrite tube normals');
assert.deepEqual(routeNormals(.39),fixedNormals,'Reverse ring phase retains tube normals');
const {fieldHeight,TERRAIN_CURVE_DIVISOR}=await import('../../apps/web/public/cinematic/terrain.js');
for(const flatten of [0,.4,.92]){
 corridor.userData.apply(.42,new THREE.Vector3(2,13,-1),flatten);
 const positions=corridor.userData.tiles.geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const scale=descentSurface(.42).scale,x=positions.getX(i)/scale,z=positions.getZ(i)/scale;
  assert.ok(Math.abs(positions.getY(i)-(fieldHeight(x,z)+(x*x+z*z)/TERRAIN_CURVE_DIVISOR*flatten)*scale-.025)<1e-6,'Regional scan vertices follow the same scaled and deformed ground relationship');
 }
}
assert.equal(corridor.userData.clouds.children.length,7,'Separated cloud volumes retain controlled negative space');
const {buildEarth}=await import('../../apps/web/public/cinematic/earth.js');
const earthMaps={day:new THREE.Texture(),clouds:new THREE.Texture(),night:new THREE.Texture(),regional:new THREE.Texture()},earth=buildEarth(earthMaps);
const sharedRegion=earth.userData.regionalBlend;
const regionalTerrain=buildTerrain({farmland,tree},{day:earthMaps.day,regional:earthMaps.regional,regionalBlend:sharedRegion});
const shaderTemplate={vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <map_fragment>\n#include <color_fragment>'};
const earthShader={...shaderTemplate,uniforms:{}},fieldShader={...shaderTemplate,uniforms:{}};
earth.userData.surface.material.onBeforeCompile(earthShader);
regionalTerrain.children.find(mesh=>mesh.name==='Rice field 1').material.onBeforeCompile(fieldShader);
for(const compiled of [earthShader,fieldShader]){
 assert.equal(compiled.uniforms.regionalMap.value,earthMaps.regional,'Both surfaces sample the one authored regional image');
 assert.equal(compiled.uniforms.regionalBlend,sharedRegion,'Both surfaces share the same progress-derived material blend');
 assert.match(compiled.fragmentShader,/local\/128\.\+\.5/,'Both maps use the authored 128-unit atlas extent');
}
for(const p of [.385,.405,.42,.44,.46,.44,.42,.405,.385]){
 const {scale,radius}=descentSurface(p);
 for(const [x,z] of [[0,0],[3.18,-8],[-18.65,3.02],[20,25]]){
  const y=Math.sqrt(900*900-x*x-z*z)-900;
  const earthRay=new THREE.Vector3(x*scale,y*scale+radius,z*scale).normalize();
  const terrainRay=new THREE.Vector3(x,y+900,z).normalize();
  assert.ok(earthRay.distanceTo(terrainRay)<1e-12,'Regional coordinates agree on the shared tangent in both directions');
 }
}
console.log('PASS shared regional atlas binding and tangent coordinates across forward/reverse expansion');

assert.notEqual(earth.userData.clouds.geometry.parameters.radius,earth.userData.highClouds.geometry.parameters.radius,'Cloud strata occupy different physical depths');
assert.equal(earth.userData.highClouds.material.bumpMap,earthMaps.clouds);
assert.equal(earth.userData.cloudShadow.material.alphaMap,earthMaps.clouds);
assert.ok(earth.userData.atmosphere.geometry.parameters.radius>earth.userData.highClouds.geometry.parameters.radius);
console.log('PASS deterministic data trace/packets, no cone/planes, terrain-conforming tiles and distinct Earth cloud strata');

// Near-shell triangles must interpolate view-space vectors, not unit directions.
// Exercise the real authored sphere and cameras at the independently reported wash.
const atmosphere=earth.userData.atmosphere;
assert.match(atmosphere.material.vertexShader,/v=-p\.xyz;/,'Preserve vector magnitude until fragment interpolation');
assert.match(atmosphere.material.fragmentShader,/normalize\(v\)/,'Normalize the interpolated view vector per fragment');
for(const [aspect,p] of [[1440/900,.449431],[375/667,.465]]){
 const key=sampleCamera(p,aspect),surface=descentSurface(p);
 const camera=new THREE.PerspectiveCamera(key.fov,aspect,.08,450);
 camera.position.copy(key.position);camera.lookAt(key.target);camera.rotateZ(key.roll);camera.updateMatrixWorld(true);
 earth.scale.setScalar(surface.radius/40);earth.position.y=-surface.radius;earth.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);
 const hit=ray.intersectObject(atmosphere)[0];assert.ok(hit,'Regression ray crosses the actual atmosphere mesh');
 const position=atmosphere.geometry.attributes.position;
 const vertices=[hit.face.a,hit.face.b,hit.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(position,i));
 const weights=new THREE.Triangle(...vertices).getBarycoord(atmosphere.worldToLocal(hit.point.clone()),new THREE.Vector3());
 const modelView=new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,atmosphere.matrixWorld);
 const interpolated=new THREE.Vector3(),oldUnitInterpolation=new THREE.Vector3();
 vertices.forEach((vertex,i)=>{
  const view=vertex.applyMatrix4(modelView).negate(),weight=weights.getComponent(i);
  interpolated.addScaledVector(view,weight);oldUnitInterpolation.addScaledVector(view.clone().normalize(),weight);
 });
 const geometricView=hit.point.clone().applyMatrix4(camera.matrixWorldInverse).negate().normalize();
 assert.ok(interpolated.normalize().distanceTo(geometricView)<1e-10,'Interpolated view agrees with the geometric ray inside the triangle');
 assert.ok(oldUnitInterpolation.normalize().distanceTo(geometricView)>.1,'Fixture catches the former normalized-vertex interpolation error');
}
console.log('PASS atmosphere view-vector interpolation at actual desktop/mobile shell-crossing triangles');


// The transition preserves the accepted triangle interiors by using a common
// affine transform, rather than independently warping sparsely sampled surfaces.
const scaleCheckpoints=[.375,.397,.405,.415,.433,.455,.465,.475];
for(const p of [...scaleCheckpoints,...scaleCheckpoints.toReversed()]){
 terrain.userData.update(p);
 assert.deepEqual(terrain.scale.toArray(),Array(3).fill(descentSurface(p).scale),`Production terrain transform at ${p}`);
}
terrain.userData.update(.465);
assert.deepEqual(terrain.scale.toArray(),[1,1,1],'Production terrain restores authored scale exactly');
const assetGeometry=decodeMeshAsset(farmland);
let interiorSamples=0;
for(const p of [.375,.397,.405,.415,.433,.455,.465,.475]){
 const a=descentSurface(p),b=descentSurface(p);assert.deepEqual(a,b);
 assert.equal(a.radius/a.scale,900,'Earth and field magnify about the same tangent point');
 for(const mesh of assetGeometry.children){
  const {position}=mesh.geometry.attributes,index=mesh.geometry.index.array;
  for(let i=0;i<index.length;i+=3){
   const triangle=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,index[i+j]));
   const weights=[.23,.31,.46],center=new THREE.Vector3(),scaledCenter=new THREE.Vector3();
   triangle.forEach((point,j)=>{
    center.addScaledVector(point,weights[j]);
    scaledCenter.addScaledVector(new THREE.Vector3(...projectDescentSurface(...point.toArray(),p)),weights[j]);
   });
   const direct=new THREE.Vector3(...projectDescentSurface(...center.toArray(),p));
   assert.ok(direct.distanceTo(scaledCenter)<1e-12,'Projection commutes with triangle-interior interpolation');interiorSamples++;
  }
 }
 assert.ok(Number.isFinite(descentCloudHeight(12,-12,p)));
}
assert.deepEqual(projectDescentSurface(17,.14,-11,.475),[17,.14,-11],'Authored field coordinates restored exactly');
for(const p of [.375,.397,.405,.415,.433,.455,.465,.475]){
 const e=1e-7,l=descentSurface(p-e),c=descentSurface(p),r=descentSurface(p+e);
 for(const key of ['radius','scale','detail','reveal']){
  assert.ok(Math.abs(l[key]-r[key])<.02,`${key} has no transition step at ${p}`);
  assert.ok(Math.abs((c[key]-l[key])/e-(r[key]-c[key])/e)<1,`${key} keeps a continuous first derivative at ${p}`);
 }
}
const envelope=corridor.getObjectByName('Survey route envelope');
assert.ok(envelope.isMesh&&envelope.geometry.index.count>0,'Corridor uses a finite physical cross-section for portrait readability');
assert.equal(corridor.userData.endpoint,null,'Landing corridor does not add the lab-only registration response');
assert.equal(corridor.userData.acquisition,null,'Landing corridor does not add the lab-only acquisition plane');
corridor.userData.apply(.39,new THREE.Vector3(2,13,-1),0);
assert.equal(corridor.userData.clouds.visible,false,'Local cloud banks do not float outside the globe before descent');
const labCorridor=buildSurveyCorridor({lab:true});
assert.equal(labCorridor.userData.endpoint.geometry.type,'CircleGeometry');
assert.equal(labCorridor.userData.endpoint.geometry.parameters.radius,1,'Registration response retains its localized unit source before the authored ellipse scale');
assert.equal(labCorridor.userData.acquisition.geometry.type,'PlaneGeometry');
assert.deepEqual([labCorridor.userData.acquisition.geometry.parameters.width,labCorridor.userData.acquisition.geometry.parameters.height],[4.95,4.57],'Acquisition response is confined to the exact sample boundary');
const labRevealState=p=>{
 labCorridor.userData.apply(p,new THREE.Vector3(2,13,-1),0);
 return {
  endpointVisible:labCorridor.userData.endpoint.visible,
  endpointOpacity:labCorridor.userData.endpoint.material.uniforms.opacity.value,
  acquisitionVisible:labCorridor.userData.acquisition.visible,
  acquisitionOpacity:labCorridor.userData.acquisition.material.uniforms.opacity.value,
  scan:labCorridor.userData.acquisition.material.uniforms.scan.value,
 };
};
const arrivalReveal=labRevealState(.48),acquisitionReveal=labRevealState(.535);
assert.equal(arrivalReveal.endpointVisible,true);assert.equal(arrivalReveal.acquisitionVisible,false,'Arrival uses the localized response before acquisition begins');
assert.equal(acquisitionReveal.endpointVisible,true);assert.equal(acquisitionReveal.acquisitionVisible,true,'Acquisition adds a distinct scan front within the exact field');
assert.ok(acquisitionReveal.acquisitionOpacity>0&&acquisitionReveal.acquisitionOpacity<=.70,'Acquisition coverage retains the bounded selected brightness');
assert.deepEqual(labRevealState(.56),{endpointVisible:false,endpointOpacity:0,acquisitionVisible:false,acquisitionOpacity:0,scan:1},'Settled field removes the temporary arrival and acquisition effects');
assert.deepEqual(labRevealState(.535),acquisitionReveal,'Reverse traversal restores the exact acquisition state');
corridor.userData.apply(.52,new THREE.Vector3(2,13,-1),0);
labCorridor.userData.apply(.52,new THREE.Vector3(2,13,-1),0);
assert.equal(corridor.userData.clouds.visible,false,'Landing cloud strata retain their established .465–.515 fade window');
assert.equal(labCorridor.userData.clouds.visible,false,'The lab disables legacy surface cloud blobs in favor of the separate Scene 4 atmosphere');
assert.equal(cloudState(desktopAtmosphere,.52).visible,true,'The separate Scene 4 atmosphere remains present during the lab descent');
const [mainSource,labMainSource]=await Promise.all([
 readFile(new URL('../../apps/web/public/cinematic/main.js',import.meta.url),'utf8'),
 readFile(new URL('../../apps/web/public/cinematic/lab-main.js',import.meta.url),'utf8'),
]);
assert.match(mainSource,/const flatten=terrain\.userData\.update\(p\);[\s\S]{0,160}heroWorld\?\.userData\.apply\(p,flatten\)/,'The runtime passes the terrain-owned flatten value directly to the Hero update');
assert.doesNotMatch(mainSource,/from ['"]\.\/lab-timeline\.js['"]/,'The landing entry graph does not request the lab camera timeline');
assert.match(labMainSource,/from ['"]\.\/lab-timeline\.js['"]/,'Only the lab entry imports its camera timeline');
assert.match(mainSource,/lab\?\.38:\.35/,'Landing bloom radius remains .35 while the lab opts into .38');
assert.match(mainSource,/if\(lab\)\{[\s\S]*?fieldKey=new THREE\.SpotLight/,'The Hero Field spotlight is constructed only for the lab');
console.log(`PASS shared tangent magnification: ${interiorSamples} authored triangle interiors, continuous scale/material weights, stable cloud placement and portrait corridor geometry`);
