import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';

export function buildSpacecraft(asset,surfaceMaps={}) {
 const group=decodeMeshAsset(asset,0,surfaceMaps);
 group.name='AgriScope original orbital survey craft';
 group.userData.payloadPosition=new THREE.Vector3(0,0,1.44);
 group.userData.apply=({deployment,activation})=>{
  for(const [name,part] of group.userData.parts){
   if(name.startsWith('wing-'))part.rotation.y=(name==='wing-left'?1:-1)*(.17-.15*deployment);
   if(name.startsWith('ring-'))part.rotation.z=(name==='ring-0'?1:-1)*deployment*.65;
   if(name.startsWith('iris-'))part.rotation.z=deployment*.95;
  }
  group.traverse(object=>{
   if(object.isMesh&&object.name==='Survey / optical activation')object.material.emissiveIntensity=.2+activation*2.2;
  });
 };
 return group;
}
