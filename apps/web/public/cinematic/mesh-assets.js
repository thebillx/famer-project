import * as THREE from './vendor.js';

function bytes(text) {
 const raw=atob(text),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}

const materialNoise = `
float surfaceHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float surfaceNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1.,0.,0.)),f.x),mix(surfaceHash(i+vec3(0.,1.,0.)),surfaceHash(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(surfaceHash(i+vec3(0.,0.,1.)),surfaceHash(i+vec3(1.,0.,1.)),f.x),mix(surfaceHash(i+vec3(0.,1.,1.)),surfaceHash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
`;

function authoredSurface(material,name){
 const role=name.toLowerCase();
 const kind=role.includes('photovoltaic')?1:role.includes('optical')?2:role.includes('mli')?3:role.includes('aluminium')?4:role.includes('thermal')?5:6;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 authoredSurfacePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nauthoredSurfacePosition=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 authoredSurfacePosition;${materialNoise}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
float finishGrain=surfaceNoise(authoredSurfacePosition*38.);
float finishCloud=surfaceNoise(authoredSurfacePosition*5.);
if(${kind}==1){
 vec2 cell=abs(fract(authoredSurfacePosition.xy*7.)-.5);
 float conductor=1.-smoothstep(.035,.075,min(cell.x,cell.y));
 float cellTone=.91+.13*surfaceNoise(authoredSurfacePosition*1.7);
 diffuseColor.rgb*=cellTone;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.34,.45),conductor*.42);
}else if(${kind}==2){
 float radial=length(authoredSurfacePosition.xz);
 float coating=.5+.5*sin(radial*210.+finishCloud*3.2);
 diffuseColor.rgb*=.82+finishGrain*.17;diffuseColor.rgb+=vec3(.012,.048,.064)*coating*.23;
}else if(${kind}==3){
 float fold=sin(authoredSurfacePosition.x*18.+sin(authoredSurfacePosition.z*11.)*1.7);
 diffuseColor.rgb*=.88+.10*finishCloud+.035*fold;
}else if(${kind}==4||${kind}==5){
 float brushed=.5+.5*sin(authoredSurfacePosition.x*165.+finishCloud*2.);
 diffuseColor.rgb*=.91+.09*finishGrain;diffuseColor.rgb*=.96+.04*brushed;
}else{diffuseColor.rgb*=.91+.12*finishGrain;}`)
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float materialGrain=surfaceNoise(authoredSurfacePosition*23.);
if(${kind}==1)roughnessFactor=clamp(roughnessFactor+(materialGrain-.5)*.10,.18,.48);
else if(${kind}==2)roughnessFactor=clamp(roughnessFactor+(materialGrain-.5)*.035,.075,.23);
else if(${kind}==3)roughnessFactor=clamp(.70+(materialGrain-.5)*.16,.58,.84);
else if(${kind}==4)roughnessFactor=clamp(roughnessFactor+(materialGrain-.5)*.14,.19,.52);
else if(${kind}==5)roughnessFactor=clamp(roughnessFactor+(materialGrain-.5)*.12,.42,.82);
else roughnessFactor=clamp(roughnessFactor+(materialGrain-.5)*.10,.25,.86);`);
 };
 material.customProgramCacheKey=()=>`agriscope-authored-spacecraft-surface-v1-${kind}`;
}

function foliageSurface(material,name){
 const bark=name.toLowerCase().includes('bark');
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 foliagePosition;').replace('#include <begin_vertex>',`#include <begin_vertex>
foliagePosition=position;
${bark?'':'float leafRelief=.5+.5*sin(dot(position,vec3(19.,31.,43.)));transformed+=objectNormal*(leafRelief-.5)*.035;'}
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 foliagePosition;${materialNoise}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
float canopyShade=surfaceNoise(foliagePosition*${bark?'12.':'8.'});
float leafSpeckle=surfaceNoise(foliagePosition*${bark?'42.':'31.'});
diffuseColor.rgb*=mix(.78,1.16,canopyShade)*mix(.94,1.06,leafSpeckle);`)
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=clamp(roughnessFactor+${bark?'.08':'0.035'}*(canopyShade-.5),.82,1.);`);
 };
 material.customProgramCacheKey=()=>`agriscope-authored-foliage-surface-v1-${bark?'bark':'leaf'}`;
}

// Blender PBR values survive in the compact mesh export; role-based shader detail
// adds procedural surface response without UVs, external textures or another runtime.
export function decodeMeshAsset(data,variantIndex=0) {
 const variant=Array.isArray(data.variants)?data.variants[variantIndex]:data;
 if(data.schema!==1||!variant||!Array.isArray(variant.meshes))throw new Error('Unsupported Blender mesh asset');
 const group=new THREE.Group();group.name=data.generator;
 for(const m of variant.meshes){
  const packed=new Int16Array(bytes(m.position).buffer),position=new Float32Array(packed.length);
  for(let i=0;i<packed.length;i++)position[i]=m.offset[i%3]+packed[i]/32767*m.scale[i%3];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(new Int8Array(bytes(m.normal).buffer),3,true));
  geometry.setIndex(new THREE.BufferAttribute(new (m.index32?Uint32Array:Uint16Array)(bytes(m.index).buffer),1));
  geometry.computeBoundingSphere();
  const material=new THREE.MeshPhysicalMaterial({color:new THREE.Color().setRGB(...m.material.color),metalness:m.material.metalness,roughness:m.material.roughness,clearcoat:m.material.clearcoat,clearcoatRoughness:.24,envMapIntensity:1.15});
  if(m.name&&['mli','photovoltaic','optical glass','anodized aluminium','thermal radiator','instrument carbon','harness copper'].some(role=>m.name.toLowerCase().includes(role)))authoredSurface(material,m.name);
  if(m.name?.includes('Tree foliage')||m.name?.includes('Tree bark'))foliageSurface(material,m.name);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=m.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
 }
 group.userData.asset={generator:data.generator,triangles:variant.triangles,batches:variant.meshes.length,variant:variantIndex};
 return group;
}

export async function loadMeshData(name,signal) {
 const response=await fetch(`/cinematic/models/${name}.mesh.json`,{signal});
 if(!response.ok)throw new Error(`Blender mesh unavailable: ${name}`);
 return response.json();
}
