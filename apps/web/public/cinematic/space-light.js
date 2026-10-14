import * as THREE from './vendor.js';

// Original lighting environment: a narrow solar reflection, dark space and
// broad Earth bounce. No photographed studio or third-party HDR is required.
export function spaceEnvironment(renderer){
 const scene=new THREE.Scene();
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,
  vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 direction;void main(){
   vec3 d=normalize(direction),sun=normalize(vec3(-30.,22.,18.));
   float earth=pow(max(0.,-d.y),2.);
   float glint=pow(max(0.,dot(d,sun)),85.);
   float rim=pow(max(0.,dot(d,normalize(vec3(1.,.25,-.7)))),28.);
   float strip=exp(-pow((d.x+.48)*9.,2.))*smoothstep(.08,.35,d.y);
   vec3 color=vec3(.024,.032,.046)+earth*vec3(.48,.59,.72)+glint*vec3(3.2,3.0,2.8)+rim*vec3(.8,1.1,1.4)+strip*vec3(.9,.85,.75);
   gl_FragColor=vec4(color,1.);
  }`});
 const geometry=new THREE.SphereGeometry(10,24,16);scene.add(new THREE.Mesh(geometry,material));
 const generator=new THREE.PMREMGenerator(renderer),target=generator.fromScene(scene,.025,.1,50);
 generator.dispose();geometry.dispose();material.dispose();return target;
}

// Original outdoor sky reflection for irrigation water and vegetation. Terrain
// keeps this map as it emerges; the spacecraft retains the orbital environment.
export function agriculturalEnvironment(renderer){
 const scene=new THREE.Scene();
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,
  vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 direction;void main(){
   vec3 d=normalize(direction);
   float sky=smoothstep(-.12,.4,d.y),horizon=pow(1.-abs(d.y),5.);
   vec3 sunDirection=normalize(vec3(-30.,30.,18.));
   float sunHaze=pow(max(0.,dot(d,sunDirection)),7.);
   float sunlight=pow(max(0.,dot(d,sunDirection)),200.);
   vec3 color=mix(vec3(.055,.072,.038),vec3(.30,.39,.43),sky)+horizon*vec3(.31,.30,.25)+sunHaze*vec3(.22,.18,.11)+sunlight*vec3(4.4,3.8,2.8);
   gl_FragColor=vec4(color,1.);
  }`});
 const geometry=new THREE.SphereGeometry(10,24,16);scene.add(new THREE.Mesh(geometry,material));
 const generator=new THREE.PMREMGenerator(renderer),target=generator.fromScene(scene,.04,.1,50);
 generator.dispose();geometry.dispose();material.dispose();return target;
}
