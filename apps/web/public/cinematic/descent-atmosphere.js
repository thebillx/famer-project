import * as THREE from './vendor.js';
import {descentSurface} from './descent-surface.js';
import {smooth} from './timeline.js';

const LOBE_COUNT=6;

function cloudMaterial(mobile){
 const lobes=Array.from({length:LOBE_COUNT},()=>new THREE.Vector4());
 const axes=Array.from({length:LOBE_COUNT},()=>new THREE.Vector3(1,1,1));
 return new THREE.ShaderMaterial({
  uniforms:{
   opacity:{value:0},
   warmEdge:{value:0},
   lobes:{value:lobes},
   lobeAxes:{value:axes},
   coolColor:{value:new THREE.Color(0x394f61)},
   lightColor:{value:new THREE.Color(0xdba77d)},
  },
  transparent:true,
  depthWrite:false,
  side:THREE.BackSide,
  vertexShader:`varying vec3 localPoint;varying vec3 localEye;
   void main(){
    localPoint=position;
    localEye=(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
   }`,
  fragmentShader:`
   #define STEPS ${mobile?10:14}
   #define LOBES ${LOBE_COUNT}
   varying vec3 localPoint;varying vec3 localEye;
   uniform float opacity;uniform float warmEdge;
   uniform vec4 lobes[LOBES];uniform vec3 lobeAxes[LOBES];
   uniform vec3 coolColor;uniform vec3 lightColor;
   float densityAt(vec3 p){
    float volume=0.;
    for(int i=0;i<LOBES;i++){
     vec3 q=(p-lobes[i].xyz)/lobeAxes[i];
     volume=max(volume,max(0.,1.-dot(q,q))*lobes[i].w);
    }
    float folds=.70+.30*sin((p.x+p.z)*13.1+sin(p.y*8.7))*sin((p.z-p.y)*10.3);
    vec3 edge=vec3(1.)-abs(p);float boundary=smoothstep(0.,.18,min(edge.x,min(edge.y,edge.z)));
    return smoothstep(.07,.58,volume*folds*boundary);
   }
   void main(){
    vec3 ray=normalize(localPoint-localEye),inv=1./ray;
    vec3 t0=(-vec3(1.)-localEye)*inv,t1=(vec3(1.)-localEye)*inv;
    vec3 nearPlane=min(t0,t1),farPlane=max(t0,t1);
    float entry=max(max(nearPlane.x,nearPlane.y),nearPlane.z);
    float exitPoint=min(min(farPlane.x,farPlane.y),farPlane.z);
    entry=max(entry,0.);
    if(exitPoint<=entry)discard;
    float stride=(exitPoint-entry)/float(STEPS),transmittance=1.;
    vec3 accumulated=vec3(0.),lightDirection=normalize(vec3(-.65,.55,.42));
    for(int i=0;i<STEPS;i++){
     vec3 samplePoint=localEye+ray*(entry+(float(i)+.5)*stride);
     float density=densityAt(samplePoint);
     float towardLight=densityAt(samplePoint+lightDirection*.12);
     float exposed=clamp(.30+(density-towardLight)*3.6+samplePoint.y*.16-samplePoint.x*.035,0.,1.);
     float stepAlpha=1.-exp(-density*stride*2.8);
     float pocket=.58+.42*sin(samplePoint.x*8.4+sin(samplePoint.z*6.7))*sin(samplePoint.y*7.1);
     exposed*=pocket;
     vec3 neutral=mix(coolColor,vec3(.58,.64,.69),exposed*.45);
     float rim=exposed*smoothstep(.08,.32,density)*(1.-smoothstep(.52,.84,density));
     vec3 sampleColor=mix(neutral,lightColor,rim*warmEdge*.22);
     accumulated+=transmittance*stepAlpha*sampleColor;
     transmittance*=1.-stepAlpha;
     if(transmittance<.025)break;
    }
    float alpha=(1.-transmittance)*opacity;
    if(alpha<.004)discard;
    gl_FragColor=vec4(accumulated/max(1.-transmittance,.001),alpha);
   }`,
 });
}

const BANKS=[
 // Near gates sit outside the destination opening. Middle and far strata
 // overlap the landscape in depth instead of resting on its surface.
 {name:'Near cloud · left frame',position:[-8,15,2],scale:[7.5,7.5,11],order:6,seed:1},
 {name:'Near cloud · right frame',position:[16.5,16,-5],scale:[6.5,7,10],order:5,seed:2},
 {name:'Middle cloud · west passage',position:[-23,18,-32],scale:[18,7,15],order:4,seed:3},
 {name:'Middle cloud · east passage',position:[20,19,-43],scale:[17,8,17],order:3,seed:4},
 {name:'Far cloud · broken crown',position:[-34,23,-88],scale:[29,8,22],order:2,seed:5},
 {name:'Far cloud · sunward bank',position:[31,24,-108],scale:[33,9,24],order:1,seed:6},
];

function seeded(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

function shape(material,seed){
 const random=seeded(seed),lobes=material.uniforms.lobes.value,axes=material.uniforms.lobeAxes.value;
 const anchors=[[-.48,-.08,.06],[-.16,.18,-.14],[.18,-.02,.13],[.48,.12,-.08],[-.04,-.30,.30],[.12,.42,.08]];
 anchors.forEach((anchor,index)=>{
  lobes[index].set(anchor[0]+(random()-.5)*.12,anchor[1]+(random()-.5)*.10,anchor[2]+(random()-.5)*.13,.78+random()*.22);
  axes[index].set(.43+random()*.15,.36+random()*.18,.44+random()*.18);
 });
}

// Runtime cloud art is an original bounded volume treatment informed by the
// SHA-bound Scene 4 near/middle/far layout. It does not render the concept image
// or attempt to stream the offline VDBs into the browser.
export function buildDescentAtmosphere({mobile=false}={}){
 const group=new THREE.Group();group.name='Scene 4 atmospheric passage · runtime derivative';
 const skyMaterial=new THREE.ShaderMaterial({uniforms:{opacity:{value:0},topColor:{value:new THREE.Color(0x183047)},horizonColor:{value:new THREE.Color(0x9b7556)},sunColor:{value:new THREE.Color(0xf1bd7d)}},transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,
  vertexShader:'varying vec3 skyDirection;void main(){skyDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 skyDirection;uniform float opacity;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 sunColor;
   void main(){vec3 direction=normalize(skyDirection);float altitude=smoothstep(-.08,.72,direction.y);float horizon=exp(-abs(direction.y)*5.2);float sun=pow(max(0.,dot(direction,normalize(vec3(.46,.10,-.88)))),96.);vec3 color=mix(horizonColor,topColor,altitude)+sunColor*sun*.55+horizon*sunColor*.055;gl_FragColor=vec4(color,opacity);}`});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(360,40,24),skyMaterial);sky.name='Cool atmosphere with selective warm horizon';sky.renderOrder=-100;group.add(sky);
 const geometry=new THREE.BoxGeometry(2,2,2);
 const banks=[];
 for(const definition of BANKS){
  const material=cloudMaterial(mobile);shape(material,definition.seed);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=definition.name;
  mesh.position.fromArray(definition.position);mesh.scale.fromArray(definition.scale);
  mesh.renderOrder=definition.order;mesh.frustumCulled=true;group.add(mesh);banks.push(mesh);
 }
 group.visible=false;
 group.userData.apply=p=>{
  const surface=descentSurface(p),arrival=smooth(.428,.46,p),departure=1-smooth(.535,.59,p);
  const opacity=arrival*departure;
  const skyOpacity=.82*smooth(.40,.445,p)*(1-smooth(.60,.68,p));
  group.visible=Math.max(opacity,skyOpacity)>.002;group.scale.setScalar(surface.scale);skyMaterial.uniforms.opacity.value=skyOpacity;
  const edge=smooth(.405,.455,p)*(1-.38*smooth(.49,.55,p));
  banks.forEach((bank,index)=>{
   bank.material.uniforms.opacity.value=opacity*(index===0?.38:index===1?.27:index<4?.38:.31);
   bank.material.uniforms.warmEdge.value=edge*(index===1||index===5?1:.68);
  });
  return {opacity,skyOpacity,scale:surface.scale,banks:banks.length};
 };
 group.userData.asset={generator:'AgriScope Scene 4 bounded cloud-volume derivative',banks:banks.length,samples:mobile?10:14};
 return group;
}
