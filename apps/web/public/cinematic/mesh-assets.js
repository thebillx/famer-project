import * as THREE from './vendor.js';

function bytes(text) {
 const raw=atob(text),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}

// A compact container for actual evaluated Blender meshes. No external loader
// or second Three.js version is introduced into the existing local ESM runtime.
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
  const material=new THREE.MeshPhysicalMaterial({color:new THREE.Color().setRGB(...m.material.color),metalness:m.material.metalness,roughness:m.material.roughness,clearcoat:m.material.clearcoat,clearcoatRoughness:.24});
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
