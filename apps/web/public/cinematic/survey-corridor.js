import * as THREE from './vendor.js';
import {smooth} from './timeline.js';
import {fieldHeight,TERRAIN_CURVE_DIVISOR} from './terrain.js';
import {projectDescentSurface,descentSurface,descentCloudHeight} from './descent-surface.js';

// Illustrative information transfer, not emitted illumination. Every packet,
// cross-section and cloud state is a pure function of absolute scroll progress.
export function buildSurveyCorridor({lab=false}={}){
 const group=new THREE.Group();group.name='Illustrative survey corridor';
 const material=new THREE.ShaderMaterial({
  uniforms:{opacity:{value:0},spectral:{value:0},volume:{value:0}},transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,
  vertexShader:`attribute float distanceAlong;attribute vec3 routeNormal;varying float along;varying float depth;varying float facing;
   void main(){along=distanceAlong;vec4 p=modelViewMatrix*vec4(position,1.);depth=-p.z;facing=abs(dot(normalize(mat3(modelViewMatrix)*routeNormal+vec3(.000001)),normalize(-p.xyz)));gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform float opacity;uniform float spectral;uniform float volume;varying float along;varying float depth;varying float facing;
   void main(){float ends=smoothstep(0.,.02,along)*(1.-smoothstep(.96,1.,along));
   vec3 tint=mix(vec3(.06,.38,.64),vec3(.25,.61,.76),along);
   tint=mix(tint,mix(vec3(.27,.74,.58),vec3(.82,.44,.24),along),spectral);
   gl_FragColor=vec4(tint,opacity*ends*mix(1.,pow(facing,2.),volume)/(1.+depth*.006));}`
 });
 // A physical cross-section survives portrait display, unlike a one-pixel GL line.
 // The narrow core and soft outer sleeve occupy the same curved route to land.
 const segments=96,sides=8,corePoints=new Float32Array((segments+1)*sides*3),coreAlong=[],coreIndices=[];
 for(let i=0;i<=segments;i++)for(let j=0;j<sides;j++){
  coreAlong.push(i/segments);
  if(i<segments){const a=i*sides+j,b=i*sides+(j+1)%sides;coreIndices.push(a,b,a+sides,b,b+sides,a+sides);}
 }
 const coreGeometry=new THREE.BufferGeometry();coreGeometry.setAttribute('position',new THREE.BufferAttribute(corePoints,3));
 coreGeometry.setAttribute('distanceAlong',new THREE.Float32BufferAttribute(coreAlong,1));coreGeometry.setIndex(coreIndices);
 coreGeometry.setAttribute('routeNormal',new THREE.BufferAttribute(new Float32Array(corePoints.length),3));
 const coreMaterial=material.clone();coreMaterial.uniforms.volume.value=1;
 const beam=new THREE.Mesh(coreGeometry,coreMaterial);beam.name='Curved data core';group.add(beam);
 const sleeveGeometry=coreGeometry.clone(),sleeveMaterial=coreMaterial.clone();
 const sleeve=new THREE.Mesh(sleeveGeometry,sleeveMaterial);sleeve.name='Survey route envelope';group.add(sleeve);
 const packetsGeometry=new THREE.BufferGeometry(),packetPoints=new Float32Array(32*2*3),packetAlong=new Float32Array(32*2);
 packetsGeometry.setAttribute('position',new THREE.BufferAttribute(packetPoints,3));packetsGeometry.setAttribute('distanceAlong',new THREE.BufferAttribute(packetAlong,1));
 const packets=new THREE.LineSegments(packetsGeometry,material);packets.name='Travelling data packets';group.add(packets);
 const ringsGeometry=new THREE.BufferGeometry(),ringPoints=new Float32Array(3*48*2*3),ringAlong=new Float32Array(3*48*2);
 ringsGeometry.setAttribute('position',new THREE.BufferAttribute(ringPoints,3));ringsGeometry.setAttribute('distanceAlong',new THREE.BufferAttribute(ringAlong,1));
 const rings=new THREE.LineSegments(ringsGeometry,material);rings.name='Scan cross-sections';group.add(rings);
 const curve=lab
  ?new THREE.CubicBezierCurve3(new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(0,.16,0))
  :new THREE.QuadraticBezierCurve3(new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(0,.16,0));
 const referenceAxis=new THREE.Vector3(0,0,1),center=new THREE.Vector3(),tangent=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),point=new THREE.Vector3();
 function frame(t){curve.getPoint(t,point);curve.getTangent(t,tangent);side.crossVectors(tangent,referenceAxis).normalize();up.crossVectors(side,tangent).normalize();}

 const tileMaterial=new THREE.LineBasicMaterial({color:0x9dc8d5,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
 // Subdivide only the information overlay edges so each follows the accepted
 // deformed ground, rather than connecting four elevated corner samples.
 const tileGeometry=new THREE.BufferGeometry(),steps=24;
 const positions=new Float32Array(4*4*4*steps*2*3);tileGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const tiles=new THREE.LineSegments(tileGeometry,tileMaterial);tiles.name='Terrain conforming regional tiles';group.add(tiles);

 // Small separated cloud banks occupy real world volume. Surface-facing
 // extinction softens each bank; empty corridors between clusters reveal land.
 const cloudMaterial=new THREE.ShaderMaterial({uniforms:{opacity:{value:0}},transparent:true,depthWrite:false,side:THREE.BackSide,
  vertexShader:`varying vec3 localPoint;varying vec3 localEye;varying mat4 worldTransform;
   void main(){localPoint=position;localEye=(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;worldTransform=modelMatrix;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 localPoint;varying vec3 localEye;varying mat4 worldTransform;uniform float opacity;
   float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
   void main(){vec3 ray=normalize(localPoint-localEye);float b=dot(localEye,ray),c=dot(localEye,localEye)-1.;float h=b*b-c;if(h<=0.)discard;
    float entry=max(0.,-b-sqrt(h)),exitPoint=-b+sqrt(h),stepSize=(exitPoint-entry)/12.;float density=0.,lit=0.;
    for(int i=0;i<12;i++){vec3 q=localEye+ray*(entry+(float(i)+.5)*stepSize);vec3 world=(worldTransform*vec4(q,1.)).xyz;
     float structure=.65*noise(world*.72)+.25*noise(world*1.9)+.10*noise(world*4.8);
     float sampleDensity=smoothstep(.30,.67,structure)*pow(max(0.,1.-dot(q,q)),1.7)*stepSize;
     density+=sampleDensity;lit+=sampleDensity*(q.y*.3+.65);
    }
    float alpha=(1.-exp(-density*3.8))*opacity;
    vec3 tint=mix(vec3(.30,.39,.47),vec3(.80,.86,.90),lit/max(density,.0001));gl_FragColor=vec4(tint,alpha);}`});
 const clouds=new THREE.Group();clouds.name='Surface attached atmospheric strata';group.add(clouds);
 const cloudGeometry=new THREE.SphereGeometry(1,28,16);
 const cloudLayout=lab?[[-11,6,-4,8,1.45,4.2],[9,6.5,-6,7,1.25,3.7],[-6,8,5,6,1.1,3.3],[8,10,5,7,1.5,4.1],[-14,7,2,7,1.4,4.5],[13,11,-12,8,1.8,4.7],[-2,12,-13,7,1.5,4]]:[[-9,2.4,-4,7,.45,3.6],[8,3.4,-6,6,.65,3.1],[-6,1.8,5,5,.42,3],[7,2.6,4,5,.55,2.8],[-13,3,1,6,.7,4],[12,4,-12,7,.8,4],[-3,3.4,-12,5,.55,3]];
 for(const [x,y,z,sx,sy,sz] of cloudLayout){
  const cloud=new THREE.Mesh(cloudGeometry,cloudMaterial);cloud.position.set(x,y,z);cloud.scale.set(sx,sy,sz);cloud.userData.anchor=[x,y,z];clouds.add(cloud);
 }

 // The accepted static reveal used a soft endpoint registration followed by a
 // boundary-confined scan. These runtime derivatives are functions of scroll
 // position, so reverse and chapter jumps restore the exact same state.
 let endpoint=null,endpointMaterial=null,acquisition=null,acquisitionMaterial=null;
 if(lab){
  endpointMaterial=new THREE.ShaderMaterial({uniforms:{opacity:{value:0}},transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,
   vertexShader:'varying vec2 uvPoint;void main(){uvPoint=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'varying vec2 uvPoint;uniform float opacity;void main(){float radius=length((uvPoint-.5)*2.);float feather=pow(max(0.,1.-radius),2.6);gl_FragColor=vec4(.18,.68,.82,opacity*feather);}' });
  endpoint=new THREE.Mesh(new THREE.CircleGeometry(1,48),endpointMaterial);endpoint.name='Localized field registration feather';
  endpoint.rotation.x=-Math.PI/2;endpoint.position.set(0,fieldHeight(0,0)+.07,0);endpoint.scale.set(2.1,1.25,1);endpoint.renderOrder=8;group.add(endpoint);
  acquisitionMaterial=new THREE.ShaderMaterial({uniforms:{opacity:{value:0},scan:{value:0}},transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,
   vertexShader:'varying vec2 fieldUV;void main(){fieldUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec2 fieldUV;uniform float opacity;uniform float scan;
    void main(){float front=exp(-pow((fieldUV.y-scan)*72.,2.));float covered=(1.-smoothstep(scan-.025,scan+.012,fieldUV.y))*.08;
     float edge=smoothstep(0.,.025,fieldUV.x)*smoothstep(0.,.025,fieldUV.y)*smoothstep(0.,.025,1.-fieldUV.x)*smoothstep(0.,.025,1.-fieldUV.y);
     gl_FragColor=vec4(.14,.72,.86,opacity*(front*.70+covered)*edge);}`});
  acquisition=new THREE.Mesh(new THREE.PlaneGeometry(4.95,4.57),acquisitionMaterial);acquisition.name='Sample-bound acquisition front and coverage';
  acquisition.rotation.x=-Math.PI/2;acquisition.position.set(-.025,fieldHeight(0,0)+.074,-.015);acquisition.renderOrder=9;group.add(acquisition);
 }
 function apply(p,payload,flatten){
  curve.v0.copy(payload);
  if(lab){
   curve.v1.copy(payload).multiplyScalar(.72).add(new THREE.Vector3(-2.4,1.8,-2.8));
   curve.v2.set(-4.8,7.5,-4.4);
  }else{
   curve.v1.copy(payload).multiplyScalar(.46).add(new THREE.Vector3(1.4,0,-.7));
  }
  const strength=smooth(.27,.30,p)*(1-smooth(lab?.455:.415,lab?.525:.475,p));
  beam.visible=sleeve.visible=packets.visible=rings.visible=strength>0;material.uniforms.opacity.value=strength*(lab?.78:.72);coreMaterial.uniforms.opacity.value=strength*(lab?.68:.55);
  sleeveMaterial.uniforms.opacity.value=strength*(lab?.035:.055);
  material.uniforms.spectral.value=.38*smooth(.365,.385,p)*(1-smooth(.395,.415,p));
  coreMaterial.uniforms.spectral.value=sleeveMaterial.uniforms.spectral.value=material.uniforms.spectral.value;
  for(let i=0;i<=segments;i++){
   const t=i/segments;frame(t);center.copy(point);
   for(let j=0;j<sides;j++){
    const angle=j/sides*Math.PI*2,radius=(lab?.026:.075)+(lab?.026:.065)*t,index=(i*sides+j)*3;
    point.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle));
    point.toArray(coreGeometry.attributes.routeNormal.array,index);point.toArray(sleeveGeometry.attributes.routeNormal.array,index);
    point.copy(center).addScaledVector(side,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius).toArray(corePoints,index);
    point.copy(center).addScaledVector(side,Math.cos(angle)*(radius+(lab?.085:.22))).addScaledVector(up,Math.sin(angle)*(radius+(lab?.085:.22))).toArray(sleeveGeometry.attributes.position.array,index);
   }
  }
  for(let i=0;i<32;i++){
   const t=(i/32+p*2.7)%1,angle=i*2.399963,radius=.10+.17*(i%4)/3;
   for(let end=0;end<2;end++){
    const a=Math.min(.999,t+end*.009);frame(a);point.addScaledVector(side,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius);
    point.toArray(packetPoints,(i*2+end)*3);packetAlong[i*2+end]=a;
   }
  }
  for(let i=0;i<3;i++){
   const t=(i/3+p*.7)%1;frame(t);center.copy(point);const radius=.20+.24*t;
   for(let j=0;j<48;j++)for(let end=0;end<2;end++){
    const angle=(j+end)/48*Math.PI*2,index=(i*48+j)*2+end;
    point.copy(center).addScaledVector(side,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius).toArray(ringPoints,index*3);ringAlong[index]=t;
   }
  }
  for(const geo of [coreGeometry,sleeveGeometry,packetsGeometry,ringsGeometry]){for(const attribute of Object.values(geo.attributes))attribute.needsUpdate=true;geo.computeBoundingSphere();}
  cloudMaterial.uniforms.opacity.value=(lab?0:.36)*smooth(.405,.435,p)*(1-smooth(.465,.515,p));clouds.visible=cloudMaterial.uniforms.opacity.value>0;
  for(const cloud of clouds.children){
   const [x,height,z]=cloud.userData.anchor;
   cloud.position.set(x,descentCloudHeight(x,z,p)+height,z);
   // Tangent orientation joins the spherical strata before becoming local cloud.
   const {radius}=descentSurface(p);
   cloud.rotation.set(z/radius,0,-x/radius);
  }
  const resolution=smooth(.40,.545,p),scale=1+3*(1-resolution);
  tiles.visible=!lab&&p>.405&&p<.56;tileMaterial.opacity=(lab?0:.32)*smooth(.405,.425,p)*(1-smooth(.53,.56,p));
  let offset=0;
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
   const corners=[[-2.50+col*4.95/4,-2.30+row*4.57/4],[-2.50+(col+1)*4.95/4,-2.30+row*4.57/4],[-2.50+(col+1)*4.95/4,-2.30+(row+1)*4.57/4],[-2.50+col*4.95/4,-2.30+(row+1)*4.57/4]];
   for(let edge=0;edge<4;edge++)for(let step=0;step<steps;step++)for(let end=0;end<2;end++){
    const a=corners[edge],b=corners[(edge+1)%4],t=(step+end)/steps;
    const x=(a[0]+(b[0]-a[0])*t)*scale,z=(a[1]+(b[1]-a[1])*t)*scale;
    const projected=projectDescentSurface(x,fieldHeight(x,z)+(x*x+z*z)/TERRAIN_CURVE_DIVISOR*flatten,z,p);
    positions[offset++]=projected[0];positions[offset++]=projected[1]+.025;positions[offset++]=projected[2];
   }
  }
  tileGeometry.attributes.position.needsUpdate=true;tileGeometry.computeBoundingSphere();
  if(endpoint){
   const endpointOpacity=smooth(.468,.493,p)*(1-smooth(.532,.552,p));
   endpoint.visible=endpointOpacity>.002;endpointMaterial.uniforms.opacity.value=.38*endpointOpacity;
   const acquisitionOpacity=smooth(.505,.522,p)*(1-smooth(.548,.56,p));
   acquisition.visible=acquisitionOpacity>.002;acquisitionMaterial.uniforms.opacity.value=.52*acquisitionOpacity;acquisitionMaterial.uniforms.scan.value=smooth(.512,.548,p);
  }
 }
 group.userData={apply,beam,clouds,tiles,endpoint,acquisition};return group;
}
