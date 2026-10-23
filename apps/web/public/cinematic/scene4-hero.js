import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {descentSurface} from './descent-surface.js';
import {TERRAIN_CURVE_DIVISOR} from './terrain.js';
import {smooth} from './timeline.js';

function tuneHeroMaterial(material,name,environment,flatten){
 const surface=material.userData.surface;
 const baseOpacity=material.opacity;
 const outerGroundTone=name.includes('hero-ground')?'\nfloat outerGround=smoothstep(8.,24.,heroHandoff);\ndiffuseColor.rgb*=mix(vec3(1.),vec3(.52,.82,.45),outerGround*.82);':'';
 material.envMap=environment;
 material.transparent=true;
 material.opacity=0;

 if(surface==='water'){
  // Keep the authored canal response, but broaden and darken reflections so
  // the grazing outdoor environment cannot turn it into a white focal line.
  material.envMapIntensity=.42;
  material.ior=1.333;
  material.specularIntensity=.48;
  material.clearcoat=.48;
  material.clearcoatRoughness=.24;
  material.roughness=.30;
  material.normalScale.setScalar(.22);
  material.color.lerp(new THREE.Color(0x123c42),.52);
  material.depthWrite=false;
 }else if(surface==='crop'){
  material.envMapIntensity=name.includes('hero-rows')?.38:.30;
  material.roughness=Math.max(name.includes('hero-rows')?.84:.88,material.roughness);
  material.clearcoat=Math.min(material.clearcoat,.04);
  material.normalScale.setScalar(.38);
  material.depthWrite=true;
 }else if(name.includes('hero-ground')){
  // This is the continuous substrate below the authored holdings. A dark
  // olive response lets the distinct access/bank soils remain brown without
  // exposing a broad clay-colored plate at the regional handoff.
  material.color.setRGB(.065,.105,.038);
  material.envMapIntensity=.16;
  material.roughness=.94;
  material.clearcoat=0;
  material.normalScale.setScalar(.34);
  material.depthWrite=true;
 }else{
  material.envMapIntensity=.18;
  material.roughness=Math.max(.90,material.roughness);
  material.clearcoat=0;
  material.normalScale.setScalar(.34);
  material.depthWrite=true;
 }

 material.userData.baseOpacity=baseOpacity;
 material.onBeforeCompile=shader=>{
  shader.uniforms.fieldFlatten=flatten;
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nuniform float fieldFlatten;\nvarying vec3 heroPosition;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed.y+=dot(position.xz,position.xz)/${TERRAIN_CURVE_DIVISOR}.*fieldFlatten;\nheroPosition=position;`);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 heroPosition;')
   .replace('#include <color_fragment>',`#include <color_fragment>\nfloat heroHandoff=max(abs(heroPosition.x),abs(heroPosition.z))+sin(heroPosition.x*.19)*.55+sin(heroPosition.z*.14)*.45;${outerGroundTone}\nfloat heroFeather=1.-smoothstep(12.,31.5,heroHandoff);\nif(heroFeather<.012)discard;\ndiffuseColor.a*=heroFeather;`);
 };
 material.customProgramCacheKey=()=>`agriscope-scene4-hero-v3-${surface}-${name}`;
}

// Runtime derivative of 08_EXPORT in the SHA-bound Scene 4 establishing master.
// The authored origin, orientation and shared descent transform preserve the
// sample/NDVI registration; a broad, subtly irregular edge feather hands only
// its outer extent to the Scene 4 regional shell. The separately accepted Hero
// milestone remains an archived visual reference, not this exporter's input.
export function buildScene4Hero(asset,{environment=null,surfaceMaps={}}={}){
 const group=decodeMeshAsset(asset,0,surfaceMaps);
 group.name='Scene 4 Hero Field · Blender runtime derivative';
 const materials=new Set(),flatten={value:0};
 group.traverse(object=>{
  if(!object.isMesh)return;
  object.castShadow=false;
  object.receiveShadow=true;
  object.renderOrder=-1;
  tuneHeroMaterial(object.material,object.name,environment,flatten);
  materials.add(object.material);
 });
 group.visible=false;
 group.userData.apply=(p,fieldFlatten=0)=>{
  const surface=descentSurface(p),opacity=smooth(.424,.468,p);
  flatten.value=fieldFlatten;
  group.visible=opacity>.002;
  group.scale.setScalar(surface.scale);
  for(const material of materials)material.opacity=material.userData.baseOpacity*opacity;
  return {opacity,scale:surface.scale,flatten:flatten.value,triangles:asset.triangles,batches:asset.meshes.length};
 };
 return group;
}
