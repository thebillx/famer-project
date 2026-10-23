import * as THREE from './vendor.js';
import {buildSpacecraft} from './spacecraft.js';
import {descentSurface} from './descent-surface.js';
import {buildSurveyCorridor} from './survey-corridor.js';
import {buildEarth,buildStarfield} from './earth.js';
import {bindTerrainEnvironment,buildTerrain,fieldHeight} from './terrain.js';
import {buildEvidence,DEMO} from './demo-evidence.js';
import {loadMeshData,loadSurfaceMaps} from './mesh-assets.js';
import {spaceEnvironment,agriculturalEnvironment} from './space-light.js';
import {SHOTS,BEATS,sampleCamera,sampleSpacecraft,clamp,smooth} from './timeline.js';

// One instance per React mount. Assets, listeners and GPU resources belong to it.
export function mountJourney(root,{lab=false,cameraSampler=sampleCamera}={}){
 const controller=new AbortController();
 const listen=(element,event,handler,options={})=>element.addEventListener(event,handler,{...options,signal:controller.signal});
 const $=id=>root.querySelector(`#${id}`),params=new URLSearchParams(location.search);
 const media=matchMedia('(prefers-reduced-motion: reduce)'),diagnostic=params.has('qa');
 const resources=[];
 let disposed=false,initializing=false,probeStarted=false,reduced=media.matches||params.get('motion')==='reduce';
 let renderer,composer,scene,camera,spacecraft,earth,terrain,heroWorld,regionalWorld,descentAtmosphere,stars,beam,corridor,evidence,sun,fill,hemisphere,craftFill,craftRim,craftEdge,fieldKey,payloadMeshes=[],craftMaterials=[];
 let progress=0,target=0,active=false,raf=0,last=0,frames=0,shotIndex=-1,mobileLayout=null,narrativeInsufficient=null,corridorCopy=null,focusField=false,insufficient=false,state={};
 let comparisonOverride=null,payloadExpanded=false,activeHotspot=null;
 const pointerGoal={x:0,y:0},pointer={x:0,y:0};
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
   renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=lab?1.04:.98;
   renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   $('scene-root').appendChild(renderer.domElement);
   listen(renderer.domElement,'webglcontextlost',e=>{e.preventDefault();fallback('การแสดงผล 3D หยุดชั่วคราว กรุณาโหลดหน้าใหม่เพื่อเริ่มอีกครั้ง');});
   scene=new THREE.Scene();scene.background=new THREE.Color(0x060d15);scene.fog=new THREE.FogExp2(0x11263a,.0008);
   camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.08,450);
   const assetCount=lab?8:7;let loaded=0;const complete=()=>{$('loading-progress').style.width=`${++loaded/assetCount*100}%`;};
   const loader=new THREE.TextureLoader();
   const labModules=lab?Promise.all([import('./descent-atmosphere.js'),import('./scene4-regional.js'),import('./scene4-hero.js')]):Promise.resolve(null);
   const textures=await Promise.all(['earth-day.jpg','earth-clouds.jpg','earth-night.png','regional-landscape.png'].map(async file=>{
    const texture=await loader.loadAsync(`/cinematic/textures/${file}`);
    if(disposed)texture.dispose();else resources.push(texture);
    complete();return texture;
   }));
   // The lab replaces the old procedural tree instances with authored regional
   // vegetation masses. The landing route keeps its existing tree asset.
   const meshNames=lab?['spacecraft','farmland','scene4-regional','scene4-hero']:['spacecraft','farmland','tree'];
   const meshData=await Promise.all(meshNames.map(async name=>{
    const data=await loadMeshData(name,controller.signal);complete();return data;
   }));
   const [ship,farmland,third,fourth]=meshData;
   const tree=lab?null:third,scene4Regional=lab?third:null,scene4Hero=lab?fourth:null;
   const modules=await labModules;
   if(disposed)return;
   const surfaceMaps=await loadSurfaceMaps([ship,farmland,...(tree?[tree]:[]),...(scene4Regional?[scene4Regional]:[]),...(scene4Hero?[scene4Hero]:[])],loader);
   for(const set of Object.values(surfaceMaps))for(const texture of Object.values(set)){if(disposed)texture.dispose();else resources.push(texture);}
   if(disposed)return;
   const [day,clouds,night,regional]=textures;
   textures.forEach(t=>{t.colorSpace=t===clouds?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
   const environment=spaceEnvironment(renderer);scene.environment=environment.texture;resources.push(environment);scene.environmentIntensity=.68;
   hemisphere=new THREE.HemisphereLight(0xb3d8ee,0x1b2618,.68);scene.add(hemisphere);
   sun=new THREE.DirectionalLight(0xffead4,2.35);sun.position.set(-30,30,18);sun.castShadow=true;
   sun.shadow.mapSize.set(innerWidth<760?1024:2048,innerWidth<760?1024:2048);
   Object.assign(sun.shadow.camera,{near:1,far:120,left:-19,right:19,top:25,bottom:-19});sun.shadow.bias=-.00012;sun.shadow.normalBias=.003;sun.shadow.radius=5;scene.add(sun);
   fill=new THREE.DirectionalLight(0x7faed2,.76);fill.position.set(20,18,-15);scene.add(fill);
   craftFill=new THREE.PointLight(0xc4dded,90,22,2);scene.add(craftFill);
   if(lab){
    craftRim=new THREE.PointLight(0xffae70,0,28,2);craftRim.layers.set(1);
    craftEdge=new THREE.PointLight(0x6eb8ee,0,32,2);craftEdge.layers.set(1);scene.add(craftRim,craftEdge);
    fieldKey=new THREE.SpotLight(0xffc98c,0,40,.25,.93,1.55);fieldKey.position.set(-8,12,2);fieldKey.target.position.set(-.1,0,-.2);scene.add(fieldKey,fieldKey.target);
   }
   earth=buildEarth({day,clouds,night,regional});scene.add(earth);stars=buildStarfield();scene.add(stars);
   if(lab)earth.userData.surface.material.transparent=true;
   spacecraft=buildSpacecraft(ship,surfaceMaps,{cinematic:lab});scene.add(spacecraft);
   if(lab)spacecraft.traverse(object=>object.layers.enable(1));
   if(lab)craftMaterials=[...new Set(spacecraft.children.flatMap(object=>{const materials=[];object.traverse?.(child=>{if(child.isMesh&&child.material.userData.cinematicBaseOpacity!==undefined)materials.push(child.material);});return materials;}))];
   spacecraft.traverse(object=>{if(object.isMesh&&object.name==='Survey / optical activation')payloadMeshes.push(object);});
   const rotation=new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(earth.quaternion.clone().invert()));
   terrain=buildTerrain({farmland,tree},{mobile:innerWidth<760,day,rotation,surfaceMaps,regional,regionalBlend:earth.userData.regionalBlend,cinematic:lab});scene.add(terrain);
   const fieldEnvironment=agriculturalEnvironment(renderer);resources.push(fieldEnvironment);
   bindTerrainEnvironment(terrain,fieldEnvironment.texture);
   if(lab){
    regionalWorld=modules[1].buildScene4Regional(scene4Regional,{environment:fieldEnvironment.texture,surfaceMaps:{water:surfaceMaps.water}});scene.add(regionalWorld);
    heroWorld=modules[2].buildScene4Hero(scene4Hero,{environment:fieldEnvironment.texture,surfaceMaps});scene.add(heroWorld);
    descentAtmosphere=modules[0].buildDescentAtmosphere({mobile:innerWidth<760});scene.add(descentAtmosphere);
   }
   evidence=buildEvidence();scene.add(evidence.group);
   corridor=buildSurveyCorridor({lab});scene.add(corridor);beam=corridor.userData.beam;
   composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(scene,camera));
   composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),lab?.16:.10,lab?.38:.35,1.5));composer.addPass(new THREE.OutputPass());
   const phases=[0,1,3,6,9];
   SHOTS.forEach((shot,i)=>{
    const button=document.createElement('button');button.type='button';button.dataset.phase=String(phases.includes(i));
    button.setAttribute('aria-label',`ช่วง ${i+1}: ${shot.thai}`);button.innerHTML=lab?`<span>${String(i+1).padStart(2,'0')}</span><i></i>`:'<i></i>';
    listen(button,'click',()=>moveTo(shot.p,reduced?'instant':'smooth'));$('rail').appendChild(button);
   });
   const hashProgress={orbit:0,mission:.22,field:.86}[location.hash.slice(1)];
   const initial=params.has('shot')?SHOTS[clamp(Math.floor(Number(params.get('shot'))||1)-1,0,9)].p:params.has('p')?clamp(Number(params.get('p'))||0):hashProgress??null;
   if(initial!==null){root.classList.remove('static-mode');moveTo(initial);progress=getProgress();}
   const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
   writeDiagnostics({assets:assetCount,model:spacecraft.userData.asset,land:terrain.userData.asset,heroLand:heroWorld?.userData.asset??null,regionalLand:regionalWorld?.userData.asset??null,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),devicePixelRatio,renderPixelRatio:renderer.getPixelRatio(),browser:navigator.userAgent});
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
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),at=q=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)};};
  const intervalClassification={droppedFrameIntervals:intervals.filter(value=>value>25).length,stalledFrameIntervals:intervals.filter(value=>value>50).length,severeStallIntervals:intervals.filter(value=>value>100).length,estimatedMissedVsyncs:intervals.reduce((total,value)=>total+Math.max(0,Math.round(value/(1000/60))-1),0),thresholdsMs:{dropped:25,stalled:50,severe:100}};
  writeDiagnostics({hardwareProbe:{shot,progress:base,recording,elapsedMs:performance.now()-started,intervalStatsMs:stats(intervals),intervalClassification,submissionStatsMs:stats(submission),intervalsMs:intervals,renderSubmissionMs:submission,interpretation:'rAF scheduling and synchronous render submission under the reported renderer; intentional journey holds are not part of this probe and this is not isolated GPU execution time.'}});
 }
 function panel(id,opacity){const element=$(id);element.style.opacity=opacity;element.style.visibility=opacity>.02?'visible':'hidden';element.inert=opacity<.5;}
 function apply(p){
  const key=cameraSampler(p,innerWidth/innerHeight),mobile=innerWidth<760;
  const shot=SHOTS.reduce((a,s,i)=>p>=s.p-.025?i:a,0);
  const parallax=lab&&!mobile?smooth(.025,.07,p)*(1-smooth(.30,.36,p)):0;
  key.position.x+=pointer.x*.28*parallax;key.position.y-=pointer.y*.16*parallax;
  key.target.x+=pointer.x*.08*parallax;key.target.y-=pointer.y*.05*parallax;
  camera.position.copy(key.position);camera.fov=key.fov;camera.lookAt(key.target);camera.rotateZ(key.roll);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const craft=sampleSpacecraft(p);
  spacecraft.position.copy(craft.position);spacecraft.quaternion.copy(craft.quaternion);
  const craftOpacity=lab?1-smooth(.405,.45,p):1;
  spacecraft.visible=lab?craftOpacity>.002:p<.50;
  if(lab)for(const material of craftMaterials){
   material.opacity=material.userData.cinematicBaseOpacity*craftOpacity;
   // Opaque spacecraft surfaces write depth until departure begins. During the
   // fade they stop occluding the Earth, corridor and cloud passage behind them.
   material.depthWrite=material.userData.cinematicBaseDepthWrite&&craftOpacity>.995;
  }
  spacecraft.userData.apply?.(craft);
  if(lab&&payloadExpanded)for(const mesh of payloadMeshes)mesh.material.emissiveIntensity+=1.15;
  const surface=descentSurface(p),descent=smooth(.41,.56,p),detail=surface.detail;
  const cameraSide=key.position.clone().sub(craft.position).normalize();
  craftFill.position.copy(craft.position).addScaledVector(cameraSide,5.5).add(new THREE.Vector3(-2,2,0));
   craftFill.intensity=(lab?68:90)-(lab?32:55)*smooth(.15,.18,p)*(1-smooth(.185,.22,p));craftFill.intensity*=1-smooth(.40,.49,p);
   if(craftRim){
    const orbital=1-smooth(.365,.46,p),activation=smooth(.15,.235,p)*(1-.38*smooth(.29,.36,p));
    craftRim.position.copy(craft.position).add(new THREE.Vector3(-4,4,4));
    craftEdge.position.copy(craft.position).addScaledVector(cameraSide,-3.2).add(new THREE.Vector3(3,1,-2));
    craftRim.intensity=(90+55*activation)*orbital;craftEdge.intensity=(58+34*activation)*orbital;
   }
  const agriculturalLight=smooth(.43,.57,p);
  // During descent, preserve the warm key while restoring cool sky fill and
  // environment response so crop ridges, bank slopes, and water retain depth.
  sun.intensity=(lab?1.72:1.85)+(lab?.72:.43)*agriculturalLight;fill.intensity=(lab?.94:1.05)-(lab?.30:.27)*agriculturalLight;hemisphere.intensity=.56+(lab?.18:.12)*agriculturalLight;scene.environmentIntensity=.70+(lab?.12:.08)*agriculturalLight;
   if(fieldKey)fieldKey.intensity=360*smooth(.395,.47,p)*(1-.86*smooth(.505,.548,p))*(1-.22*smooth(.82,.94,p));
  // Keep the far edge atmospheric, but let the nearby parcels retain warm soil
  // and crop contrast instead of disappearing into a grey fog wash.
   scene.fog.density=.00055+descent*(lab?.0048:.0073);scene.fog.color.set(0x101c29).lerp(new THREE.Color(lab?0x304852:0x354b50),descent);
  scene.background.set(0x060d15).lerp(new THREE.Color(0x13282f),descent);
  stars.material.opacity=.78*(1-smooth(.36,.49,p));stars.visible=p<.51;
  terrain.visible=surface.reveal>0;
  earth.scale.setScalar(surface.radius/40);earth.position.y=-surface.radius;
  earth.userData.regionalBlend.value=smooth(.385,.423,p);
  terrain.userData.localDetail.value=detail;
  const flatten=terrain.userData.update(p);
   const heroState=heroWorld?.userData.apply(p,flatten)??null;
   const regionalState=regionalWorld?.userData.apply(p)??null;
   const atmosphericState=descentAtmosphere?.userData.apply(p)??null;
  terrain.userData.boundary.material.transparent=true;terrain.userData.boundary.material.opacity=smooth(.50,.56,p);
  // Let the spherical basemap leave as the camera commits to the local terrain.
  // Keeping it underneath the flattening mesh produces stray geographic green
  // islands through gaps between synthetic plots in shots 5–6.
  const earthDeparture=lab?1-smooth(.405,.44,p):1;
  earth.userData.surface.visible=lab?earthDeparture>.002:p<.475;
  if(lab){earth.userData.surface.material.opacity=earthDeparture;earth.userData.surface.material.depthWrite=earthDeparture>.995;}
  earth.userData.atmosphere.material.uniforms.opacity.value=1-smooth(lab?.405:.42,lab?.455:.49,p);
  const orbitalCloudDeparture=1-smooth(lab?.395:.41,lab?.44:.465,p);
  earth.userData.clouds.visible=p<(lab?.445:.49);earth.userData.clouds.material.opacity=.68*orbitalCloudDeparture;
  earth.userData.clouds.rotation.y=.008*smooth(.20,.49,p);
  earth.userData.highClouds.visible=p<(lab?.445:.49);earth.userData.highClouds.material.opacity=.36*orbitalCloudDeparture;
  earth.userData.highClouds.rotation.y=.006+.012*smooth(.20,.49,p);
  earth.userData.cloudShadow.visible=p<(lab?.445:.49);earth.userData.cloudShadow.material.opacity=.26*orbitalCloudDeparture;
  earth.userData.cloudShadow.rotation.y=earth.userData.clouds.rotation.y-.0018;
  earth.userData.thailandFocus.visible=p<.445;
  earth.userData.thailandFocus.material.opacity=.72*smooth(.31,.355,p)*(1-smooth(.385,.415,p));
  const payload=spacecraft.localToWorld(spacecraft.userData.payloadPosition.clone()),ground=new THREE.Vector3(0,.12,0);
  corridor.userData.apply(p,payload,flatten);
  const sample=evidence.apply(p,insufficient,flatten,lab?comparisonOverride:null);
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
  const geoDeparture=lab?.425:.46;
  $('geo').style.opacity=smooth(.33,.36,p)*(1-smooth(lab?.395:.425,geoDeparture,p));$('geo').style.visibility=p>=.33&&p<geoDeparture?'visible':'hidden';
  const projectedGround=ground.clone().project(camera);
  $('geo').style.left=`${clamp((projectedGround.x*.5+.5)*innerWidth+18,24,innerWidth-210)}px`;
  $('geo').style.top=`${clamp((-projectedGround.y*.5+.5)*innerHeight-24,110,innerHeight*.56)}px`;
  const optic=payload.project(camera);
  $('instrument').style.left=`${clamp((optic.x*.5+.5)*innerWidth-27,24,innerWidth-230)}px`;
  $('instrument').style.top=`${clamp((-optic.y*.5+.5)*innerHeight-27,110,innerHeight*.48)}px`;
  if(lab){
   const payloadControl=$('payload-control'),payloadVisible=p>=.17&&p<.31;
   payloadControl.hidden=!payloadVisible;payloadControl.inert=!payloadVisible;
   payloadControl.style.left=`${clamp((optic.x*.5+.5)*innerWidth+18,20,innerWidth-155)}px`;
   payloadControl.style.top=`${clamp((-optic.y*.5+.5)*innerHeight-20,105,innerHeight*.55)}px`;
   const payloadTip=$('payload-tip');payloadTip.style.left=payloadControl.style.left;payloadTip.style.top=`${clamp(parseFloat(payloadControl.style.top)+50,150,innerHeight-150)}px`;
   if(!payloadVisible&&payloadExpanded){payloadExpanded=false;payloadControl.setAttribute('aria-expanded','false');payloadTip.hidden=true;}
   const fieldVisible=p>=.535&&p<.635,hotspots=$('field-hotspots');hotspots.hidden=!fieldVisible;hotspots.inert=!fieldVisible;
   if(fieldVisible){
    const points=[new THREE.Vector3(-2.12,fieldHeight(-2.12,-1.84)+.08,-1.84),new THREE.Vector3(.95,fieldHeight(.95,.25)+.10,.25)];
    [...hotspots.children].forEach((button,index)=>{const point=terrain.localToWorld(points[index].clone()).project(camera);button.style.left=`${clamp((point.x*.5+.5)*innerWidth,24,innerWidth-80)}px`;button.style.top=`${clamp((-point.y*.5+.5)*innerHeight,110,innerHeight-90)}px`;});
   }else if(activeHotspot){activeHotspot=null;$('hotspot-detail').hidden=true;}
  }
  const illustrative=p>=.265&&p<.335;
  if(shot!==shotIndex||mobile!==mobileLayout||insufficient!==narrativeInsufficient||illustrative!==corridorCopy){
   corridorCopy=illustrative;
   shotIndex=shot;mobileLayout=mobile;narrativeInsufficient=insufficient;const s=SHOTS[shot],assessmentCopy=insufficient?insufficientChapters[shot]:null;$('eyebrow').textContent=`${String(shot+1).padStart(2,'0')} / 10   ${s.name}`;
   if(assessmentCopy){
    $('title').textContent=assessmentCopy[0];$('description').textContent=assessmentCopy[1];
   }else{
    $('title').innerHTML=shot===0?'มองเห็นความเปลี่ยนแปลง<br><span>จากวงโคจรถึงแปลงจริง</span>':s.thai.split(' ').filter(Boolean).join('<br>');
    $('description').textContent=mobile?mobileChapters[shot][1]:s.text;
    if(mobile)$('title').textContent=mobileChapters[shot][0];
   }
   if(illustrative){$('title').textContent='เชื่อมข้อมูล สู่พื้นที่จริง';$('description').textContent='ยานและแนวแสงเป็นภาพจำลองการเชื่อมโยงข้อมูล ไม่ใช่ยานของ AgriScope หรือการยิงแสงจากดาวเทียม';}
   $('chapter').textContent=`${s.name} / ${String(shot+1).padStart(2,'0')}`;
  }
  const phase=[0,1,3,6,9].reduce((a,i)=>i<=shot?i:a,0);
  const currentRail=lab?shot:mobile?phase:shot;
  [...$('rail').children].forEach((b,i)=>b.setAttribute('aria-current',String(i===currentRail)));
  $('bottom-left').firstChild.textContent=p<.08?'SCROLL TO EXPLORE ':p>.93?'YOUR AGRISCOPE WORKSPACE ':'EARTH OBSERVATION / THAILAND ';
  const craftDepthWriters=lab?craftMaterials.filter(material=>material.depthWrite).length:null;
  writeDiagnostics({p:+p.toFixed(6),shot:shot+1,beat:BEATS.filter(beat=>p>=beat.p).at(-1)?.id,journeyMode:lab?'lab':'landing',roll:key.roll,camera:camera.position.toArray(),look:key.target.toArray(),fov:camera.fov,terrain:terrain.visible,scene4Hero:heroState,regionalWorld:regionalState,descentAtmosphere:atmosphericState,descentSurface:surface,surfaceTransforms:{earthScale:earth.scale.toArray(),earthPosition:earth.position.toArray(),terrainScale:terrain.scale.toArray(),heroScale:heroWorld?.scale.toArray()??null,regionalScale:regionalWorld?.scale.toArray()??null},localDetail:detail,flatten,cloudOpacity:earth.userData.clouds.material.opacity,cloudRotation:earth.userData.clouds.rotation.y,cloudShadowOpacity:earth.userData.cloudShadow.material.opacity,thailandFocusOpacity:earth.userData.thailandFocus.material.opacity,atmosphere:earth.userData.atmosphere.material.uniforms.opacity.value,beamOpacity:beam.material.uniforms.opacity.value,beamPosition:beam.position.toArray(),beamAttitude:beam.quaternion.toArray(),fog:scene.fog.density,fieldOpacity,evidenceOpacity,attitude:spacecraft.quaternion.toArray(),spacecraftPosition:spacecraft.position.toArray(),spacecraftOpacity:craftOpacity,spacecraftDepthWrite:lab?{enabled:craftDepthWriters>0,active:craftDepthWriters,authored:craftMaterials.filter(material=>material.userData.cinematicBaseDepthWrite).length,total:craftMaterials.length}:null,beam:beam.visible,evidence:sample,pointerParallax:[pointer.x,pointer.y],payloadExpanded,activeHotspot,viewport:[innerWidth,innerHeight]});
 }
 function animate(time){
  if(!active)return;raf=requestAnimationFrame(animate);if(document.hidden)return;
  const dt=Math.max(0,Math.min((time-last)/1000,.1));last=time;target=getProgress();
  const next=progress+(target-progress)*(1-Math.exp(-10*dt)),previous=progress;
  progress=Math.abs(target-next)<.00002?target:next;
  const previousPointerX=pointer.x,previousPointerY=pointer.y,pointerEase=1-Math.exp(-7*dt);
  pointer.x+=(pointerGoal.x-pointer.x)*pointerEase;pointer.y+=(pointerGoal.y-pointer.y)*pointerEase;
  const pointerMoved=Math.abs(pointer.x-previousPointerX)+Math.abs(pointer.y-previousPointerY)>.0001;
  // No time-based orbit drift: each checkpoint is identical in either direction.
  if(progress!==previous||pointerMoved||frames++<3){apply(progress);renderScene();}
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
  if(lab){$('comparison-slider').disabled=insufficient;$('comparison-output').textContent=insufficient?'ข้อมูลสองวันไม่มีพื้นที่ร่วม จึงเปรียบเทียบไม่ได้':comparisonOverride===null?'แบ่งดูสองช่วงเวลา':comparisonOverride<.34?'แสดงวันที่ก่อนเป็นหลัก':comparisonOverride>.66?'แสดงวันที่หลังเป็นหลัก':'แบ่งดูสองช่วงเวลา';}
  if(active){apply(progress);renderScene();}
 }
 if(lab){
  listen(root,'pointermove',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;const rect=root.querySelector('.cinematic-stage').getBoundingClientRect();pointerGoal.x=clamp((event.clientX-rect.left)/rect.width)*2-1;pointerGoal.y=clamp((event.clientY-rect.top)/rect.height)*2-1;},{passive:true});
  listen(root,'pointerleave',()=>{pointerGoal.x=0;pointerGoal.y=0;});
  const payloadControl=$('payload-control'),payloadTip=$('payload-tip');
  listen(payloadControl,'click',()=>{payloadExpanded=!payloadExpanded;payloadControl.setAttribute('aria-expanded',String(payloadExpanded));payloadTip.hidden=!payloadExpanded;if(active){apply(progress);renderScene();}});
  const slider=$('comparison-slider');
  listen(slider,'input',()=>{comparisonOverride=Number(slider.value)/100;updateSample();});
  const hotspotCopy={boundary:'ขอบเขตเดียวกันใช้เชื่อมข้อมูลทุกช่วงเวลา เพื่อให้การเปรียบเทียบอ้างอิงพื้นที่เดียวกัน',change:'สีบนแปลงเป็น NDVI จำลองสำหรับอธิบายการเปรียบเทียบ ไม่ได้ระบุโรคหรือสาเหตุ'};
  for(const button of root.querySelectorAll('[data-hotspot]')){
   const show=()=>{activeHotspot=button.dataset.hotspot;const output=$('hotspot-detail');output.textContent=hotspotCopy[activeHotspot];const rect=button.getBoundingClientRect();output.style.left=`${clamp(rect.left,16,innerWidth-310)}px`;output.style.top=`${clamp(rect.top+42,120,innerHeight-120)}px`;output.hidden=false;if(active)writeDiagnostics({activeHotspot});};
   listen(button,'click',show);listen(button,'focus',show);listen(button,'pointerenter',event=>{if(event.pointerType==='mouse')show();});
  }
  listen(root,'keydown',event=>{if(event.key==='Escape'){payloadExpanded=false;activeHotspot=null;payloadControl.setAttribute('aria-expanded','false');payloadTip.hidden=true;$('hotspot-detail').hidden=true;if(active){apply(progress);renderScene();}}});
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
 const diagnostics={snapshot:()=>structuredClone(state),sampleCamera:cameraSampler,SHOTS,BEATS,setTerrainDebug:(layer='all',wireframe=false)=>{
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
