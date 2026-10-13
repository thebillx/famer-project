import * as THREE from './vendor.js';

function bytes(text) {
 const raw=atob(text),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}

const SURFACES=new Set(['soil','crop','water','foil','solar','metal','leaf']);

// One texture set per authored surface, shared across material batches and tree
// instances. The caller owns disposal, just like the existing Earth textures.
export async function loadSurfaceMaps(assets,loader){
 const roles=new Set();
 for(const data of assets)for(const variant of data.variants||[data])for(const mesh of variant.meshes){
  const role=mesh.material.surface;
  if(role){if(!SURFACES.has(role))throw new Error('Unsupported authored surface');roles.add(role);}
 }
 const maps={};
 try{
  for(const role of roles){
   maps[role]={};
   for(const [slot,suffix] of [['map','color'],['normalMap','normal'],['roughnessMap','roughness']]){
    const texture=await loader.loadAsync(`/cinematic/textures/surfaces/${role}-${suffix}.png`);
    texture.colorSpace=slot==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
    maps[role][slot]=texture;
   }
  }
  return maps;
 }catch(error){for(const set of Object.values(maps))for(const texture of Object.values(set))texture.dispose();throw error;}
}

// Blender PBR values survive in the compact mesh export; authored UVs and the same baked maps
// drive Blender and browser material response without a second Three.js runtime.
export function decodeMeshAsset(data,variantIndex=0,surfaceMaps={}) {
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
  if(m.uv){const packed=new Int16Array(bytes(m.uv).buffer);if(packed.length!==geometry.attributes.position.count*2)throw new Error('Invalid authored UV count');geometry.setAttribute('uv',new THREE.BufferAttribute(Float32Array.from(packed,value=>value/512),2));}
  geometry.computeBoundingSphere();
  const surface=m.material.surface;
  if(surface&&!SURFACES.has(surface))throw new Error('Unsupported authored surface');
  const response=surface==='solar'?2.05:surface==='foil'?1.44:surface==='metal'?1.2:surface==='water'?1.7:surface==='leaf' ? .7 : 1.0;
  const optical=surface==='solar'?{iridescence:.16,iridescenceIOR:1.42,iridescenceThicknessRange:[105,235],specularIntensity:1.14}:surface==='water'?{ior:1.333,transparent:true,opacity:.94,depthWrite:true}:{};
  const material=new THREE.MeshPhysicalMaterial({color:new THREE.Color().setRGB(...m.material.color),metalness:m.material.metalness,roughness:m.material.roughness,clearcoat:m.material.clearcoat,clearcoatRoughness:surface==='water'?.08:.24,envMapIntensity:response,side:m.material.doubleSided?THREE.DoubleSide:THREE.FrontSide,...optical,...(surfaceMaps[surface]||{})});
  material.userData.surface=surface||null;
  if(surface)material.normalScale.setScalar(m.material.normalStrength??.5);
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
