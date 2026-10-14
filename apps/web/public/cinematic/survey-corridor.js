import * as THREE from './vendor.js';
import {smooth} from './timeline.js';
import {fieldHeight,TERRAIN_CURVE_DIVISOR} from './terrain.js';

// Illustrative information transfer, not emitted illumination. Every packet,
// cross-section and cloud state is a pure function of absolute scroll progress.
export function buildSurveyCorridor(){
 const group=new THREE.Group();group.name='Illustrative survey corridor';
 const material=new THREE.ShaderMaterial({
  uniforms:{opacity:{value:0},spectral:{value:0}},transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,
  vertexShader:`attribute float distanceAlong;varying float along;varying float depth;
   void main(){along=distanceAlong;vec4 p=modelViewMatrix*vec4(position,1.);depth=-p.z;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform float opacity;uniform float spectral;varying float along;varying float depth;
   void main(){float ends=smoothstep(0.,.04,along)*(1.-smoothstep(.65,1.,along));
   vec3 tint=mix(vec3(.26,.63,.86),vec3(.66,.81,.91),along);
   tint=mix(tint,mix(vec3(.27,.74,.58),vec3(.82,.44,.24),along),spectral);
   gl_FragColor=vec4(tint,opacity*ends/(1.+depth*.018));}`
 });
 const segments=96,corePoints=new Float32Array((segments+1)*3);
 const coreGeometry=new THREE.BufferGeometry();coreGeometry.setAttribute('position',new THREE.BufferAttribute(corePoints,3));
 coreGeometry.setAttribute('distanceAlong',new THREE.Float32BufferAttribute(Array.from({length:segments+1},(_,i)=>i/segments),1));
 const beam=new THREE.Line(coreGeometry,material);beam.name='Curved data core';group.add(beam);
 const packetsGeometry=new THREE.BufferGeometry(),packetPoints=new Float32Array(32*2*3),packetAlong=new Float32Array(32*2);
 packetsGeometry.setAttribute('position',new THREE.BufferAttribute(packetPoints,3));packetsGeometry.setAttribute('distanceAlong',new THREE.BufferAttribute(packetAlong,1));
 const packets=new THREE.LineSegments(packetsGeometry,material);packets.name='Travelling data packets';group.add(packets);
 const ringsGeometry=new THREE.BufferGeometry(),ringPoints=new Float32Array(3*48*2*3),ringAlong=new Float32Array(3*48*2);
 ringsGeometry.setAttribute('position',new THREE.BufferAttribute(ringPoints,3));ringsGeometry.setAttribute('distanceAlong',new THREE.BufferAttribute(ringAlong,1));
 const rings=new THREE.LineSegments(ringsGeometry,material);rings.name='Scan cross-sections';group.add(rings);
 const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(0,.16,0));
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
 const clouds=new THREE.Group();clouds.name='Separated atmospheric cloud banks';group.add(clouds);
 const cloudGeometry=new THREE.SphereGeometry(1,28,16);
 for(const [x,y,z,sx,sy,sz] of [[-9,6,-4,5,.7,2.6],[8,7,-6,4,.8,2.1],[-6,4,5,3,.5,2],[7,3,4,3,.45,1.8],[-13,10,1,4,1,3],[12,12,-12,5,1.1,3],[-3,8,-12,3,.65,2]]){
  const cloud=new THREE.Mesh(cloudGeometry,cloudMaterial);cloud.position.set(x,y,z);cloud.scale.set(sx,sy,sz);clouds.add(cloud);
 }
 function apply(p,payload,flatten){
  curve.v0.copy(payload);curve.v1.copy(payload).multiplyScalar(.46).add(new THREE.Vector3(1.4,0,-.7));
  const strength=smooth(.27,.30,p)*(1-smooth(.375,.435,p));
  beam.visible=packets.visible=rings.visible=strength>0;material.uniforms.opacity.value=strength*.8;
  material.uniforms.spectral.value=.38*smooth(.365,.385,p)*(1-smooth(.395,.415,p));
  for(let i=0;i<=segments;i++)curve.getPoint(i/segments,point).toArray(corePoints,i*3);
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
  for(const geo of [coreGeometry,packetsGeometry,ringsGeometry]){for(const attribute of Object.values(geo.attributes))attribute.needsUpdate=true;geo.computeBoundingSphere();}
  cloudMaterial.uniforms.opacity.value=.64*smooth(.375,.405,p)*(1-smooth(.43,.47,p));clouds.visible=cloudMaterial.uniforms.opacity.value>0;
  const resolution=smooth(.40,.545,p),scale=1+3*(1-resolution);
  tiles.visible=p>.405&&p<.56;tileMaterial.opacity=.32*smooth(.405,.425,p)*(1-smooth(.53,.56,p));
  let offset=0;
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
   const corners=[[-2.50+col*4.95/4,-2.30+row*4.57/4],[-2.50+(col+1)*4.95/4,-2.30+row*4.57/4],[-2.50+(col+1)*4.95/4,-2.30+(row+1)*4.57/4],[-2.50+col*4.95/4,-2.30+(row+1)*4.57/4]];
   for(let edge=0;edge<4;edge++)for(let step=0;step<steps;step++)for(let end=0;end<2;end++){
    const a=corners[edge],b=corners[(edge+1)%4],t=(step+end)/steps;
    const x=(a[0]+(b[0]-a[0])*t)*scale,z=(a[1]+(b[1]-a[1])*t)*scale;
    positions[offset++]=x;positions[offset++]=fieldHeight(x,z)+(x*x+z*z)/TERRAIN_CURVE_DIVISOR*flatten+.025;positions[offset++]=z;
   }
  }
  tileGeometry.attributes.position.needsUpdate=true;tileGeometry.computeBoundingSphere();
 }
 group.userData={apply,beam,clouds,tiles};return group;
}
