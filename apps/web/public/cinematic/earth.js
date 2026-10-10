import * as THREE from './vendor.js';
import {seededRandom} from './timeline.js';
export const RADIUS=40;
export function buildEarth(textures) {
 const g=new THREE.Group();g.position.y=-RADIUS;
 const lat=15.87*Math.PI/180,lon=100.99*Math.PI/180;
 const thailand=new THREE.Vector3(Math.cos(lon)*Math.cos(lat),Math.sin(lat),-Math.sin(lon)*Math.cos(lat));
 g.quaternion.setFromUnitVectors(thailand,new THREE.Vector3(0,1,0));
 const earth=new THREE.Mesh(new THREE.SphereGeometry(RADIUS,128,80),new THREE.MeshStandardMaterial({map:textures.day,envMapIntensity:.10,roughness:.87,metalness:0,emissiveMap:textures.night,emissive:0xffcf9a,emissiveIntensity:.22}));
 g.add(earth);
 const clouds=new THREE.Mesh(new THREE.SphereGeometry(RADIUS+.15,96,64),new THREE.MeshStandardMaterial({map:textures.clouds,transparent:true,opacity:.30,depthWrite:false,roughness:1}));g.add(clouds);
 const atmo=new THREE.Mesh(new THREE.SphereGeometry(RADIUS+.7,96,64),new THREE.ShaderMaterial({uniforms:{opacity:{value:1},color:{value:new THREE.Color(0x6a9bb5)}},vertexShader:`varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,fragmentShader:`varying vec3 n;varying vec3 v;uniform vec3 color;uniform float opacity;void main(){float limb=1.-abs(dot(normalize(n),normalize(v)));float f=pow(limb,3.)*(1.-smoothstep(.70,1.,limb));gl_FragColor=vec4(color,f*.38*opacity);}`,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide}));g.add(atmo);
 g.userData.surface=earth;g.userData.atmosphere=atmo;g.userData.clouds=clouds;return g;
}
export function buildStarfield(){const r=seededRandom(88),geo=new THREE.BufferGeometry(),a=[];for(let i=0;i<2400;i++){const phi=r()*Math.PI*2,cos=r()*2-1,sin=Math.sqrt(1-cos*cos),d=180+r()*100;a.push(d*sin*Math.cos(phi),d*cos,d*sin*Math.sin(phi));}geo.setAttribute('position',new THREE.Float32BufferAttribute(a,3));return new THREE.Points(geo,new THREE.PointsMaterial({color:0xc1d6e8,size:.18,sizeAttenuation:true,transparent:true,opacity:.8,depthWrite:false}));}
