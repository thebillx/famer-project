import * as THREE from './vendor.js';
import {batchStatic} from './batch.js';
import {seededRandom} from './timeline.js';
export function buildTerrain(){
 const g=new THREE.Group();g.name='stylized field demonstration';const r=seededRandom(21);
 function h(x,z){return -(x*x+z*z)/80+.05+Math.sin(x*.52)*Math.sin(z*.43)*.035;}
 const geo=new THREE.CircleGeometry(16,96);geo.rotateX(-Math.PI/2);const a=geo.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,h(a.getX(i),a.getZ(i))-.04);geo.computeVertexNormals();
 const base=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x536647,roughness:1}));base.receiveShadow=true;g.add(base);
 const rowMaterial=new THREE.MeshStandardMaterial({color:0x345837,roughness:1});
 const colors=[0x749258,0x547747,0x8e9b55,0x557647,0x71824a,0x345d45];
 const fieldMaterials=colors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.95}));
 const pathmat=new THREE.MeshStandardMaterial({color:0xb5a97d,roughness:1});
 for(let ix=-5;ix<=5;ix++)for(let iz=-5;iz<=5;iz++){
  const x=ix*2.65,z=iz*2.45;if(Math.hypot(x,z)>13)continue;
  const geo=new THREE.PlaneGeometry(2.52,2.31,3,3);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,h(x+p.getX(i),z+p.getZ(i)));geo.computeVertexNormals();
  const field=new THREE.Mesh(geo,fieldMaterials[Math.floor(r()*colors.length)]);field.position.set(x,0,z);field.receiveShadow=true;g.add(field);
  for(let j=0;j<9;j++){const rowgeo=new THREE.PlaneGeometry(2.50,.025,4,1);rowgeo.rotateX(-Math.PI/2);const p=rowgeo.attributes.position,zz=z-1.05+j*.26;for(let i=0;i<p.count;i++)p.setY(i,h(x+p.getX(i),zz)+.013);const row=new THREE.Mesh(rowgeo,rowMaterial);row.position.set(x,0,zz);g.add(row);}
 }
 // Irrigation channel and raised farm tracks.
 function surfaceStrip(width,length,x,z,mat,segments=24){const geo=new THREE.PlaneGeometry(width,length,segments,segments);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,h(x+p.getX(i),z+p.getZ(i))+.02);geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.position.set(x,0,z);m.receiveShadow=true;g.add(m);}
 surfaceStrip(.27,24,-4,0,new THREE.MeshPhysicalMaterial({color:0x46817c,roughness:.24,metalness:.38}));
 for(const z of [-3.6,3.65])surfaceStrip(15,.15,0,z,pathmat,16);
 const verts=[[-2.5,-2.3],[2.45,-2.3],[2.45,2.27],[-2.5,2.27]];
 const pts=verts.map(([x,z])=>new THREE.Vector3(x,h(x,z)+.04,z));pts.push(pts[0].clone());
 const boundary=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,false,'catmullrom',0),80,.018,6,false),new THREE.MeshBasicMaterial({color:0xf4d5a1}));g.add(boundary);
 // Scattered tree canopies are instances, not hundreds of individual draw calls.
 const trees=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.16,1),new THREE.MeshStandardMaterial({color:0x244c36,roughness:1}),255);
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.023,.04,.32,6),new THREE.MeshStandardMaterial({color:0x6e5940,roughness:1}),85);const dummy=new THREE.Object3D();
 for(let i=0;i<85;i++){let x=(r()-.5)*25,z=(r()-.5)*25;if(Math.abs(x)<3&&Math.abs(z)<3)x+=5;
  dummy.position.set(x,h(x,z)+.16,z);dummy.scale.setScalar(1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  for(let j=0;j<3;j++){dummy.position.set(x+(r()-.5)*.2,h(x,z)+.3+r()*.15,z+(r()-.5)*.2);dummy.scale.set(.9+r()*.5,.8+r()*.4,.9+r()*.5);dummy.updateMatrix();trees.setMatrixAt(i*3+j,dummy.matrix);}
 }trees.castShadow=trunks.castShadow=true;g.add(trees,trunks);
 const beacon=new THREE.Mesh(new THREE.TorusGeometry(.35,.012,6,64),new THREE.MeshBasicMaterial({color:0xf4d5a1}));beacon.rotation.x=-Math.PI/2;beacon.position.y=.12;g.add(beacon);
 g.userData.boundary=boundary;return batchStatic(g);
}
