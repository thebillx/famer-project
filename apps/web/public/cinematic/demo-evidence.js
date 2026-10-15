import * as THREE from './vendor.js';
import {fieldHeight,TERRAIN_CURVE_DIVISOR} from './terrain.js';
import {smooth} from './timeline.js';

// Existing offline seed dates, values and masks. No public API or private field.
// The cells illustrate these fixtures; they are not real satellite pixels.
export const DEMO={name:'แปลงสาธิต AgriScope',beforeDate:'10 ก.ย. 2569',afterDate:'20 ก.ย. 2569',before:.68,after:.42};
export function sampleEvidence(p,insufficient=false){
 return {comparison:smooth(.69,.79,p),commonSupport:insufficient?0:1,status:insufficient?'NOT_ASSESSABLE':'NEEDS_INSPECTION',before:insufficient?null:DEMO.before,after:insufficient?null:DEMO.after,delta:insufficient?null:Number((DEMO.after-DEMO.before).toFixed(2))};
}
export function buildEvidence(){
 const cells=[];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const x=-2.46+col*4.86/8,z=-2.26+row*4.49/8,w=4.86/8,d=4.49/8;
  const geometry=new THREE.PlaneGeometry(w-.012,d-.012,3,3);geometry.rotateX(-Math.PI/2);
  const a=geometry.attributes.position;
  for(let i=0;i<a.count;i++){
   const px=x+w/2+a.getX(i),pz=z+d/2+a.getZ(i);
   a.setXYZ(i,px,fieldHeight(px,pz)+.045,pz);
  }
  cells.push(geometry);
 }
 const geometry=THREE.mergeGeometries(cells);cells.forEach(g=>g.dispose());
 const uniforms={flatten:{value:0},comparison:{value:0},opacity:{value:0},before:{value:new THREE.Color(0x77a45b)},after:{value:new THREE.Color(0xc79358)}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  vertexShader:`uniform float flatten;varying float column;void main(){vec3 point=position;point.y+=dot(position.xz,position.xz)/${TERRAIN_CURVE_DIVISOR}.*flatten;column=(floor((position.x+2.46)/4.86*8.)+.5)/8.;gl_Position=projectionMatrix*modelViewMatrix*vec4(point,1.);}`,
  fragmentShader:`varying float column;uniform float comparison;uniform float opacity;uniform vec3 before;uniform vec3 after;void main(){
   float t=smoothstep(column-.065,column+.065,comparison);
   gl_FragColor=vec4(mix(before,after,t),opacity);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const group=new THREE.Group();group.add(new THREE.Mesh(geometry,material));group.name='Synthetic dated comparison · one field';
 return {group,apply(p,insufficient=false,flatten=0){
  const state=sampleEvidence(p,insufficient);
  group.visible=p>=.64&&!insufficient;
  uniforms.flatten.value=flatten;uniforms.comparison.value=state.comparison;uniforms.opacity.value=smooth(.65,.72,p)*.60;
  return state;
 }};
}
