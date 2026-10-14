import * as THREE from './vendor.js';
import {smooth} from './timeline.js';
import {fieldHeight,TERRAIN_CURVE_DIVISOR} from './terrain.js';

// Illustrative survey/data corridor, not a physical beam emitted by Sentinel.
// The camera travels beside its open tapered volume. No time accumulation.
export function buildSurveyCorridor(){
 const group=new THREE.Group();group.name='Illustrative survey corridor';
 const material=new THREE.ShaderMaterial({
  uniforms:{opacity:{value:0},spectral:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
  blending:THREE.AdditiveBlending,
  vertexShader:`varying vec2 vUv;varying vec3 normalView;varying vec3 directionView;
   void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);normalView=normalize(normalMatrix*normal);directionView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform float opacity;uniform float spectral;varying vec2 vUv;varying vec3 normalView;varying vec3 directionView;
   void main(){float edge=pow(1.-abs(dot(normalize(normalView),normalize(directionView))),2.);
   float ends=smoothstep(0.,.07,vUv.y)*(1.-smoothstep(.93,1.,vUv.y));
   vec3 color=mix(vec3(.18,.40,.64),vec3(.66,.83,.94),vUv.y);
   vec3 bands=vUv.x<.33?vec3(.30,.55,.84):vUv.x<.66?vec3(.30,.72,.52):vec3(.86,.46,.22);
   color=mix(color,bands,spectral);
   gl_FragColor=vec4(color,opacity*ends*(.025+.15*edge));}`
 });
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(.42,3.1,1,48,1,true),material);beam.name='Open survey volume';group.add(beam);
 const tiles=new THREE.Group();group.add(tiles);
 const tileMaterial=new THREE.LineBasicMaterial({color:0x9dc8d5,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
 // A single chosen regional footprint resolves to the accepted sample bounds.
 // Every line samples the same deformed height relationship as the field overlay.
 const tileGeometry=new THREE.BufferGeometry();
 const positions=new Float32Array(4*4*4*2*3);tileGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const lines=new THREE.LineSegments(tileGeometry,tileMaterial);tiles.add(lines);
 const cloudMaterial=new THREE.ShaderMaterial({uniforms:{opacity:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
 vertexShader:'varying vec3 localPoint;void main(){localPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 localPoint;uniform float opacity;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
 void main(){vec2 p=localPoint.xy*.25;float n=noise(p)+.48*noise(p*2.03)+.21*noise(p*4.07);
 float edge=1.-smoothstep(15.,25.,length(localPoint.xy));float cloud=smoothstep(.64,1.32,n);
 gl_FragColor=vec4(mix(vec3(.27,.39,.44),vec3(.81,.87,.86),cloud),cloud*edge*opacity);}`});
 const clouds=new THREE.Group();group.add(clouds);
 for(let i=0;i<3;i++){
  const cloud=new THREE.Mesh(new THREE.PlaneGeometry(50,50),cloudMaterial);cloud.rotation.x=-Math.PI/2;cloud.rotation.z=i*1.7;cloud.position.set(i*2-2,4.5+i*2.5,-i*3);clouds.add(cloud);
 }
 function apply(p,payload,flatten){
  const ground=new THREE.Vector3(0,.12,0),direction=payload.clone().sub(ground);
  beam.position.copy(payload).add(ground).multiplyScalar(.5);beam.scale.y=direction.length();beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  const strength=smooth(.27,.30,p)*(1-smooth(.405,.46,p));beam.visible=strength>0;material.uniforms.opacity.value=strength;material.uniforms.spectral.value=.55*smooth(.365,.385,p)*(1-smooth(.395,.415,p));
  cloudMaterial.uniforms.opacity.value=.24*smooth(.35,.405,p)*(1-smooth(.43,.48,p));clouds.visible=cloudMaterial.uniforms.opacity.value>0;
  const resolution=smooth(.40,.545,p),scale=1+3*(1-resolution);
  tiles.visible=p>.35&&p<.56;tileMaterial.opacity=.42*smooth(.35,.39,p)*(1-smooth(.53,.56,p));
  let offset=0;
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
   const corners=[[-2.50+col*4.95/4,-2.30+row*4.57/4],[-2.50+(col+1)*4.95/4,-2.30+row*4.57/4],[-2.50+(col+1)*4.95/4,-2.30+(row+1)*4.57/4],[-2.50+col*4.95/4,-2.30+(row+1)*4.57/4]];
   for(let edge=0;edge<4;edge++)for(const point of [corners[edge],corners[(edge+1)%4]]){
    const x=point[0]*scale,z=point[1]*scale;
    positions[offset++]=x;positions[offset++]=fieldHeight(x,z)+(x*x+z*z)/TERRAIN_CURVE_DIVISOR*flatten+.065;positions[offset++]=z;
   }
  }
  tileGeometry.attributes.position.needsUpdate=true;tileGeometry.computeBoundingSphere();
 }
 group.userData={apply,beam};return group;
}
