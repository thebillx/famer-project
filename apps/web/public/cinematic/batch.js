import * as THREE from './vendor.js';
import {mergeGeometries} from './vendor.js';
// Bake authored static meshes by material; retain true geometry and shadows.
export function batchStatic(group){
 group.updateMatrixWorld(true);const materials=new Map(),remove=[];
 group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);const key=o.material.uuid;if(!materials.has(key))materials.set(key,{mat:o.material,geos:[]});materials.get(key).geos.push(geo);remove.push(o);});
 for(const o of remove)o.removeFromParent();
 for(const {mat,geos} of materials.values()){const geo=mergeGeometries(geos,false);if(!geo)throw new Error('Static batching failed');const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;group.add(m);geos.forEach(g=>g.dispose());}
 return group;
}
