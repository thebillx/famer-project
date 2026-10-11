import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {seededRandom,smooth} from './timeline.js';

export function fieldHeight(x,z){return -(x*x+z*z)/80+.05+Math.sin(x*.52)*Math.sin(z*.43)*.035;}

function detail(material,transition){
 material.onBeforeCompile=shader=>{
  shader.uniforms.fieldFlatten=transition.flatten;shader.uniforms.localDetail=transition.detail;shader.uniforms.globeMap=transition.map;shader.uniforms.globeRotation=transition.rotation;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float fieldFlatten;\nvarying vec3 agriculturalPosition;\nvarying vec3 geographicNormal;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal.xz*=1.-fieldFlatten;objectNormal=normalize(objectNormal);').replace('#include <begin_vertex>','#include <begin_vertex>\nagriculturalPosition = position;\ntransformed.y+=dot(position.xz,position.xz)/80.*fieldFlatten;\ngeographicNormal = normalize(normalMatrix*vec3(position.x,position.y+40.,position.z));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 agriculturalPosition;\nvarying vec3 geographicNormal;\nuniform float localDetail;\nuniform sampler2D globeMap;\nuniform mat3 globeRotation;\nfloat fieldHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\nfloat fieldNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fieldHash(i),fieldHash(i+vec2(1.,0.)),f.x),mix(fieldHash(i+vec2(0.,1.)),fieldHash(i+vec2(1.,1.)),f.x),f.y);}')
   .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(mix(geographicNormal,normal,localDetail));')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.87,roughnessFactor,localDetail);\nfloat surfaceRoughness=fieldNoise(agriculturalPosition.xz*8.5);\nroughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.18,.48,.99);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=localDetail;')
   .replace('#include <color_fragment>','#include <color_fragment>\nfloat fieldPatch=fieldNoise(agriculturalPosition.xz*.24);\nfloat soilVariation=fieldNoise(agriculturalPosition.xz*1.7);\nfloat fineVariation=fieldNoise(agriculturalPosition.xz*12.);\nfloat furrowLight=sin(agriculturalPosition.x*4.1+sin(agriculturalPosition.z*2.7));\nfloat soilTone=fieldNoise(agriculturalPosition.xz*.48);\nfloat vegetationMask=smoothstep(.035,.085,diffuseColor.g-diffuseColor.b);\nfloat earthyGrain=.82+.28*soilVariation+.18*fineVariation;\nfloat plantedVariation=.74+.48*fieldPatch+.19*soilVariation+.11*fineVariation+.035*furrowLight;\ndiffuseColor.rgb*=mix(earthyGrain,plantedVariation,vegetationMask);\ndiffuseColor.rgb*=mix(vec3(1.),vec3(1.+(fieldPatch-.5)*.18,.97+(soilVariation-.5)*.12,.90+(fieldPatch-.5)*.12),vegetationMask);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.145,.126,.091),.14*(1.-soilTone));\nvec3 earthDirection=normalize(globeRotation*vec3(agriculturalPosition.x,agriculturalPosition.y+40.,agriculturalPosition.z));\nvec2 earthUV=vec2(fract(atan(earthDirection.z,-earthDirection.x)/6.2831853),asin(earthDirection.y)/3.14159265+.5);\nvec3 geographicColor=texture2D(globeMap,earthUV).rgb;\ndiffuseColor.rgb=mix(geographicColor,diffuseColor.rgb,localDetail);');
 };
 material.customProgramCacheKey=()=> 'agriscope-blender-field-detail-v3';
}

export function buildTerrain(assets,{mobile=false,day=null,rotation=new THREE.Matrix3()}={}){
 const group=decodeMeshAsset(assets.farmland);group.name='Blender agricultural landscape · synthetic demonstration';
 const transition={detail:{value:day?0:1},flatten:{value:0},map:{value:day},rotation:{value:rotation}};
 for(const mesh of group.children){mesh.castShadow=false;if(day)detail(mesh.material,transition);}
 const prototypes=(assets.tree.variants||[assets.tree]).map((_,index)=>decodeMeshAsset(assets.tree,index));
 const random=seededRandom(21),count=mobile?14:24,clusterCount=mobile?5:8,dummy=new THREE.Object3D();
 const transforms=prototypes.map(()=>[]),trees=[];
 const groveAnchors=[[-12,-10],[-8,-14],[-1,-13],[8,-12],[14,-7],[-14,-1],[-12,9],[-6,14],[4,12],[13,8],[15,1],[3,-7]];
 let anchor=null;
 for(let i=0;i<count;i++){
  const cluster=Math.floor(i/(count/clusterCount));
  if(!anchor||cluster!==Math.floor((i-1)/(count/clusterCount))){
   const [ax,az]=groveAnchors[cluster];
   anchor={x:ax+(random()-.5)*1.8,z:az+(random()-.5)*1.8};
  }
  const angle=random()*Math.PI*2,radius=.45+random()*1.45;
  let x=THREE.MathUtils.clamp(anchor.x+Math.cos(angle)*radius,-13,13);
  const z=THREE.MathUtils.clamp(anchor.z+Math.sin(angle)*radius,-13,13);
  if(x> -2.95&&x<2.90&&z> -2.75&&z<2.72)x=THREE.MathUtils.clamp(x+(x<0?-4:4),-15.5,15.5);
  dummy.position.set(x,fieldHeight(x,z),z);dummy.rotation.y=random()*Math.PI*2;dummy.scale.set(.62+random()*.25,.66+random()*.24,.62+random()*.25);dummy.updateMatrix();
  transforms[i%prototypes.length].push(dummy.matrix.clone());
 }
 for(let variant=0;variant<prototypes.length;variant++)for(const part of prototypes[variant].children){
  const placement=transforms[variant],instances=new THREE.InstancedMesh(part.geometry,part.material,placement.length);instances.name=`${part.name} · silhouette ${variant+1}`;instances.castShadow=true;instances.receiveShadow=false;
  placement.forEach((matrix,i)=>instances.setMatrixAt(i,matrix));group.add(instances);trees.push({instances,placement});
 }
 const vertices=[[-2.5,-2.3],[2.45,-2.3],[2.45,2.27],[-2.5,2.27]],points=[];
 for(let edge=0;edge<4;edge++){
  const [ax,az]=vertices[edge],[bx,bz]=vertices[(edge+1)%4];
  for(let i=0;i<24;i++){const t=i/24,x=ax+(bx-ax)*t,z=az+(bz-az)*t;points.push(new THREE.Vector3(x,fieldHeight(x,z)+.052,z));}
 }
 const boundary=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true,'centripetal'),256,.014,6,true),new THREE.MeshBasicMaterial({color:0xf1c88a}));
 boundary.material.onBeforeCompile=shader=>{shader.uniforms.fieldFlatten=transition.flatten;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float fieldFlatten;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=dot(position.xz,position.xz)/80.*fieldFlatten;');};
 boundary.name='Sample field boundary';group.add(boundary);group.userData.boundary=boundary;group.userData.localDetail=transition.detail;
 group.userData.update=p=>{
  const flatten=.92*smooth(.465,.59,p);transition.flatten.value=flatten;
  const matrix=new THREE.Matrix4();
  for(const {instances,placement} of trees){
   instances.visible=p>=.465;
   placement.forEach((source,i)=>{matrix.copy(source);const e=matrix.elements;e[13]+=(e[12]*e[12]+e[14]*e[14])/80*flatten;instances.setMatrixAt(i,matrix);});
   instances.instanceMatrix.needsUpdate=true;
  }
  return flatten;
 };
 return group;
}
