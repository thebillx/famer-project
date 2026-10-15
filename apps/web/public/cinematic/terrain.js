import * as THREE from './vendor.js';
import {decodeMeshAsset} from './mesh-assets.js';
import {seededRandom,smooth} from './timeline.js';
import {regionalSurfaceGLSL} from './regional-surface.js';
import {descentSurface} from './descent-surface.js';

export const TERRAIN_CURVE_DIVISOR=1800;
export function fieldHeight(x,z){return -(x*x+z*z)/TERRAIN_CURVE_DIVISOR+.07+Math.sin(x*.115+.4)*.034+Math.cos(z*.097-.8)*.027+Math.sin((x+z)*.205)*.016;}

function detail(material,transition,role){
 const surface=material.userData.surface;
 const surfaceKind=role.includes('Wet channel')?6:role.includes('Damp channel')?5:surface==='water'?4:role.includes('tracks')||role.includes('bank')?3:role.includes('rows')?2:role.includes('Rice field')?1:0;
 material.onBeforeCompile=shader=>{
  shader.uniforms.regionalMap=transition.regional;shader.uniforms.regionalBlend=transition.regionalBlend;
  shader.uniforms.descentReveal=transition.reveal;
  shader.uniforms.fieldFlatten=transition.flatten;shader.uniforms.localDetail=transition.detail;shader.uniforms.globeMap=transition.map;shader.uniforms.globeRotation=transition.rotation;shader.uniforms.surfaceKind={value:surfaceKind};
  // Crop blades keep their authored slope. The field's vertical displacement
  // changes a normal by the inverse-transpose Jacobian, not by flattening all
  // of its horizontal components (which erased the new canopy in the browser).
  const deformationNormal=surfaceKind===2
   ? `objectNormal.xz-=2.*position.xz/${TERRAIN_CURVE_DIVISOR}.*fieldFlatten*objectNormal.y;`
   : 'objectNormal.xz*=1.-fieldFlatten;';
  const localWaterNormal=surfaceKind===4?'\nobjectNormal.xz*=1.-.82*localDetail;':'';
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float fieldFlatten;\nuniform float localDetail;\nvarying vec3 agriculturalPosition;\nvarying vec3 agriculturalViewNormal;\nvarying vec3 geographicNormal;').replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\n${deformationNormal}${localWaterNormal}\nobjectNormal=normalize(objectNormal);\nagriculturalViewNormal=normalize(normalMatrix*objectNormal);`).replace('#include <begin_vertex>',`#include <begin_vertex>\nagriculturalPosition = position;\ntransformed.y+=dot(position.xz,position.xz)/${TERRAIN_CURVE_DIVISOR}.*fieldFlatten;\ngeographicNormal = normalize(normalMatrix*vec3(position.x,position.y+900.,position.z));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>'+regionalSurfaceGLSL+'\nuniform float descentReveal;\nvarying vec3 agriculturalPosition;\nvarying vec3 agriculturalViewNormal;\nvarying vec3 geographicNormal;\nuniform float localDetail;\nuniform float surfaceKind;\nuniform sampler2D globeMap;\nuniform mat3 globeRotation;\nfloat fieldHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\nfloat fieldNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fieldHash(i),fieldHash(i+vec2(1.,0.)),f.x),mix(fieldHash(i+vec2(0.,1.)),fieldHash(i+vec2(1.,1.)),f.x),f.y);}')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(mix(geographicNormal,normal,localDetail));')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.87,roughnessFactor,localDetail);\nfloat surfaceRoughness=fieldNoise(agriculturalPosition.xz*.68);\nif(surfaceKind>5.5)roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.055,.74,.93);\nelse if(surfaceKind>4.5)roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.05,.78,.95);\nelse if(surfaceKind>3.5)roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.035,.07,.18);\nelse roughnessFactor=clamp(roughnessFactor+(surfaceRoughness-.5)*.06,.52,.99);\nroughnessFactor=mix(.86,roughnessFactor,localDetail);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=localDetail;')
   .replace('#include <color_fragment>','#include <color_fragment>\nfloat broadTone=fieldNoise(agriculturalPosition.xz*.43);\nfloat fineTone=fieldNoise(agriculturalPosition.xz*1.17+vec2(3.1,-1.7));\nfloat fieldPatch=broadTone*.64+fineTone*.36;\nfloat soilTone=fieldNoise(agriculturalPosition.xz*.84+vec2(-2.3,4.7));\nif(surfaceKind<.5){diffuseColor.rgb*=.95+.065*soilTone;diffuseColor.rgb*=mix(vec3(.955,.91,.84),vec3(1.02,1.,.95),fieldPatch);}\nelse if(surfaceKind<1.5){diffuseColor.rgb*=.965+.060*fieldPatch;diffuseColor.rgb*=vec3(1.+(fieldPatch-.5)*.018,1.+(soilTone-.5)*.022,.982);}\nelse if(surfaceKind<2.5){float rowTone=mix(.96,1.02,fieldNoise(agriculturalPosition.xz*.31));diffuseColor.rgb*=rowTone;diffuseColor.rgb*=vec3(.965,1.,.95);}\nelse if(surfaceKind<3.5){diffuseColor.rgb*=.98+.025*soilTone;diffuseColor.rgb*=vec3(1.02,.995,.94);}\nelse if(surfaceKind<4.5){diffuseColor.rgb*=vec3(.78,.90,.92);}\nelse if(surfaceKind<5.5){diffuseColor.rgb*=.985+.020*soilTone;diffuseColor.rgb*=vec3(.99,.96,.89);}\nelse{diffuseColor.rgb*=.97+.020*soilTone;diffuseColor.rgb*=vec3(.97,.95,.87);}\nvec3 earthDirection=normalize(globeRotation*vec3(agriculturalPosition.x,agriculturalPosition.y+900.,agriculturalPosition.z));\nvec2 earthUV=vec2(fract(atan(earthDirection.z,-earthDirection.x)/6.2831853),asin(earthDirection.y)/3.14159265+.5);\nvec3 geographicColor=regionalSurfaceColor(texture2D(globeMap,earthUV).rgb,vec3(agriculturalPosition.x,agriculturalPosition.y+900.,agriculturalPosition.z));\ndiffuseColor.rgb=mix(geographicColor,diffuseColor.rgb,localDetail);\ndiffuseColor.a*=descentReveal;');
 };
 material.customProgramCacheKey=()=> `agriscope-blender-field-detail-v16-${surfaceKind}`;
}

export function bindTerrainEnvironment(group,environment){
 group.traverse(mesh=>{
  const material=mesh.material;
  if(!material?.isMeshStandardMaterial)return;
  material.envMap=environment;
  const surface=material.userData.surface;
  material.envMapIntensity=surface==='water'?1.65:surface==='leaf'?.48:.42;
 });
}

export function buildTerrain(assets,{mobile=false,day=null,rotation=new THREE.Matrix3(),surfaceMaps={},regional=day,regionalBlend={value:0}}={}){
 const group=decodeMeshAsset(assets.farmland,0,surfaceMaps);group.name='Blender agricultural landscape · synthetic demonstration';
 // Incoming transparent land must compose before the higher cloud strata.
 group.renderOrder=-1;
 const transition={regional:{value:regional},regionalBlend,reveal:{value:1},detail:{value:day?0:1},flatten:{value:0},map:{value:day},rotation:{value:rotation}};
 const layerFor=name=>name==='Dry earth'?'ground':name.startsWith('Rice field')?'parcel':name.startsWith('Rice rows')?'crop':name==='Irrigation water'?'water':name==='Field tracks'||name==='Damp channel shoulder'||name==='Wet channel earth'||name==='Vegetated sample verge'?'bank':'other';
 const surfaceMeshes=[...group.children];
 for(const mesh of surfaceMeshes){mesh.userData.terrainLayer=layerFor(mesh.name);mesh.castShadow=mesh.name==='Field tracks';mesh.receiveShadow=true;if(day){detail(mesh.material,transition,mesh.name);mesh.userData.authoredTransparent=mesh.material.transparent;}}
 const cropRows=group.children.filter(mesh=>mesh.name.startsWith('Rice rows'));
 const prototypes=(assets.tree.variants||[assets.tree]).map((_,index)=>decodeMeshAsset(assets.tree,index,surfaceMaps));
 const random=seededRandom(21),count=mobile?20:30,clusterCount=mobile?8:10,dummy=new THREE.Object3D();
 const transforms=prototypes.map(()=>[]),trees=[];
 const groveAnchors=[[-5.3,4.0],[5.25,4.7],[-9.8,8.2],[10.2,8.8],[-7.2,-7.9],[7.4,-7.8],[-12.8,2.0],[13.2,1.1],[-10.5,-12.8],[-1.2,-12.3],[10.7,-12.0],[-14,-1]];
 let anchor=null;
 for(let i=0;i<count;i++){
  const cluster=Math.floor(i/(count/clusterCount));
  if(!anchor||cluster!==Math.floor((i-1)/(count/clusterCount))){
   const [ax,az]=groveAnchors[cluster];
   anchor={x:ax+(random()-.5)*1.15,z:az+(random()-.5)*1.15};
  }
  const angle=random()*Math.PI*2,radius=.34+random()*1.12;
  let x=THREE.MathUtils.clamp(anchor.x+Math.cos(angle)*radius,-13,13);
  const z=THREE.MathUtils.clamp(anchor.z+Math.sin(angle)*radius,-13,13);
  if(x> -2.95&&x<2.90&&z> -2.75&&z<2.72)x=THREE.MathUtils.clamp(x+(x<0?-4:4),-15.5,15.5);
  dummy.position.set(x,fieldHeight(x,z),z);dummy.rotation.y=random()*Math.PI*2;dummy.scale.set(.86+random()*.36,.79+random()*.31,.86+random()*.36);dummy.updateMatrix();
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
 const boundary=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xf1c88a,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false}));
 boundary.material.onBeforeCompile=shader=>{shader.uniforms.fieldFlatten=transition.flatten;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float fieldFlatten;').replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed.y+=dot(position.xz,position.xz)/${TERRAIN_CURVE_DIVISOR}.*fieldFlatten;`);};
 boundary.name='Sample field boundary';boundary.visible=false;group.add(boundary);group.userData.boundary=boundary;group.userData.localDetail=transition.detail;
 const debugState={layer:'all',wireframe:false};let currentProgress=0;
 const applyDebugVisibility=()=>{
  for(const mesh of surfaceMeshes)mesh.visible=(debugState.layer==='all'||mesh.userData.terrainLayer===debugState.layer)&&!((cropRows.includes(mesh))&&currentProgress<.505);
  for(const {instances} of trees)instances.visible=(debugState.layer==='all'||debugState.layer==='trees')&&currentProgress>=.465;
  boundary.visible=debugState.layer==='all'&&currentProgress>=.50;
 };
 group.userData.setDebug=({layer='all',wireframe=false}={})=>{
  if(!['all','ground','parcel','crop','bank','water','trees'].includes(layer))throw new Error('Unknown terrain debug layer');
  debugState.layer=layer;
  const nextWireframe=Boolean(wireframe);
  if(debugState.wireframe!==nextWireframe){
   debugState.wireframe=nextWireframe;
   for(const material of new Set(surfaceMeshes.map(mesh=>mesh.material))){material.wireframe=nextWireframe;material.needsUpdate=true;}
  }
  applyDebugVisibility();
  return {...debugState};
 };
 group.userData.debugState=debugState;
 group.userData.update=p=>{
  currentProgress=p;
  const descent=descentSurface(p);
  transition.reveal.value=descent.reveal;
  if(day)group.scale.setScalar(descent.scale);
  for(const mesh of surfaceMeshes){
   const transparent=mesh.userData.authoredTransparent||descent.reveal<1;
   if(day&&mesh.material.transparent!==transparent){mesh.material.transparent=transparent;mesh.material.needsUpdate=true;}
   if(day)mesh.material.envMapIntensity=THREE.MathUtils.lerp(.30,mesh.material.userData.surface==='water'?1.65:.42,descent.detail);
  }
  const flatten=.92*smooth(.465,.59,p);transition.flatten.value=flatten;
  const matrix=new THREE.Matrix4();
  for(const {instances,placement} of trees){
   placement.forEach((source,i)=>{matrix.copy(source);const e=matrix.elements;e[13]+=(e[12]*e[12]+e[14]*e[14])/TERRAIN_CURVE_DIVISOR*flatten;instances.setMatrixAt(i,matrix);});
   instances.instanceMatrix.needsUpdate=true;
  }
  applyDebugVisibility();
  return flatten;
 };
 return group;
}
