import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';

export function buildSpacecraft(asset) {
 const group=decodeMeshAsset(asset);
 group.name='Blender-authored conceptual Earth-observation spacecraft';
 group.userData.payloadPosition=new THREE.Vector3(0,.18,1.65);
 return group;
}
