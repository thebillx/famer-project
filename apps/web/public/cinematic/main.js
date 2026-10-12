import * as THREE from './vendor.js';
import {buildSpacecraft} from './spacecraft.js';
import {buildEarth,buildStarfield} from './earth.js';
import {buildTerrain} from './terrain.js';
import {buildEvidence,DEMO} from './demo-evidence.js';
import {loadMeshData,loadSurfaceMaps} from './mesh-assets.js';
import {spaceEnvironment,agriculturalEnvironment} from './space-light.js';
import {SHOTS,sampleCamera,clamp,smooth} from './timeline.js';

// One instance per React mount. Assets, listeners and GPU resources belong to it.
export function mountJourney(root){
 const controller=new AbortController();
 const listen=(element,event,handler,options={})=>element.addEventListener(event,handler,{...options,signal:controller.signal});
 const $=id=>root.querySelector(`#${id}`),params=new URLSearchParams(location.search);
 const media=matchMedia('(prefers-reduced-motion: reduce)'),diagnostic=params.has('qa');
 const resources=[];
 let disposed=false,initializing=false,probeStarted=false,reduced=media.matches||params.get('motion')==='reduce';
 let renderer,composer,scene,camera,spacecraft,earth,terrain,stars,beam,evidence,sun,fill,hemisphere;
 let progress=0,target=0,active=false,raf=0,last=0,frames=0,shotIndex=-1,mobileLayout=null,narrativeInsufficient=null,focusField=false,insufficient=false,state={};
 const mobileChapters=[
  ['มองเห็นความเปลี่ยนแปลง','จากวงโคจรถึงแปลงจริง'],
  ['ดูโลกในแต่ละช่วงเวลา','ภาพดาวเทียมช่วยติดตามพื้นที่เดิม'],
  ['อ่านแสงเพื่อเปรียบเทียบ','ข้อมูลหลายช่วงคลื่นประกอบการคำนวณ NDVI'],
  ['จากภาพโลกสู่ประเทศไทย','เลือกพื้นที่ที่คุณสนใจติดตาม'],
  ['เข้าใกล้พื้นที่เกษตร','การเดินทางนี้เป็นภาพจำลอง'],
  ['เริ่มจากขอบเขตแปลง','ใช้พื้นที่เดียวกันค้นหาและเปรียบเทียบข้อมูล'],
  ['ตรวจวันที่และคุณภาพ','ข้อมูลต้องพอทั้งสองช่วงเวลา หากไม่พอจะยังสรุปไม่ได้'],
  ['เปรียบเทียบพื้นที่เดียวกัน','ค่า NDVI ตัวอย่างต่างวันที่ · ข้อมูลจำลอง'],
  ['ผลนี้ควรตรวจแปลงต่อ','ค่า NDVI ลดลง แต่ข้อมูลดาวเทียมยังไม่บอกสาเหตุ'],
  ['เริ่มติดตามแปลงของคุณ','สร้างฟาร์มและวาดขอบเขตใน AgriScope']
 ];
 const insufficientChapters={
  6:['ตรวจคุณภาพก่อนเปรียบเทียบ','ข้อมูลที่ใช้วัดได้ไม่ทับซ้อนกัน จึงยังสรุปการเปลี่ยนแปลงไม่ได้'],
  7:['ยังเปรียบเทียบไม่ได้','ไม่มีพื้นที่ร่วมที่ใช้วัดได้ จึงไม่แสดงค่าเปลี่ยนแปลงหรือแผนที่เปรียบเทียบ'],
  8:['ข้อมูลยังไม่พอจะสรุป','ต้องมีข้อมูลที่ใช้วัดได้ร่วมกันก่อน จึงจะประเมินการเปลี่ยนแปลงได้']
 };
 const range=()=>Math.max(1,$('journey').offsetHeight-innerHeight);
 const moveTo=(p,behavior='instant')=>scrollTo({top:root.offsetTop+clamp(p)*range(),behavior});
 const getProgress=()=>clamp((scrollY-root.offsetTop)/range());
 function writeDiagnostics(extra){Object.assign(state,extra);if(diagnostic)$('diagnostics').textContent=JSON.stringify(state);}
 function fallback(reason,voluntary=false){
  active=false;cancelAnimationFrame(raf);root.classList.remove('preparing');root.classList.add('static-mode');
  $('rail').inert=true;root.querySelector('.skip').href='#fallback';$('fallback').hidden=false;$('loading').hidden=true;
  $('fallback-reason').textContent=reason;$('motion').textContent='เปิดประสบการณ์ 3D';$('motion').setAttribute('aria-pressed',String(voluntary));
  $('resume').hidden=!voluntary;$('motion').hidden=!voluntary;
  moveTo(0);writeDiagnostics({ready:true,mode:'static',reason});
 }
 function activate(){
  resizeViewport();root.classList.remove('static-mode','preparing');$('rail').inert=false;
  root.querySelector('.skip').href='#field';$('fallback').hidden=true;$('loading').hidden=true;$('motion').hidden=false;
  moveTo(progress);target=getProgress();progress=target;apply(progress);renderScene();
  active=true;last=performance.now();writeDiagnostics({ready:true,mode:'webgl'});animate(last);
 }
 async function init(){
  if(disposed||initializing)return;
  initializing=true;root.classList.add('preparing');$('loading').hidden=false;
  try{
   if(renderer&&composer){activate();return;}
   renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
   renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
   renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   $('scene-root').appendChild(renderer.domElement);
   listen(renderer.domElement,'webglcontextlost',e=>{e.preventDefault();fallback('การแสดงผล 3D หยุดชั่วคราว กรุณาโหลดหน้าใหม่เพื่อเริ่มอีกครั้ง');});
   scene=new THREE.Scene();scene.background=new THREE.Color(0x060d15);scene.fog=new THREE.FogExp2(0x11263a,.0008);
   camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.08,450);
   let loaded=0;const complete=()=>{$('loading-progress').style.width=`${++loaded/6*100}%`;};
   const loader=new THREE.TextureLoader();
   const textures=await Promise.all(['earth-day.jpg','earth-clouds.png','earth-night.png'].map(async file=>{
    const texture=await loader.loadAsync(`/cinematic/textures/${file}`);
    if(disposed)texture.dispose();else resources.push(texture);
    complete();return texture;
   }));
   const [ship,farmland,tree]=await Promise.all(['spacecraft','farmland','tree'].map(async name=>{
    const data=await loadMeshData(name,controller.signal);complete();return data;
   }));
   if(disposed)return;
   const surfaceMaps=await loadSurfaceMaps([ship,farmland,tree],loader);
   for(const set of Object.values(surfaceMaps))for(const texture of Object.values(set)){if(disposed)texture.dispose();else resources.push(texture);}
   if(disposed)return;
   const [day,clouds,night]=textures;
   textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
   const environment=spaceEnvironment(renderer);scene.environment=environment.texture;resources.push(environment);scene.environmentIntensity=.68;
   hemisphere=new THREE.HemisphereLight(0xb3d8ee,0x1b2618,.68);scene.add(hemisphere);
   sun=new THREE.DirectionalLight(0xffead4,2.35);sun.position.set(-30,30,18);sun.castShadow=true;
   sun.shadow.mapSize.set(innerWidth<760?1024:2048,innerWidth<760?1024:2048);
   Object.assign(sun.shadow.camera,{near:1,far:120,left:-19,right:19,top:25,bottom:-19});sun.shadow.bias=-.00012;sun.shadow.normalBias=.003;sun.shadow.radius=5;scene.add(sun);
   fill=new THREE.DirectionalLight(0x7faed2,.76);fill.position.set(20,18,-15);scene.add(fill);
   earth=buildEarth({day,clouds,night});scene.add(earth);stars=buildStarfield();scene.add(stars);
   spacecraft=buildSpacecraft(ship,surfaceMaps);scene.add(spacecraft);
   const rotation=new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(earth.quaternion.clone().invert()));
   terrain=buildTerrain({farmland,tree},{mobile:innerWidth<760,day,rotation,surfaceMaps});scene.add(terrain);
   const fieldEnvironment=agriculturalEnvironment(renderer);resources.push(fieldEnvironment);
   terrain.traverse(mesh=>{if(mesh.material?.isMeshStandardMaterial){mesh.material.envMap=fieldEnvironment.texture;mesh.material.envMapIntensity=mesh.name.includes('water')?2.05:mesh.name.includes('foliage')?.48:.42;}});
   evidence=buildEvidence();scene.add(evidence.group);
   beam=new THREE.Mesh(new THREE.CylinderGeometry(.008,.024,1,16,1,true),new THREE.MeshBasicMaterial({color:0xe8c99a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));scene.add(beam);
   composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(scene,camera));
   composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.10,.35,1.5));composer.addPass(new THREE.OutputPass());
   const phases=[0,1,3,6,9];
   SHOTS.forEach((shot,i)=>{
    const button=document.createElement('button');button.type='button';button.dataset.phase=String(phases.includes(i));
    button.setAttribute('aria-label',`ช่วง ${i+1}: ${shot.thai}`);button.innerHTML='<i></i>';
    listen(button,'click',()=>moveTo(shot.p,reduced?'instant':'smooth'));$('rail').appendChild(button);
   });
   const hashProgress={orbit:0,mission:.22,field:.86}[location.hash.slice(1)];
   const initial=params.has('shot')?SHOTS[clamp(Math.floor(Number(params.get('shot'))||1)-1,0,9)].p:params.has('p')?clamp(Number(params.get('p'))||0):hashProgress??null;
   if(initial!==null){root.classList.remove('static-mode');moveTo(initial);progress=getProgress();}
   const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
   writeDiagnostics({assets:6,model:spacecraft.userData.asset,land:terrain.userData.asset,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),devicePixelRatio,renderPixelRatio:renderer.getPixelRatio(),browser:navigator.userAgent});
   if(reduced)fallback('แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);else{activate();void runHardwareProbe();}
  }catch(error){
   if(!disposed){console.error('[AgriScope]',error);fallback('อุปกรณ์นี้แสดงภาพ 3D ไม่ได้ คุณยังอ่านวิธีติดตามแปลงและดูข้อมูลตัวอย่างได้');}
  }finally{initializing=false;}
 }
 function renderScene(){renderer.info.reset();composer.render();writeDiagnostics({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});}
 async function runHardwareProbe(){
  if(probeStarted||!diagnostic||!params.has('hardware-probe'))return;probeStarted=true;
  const shot=Math.max(1,Math.min(10,Number(params.get('hardware-probe'))||6)),base=SHOTS[shot-1].p,recording=params.get('recording')==='1';
  moveTo(base);target=getProgress();progress=target;apply(progress);renderScene();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const intervals=[],submission=[],started=performance.now();let previous=started;
  await new Promise(resolve=>{const frame=now=>{
   intervals.push(now-previous);previous=now;const renderStarted=performance.now();
   apply(base+Math.sin((now-started)/700)*.003);renderScene();submission.push(performance.now()-renderStarted);
   if(now-started<2400)requestAnimationFrame(frame);else resolve();
  };requestAnimationFrame(frame);});
  progress=base;target=base;apply(base);renderScene();
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],max:sorted.at(-1)};};
  writeDiagnostics({hardwareProbe:{shot,progress:base,recording,elapsedMs:performance.now()-started,intervalStatsMs:stats(intervals),submissionStatsMs:stats(submission),intervalsMs:intervals,renderSubmissionMs:submission,interpretation:'rAF scheduling and synchronous render submission under the reported renderer; intentional journey holds are not part of this probe and this is not isolated GPU execution time.'}});
 }
 function panel(id,opacity){const element=$(id);element.style.opacity=opacity;element.style.visibility=opacity>.02?'visible':'hidden';element.inert=opacity<.5;}
 function apply(p){
  const key=sampleCamera(p,innerWidth/innerHeight),mobile=innerWidth<760;
  const shot=SHOTS.reduce((a,s,i)=>p>=s.p-.025?i:a,0);
  camera.position.copy(key.position);camera.fov=key.fov;camera.lookAt(key.target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const orbit=.32*smooth(.235,.38,p);
  spacecraft.position.set(53*Math.sin(orbit),53*Math.cos(orbit)-40,-4*smooth(.235,.38,p));
  const attitude=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.18,-.22,-.22));
  const nadir=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,-.22));
  spacecraft.quaternion.copy(attitude).slerp(nadir,smooth(.235,.38,p));spacecraft.visible=p<.50;
  const descent=smooth(.41,.56,p),detail=smooth(.385,.455,p);
  const agriculturalLight=smooth(.43,.57,p);
  // During descent, preserve the warm key while restoring cool sky fill and
  // environment response so crop ridges, bank slopes, and water retain depth.
  sun.intensity=2.4-.12*agriculturalLight;fill.intensity=.66+.12*agriculturalLight;hemisphere.intensity=.56+.12*agriculturalLight;scene.environmentIntensity=.70+.08*agriculturalLight;
  // Keep the far edge atmospheric, but let the nearby parcels retain warm soil
  // and crop contrast instead of disappearing into a grey fog wash.
  scene.fog.density=.00055+descent*.0073;scene.fog.color.set(0x101c29).lerp(new THREE.Color(0x354b50),descent);
  scene.background.set(0x060d15).lerp(new THREE.Color(0x13282f),descent);
  stars.material.opacity=.78*(1-smooth(.36,.49,p));stars.visible=p<.51;
  terrain.visible=p>=.405;terrain.userData.localDetail.value=detail;
  const flatten=terrain.userData.update(p);
  terrain.userData.boundary.material.transparent=true;terrain.userData.boundary.material.opacity=smooth(.50,.56,p);
  // Let the spherical basemap leave as the camera commits to the local terrain.
  // Keeping it underneath the flattening mesh produces stray geographic green
  // islands through gaps between synthetic plots in shots 5–6.
  earth.userData.surface.visible=p<.455;
  earth.userData.atmosphere.material.uniforms.opacity.value=1-smooth(.41,.53,p);
  earth.userData.clouds.visible=p<.49;earth.userData.clouds.material.opacity=.38*(1-smooth(.35,.49,p));
  earth.userData.clouds.rotation.y=.008*smooth(.20,.49,p);
  const payload=spacecraft.localToWorld(spacecraft.userData.payloadPosition.clone()),ground=new THREE.Vector3(0,.12,0),direction=payload.clone().sub(ground);
  beam.position.copy(payload).add(ground).multiplyScalar(.5);beam.scale.y=direction.length();beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  beam.visible=p>=.25&&p<=.43;beam.material.opacity=.07*smooth(.25,.30,p)*(1-smooth(.37,.43,p));
  const sample=evidence.apply(p,insufficient,flatten);
  const fieldOpacity=smooth(.835,.86,p),evidenceOpacity=smooth(.635,.655,p)*(1-smooth(.815,.84,p));
  panel('field-panel',fieldOpacity);panel('evidence-panel',evidenceOpacity);
  if(focusField&&fieldOpacity>=.5){$('inspect-field').focus({preventScroll:true});focusField=false;}
  const narrative=$('narrative'),chapterCta=$('chapter-cta');
  const compactChapter=mobile&&p>=.62;
  narrative.style.opacity=1;narrative.inert=false;
  narrative.classList.toggle('mobile-chapter',compactChapter);
  $('field-panel').classList.toggle('is-handoff',mobile&&p>=.925);
  chapterCta.hidden=!(mobile&&p>=.925);
  panel('hero-actions',1-smooth(.035,.065,p));
  $('instrument').style.opacity=smooth(.18,.21,p)*(1-smooth(.235,.265,p));$('instrument').style.visibility=p>=.18&&p<.265?'visible':'hidden';
  $('geo').style.opacity=smooth(.33,.36,p)*(1-smooth(.425,.46,p));$('geo').style.visibility=p>=.33&&p<.46?'visible':'hidden';
  const projectedGround=ground.clone().project(camera);
  $('geo').style.left=`${clamp((projectedGround.x*.5+.5)*innerWidth+18,24,innerWidth-210)}px`;
  $('geo').style.top=`${clamp((-projectedGround.y*.5+.5)*innerHeight-24,110,innerHeight*.56)}px`;
  const optic=payload.project(camera);
  $('instrument').style.left=`${clamp((optic.x*.5+.5)*innerWidth-27,24,innerWidth-230)}px`;
  $('instrument').style.top=`${clamp((-optic.y*.5+.5)*innerHeight-27,110,innerHeight*.48)}px`;
  if(shot!==shotIndex||mobile!==mobileLayout||insufficient!==narrativeInsufficient){
   shotIndex=shot;mobileLayout=mobile;narrativeInsufficient=insufficient;const s=SHOTS[shot],assessmentCopy=insufficient?insufficientChapters[shot]:null;$('eyebrow').textContent=`${String(shot+1).padStart(2,'0')} / 10   ${s.name}`;
   if(assessmentCopy){
    $('title').textContent=assessmentCopy[0];$('description').textContent=assessmentCopy[1];
   }else{
    $('title').innerHTML=shot===0?'มองเห็นความเปลี่ยนแปลง<br><span>จากวงโคจรถึงแปลงจริง</span>':s.thai.split(' ').filter(Boolean).join('<br>');
    $('description').textContent=mobile?mobileChapters[shot][1]:s.text;
    if(mobile)$('title').textContent=mobileChapters[shot][0];
   }
   $('chapter').textContent=`${s.name} / ${String(shot+1).padStart(2,'0')}`;
  }
  const phase=[0,1,3,6,9].reduce((a,i)=>i<=shot?i:a,0);
  [...$('rail').children].forEach((b,i)=>b.setAttribute('aria-current',String(i===(mobile?phase:shot))));
  $('bottom-left').firstChild.textContent=p<.08?'SCROLL TO EXPLORE ':p>.93?'YOUR AGRISCOPE WORKSPACE ':'EARTH OBSERVATION / THAILAND ';
  writeDiagnostics({p:+p.toFixed(6),shot:shot+1,camera:camera.position.toArray(),look:key.target.toArray(),fov:camera.fov,terrain:terrain.visible,localDetail:detail,flatten,cloudOpacity:earth.userData.clouds.material.opacity,cloudRotation:earth.userData.clouds.rotation.y,atmosphere:earth.userData.atmosphere.material.uniforms.opacity.value,beamOpacity:beam.material.opacity,beamPosition:beam.position.toArray(),beamAttitude:beam.quaternion.toArray(),fog:scene.fog.density,fieldOpacity,evidenceOpacity,attitude:spacecraft.quaternion.toArray(),spacecraftPosition:spacecraft.position.toArray(),beam:beam.visible,evidence:sample,viewport:[innerWidth,innerHeight]});
 }
 function animate(time){
  if(!active)return;raf=requestAnimationFrame(animate);if(document.hidden)return;
  const dt=Math.max(0,Math.min((time-last)/1000,.1));last=time;target=getProgress();
  const next=progress+(target-progress)*(1-Math.exp(-10*dt)),previous=progress;
  progress=Math.abs(target-next)<.00002?target:next;
  // No time-based orbit drift: each checkpoint is identical in either direction.
  if(progress!==previous||frames++<3){apply(progress);renderScene();}
 }
 function resizeViewport(){
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1.25:1.5));renderer.setSize(innerWidth,innerHeight);
  composer?.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;
 }
 function updateSample(){
  $('sample-status').textContent=insufficient?'ข้อมูลยังไม่พอ':'ควรตรวจต่อ';
  $('before-value').textContent=insufficient?'—':DEMO.before.toFixed(2);$('after-value').textContent=insufficient?'—':DEMO.after.toFixed(2);
  $('sample-explanation').textContent=insufficient?'พื้นที่ที่ใช้วัดได้ในสองวันไม่ทับซ้อนกัน จึงยังสรุปการเปลี่ยนแปลงไม่ได้':'ค่า NDVI ลดลงในพื้นที่ตัวอย่าง จึงควรตรวจแปลงต่อเพื่อหาสาเหตุ';
  $('inspect-field').textContent=insufficient?'กลับไปดูกรณีข้อมูลเพียงพอ':'ดูกรณีข้อมูลไม่พอ';
  $('evidence-panel').querySelector('.quality-line').textContent=insufficient?'ไม่มีพื้นที่ร่วมที่ใช้วัดได้ จึงเปรียบเทียบไม่ได้':'ข้อมูลตัวอย่างสองช่วงเวลาใช้เปรียบเทียบได้';
  $('evidence-panel').querySelector('.map-legend').hidden=insufficient;
  $('evidence-panel').querySelectorAll('.evidence-dates div span').forEach((e,i)=>e.textContent=insufficient?'NDVI —':`NDVI ${[DEMO.before,DEMO.after][i].toFixed(2)}`);
  if(active){apply(progress);renderScene();}
 }
 listen(window,'resize',()=>{if(!renderer||!active)return;resizeViewport();target=getProgress();progress=target;apply(progress);renderScene();});
 listen(window,'scroll',()=>target=getProgress(),{passive:true});listen(document,'visibilitychange',()=>last=performance.now());
 const resume=()=>{reduced=false;$('motion').textContent='ลดการเคลื่อนไหว';$('motion').setAttribute('aria-pressed','false');init();};
 listen($('motion'),'click',()=>{if(reduced)resume();else{reduced=true;fallback('เปิดโหมดลดการเคลื่อนไหว แสดงวิธีติดตามแปลงและข้อมูลตัวอย่าง',true);}});
 listen($('resume'),'click',resume);
 listen(media,'change',e=>{reduced=e.matches;if(reduced)fallback('แสดงวิธีติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);else resume();});
 listen(root.querySelector('.loading-skip'),'click',e=>{e.preventDefault();reduced=true;fallback('ติดตามแปลงด้วยข้อมูลดาวเทียม ก่อนลงตรวจพื้นที่จริง',true);$('fallback').focus({preventScroll:true});});
 listen($('inspect-field'),'click',()=>{insufficient=!insufficient;updateSample();});
 for(const link of root.querySelectorAll('a[href^="#"]'))listen(link,'click',e=>{
  const id=link.getAttribute('href').slice(1),p={orbit:0,mission:.22,field:.86}[id];
  if(p===undefined)return;e.preventDefault();
  if(reduced||!active){$('fallback').focus({preventScroll:true});return;}
  moveTo(p,'smooth');history.replaceState(null,'',`#${id}`);if(id==='field')focusField=true;
 });
 // Exact scroll checkpoints avoid timing-dependent capture in software WebGL.
 // Ordinary visits and user navigation still use the continuous scroll easing.
 const diagnostics={snapshot:()=>structuredClone(state),sampleCamera,SHOTS,setTerrainDebug:(layer='all',wireframe=false)=>{
  if(!active)throw new Error('Journey is not active');
  const terrainDebug=terrain.userData.setDebug({layer,wireframe});
  renderScene();writeDiagnostics({terrainDebug});
  return structuredClone(state);
 },seekCheckpoint:p=>{
  if(!active)throw new Error('Journey is not active');
  moveTo(p);target=getProgress();progress=target;apply(progress);renderScene();
  return structuredClone(state);
 }};if(diagnostic)window.__agriscope=diagnostics;
 $('motion').hidden=false;
 if(reduced)fallback('แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);else init();
 return ()=>{
  disposed=true;active=false;controller.abort();cancelAnimationFrame(raf);
  if(window.__agriscope===diagnostics)delete window.__agriscope;
  const geometries=new Set(),materials=new Set(),textures=new Set(resources);
  scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  composer?.passes.forEach(p=>p.dispose?.());composer?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();$('rail').replaceChildren();
 };
}
