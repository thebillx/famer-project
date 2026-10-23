import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {descentSurface} from './descent-surface.js';
import {smooth} from './timeline.js';

function tuneRegionalMaterial(material,name,environment){
 const surface=material.userData.surface;
 const baseOpacity=material.opacity;
 const shellCurve=name.includes('regional-ground')?'smoothstep(8.,12.,regionalHandoff)':'smoothstep(12.,31.5,regionalHandoff)';
 material.envMap=environment;
 material.envMapIntensity=surface==='water'?1.08:surface==='leaf'?.34:.24;
 material.transparent=true;
 material.depthWrite=surface!=='water';
 material.opacity=0;
 if(surface==='water'){
  material.ior=1.333;material.clearcoat=.68;material.clearcoatRoughness=.15;
  material.roughness=.24;material.color.lerp(new THREE.Color(0x173c48),.55);
 }else if(surface==='leaf'){
  material.roughness=.90;material.color.setRGB(.055,.125,.06);
 }else if(name.includes('access')){
  material.roughness=.82;material.color.multiply(new THREE.Color(0xd2c39d));
 }else if(name.includes('regional-ground')){
  // The authored broad ground sits directly below the Hero derivative during
  // the handoff. Keep its near response in the same olive family so the
  // destination reads as part of one landscape under the warm key.
  material.roughness=.90;material.envMapIntensity=.20;material.color.setRGB(.10,.16,.065);
 }else{
  material.roughness=Math.max(.84,material.roughness);
 }
 material.userData.baseOpacity=baseOpacity;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 regionalPosition;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nregionalPosition=position;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 regionalPosition;\nfloat regionalHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat regionalNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(regionalHash(i),regionalHash(i+vec2(1.,0.)),f.x),mix(regionalHash(i+vec2(0.,1.)),regionalHash(i+vec2(1.,1.)),f.x),f.y);}')
   .replace('#include <color_fragment>',`#include <color_fragment>\nfloat regionalHandoff=max(abs(regionalPosition.x),abs(regionalPosition.z))+sin(regionalPosition.x*.19)*.55+sin(regionalPosition.z*.14)*.45;\nfloat shell=${shellCurve};\nif(shell<.012)discard;\nfloat broad=regionalNoise(regionalPosition.xz*.018);\nfloat middle=regionalNoise(regionalPosition.xz*.065+vec2(7.3,-4.1));\ndiffuseColor.rgb*=.88+.16*broad+.055*middle;\nfloat farDepth=smoothstep(55.,520.,-regionalPosition.z);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.20,.28,.29),farDepth*.42);\ndiffuseColor.a*=shell;`);
 };
 material.customProgramCacheKey=()=>`agriscope-scene4-regional-v5-${surface}-${name}`;
}

// The mesh is a compact derivative of the SHA-bound Scene 4 establishing
// source. It supplies authored valley, drainage, access, ridge and vegetation
// masses around the protected Hero asset; the accepted field remains separate.
export function buildScene4Regional(asset,{environment=null,surfaceMaps={}}={}){
 const group=decodeMeshAsset(asset,0,surfaceMaps);
 group.name='Scene 4 connected regional landscape · Blender runtime derivative';
 const materials=new Set();
 group.traverse(object=>{
  if(!object.isMesh)return;
  object.castShadow=false;object.receiveShadow=true;object.renderOrder=-2;
  tuneRegionalMaterial(object.material,object.name,environment);materials.add(object.material);
 });
 // The authored continuation begins around the Hero derivative's outer edge. The matching broad feather
 // meets the preserved Hero core there, instead of cutting away the river,
 // woodland and land-cover forms until the old 32-unit parcel grid dominates.
 // A small vertical separation prevents z-fighting through that join.
 group.position.y=-.08;group.visible=false;
 group.userData.apply=p=>{
  const surface=descentSurface(p),arrival=smooth(.424,.468,p),departure=1-smooth(.72,.78,p);
  const opacity=arrival*departure;
  group.visible=opacity>.002;group.scale.setScalar(surface.scale);
  for(const material of materials)material.opacity=(material.userData.baseOpacity||1)*opacity;
  return {opacity,scale:surface.scale,triangles:asset.triangles,batches:asset.meshes.length};
 };
 return group;
}
