import * as THREE from './vendor.js';
import {RoundedBoxGeometry} from './vendor.js';
import {batchStatic} from './batch.js';
import {seededRandom} from './timeline.js';

// Authored conceptual EO satellite. All structural features are actual 3D geometry.
export function buildSpacecraft() {
 const group=new THREE.Group(); group.name='AgriScope conceptual spacecraft';
 const rand=seededRandom(9),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const c=canvas.getContext('2d');c.fillStyle='#bfbfbf';c.fillRect(0,0,256,256);
 for(let i=0;i<1900;i++){const x=rand()*256,y=rand()*256;c.strokeStyle=`rgba(${rand()>.5?'255,255,255':'30,30,30'},.18)`;c.beginPath();c.moveTo(x,y);c.lineTo(x+(rand()-.5)*22,y+(rand()-.5)*22);c.stroke();}
 const bump=new THREE.CanvasTexture(canvas);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(2,2);
 const gold=new THREE.MeshStandardMaterial({color:0x9d7c43,metalness:.80,roughness:.43,bumpMap:bump,bumpScale:.06});
 const dark=new THREE.MeshStandardMaterial({color:0x17212d,metalness:.65,roughness:.34});
 const silver=new THREE.MeshStandardMaterial({color:0x8e9da8,metalness:.88,roughness:.32});
 const white=new THREE.MeshStandardMaterial({color:0xbcc7c5,metalness:.22,roughness:.57});
 const cell=new THREE.MeshPhysicalMaterial({color:0x102742,metalness:.58,roughness:.32,clearcoat:.72,clearcoatRoughness:.18});
 const glass=new THREE.MeshPhysicalMaterial({color:0x07283c,metalness:.55,roughness:.06,clearcoat:1,iridescence:.42,iridescenceIOR:1.35});
 function mesh(geo,mat,x=0,y=0,z=0,parent=group){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 const bus=mesh(new RoundedBoxGeometry(1.65,2.05,1.5,3,.10),gold);
 mesh(new THREE.BoxGeometry(1.75,.13,1.6),silver,0,1.05,0);
 mesh(new THREE.BoxGeometry(1.75,.12,1.6),dark,0,-1.04,0);
 for(const x of [-.84,.84]){mesh(new THREE.BoxGeometry(.07,1.55,1.23),white,x,.08,0);for(let j=0;j<10;j++) mesh(new THREE.BoxGeometry(.08,.035,1.21),silver,x,-.65+j*.14,0);}
 for(const x of [-.73,.73]) for(const z of [-.66,.66])mesh(new THREE.BoxGeometry(.07,2,.07),silver,x,0,z);
 const instrument=new THREE.Group();instrument.position.set(0,.18,1.15);group.add(instrument);
 const barrel=mesh(new THREE.CylinderGeometry(.52,.58,.95,48,1,true),dark,0,0,0,instrument);barrel.rotation.x=Math.PI/2;
 for(let i=0;i<7;i++)mesh(new THREE.TorusGeometry(.55,.015,6,48),silver,0,0,-.42+i*.14,instrument);
 mesh(new THREE.TorusGeometry(.48,.055,12,64),gold,0,0,.54,instrument);
 mesh(new THREE.SphereGeometry(.44,48,24,0,Math.PI*2,0,Math.PI/2),glass,0,0,.5,instrument).rotation.x=Math.PI/2;
 const lens=mesh(new THREE.CircleGeometry(.38,48),glass,0,0,.56,instrument);
 mesh(new THREE.TorusGeometry(.26,.008,6,48),silver,0,0,.57,instrument);
 for(const sign of [-1,1]) {
   mesh(new THREE.BoxGeometry(1.5,.12,.13),silver,sign*1.45,0,0);
   const wing=new THREE.Group();group.add(wing);
   for(let j=0;j<3;j++){
    const x=sign*(2.35+j*1.45);
    mesh(new RoundedBoxGeometry(1.4,2.4,.065,1,.025),silver,x,0,0,wing);
    mesh(new THREE.BoxGeometry(1.30,2.3,.072),dark,x,0,0,wing);
    for(let row=0;row<8;row++)for(let col=0;col<4;col++){
      const tile=mesh(new THREE.BoxGeometry(.303,.268,.009),cell,x-.49+col*.327,-1+row*.285,.043,wing);
      // Cell busbars are geometry, retained in close inspection.
      mesh(new THREE.BoxGeometry(.27,.005,.003),silver,tile.position.x,tile.position.y,.049,wing);
    }
   }
   group.userData[sign<0?'wingL':'wingR']=wing;
 }
 // Antenna dish: a revolved parabola, with feed on structural spars.
 const pts=[];for(let i=0;i<=14;i++){const r=i/14*.42;pts.push(new THREE.Vector2(r,r*r*.7));}
 const dish=mesh(new THREE.LatheGeometry(pts,48),white,.35,1.48,-.3);dish.rotation.x=.32;
 mesh(new THREE.CylinderGeometry(.04,.06,.5,12),silver,.35,1.23,-.3);
 mesh(new THREE.CylinderGeometry(.012,.012,1.5,8),silver,-.5,1.76,-.3);
 mesh(new THREE.SphereGeometry(.037,10,8),silver,-.5,2.52,-.3);
 for(let i=0;i<4;i++){const x=i%2?.54:-.54,z=i<2?-.46:.46;mesh(new THREE.CylinderGeometry(.09,.16,.23,16,1,true),dark,x,-1.22,z);}
 for(let i=0;i<8;i++)mesh(new THREE.SphereGeometry(.027,8,6),silver,(i%2?.68:-.68),-.8+Math.floor(i/2)*.5,.76);
 group.userData.payload=instrument;group.userData.lens=lens;group.userData.materials={gold,cell};
 return batchStatic(group);
}
