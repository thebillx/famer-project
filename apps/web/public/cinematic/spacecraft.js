import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';

export function buildSpacecraft(asset,surfaceMaps={}) {
 const group=decodeMeshAsset(asset,0,surfaceMaps);
 group.name='Blender-authored conceptual Earth-observation spacecraft';
 group.userData.payloadPosition=new THREE.Vector3(0,.18,1.65);
 return group;
}
