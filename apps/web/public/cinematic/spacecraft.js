import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';

function cinematicMaterial(mesh){
 const material=mesh.material,name=mesh.name.toLowerCase(),surface=material.userData.surface;
 if(surface==='solar'){
  material.color.multiply(new THREE.Color(0x89a9d7));material.metalness=.58;material.roughness=.24;
  material.clearcoat=.72;material.clearcoatRoughness=.12;material.envMapIntensity=1.45;
 }else if(name.includes('machined edges')){
  material.metalness=1;material.roughness=.17;material.clearcoat=.45;material.clearcoatRoughness=.11;material.envMapIntensity=1.72;
 }else if(name.includes('brushed titanium')){
  material.metalness=.96;material.roughness=.30;material.envMapIntensity=1.30;
 }else if(name.includes('ceramic armour')){
  material.color.multiply(new THREE.Color(0xb8c7d1));material.metalness=.14;material.roughness=.39;
  material.clearcoat=.26;material.clearcoatRoughness=.28;material.envMapIntensity=.78;
 }else if(name.includes('satin ceramic')){
  material.color.multiply(new THREE.Color(0x9caeb9));material.metalness=.08;material.roughness=.48;material.envMapIntensity=.64;
 }else if(name.includes('multispectral glass')){
  material.color.set(0x03131f);material.metalness=.18;material.roughness=.075;material.clearcoat=1;material.clearcoatRoughness=.045;
  material.iridescence=.42;material.iridescenceIOR=1.38;material.iridescenceThicknessRange=[145,420];material.envMapIntensity=1.9;
 }else if(name.includes('status gold')){
  material.metalness=.82;material.roughness=.20;material.envMapIntensity=1.35;
 }
 material.transparent=true;
 material.userData.cinematicBaseOpacity=material.opacity;
 material.userData.cinematicBaseDepthWrite=material.depthWrite;
}

export function buildSpacecraft(asset,surfaceMaps={},options={}) {
 const group=decodeMeshAsset(asset,0,surfaceMaps);
 group.name='AgriScope original orbital survey craft';
 group.userData.payloadPosition=new THREE.Vector3(0,0,1.44);
 let activationRings=null,activationLight=null;
 if(options.cinematic){
  group.traverse(object=>{if(object.isMesh)cinematicMaterial(object);});
  activationRings=new THREE.Group();activationRings.name='Payload activation aperture';activationRings.position.copy(group.userData.payloadPosition);
  const ringMaterial=new THREE.MeshBasicMaterial({color:0x78d9ff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  for(const [radius,tube,z] of [[.29,.012,.015],[.39,.008,.025]]){
   const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,48),ringMaterial.clone());ring.position.z=z;activationRings.add(ring);
  }
  activationLight=new THREE.PointLight(0x6bcaff,0,4,2);activationLight.position.z=.20;activationRings.add(activationLight);group.add(activationRings);
 }
 group.userData.apply=({deployment,activation})=>{
  for(const [name,part] of group.userData.parts){
   if(name.startsWith('wing-'))part.rotation.y=(name==='wing-left'?1:-1)*(.17-.15*deployment);
   if(name.startsWith('ring-'))part.rotation.z=(name==='ring-0'?1:-1)*deployment*.65;
   if(name.startsWith('iris-'))part.rotation.z=deployment*.95;
  }
  group.traverse(object=>{
   if(object.isMesh&&object.name==='Survey / optical activation')object.material.emissiveIntensity=.2+activation*2.2;
  });
  if(activationRings){
   activationRings.visible=activation>.002;
   activationRings.rotation.z=activation*.72;
   activationRings.scale.setScalar(.78+.32*activation);
   activationRings.children.forEach((object,index)=>{if(object.isMesh)object.material.opacity=activation*(index?.34:.62);});
   activationLight.intensity=5.5*activation;
  }
 };
 return group;
}
