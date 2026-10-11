import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {seededRandom,smooth} from './timeline.js';

export function fieldHeight(x,z){return -(x*x+z*z)/80+.05+Math.sin(x*.52)*Math.sin(z*.43)*.035;}

function detail(material,transition){
 material.onBeforeCompile=shader=>{
  shader.uniforms.fieldFlatten=transition.flatten;shader.uniforms.localDetail=transition.detail;shader.uniforms.globeMap=transition.map;shader.uniforms.globeRotation=transition.rotation;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float fieldFlatten;\nvarying vec3 agriculturalPosition;\nvarying vec3 geographicNormal;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal.xz*=1.-fieldFlatten;objectNormal=normalize(objectNormal);').replace('#include <begin_vertex>','#include <begin_vertex>\nagriculturalPosition = position;\ntransformed.y+=dot(position.xz,position.xz)/80.*fieldFlatten;\ngeographicNormal = normalize(normalMatrix*vec3(position.x,position.y+40.,position.z));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 agriculturalPosition;\nvarying vec3 geographicNormal;\nuniform float localDetail;\nuniform sampler2D globeMap;\nuniform mat3 globeRotation;\nfloat fieldNoise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}')
   .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(mix(geographicNormal,normal,localDetail));')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.87,roughnessFactor,localDetail);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=localDetail;')
   .replace('#include <color_fragment>','#include <color_fragment>\nfloat fieldPatch=fieldNoise(agriculturalPosition.xz*1.7);\nfloat grain=fieldNoise(floor(agriculturalPosition.xz*45.));\nfloat soilVariation=sin(agriculturalPosition.x*9.3+sin(agriculturalPosition.z*8.1));\ndiffuseColor.rgb *= .78 + .31*fieldPatch + .10*grain + .025*soilVariation;\nvec3 earthDirection=normalize(globeRotation*vec3(agriculturalPosition.x,agriculturalPosition.y+40.,agriculturalPosition.z));\nvec2 earthUV=vec2(fract(atan(earthDirection.z,-earthDirection.x)/6.2831853),asin(earthDirection.y)/3.14159265+.5);\nvec3 geographicColor=texture2D(globeMap,earthUV).rgb;\ndiffuseColor.rgb=mix(geographicColor,diffuseColor.rgb,localDetail);');
 };
 material.customProgramCacheKey=()=> 'agriscope-blender-field-detail-v3';
}

export function buildTerrain(assets,{mobile=false,day=null,rotation=new THREE.Matrix3()}={}){
 const group=decodeMeshAsset(assets.farmland);group.name='Blender agricultural landscape · synthetic demonstration';
 const transition={detail:{value:day?0:1},flatten:{value:0},map:{value:day},rotation:{value:rotation}};
 for(const mesh of group.children){mesh.castShadow=false;if(day)detail(mesh.material,transition);}
 const prototypes=(assets.tree.variants||[assets.tree]).map((_,index)=>decodeMeshAsset(assets.tree,index));
 const random=seededRandom(21),count=mobile?20:36,dummy=new THREE.Object3D();
 const transforms=prototypes.map(()=>[]),trees=[];
 for(let i=0;i<count;i++){
  let x=(random()-.5)*30,z=(random()-.5)*30;
  if(Math.abs(x)<3.2&&Math.abs(z)<3.2)x+=5;
  dummy.position.set(x,fieldHeight(x,z),z);dummy.rotation.y=random()*Math.PI*2;dummy.scale.setScalar(.7+random()*.5);dummy.updateMatrix();
  transforms[i%prototypes.length].push(dummy.matrix.clone());
 }
 for(let variant=0;variant<prototypes.length;variant++)for(const part of prototypes[variant].children){
  const placement=transforms[variant],instances=new THREE.InstancedMesh(part.geometry,part.material,placement.length);instances.name=`${part.name} · silhouette ${variant+1}`;instances.castShadow=instances.receiveShadow=true;
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
