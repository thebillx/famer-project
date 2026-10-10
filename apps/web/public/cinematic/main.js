import * as THREE from './vendor.js';
import {RoomEnvironment} from './vendor.js';
import {EffectComposer} from './vendor.js';
import {RenderPass} from './vendor.js';
import {UnrealBloomPass} from './vendor.js';
import {OutputPass} from './vendor.js';
import {buildSpacecraft} from './spacecraft.js';
import {buildEarth,buildStarfield} from './earth.js';
import {buildTerrain} from './terrain.js';
import {SHOTS,sampleCamera,clamp,smooth} from './timeline.js';

// One instance per React mount. No listeners or GPU resources survive route changes.
export function mountJourney(root) {
const controller=new AbortController();let disposed=false,initializing=false;
const listen=(element,event,handler,options={})=>element.addEventListener(event,handler,{...options,signal:controller.signal});
const $=id=>root.querySelector(`#${id}`),params=new URLSearchParams(location.search);
const range=()=>Math.max(1,$('journey').offsetHeight-innerHeight);
const moveTo=(p,behavior='instant')=>scrollTo({top:root.offsetTop+clamp(p)*range(),behavior});
let renderer,composer,scene,camera,spacecraft,earth,terrain,stars,beam,progress=0,target=0,active=false,raf=0,last=0,frames=0,frameMs=16,state=null,resources=[];
const media=matchMedia('(prefers-reduced-motion: reduce)');
let reduced=media.matches||params.get('motion')==='reduce';
const diagnostic=params.has('qa');
function fallback(reason,voluntary=false){
 active=false;cancelAnimationFrame(raf);root.classList.remove('preparing');root.classList.add('static-mode');$('rail').inert=true;$('instrument').style.visibility='hidden';$('geo').style.visibility='hidden';root.querySelector('.skip').href='#fallback';$('fallback').hidden=false;$('loading').hidden=true;$('fallback-reason').textContent=reason;$('motion').textContent=voluntary?'เปิดประสบการณ์ 3D':'ลดการเคลื่อนไหว';$('motion').setAttribute('aria-pressed',String(voluntary));$('resume').hidden=!voluntary;
 $('motion').hidden=!voluntary;
 moveTo(0);writeDiagnostics({ready:true,mode:'static',reason});
}
function writeDiagnostics(extra={}){
 if(!state)state={};Object.assign(state,extra);
 if(diagnostic){$('diagnostics').textContent=JSON.stringify(state);}
}
async function init(){
 if(disposed||initializing)return;
 initializing=true;
 root.classList.add('preparing');

 if(renderer&&composer){resizeViewport();root.classList.remove('static-mode');$('rail').inert=false;root.querySelector('.skip').href='#field';$('fallback').hidden=true;moveTo(progress);target=getProgress();progress=target;apply(progress);renderScene();root.classList.remove('preparing');initializing=false;writeDiagnostics({ready:true,mode:'webgl'});active=true;last=performance.now();animate(last);return;}
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1.25:1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;
  renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('scene-root').appendChild(renderer.domElement);
  listen(renderer.domElement,'webglcontextlost',e=>{e.preventDefault();fallback('การแสดงผล 3D หยุดชั่วคราว กรุณาโหลดหน้าใหม่เพื่อเริ่มอีกครั้ง');});
  scene=new THREE.Scene();scene.background=new THREE.Color(0x060d15);scene.fog=new THREE.FogExp2(0x11263a,.0008);
  camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.08,450);
  const manager=new THREE.LoadingManager();manager.onProgress=(_,loaded,total)=>$('loading-progress').style.width=`${loaded/total*100}%`;
  const loader=new THREE.TextureLoader(manager);
  const [day,clouds,night]=await Promise.all(['earth-day.jpg','earth-clouds.png','earth-night.png'].map(file=>loader.loadAsync(`/cinematic/textures/${file}`)));
  if(disposed){[day,night,clouds].forEach(t=>t.dispose());return;}
  day.colorSpace=night.colorSpace=clouds.colorSpace=THREE.SRGBColorSpace;
  [day,night,clouds].forEach(t=>{t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resources.push(t);});
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room,.035);scene.environment=env.texture;resources.push(env);pmrem.dispose();room.dispose();
  const hemi=new THREE.HemisphereLight(0x8ec6ee,0x151c18,.34);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffd7a2,2.5);sun.position.set(-30,22,18);sun.castShadow=true;
  sun.shadow.mapSize.set(innerWidth<760?1024:2048,innerWidth<760?1024:2048);Object.assign(sun.shadow.camera,{near:1,far:100,left:-18,right:18,top:20,bottom:-20});sun.shadow.bias=-.00015;sun.shadow.normalBias=.025;scene.add(sun);
  const fill=new THREE.DirectionalLight(0x689cce,1.6);fill.position.set(20,18,-15);scene.add(fill);
  earth=buildEarth({day,clouds,night});scene.add(earth);stars=buildStarfield();scene.add(stars);
  spacecraft=buildSpacecraft();spacecraft.position.set(0,13,0);spacecraft.rotation.set(-.18,-.22,-.22);scene.add(spacecraft);
  terrain=buildTerrain();scene.add(terrain);
  beam=new THREE.Mesh(new THREE.CylinderGeometry(.018,.045,1,24,1,true),new THREE.MeshBasicMaterial({color:0xe8c99a,transparent:true,opacity:.08,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));beam.position.set(0,5.9,0);scene.add(beam);
  composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.15,.4,1.3));composer.addPass(new OutputPass());
  scene.environmentIntensity=.42;
  for(let i=0;i<SHOTS.length;i++){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`ช็อต ${i+1}: ${SHOTS[i].thai}`);b.innerHTML='<i></i>';listen(b,'click',()=>moveTo(SHOTS[i].p,reduced?'instant':'smooth'));$('rail').appendChild(b);}
  root.classList.remove('static-mode');$('rail').inert=false;root.querySelector('.skip').href='#field';$('fallback').hidden=true;active=true;
  // Restore hash navigation, deep-linked checkpoints, or scroll-restored document.
  const hashProgress={orbit:0,mission:.22,field:.95}[location.hash.slice(1)];
  const initial=params.has('shot')?SHOTS[clamp(Math.floor(Number(params.get('shot'))||1)-1,0,9)].p:params.has('p')?clamp(Number(params.get('p'))||0):hashProgress??null;
  if(initial!==null)moveTo(initial);
  resizeViewport();target=getProgress();progress=target;apply(progress);renderScene();$('loading').hidden=true;root.classList.remove('preparing');if(reduced)fallback('แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');writeDiagnostics({ready:true,mode:'webgl',webgl:renderer.capabilities.isWebGL2,assets:3,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});
  last=performance.now();if(!reduced)animate(last);
 }catch(err){if(disposed)return;console.error('[AgriScope]',err);fallback('อุปกรณ์นี้แสดงภาพ 3D ไม่ได้ คุณยังอ่านขั้นตอนติดตามแปลงด้านล่างได้');}finally{initializing=false;}
}
function renderScene(){renderer.info.reset();composer.render();writeDiagnostics({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});}
function getProgress(){return clamp((scrollY-root.offsetTop)/range());}
let shotIndex=-1,focusField=false;
function apply(p){
 const shot=SHOTS.reduce((a,s,i)=>p>=s.p-.025?i:a,0),key=sampleCamera(p,innerWidth/innerHeight),mobile=innerWidth<760;
 camera.position.copy(key.position);camera.fov=key.fov;
 const attitude=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.18,-.22,-.22));
 const nadir=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,-.22));
 spacecraft.quaternion.copy(attitude).slerp(nadir,smooth(.51,.61,p));
 camera.lookAt(key.target);camera.updateProjectionMatrix();
 const descent=smooth(.60,.84,p);
 scene.fog.density=.0008+descent*.038;scene.fog.color.set(0x11263a).lerp(new THREE.Color(0x6a8b94),descent);
 scene.background.set(0x060d15).lerp(new THREE.Color(0x6a8b94),descent);
 stars.material.opacity=.78*(1-smooth(.57,.74,p));
 // Every dependent property is assigned from progress; forward and reverse are identical.
 terrain.visible=p>=.58;earth.userData.surface.visible=p<.82;earth.userData.surface.material.transparent=true;earth.userData.surface.material.opacity=1-smooth(.66,.82,p);earth.userData.surface.material.depthWrite=p<.76;earth.userData.atmosphere.material.uniforms.opacity.value=1-smooth(.62,.78,p);terrain.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=smooth(.58,.72,p);o.material.depthWrite=p>=.72;}});earth.userData.clouds.material.opacity=.30*(1-smooth(.64,.79,p));earth.userData.clouds.rotation.y=.008*smooth(.20,.72,p);spacecraft.visible=p<.75;
 const payloadPosition=spacecraft.localToWorld(new THREE.Vector3(0,.18,1.71)),ground=new THREE.Vector3(0,.12,0),direction=payloadPosition.clone().sub(ground);
 beam.position.copy(payloadPosition).add(ground).multiplyScalar(.5);beam.scale.y=direction.length();beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
 beam.visible=p>=.52&&p<=.84;beam.material.opacity=.11*smooth(.52,.61,p)*(1-smooth(.76,.84,p));
 const fieldOpacity=smooth(.89,.94,p);$('field-panel').style.opacity=fieldOpacity;$('field-panel').style.visibility=fieldOpacity>.02?'visible':'hidden';$('field-panel').inert=fieldOpacity<.5;if(focusField&&fieldOpacity>=.5){$('inspect-field').focus({preventScroll:true});focusField=false;}
 $('narrative').style.opacity=p>.85?(mobile?1-smooth(.85,.93,p):Math.max(1-smooth(.85,.93,p),smooth(.92,.95,p))):1;
 $('narrative').inert=mobile&&p>.92;
 $('instrument').style.opacity=smooth(.36,.43,p)*(1-smooth(.51,.56,p));
 $('geo').style.opacity=smooth(.53,.56,p)*(1-smooth(.68,.73,p));
 const projectedGround=new THREE.Vector3(0,.12,0).project(camera);
 $('geo').style.left=`${clamp((projectedGround.x*.5+.5)*innerWidth+18,24,innerWidth-210)}px`;$('geo').style.top=`${clamp((-projectedGround.y*.5+.5)*innerHeight-24,110,innerHeight*.56)}px`;
 const optic=spacecraft.localToWorld(new THREE.Vector3(0,.18,1.71)).project(camera);
 $('instrument').style.left=`${clamp((optic.x*.5+.5)*innerWidth-27,24,innerWidth-230)}px`;$('instrument').style.top=`${clamp((-optic.y*.5+.5)*innerHeight-27,110,innerHeight*.48)}px`;
 $('begin').style.display=p<.07?'inline-flex':'none';$('geo').style.visibility=p>=.55&&p<.73?'visible':'hidden';$('instrument').style.visibility=p>=.36&&p<.56?'visible':'hidden';
 if(shot!==shotIndex){shotIndex=shot;const s=SHOTS[shot];$('eyebrow').textContent=`${String(shot+1).padStart(2,'0')} / 10   ${s.name}`;
  $('title').innerHTML=shot===0?'มองเห็นความเปลี่ยนแปลง<br><span>จากวงโคจรถึงแปลงจริง</span>':s.thai.split(' ').filter(Boolean).join('<br>');
  $('description').textContent=s.text;$('chapter').textContent=`${s.name} / ${String(shot+1).padStart(2,'0')}`;
  [...$('rail').children].forEach((b,i)=>b.setAttribute('aria-current',String(i===shot)));
 }
 $('bottom-left').firstChild.textContent=p<.08?'SCROLL TO EXPLORE ':p>.93?'FROM ORBIT TO YOUR FIELD ':'EARTH OBSERVATION / THAILAND ';
 // Small diagnostic record is useful for focused browser QA, disabled on ordinary visits.
 writeDiagnostics({p:+p.toFixed(6),shot:shot+1,camera:camera.position.toArray(),look:key.target.toArray(),fov:camera.fov,terrain:terrain.visible,cloudOpacity:earth.userData.clouds.material.opacity,cloudRotation:earth.userData.clouds.rotation.y,earthOpacity:earth.userData.surface.material.opacity,atmosphere:earth.userData.atmosphere.material.uniforms.opacity.value,terrainOpacity:smooth(.58,.72,p),beamOpacity:beam.material.opacity,beamPosition:beam.position.toArray(),beamAttitude:beam.quaternion.toArray(),fog:scene.fog.density,fieldOpacity,attitude:spacecraft.quaternion.toArray(),beam:beam.visible,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frameMs:+frameMs.toFixed(2),viewport:[innerWidth,innerHeight]});
}
function animate(time){if(!active)return;raf=requestAnimationFrame(animate);if(document.hidden)return;const dt=Math.max(0,Math.min((time-last)/1000,.1));last=time;frameMs=frameMs*.95+dt*1000*.05;
 target=getProgress();const next=progress+(target-progress)*(1-Math.exp(-10*dt));const previous=progress;
 progress=Math.abs(target-next)<.00002?target:next;
 // Render on demand; no time-based camera drift or Earth rotation to break reversibility.
 if(progress!==previous||frames++<3){apply(progress);renderScene();}
}
function resizeViewport(){renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1.25:1.5));renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;}
listen(window,'resize',()=>{if(!renderer||!active)return;resizeViewport();target=getProgress();progress=target;apply(progress);renderScene();});
listen(window,'scroll',()=>target=getProgress(),{passive:true});
listen(document,'visibilitychange',()=>last=performance.now());
listen($('motion'),'click',()=>{reduced=!reduced;$('motion').textContent=reduced?'เปิดประสบการณ์ 3D':'ลดการเคลื่อนไหว';$('motion').setAttribute('aria-pressed',String(reduced));if(reduced)fallback('เปิดโหมดลดการเคลื่อนไหว แสดงขั้นตอนติดตามแปลงแทนการเดินทาง 3D',true);else init();});
$('motion').hidden=false;
listen($('resume'),'click',()=>{reduced=false;$('motion').textContent='ลดการเคลื่อนไหว';$('motion').setAttribute('aria-pressed','false');init();});
listen(media,'change',e=>{reduced=e.matches;if(reduced)fallback('แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);else init();});
$('inspect-field').setAttribute('aria-expanded','false');
listen($('inspect-field'),'click',()=>{const t=$('trend');t.hidden=!t.hidden;$('inspect-field').setAttribute('aria-expanded',String(!t.hidden));$('inspect-field').textContent=t.hidden?'ดูแนวโน้มแปลงตัวอย่าง':'ซ่อนแนวโน้มแปลงตัวอย่าง';});
if(reduced)fallback('แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);else init();
function snapshot(){return structuredClone(state);}
// Opt-in testing surface only. Used by browser checks, not a user-facing control.
const diagnostics={snapshot,sampleCamera,SHOTS};
if(diagnostic)window.__agriscope=diagnostics;
// Hash links use the same chapter progress as the rail; no viewport-dependent anchors.
for(const link of root.querySelectorAll('a[href^="#"]'))listen(link,'click',e=>{
 const id=link.getAttribute('href').slice(1);
 const p={orbit:0,mission:.22,field:.95}[id];
 if(p===undefined)return;e.preventDefault();moveTo(p,reduced?'instant':'smooth');
 history.replaceState(null,'',`#${id}`);
 if(id==='field')focusField=true;
});
return ()=>{
 disposed=true;active=false;controller.abort();cancelAnimationFrame(raf);
 if(window.__agriscope===diagnostics)delete window.__agriscope;
 const geometries=new Set(),materials=new Set(),textures=new Set(resources);
 scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
 composer?.passes.forEach(pass=>pass.dispose?.());composer?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();
 $('rail').replaceChildren();
};
}

