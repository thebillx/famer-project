import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {descentSurface} from './descent-surface.js';
import {smooth} from './timeline.js';

function tuneContextMaterial(material,name,environment){
 const surface=material.userData.surface,baseOpacity=material.opacity;
 const field=name.includes('context-field-');
 const connected=name.includes('context-cultivation')?'1.':'smoothstep(7.,32.,-contextPosition.z)';
 const edge=name.includes('context-ground')||field?'smoothstep(29.,38.,-contextPosition.z)':'1.';
 material.envMap=environment;
 material.transparent=true;
 material.opacity=0;
 material.depthWrite=false;
 material.polygonOffset=surface!=='water';
 material.polygonOffsetFactor=-1;
 material.polygonOffsetUnits=-1;
 if(surface==='water'){
  material.envMapIntensity=.48;material.ior=1.333;material.clearcoat=.50;
  material.clearcoatRoughness=.22;material.roughness=.31;
  material.color.lerp(new THREE.Color(0x123b43),.58);
 }else if(field){
  material.envMapIntensity=.22;
 }else if(surface==='leaf'){
  material.envMapIntensity=.24;material.roughness=.93;
  material.color.setRGB(.045,.105,.052);
 }else if(surface==='crop'){
  material.envMapIntensity=.27;material.roughness=.91;
 }else if(name.includes('context-access')){
  material.envMapIntensity=.18;material.roughness=.88;
  material.color.setRGB(.19,.16,.10);
 }else{
  material.envMapIntensity=.15;material.roughness=.95;
  material.color.setRGB(.075,.13,.062);
 }
 material.userData.baseOpacity=baseOpacity;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 contextPosition;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat contextLift=1.35*smoothstep(7.,32.,-position.z);\nif(position.z<7.)transformed.y+=contextLift;\ncontextPosition=position;`);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 contextPosition;')
   .replace('#include <color_fragment>',`#include <color_fragment>\nfloat contextConnection=${connected};\nfloat contextEdge=${edge};\nfloat contextBroad=.94+.08*sin(contextPosition.x*.085+contextPosition.z*.031)*sin(contextPosition.z*.047);\ndiffuseColor.rgb*=contextBroad;\ndiffuseColor.a*=contextConnection*contextEdge;\nif(diffuseColor.a<.012)discard;`);
 };
 material.customProgramCacheKey=()=>`agriscope-scene4-context-v1-${surface}-${name}`;
}

// Compact, source-bound broad forms from HF_LANDSCAPE_COMPOSITION. These
// restore the authored access, drainage and vegetation belts that were absent
// when the browser loaded only the 08_EXPORT Hero collection. The protected
// sample/NDVI geometry remains owned by scene4-hero.js at the same origin.
export function buildScene4Context(asset,{environment=null,surfaceMaps={}}={}){
 const group=decodeMeshAsset(asset,0,surfaceMaps);
 group.name='Scene 4 Hero surroundings · Blender runtime derivative';
 const materials=new Set(),meshes=[];
 group.traverse(object=>{
  if(!object.isMesh)return;
  object.userData.intendedCastShadow=object.name.includes('context-cultivation')||object.name.includes('context-verge');
  object.castShadow=false;
  object.receiveShadow=true;
  object.renderOrder=object.material.userData.surface==='water'?0:-.5;
  tuneContextMaterial(object.material,object.name,environment);materials.add(object.material);meshes.push(object);
 });
 group.visible=false;
 group.userData.apply=p=>{
  const surface=descentSurface(p),arrival=smooth(.402,.452,p),departure=1-smooth(.72,.78,p);
  const opacity=arrival*departure;
  group.visible=opacity>.002;group.scale.setScalar(surface.scale);
  for(const material of materials){
   material.opacity=material.userData.baseOpacity*opacity;
   material.depthWrite=material.userData.surface!=='water'&&opacity>.995;
  }
  for(const mesh of meshes)mesh.castShadow=mesh.userData.intendedCastShadow&&opacity>.995;
  return {opacity,scale:surface.scale,triangles:asset.triangles,batches:asset.meshes.length};
 };
 return group;
}
