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
   float glint=pow(max(0.,dot(d,sun)),150.);
   vec3 color=vec3(.016,.022,.034)+earth*vec3(.17,.26,.34)+glint*vec3(7.,8.,9.);
   gl_FragColor=vec4(color,1.);
  }`});
 const geometry=new THREE.SphereGeometry(10,24,16);scene.add(new THREE.Mesh(geometry,material));
 const generator=new THREE.PMREMGenerator(renderer),target=generator.fromScene(scene,.025,.1,50);
 generator.dispose();geometry.dispose();material.dispose();return target;
}
