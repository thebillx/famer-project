import * as THREE from './vendor.js';
import {seededRandom} from './timeline.js';
import {THAILAND_OUTLINE} from './thailand-outline.js';
export const RADIUS=40;
export function buildEarth(textures) {
 const g=new THREE.Group();g.position.y=-RADIUS;
 const lat=15.87*Math.PI/180,lon=100.99*Math.PI/180;
 const thailand=new THREE.Vector3(Math.cos(lon)*Math.cos(lat),Math.sin(lat),-Math.sin(lon)*Math.cos(lat));
 g.quaternion.setFromUnitVectors(thailand,new THREE.Vector3(0,1,0));
 const surfaceMaterial=new THREE.MeshStandardMaterial({map:textures.day,envMapIntensity:.30,roughness:.82,metalness:0,emissiveMap:textures.night,emissive:0xffcf9a,emissiveIntensity:.10});
 // Derive ocean response from the blue-dominant basemap, not a second color
 // overlay. Night radiance is gated by world-space solar incidence.
 surfaceMaterial.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 earthNormal;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nearthNormal=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 earthNormal;')
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    float ocean=smoothstep(.003,.025,diffuseColor.b-max(diffuseColor.r,diffuseColor.g));
    roughnessFactor=mix(.86,.32,ocean);`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    totalEmissiveRadiance*=1.-smoothstep(-.16,.20,dot(normalize(earthNormal),normalize(vec3(-30.,30.,18.))));`);
 };
 const earth=new THREE.Mesh(new THREE.SphereGeometry(RADIUS,128,80),surfaceMaterial);g.add(earth);
 const cloudShadow=new THREE.Mesh(new THREE.SphereGeometry(RADIUS+.045,96,64),new THREE.MeshBasicMaterial({alphaMap:textures.clouds,color:0x050b14,transparent:true,opacity:.26,depthWrite:false}));g.add(cloudShadow);
 const cloudMaterial=new THREE.MeshStandardMaterial({alphaMap:textures.clouds,bumpMap:textures.clouds,bumpScale:.065,color:0xdde9ef,transparent:true,opacity:.70,depthWrite:false,roughness:1,envMapIntensity:.12});
 const clouds=new THREE.Mesh(new THREE.SphereGeometry(RADIUS+.16,112,72),cloudMaterial);g.add(clouds);
 const highMaterial=cloudMaterial.clone();highMaterial.color.set(0xf1f3f4);highMaterial.bumpScale=.10;
 highMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
  diffuseColor.a*=smoothstep(.32,.75,texture2D(alphaMap,vAlphaMapUv).g);`);};
 const highClouds=new THREE.Mesh(new THREE.SphereGeometry(RADIUS+.36,112,72),highMaterial);highClouds.rotation.y=.006;g.add(highClouds);
 // Interpolate view-space position before normalization. Unit vertex directions
 // distort across a near-camera triangle and turn the limb into a cyan wash.
 const atmo=new THREE.Mesh(new THREE.SphereGeometry(RADIUS+.70,112,72),new THREE.ShaderMaterial({uniforms:{opacity:{value:1}},vertexShader:`varying vec3 n;varying vec3 v;varying vec3 worldN;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);worldN=normalize(mat3(modelMatrix)*normal);v=-p.xyz;gl_Position=projectionMatrix*p;}`,fragmentShader:`varying vec3 n;varying vec3 v;varying vec3 worldN;uniform float opacity;void main(){float limb=clamp(1.-abs(dot(normalize(n),normalize(v))),0.,1.);float solar=dot(normalize(worldN),normalize(vec3(-30.,30.,18.)));float day=smoothstep(-.25,.45,solar);float band=pow(limb,3.6);vec3 tint=mix(vec3(.035,.08,.19),vec3(.16,.39,.68),day);tint=mix(tint,vec3(.48,.56,.66),pow(limb,14.)*day*.35);gl_FragColor=vec4(tint,band*(.10+.46*day)*opacity);}`,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide}));g.add(atmo);
 const outlinePoints=THAILAND_OUTLINE.map(([longitude,latitude])=>{const lat=latitude*Math.PI/180,lon=longitude*Math.PI/180,r=RADIUS+.075;return new THREE.Vector3(Math.cos(lon)*Math.cos(lat)*r,Math.sin(lat)*r,-Math.sin(lon)*Math.cos(lat)*r);});
 const thailandFocus=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints),new THREE.LineBasicMaterial({color:0xe8b66e,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));thailandFocus.name='Natural Earth Thailand focus';g.add(thailandFocus);
 g.userData.surface=earth;g.userData.atmosphere=atmo;g.userData.clouds=clouds;g.userData.highClouds=highClouds;g.userData.cloudShadow=cloudShadow;g.userData.thailandFocus=thailandFocus;return g;
}
export function buildStarfield(){const r=seededRandom(88),geo=new THREE.BufferGeometry(),a=[];for(let i=0;i<2400;i++){const phi=r()*Math.PI*2,cos=r()*2-1,sin=Math.sqrt(1-cos*cos),d=180+r()*100;a.push(d*sin*Math.cos(phi),d*cos,d*sin*Math.sin(phi));}geo.setAttribute('position',new THREE.Float32BufferAttribute(a,3));return new THREE.Points(geo,new THREE.PointsMaterial({color:0xc1d6e8,size:.18,sizeAttenuation:true,transparent:true,opacity:.8,depthWrite:false}));}
