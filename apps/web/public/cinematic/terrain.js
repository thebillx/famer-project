import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {seededRandom,smooth} from './timeline.js';

export function fieldHeight(x,z){return -(x*x+z*z)/80+.05+Math.sin(x*.52)*Math.sin(z*.43)*.035;}

function detail(material,transition,role){
 const surfaceKind=role.includes('Wet channel')?5:role.includes('water')?4:role.includes('tracks')||role.includes('bank')?3:role.includes('rows')?2:role.includes('Rice field')?1:0;
 material.onBeforeCompile=shader=>{
  shader.uniforms.fieldFlatten=transition.flatten;shader.uniforms.localDetail=transition.detail;shader.uniforms.globeMap=transition.map;shader.uniforms.globeRotation=transition.rotation;shader.uniforms.surfaceKind={value:surfaceKind};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float fieldFlatten;\nvarying vec3 agriculturalPosition;\nvarying vec3 agriculturalViewNormal;\nvarying vec3 geographicNormal;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal.xz*=1.-fieldFlatten;objectNormal=normalize(objectNormal);\nagriculturalViewNormal=normalize(normalMatrix*objectNormal);').replace('#include <begin_vertex>','#include <begin_vertex>\nagriculturalPosition = position;\ntransformed.y+=dot(position.xz,position.xz)/80.*fieldFlatten;\ngeographicNormal = normalize(normalMatrix*vec3(position.x,position.y+40.,position.z));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 agriculturalPosition;\nvarying vec3 agriculturalViewNormal;\nvarying vec3 geographicNormal;\nuniform float localDetail;\nuniform float surfaceKind;\nuniform sampler2D globeMap;\nuniform mat3 globeRotation;\nfloat fieldHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\nfloat fieldNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fieldHash(i),fieldHash(i+vec2(1.,0.)),f.x),mix(fieldHash(i+vec2(0.,1.)),fieldHash(i+vec2(1.,1.)),f.x),f.y);}')
   .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(mix(geographicNormal,normal,localDetail));')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.87,roughnessFactor,localDetail);\nfloat surfaceRoughness=fieldNoise(agriculturalPosition.xz*.68);\nif(surfaceKind>4.5)roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.07,.78,.97);\nelse if(surfaceKind>3.5)roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.04,.08,.24);\nelse roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.07,.48,.99);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=localDetail;')
   .replace('#include <color_fragment>','#include <color_fragment>\nfloat fieldPatch=fieldNoise(agriculturalPosition.xz*.18);\nfloat soilTone=fieldNoise(agriculturalPosition.xz*.62);\nif(surfaceKind<.5){diffuseColor.rgb*=.91+.13*soilTone;diffuseColor.rgb*=mix(vec3(.91,.82,.70),vec3(1.04,1.0,.91),fieldPatch);}\nelse if(surfaceKind<2.5){diffuseColor.rgb*=.94+.09*fieldPatch;diffuseColor.rgb*=vec3(1.+(fieldPatch-.5)*.035,.99+(soilTone-.5)*.05,.96);}\nelse if(surfaceKind<3.5){diffuseColor.rgb*=.91+.12*soilTone;diffuseColor.rgb*=vec3(1.04,1.,.91);}\nelse if(surfaceKind<4.5){float waterRipple=.94+.055*fieldNoise(agriculturalPosition.xz*2.1);float viewFacing=clamp(abs(dot(normalize(agriculturalViewNormal),normalize(vViewPosition))),0.,1.);float fresnel=pow(1.-viewFacing,3.);float canalAxis=min(abs(abs(agriculturalPosition.x)-3.12),abs(abs(agriculturalPosition.z)-2.95));float bankShadow=smoothstep(.09,.155,canalAxis);diffuseColor.rgb*=waterRipple*(1.-bankShadow*.19);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.13,.235,.27),fresnel*.76);}\nelse{diffuseColor.rgb*=.68+.12*soilTone;diffuseColor.rgb*=vec3(.80,.86,.78);}\nvec3 earthDirection=normalize(globeRotation*vec3(agriculturalPosition.x,agriculturalPosition.y+40.,agriculturalPosition.z));\nvec2 earthUV=vec2(fract(atan(earthDirection.z,-earthDirection.x)/6.2831853),asin(earthDirection.y)/3.14159265+.5);\nvec3 geographicColor=texture2D(globeMap,earthUV).rgb;\ndiffuseColor.rgb=mix(geographicColor,diffuseColor.rgb,localDetail);');
 };
 material.customProgramCacheKey=()=> `agriscope-blender-field-detail-v7-${surfaceKind}`;
}

export function buildTerrain(assets,{mobile=false,day=null,rotation=new THREE.Matrix3(),surfaceMaps={}}={}){
 const group=decodeMeshAsset(assets.farmland,0,surfaceMaps);group.name='Blender agricultural landscape · synthetic demonstration';
 const transition={detail:{value:day?0:1},flatten:{value:0},map:{value:day},rotation:{value:rotation}};
 for(const mesh of group.children){mesh.castShadow=mesh.name==='Field tracks'||mesh.name==='Wet channel earth';mesh.receiveShadow=true;if(day)detail(mesh.material,transition,mesh.name);}
 const cropRows=group.children.find(mesh=>mesh.name==='Rice rows');
 const prototypes=(assets.tree.variants||[assets.tree]).map((_,index)=>decodeMeshAsset(assets.tree,index,surfaceMaps));
 const random=seededRandom(21),count=mobile?22:34,clusterCount=mobile?8:11,dummy=new THREE.Object3D();
 const transforms=prototypes.map(()=>[]),trees=[];
 const groveAnchors=[[-5.3,4.0],[5.25,4.7],[-9.8,8.2],[10.2,8.8],[-7.2,-7.9],[7.4,-7.8],[-12.8,2.0],[13.2,1.1],[-10.5,-12.8],[-1.2,-12.3],[10.7,-12.0],[-14,-1]];
 let anchor=null;
 for(let i=0;i<count;i++){
  const cluster=Math.floor(i/(count/clusterCount));
  if(!anchor||cluster!==Math.floor((i-1)/(count/clusterCount))){
   const [ax,az]=groveAnchors[cluster];
   anchor={x:ax+(random()-.5)*1.15,z:az+(random()-.5)*1.15};
  }
  const angle=random()*Math.PI*2,radius=.22+random()*.82;
  let x=THREE.MathUtils.clamp(anchor.x+Math.cos(angle)*radius,-13,13);
  const z=THREE.MathUtils.clamp(anchor.z+Math.sin(angle)*radius,-13,13);
  if(x> -2.95&&x<2.90&&z> -2.75&&z<2.72)x=THREE.MathUtils.clamp(x+(x<0?-4:4),-15.5,15.5);
  dummy.position.set(x,fieldHeight(x,z),z);dummy.rotation.y=random()*Math.PI*2;dummy.scale.set(.74+random()*.30,.79+random()*.31,.74+random()*.30);dummy.updateMatrix();
  transforms[i%prototypes.length].push(dummy.matrix.clone());
 }
 for(let variant=0;variant<prototypes.length;variant++)for(const part of prototypes[variant].children){
  const placement=transforms[variant],instances=new THREE.InstancedMesh(part.geometry,part.material,placement.length);instances.name=`${part.name} · silhouette ${variant+1}`;instances.castShadow=true;instances.receiveShadow=true;
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
  if(cropRows)cropRows.visible=p>=.505;
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
