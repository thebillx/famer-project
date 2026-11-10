import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {NATIVE_ASSET_MANIFEST} from '../../apps/web/public/cinematic/native-journey-manifest.js';
import {LEGACY_FIELD_CORNERS} from '../../apps/web/public/cinematic/native-timeline.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const url=process.env.CINEMATIC_URL||'http://127.0.0.1:5180/';
const labRoute=new URL(url).pathname.includes('/cinematic-lab');
const evidence=process.env.CINEMATIC_EVIDENCE;
if(!evidence)throw new Error('Set CINEMATIC_EVIDENCE to a directory outside the repository.');
await mkdir(evidence,{recursive:true});
const software=process.env.CINEMATIC_SOFTWARE_WEBGL==='1';
const browser=await chromium.launch({
 ...(process.env.CINEMATIC_CHROMIUM?{executablePath:process.env.CINEMATIC_CHROMIUM}:{channel:'chrome'}),
 headless:process.env.CINEMATIC_HEADED!=='1',
 args:software?['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[],
});
const viewports=[{width:1440,height:900},{width:1276,height:1285},{width:390,height:844},{width:375,height:667},{width:1920,height:800}];
const report={url,browser:browser.version(),softwareWebGL:software,viewports:[],checks:[],errors:[],warnings:[],limitations:['Mobile viewport/touch emulation; no physical-device testing','Public evidence reuses synthetic offline fixture values; no satellite API or private data','Checkpoint captures seek the exact document scroll position; animated user controls are checked separately']};
const contexts=[];
const nativePaths=NATIVE_ASSET_MANIFEST.map(asset=>asset.url);
const nativeModules=['native-journey.js','native-assets.js','native-timeline.js','native-journey-manifest.js'];
const state=p=>p.evaluate(()=>window.__agriscope.snapshot());
const save=(p,name)=>p.screenshot({path:resolve(evidence,`${name}.png`),timeout:120000});
function monitor(p,normal=true){
 p.on('pageerror',e=>{if(normal)report.errors.push(e.message);});
 p.on('console',m=>{if(normal&&m.type()==='error'&&!m.text().includes('favicon.ico'))report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
}
async function ready(p){
 await p.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='webgl',null,{timeout:60000});
 assert.equal(await p.locator('.cinematic canvas').count(),1);
 const snapshot=await state(p);
 assert.equal(snapshot.assets,labRoute?11:7);
 assert.match(snapshot.model.generator,/Blender 4\.5/);
 if(labRoute){
  assert.ok(snapshot.nativeJourney,'Native descent has initialized');
  const expectedAssets=NATIVE_ASSET_MANIFEST.map(({id,url,kind,sha256,byte_length})=>({id,url,kind,sha256,byte_length})).sort((left,right)=>left.id.localeCompare(right.id));
  assert.deepEqual([...snapshot.nativeJourney.assets].sort((left,right)=>left.id.localeCompare(right.id)),expectedAssets,'Loaded native bytes match the source-bound manifest');
  assert.equal(snapshot.BEATS?.length??(await p.evaluate(()=>window.__agriscope.BEATS.length)),19);
 }
}
async function checkpoint(p,progress){return p.evaluate(progress=>window.__agriscope.seekCheckpoint(progress),progress);}
async function assertUploadedRegistration(p,snapshot){
 const uploaded=await p.evaluate(()=>{
  const context=document.querySelector('.cinematic canvas')?.getContext('webgl2');
  if(!context)throw new Error('Native overlay has no WebGL2 context');
  const program=context.getParameter(context.CURRENT_PROGRAM);
  if(!program)throw new Error('Native overlay has no rendered program');
  const location=context.getUniformLocation(program,'registration');
  if(!location)throw new Error('Rendered overlay has no registration uniform');
  return Array.from(context.getUniform(program,location));
 });
 assert.equal(uploaded.length,9);
 const homography=snapshot.nativeJourney.registration.homography;
 for(let column=0;column<3;column++)for(let row=0;row<3;row++){
  assert.ok(Math.abs(uploaded[column*3+row]-homography[row*3+column])<1e-6,'Actual GPU column-major matrix matches the CPU projective mapping');
 }
}
function assertNativeTiming(native){
 const time=native.nativeTime;
 // Accepted source-reader starts and native clip durations are independent
 // of the adapter's applied mixer-time and compositor-uniform diagnostics.
 const expectedTimes={orbit:Math.min(4.5,Math.max(0,time)),regional:Math.min(5.5,Math.max(0,time-3)),field:Math.min(5,Math.max(0,time-7)),clouds:Math.min(12,Math.max(0,time))};
 for(const [id,expected] of Object.entries(expectedTimes))assert.ok(Math.abs(native.local_times[id]-expected)<1e-6,`${id} local time at descent second ${time}: expected ${expected}, got ${native.local_times[id]}`);
 const first=Math.min(1,Math.max(0,(time-3.69)/.12)),second=Math.min(1,Math.max(0,(time-7.69)/.12));
 const firstWeight=first*first*(3-2*first),secondWeight=second*second*(3-2*second);
 const expectedWeights={orbit:1-firstWeight,regional:firstWeight*(1-secondWeight),field:secondWeight};
 for(const [id,expected] of Object.entries(expectedWeights))assert.ok(Math.abs(native.stage_weights[id]-expected)<1e-6,`${id} compositor weight at descent second ${time}: expected ${expected}, got ${native.stage_weights[id]}`);
}
async function assertParcelClearOfPanels(p,snapshot,viewport){
 const matrix=snapshot.nativeJourney.registration.homography;
 const corners=LEGACY_FIELD_CORNERS.map(([x,z])=>{
  const divisor=matrix[6]*x+matrix[7]*z+matrix[8];
  return {x:(matrix[0]*x+matrix[1]*z+matrix[2])/divisor*viewport.width,y:(matrix[3]*x+matrix[4]*z+matrix[5])/divisor*viewport.height};
 });
 const parcel={left:Math.min(...corners.map(point=>point.x)),right:Math.max(...corners.map(point=>point.x)),top:Math.min(...corners.map(point=>point.y)),bottom:Math.max(...corners.map(point=>point.y))};
 const panels=await p.evaluate(()=>['#narrative','#evidence-panel','#field-panel'].flatMap(selector=>{
  const element=document.querySelector(selector),style=getComputedStyle(element);
  if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return [];
  const {left,right,top,bottom}=element.getBoundingClientRect();
  return [{selector,left,right,top,bottom}];
 }));
 report.validationCheckpoint={viewport,snapshot,parcel,panels};
 assert.ok(parcel.left>=0&&parcel.right<=viewport.width&&parcel.top>=0&&parcel.bottom<=viewport.height,`${viewport.width}×${viewport.height} shot ${snapshot.shot}: complete parcel stays inside viewport`);
 for(const panel of panels){
  const overlapWidth=Math.min(parcel.right,panel.right)-Math.max(parcel.left,panel.left);
  const overlapHeight=Math.min(parcel.bottom,panel.bottom)-Math.max(parcel.top,panel.top);
  assert.ok(overlapWidth<=0||overlapHeight<=0,`${viewport.width}×${viewport.height} shot ${snapshot.shot}: parcel overlaps ${panel.selector} by ${overlapWidth}×${overlapHeight}px`);
 }
 delete report.validationCheckpoint;
}
async function settled(p,progress){await p.waitForFunction(progress=>Math.abs(window.__agriscope.snapshot().p-progress)<.0003,progress,{timeout:90000});}
async function staticReady(p){
 await p.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='static',null,{timeout:30000});
 assert.ok(await p.locator('#fallback').isVisible());assert.equal(await p.locator('#loading').isVisible(),false);
 assert.equal(await p.locator('.cinematic').evaluate(el=>el.classList.contains('preparing')),false);
 for(const canvas of await p.locator('.cinematic canvas').all())assert.equal(await canvas.isVisible(),false);
 assert.equal(await p.locator('#fallback .text-link').getAttribute('href'),'/login?mode=register');
}
try{
 for(const viewport of viewports){
  const mobile=viewport.width<760,ctx=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});contexts.push(ctx);
  const p=await ctx.newPage();monitor(p);
  const cinematicRequests=[];
  p.on('request',request=>{const path=new URL(request.url()).pathname;if(path.includes('/cinematic/'))cinematicRequests.push(path);});
  await p.goto(`${url}?qa=1`);await ready(p);
  if(labRoute){
   for(const path of [...nativePaths,...nativeModules.map(file=>`/cinematic/${file}`)])assert.equal(cinematicRequests.filter(request=>request===path).length,1,`Native input loaded once: ${path}`);
   for(const name of ['scene4-regional','scene4-hero','scene4-context','tree'])assert.equal(cinematicRequests.includes(`/cinematic/models/${name}.mesh.json`),false,`Native lab omits ${name} derivative`);
  }else{
   assert.equal(cinematicRequests.some(path=>path.includes('/cinematic/models/native-descent/')||/\/cinematic\/native-[^/]+\.js$/.test(path)),false,'Landing entry is isolated from native descent');
  }
  const points=await p.evaluate(()=>window.__agriscope.SHOTS.map(s=>s.p)),captures=[];
  assert.equal(points.length,10);
  for(let i=0;i<points.length;i++){
   const s=await checkpoint(p,points[i]);assert.equal(s.shot,i+1);
   // Retain the measured full-journey draw-call ceilings through integration.
   // Native image planes can render a valid frame with fewer geometry calls.
   const drawBudget=labRoute?(s.p<.5?112:s.p<.8?84:58):(s.p<.5?84:58);
   const nativeOnly=labRoute&&s.nativeJourney.nativeWeight===1;
   const checkpointLabel=`${viewport.width}×${viewport.height} shot ${s.shot} at ${s.p}`;
   report.validationCheckpoint={viewport,drawBudget,snapshot:s};
   assert.ok(Number.isInteger(s.drawCalls)&&s.drawCalls>(nativeOnly?0:5)&&s.drawCalls<=drawBudget,`${checkpointLabel}: ${s.drawCalls} draw calls fall outside ${nativeOnly?1:6}–${drawBudget}`);
   assert.ok(Number.isInteger(s.triangles)&&s.triangles>(nativeOnly?0:1000),`${checkpointLabel}: invalid triangle count ${s.triangles}`);
   delete report.validationCheckpoint;
   assert.ok(s.camera.every(Number.isFinite));
   if(labRoute){
    const native=s.nativeJourney;
    assertNativeTiming(native);
    assert.equal(native.visualCamera.position.length,3);assert.equal(native.visualCamera.quaternion.length,4);
    assert.ok([...native.visualCamera.position,...native.visualCamera.quaternion,native.visualCamera.fov,native.targetCss.x,native.targetCss.y].every(Number.isFinite),'Native camera and target projection remain finite');
    assert.ok(Math.abs(native.visualCamera.aspect-16/9)<1e-8,'Native cameras keep authored 16:9 framing');
    assert.ok(native.nativeWeight>=0&&native.nativeWeight<=1,'Native takeover remains bounded');
    assert.ok(Math.abs(native.crop.displayWidth/native.crop.displayHeight-16/9)<1e-8,'The displayed source retains its authored aspect');
    assert.ok([native.crop.u0,native.crop.u1,native.crop.v0,native.crop.v1].every(value=>Number.isFinite(value)&&value>=0&&value<=1),'Responsive crop stays inside source coverage');
    assert.ok(native.crop.u1>native.crop.u0&&native.crop.v1>native.crop.v0,'Responsive crop has positive coverage');
    assert.ok([native.crop.offsetX,native.crop.offsetY,native.crop.displayWidth,native.crop.displayHeight].every(Number.isFinite),'Responsive crop remains finite');
    assert.equal(native.registration.homography.length,9);assert.ok(native.registration.homography.every(Number.isFinite));
    assert.deepEqual(Object.keys(native.registration.identities).sort(),['bottom','left','right','top']);
    assert.equal(native.registration.target,'V17 arrival beacon');
    if(captures.length)assert.deepEqual(native.registration.identities,captures[0].nativeJourney.registration.identities,'Native parcel vertex identities remain fixed');
    if(viewport.width===1920&&native.nativeWeight===1){
     report.validationCheckpoint={viewport,snapshot:s};
     assert.ok(native.crop.offsetX<=0&&native.crop.offsetX+native.crop.displayWidth>=viewport.width,`${checkpointLabel}: native imagery covers both horizontal viewport edges`);
     assert.ok(native.crop.offsetY<=0&&native.crop.offsetY+native.crop.displayHeight>=viewport.height,`${checkpointLabel}: native imagery covers both vertical viewport edges`);
     delete report.validationCheckpoint;
    }
    if(mobile&&i>=5)await assertParcelClearOfPanels(p,s,viewport);
   }
   assert.equal(await p.locator('#fallback').isVisible(),false);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   assert.equal(await p.locator('#field-panel').isVisible(),i>=8);
   if(i===2||i===3){
    const aligned=await p.evaluate(async({state,viewport,index})=>{
     const THREE=await import('/cinematic/vendor.js');
     const camera=new THREE.PerspectiveCamera(state.fov,viewport.width/viewport.height,.08,450);
     camera.position.fromArray(state.camera);camera.lookAt(new THREE.Vector3().fromArray(state.look));camera.rotateZ(state.roll);camera.updateMatrixWorld(true);
     const point=index===2?new THREE.Vector3(0,0,1.44).applyQuaternion(new THREE.Quaternion().fromArray(state.attitude)).add(new THREE.Vector3().fromArray(state.spacecraftPosition)):new THREE.Vector3(0,.12,0);
     point.project(camera);
     const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),element=document.querySelector(index===2?'#instrument':'#geo');
     const nativeTarget=index===3&&state.nativeJourney?.nativeWeight>0?state.nativeJourney.targetCss:null;
     const target=nativeTarget??{x:(point.x*.5+.5)*viewport.width,y:(-point.y*.5+.5)*viewport.height};
     const x=clamp(target.x+(index===2?-27:18),24,viewport.width-(index===2?230:210));
     const geoMaxY=nativeTarget&&viewport.width<760?.44:.56;
     const y=clamp(target.y+(index===2?-27:-24),110,viewport.height*(index===2?.48:geoMaxY));
     return Math.abs(parseFloat(element.style.left)-x)<.01&&Math.abs(parseFloat(element.style.top)-y)<.01;
    },{state:s,viewport,index:i});
    assert.ok(aligned,'Instrument/Thailand label uses the active current-frame camera');
    if(labRoute&&mobile&&i===3){
     const geo=await p.locator('#geo').boundingBox(),narrative=await p.locator('#narrative').boundingBox();
     assert.ok(geo&&narrative,'Visible Thailand label and narrative expose their bounds');
     const overlapWidth=Math.min(geo.x+geo.width,narrative.x+narrative.width)-Math.max(geo.x,narrative.x);
     const overlapHeight=Math.min(geo.y+geo.height,narrative.y+narrative.height)-Math.max(geo.y,narrative.y);
     assert.ok(overlapWidth<=0||overlapHeight<=0,`${checkpointLabel}: Thailand label overlaps the narrative`);
    }
   }
   await save(p,`${viewport.width}x${viewport.height}-shot-${String(i+1).padStart(2,'0')}`);captures.push(s);
  }
  for(let i=9;i>=0;i--){
   const s=await checkpoint(p,points[i]),a=captures[i];
   for(const key of ['camera','look','attitude','spacecraftPosition','beamPosition','beamAttitude'])s[key].forEach((v,k)=>assert.ok(Math.abs(v-a[key][k])<.0001,`Reverse ${key}`));
   for(const key of ['terrain','beam','shot'])assert.equal(s[key],a[key]);
   for(const key of ['localDetail','flatten','cloudOpacity','cloudRotation','atmosphere','beamOpacity','fog','fieldOpacity','evidenceOpacity'])assert.ok(Math.abs(s[key]-a[key])<.00001,`Reverse ${key}`);
   assert.deepEqual(s.evidence,a.evidence);
   if(labRoute)assert.deepEqual(s.nativeJourney,a.nativeJourney,`Native state reverses exactly at chapter ${i+1}`);
  }
  const transitionPoints=[.385,.397,.4049,.4051,.415,.425,.433,.445,.449431,.451,.452550,.4549,.4551,.465,.467,.469,.475,.48,.49];
  const assertSurfaceTransforms=(s,progress)=>{
   // Use the evaluated progress weights: document scroll is rounded to pixels.
   const expected=s.descentSurface;
   assert.deepEqual(s.surfaceTransforms.earthScale,Array(3).fill(expected.radius/40),`Production Earth scale at ${progress}`);
   assert.deepEqual(s.surfaceTransforms.earthPosition,[0,-expected.radius,0],`Production Earth tangent at ${progress}`);
   assert.deepEqual(s.surfaceTransforms.terrainScale,Array(3).fill(expected.scale),`Production terrain scale at ${progress}`);
  };
  const transitionStates=[];
  for(const progress of transitionPoints){
   const s=await checkpoint(p,progress);assertSurfaceTransforms(s,progress);transitionStates.push(s);
  }
  for(let i=transitionPoints.length-1;i>=0;i--){
   const s=await checkpoint(p,transitionPoints[i]),forward=transitionStates[i];
   assertSurfaceTransforms(s,transitionPoints[i]);
   assert.deepEqual(s.surfaceTransforms,forward.surfaceTransforms,'Actual transforms reverse exactly');
   assert.deepEqual(s.descentSurface,forward.descentSurface,'Forward/reverse use identical world scale and surface weights');
   assert.deepEqual(s.camera,forward.camera,'Transition camera is direction independent');
   assert.equal(s.drawCalls,forward.drawCalls,'Reverse restores transparent/opaque material state');
   assert.equal(s.triangles,forward.triangles,'Reverse restores geometry visibility');
  }
  if(labRoute){
   const joinTimes=[3.68,3.69,3.75,3.81,3.82,7.68,7.69,7.75,7.81,7.82];
   const cameraPoints=[.299,.30,.315,.33,...joinTimes.map(time=>.30+time/12*.26),.43,.46,.485,.51,.56].sort((left,right)=>left-right),cameraStates=[];
   for(const progress of cameraPoints){
    const s=await checkpoint(p,progress);
    assert.ok([...s.camera,...s.look,s.fov,s.roll].every(Number.isFinite),`Camera is finite at ${progress}`);
    assert.ok(Math.abs(s.nativeJourney.nativeTime-Math.min(12,Math.max(0,(s.p-.30)/.26*12)))<.0001,'Native time follows evaluated absolute progress');
    assertNativeTiming(s.nativeJourney);
    assert.deepEqual(s.viewport,[viewport.width,viewport.height],`Native descent uses the intended ${viewport.width}×${viewport.height} framing`);
    cameraStates.push(s);
   }
   await checkpoint(p,1);
   for(let i=cameraPoints.length-1;i>=0;i--){
    const reverse=await checkpoint(p,cameraPoints[i]),forward=cameraStates[i];
    for(const key of ['camera','look','scene4Hero','contextWorld','regionalWorld','descentAtmosphere','nativeJourney'])assert.deepEqual(reverse[key],forward[key],`${key} restores at ${cameraPoints[i]}`);
    assert.equal(reverse.fov,forward.fov);assert.equal(reverse.roll,forward.roll);
   }
   for(const index of [0,cameraPoints.length-1,3,1]){
    await checkpoint(p,1);
    const absolute=await checkpoint(p,cameraPoints[index]);
    assert.deepEqual(absolute.nativeJourney,cameraStates[index].nativeJourney,'Seeking from the end restores native state without accumulated mixer time');
   }
   const held=(await checkpoint(p,.561)).nativeJourney;
   assert.equal(held.nativeTime,12);
   for(const progress of [.65,.76,.86,.95,1]){
    const finalField=(await checkpoint(p,progress)).nativeJourney;
    assert.equal(finalField.nativeTime,12);assert.equal(finalField.nativeWeight,1);
    for(const key of ['visualCamera','targetCss','crop','registration'])assert.deepEqual(finalField[key],held[key],`Final field ${key} holds through product chapters`);
   }
   report.checks.push(`${viewport.width}: native entry and both scale blends, absolute reverse seeks after completion, final field hold`);
   const craftBefore=await checkpoint(p,.22),craftFaded=await checkpoint(p,.46),craftRestored=await checkpoint(p,.22);
   assert.equal(craftBefore.spacecraftOpacity,1,'Spacecraft is opaque at the payload beat');
   assert.equal(craftBefore.spacecraftDepthWrite.enabled,true,'Opaque spacecraft enables authored depth writes');
   assert.equal(craftBefore.spacecraftDepthWrite.active,craftBefore.spacecraftDepthWrite.authored,'Opaque spacecraft restores every authored depth writer');
   assert.ok(craftBefore.spacecraftDepthWrite.authored>0,'Spacecraft includes depth-writing authored materials');
   assert.equal(craftFaded.spacecraftOpacity,0,'Spacecraft clears the atmospheric descent');
   assert.equal(craftFaded.spacecraftDepthWrite.enabled,false,'Faded spacecraft cannot occlude the descent through depth writes');
   assert.equal(craftFaded.spacecraftDepthWrite.active,0,'No faded spacecraft material keeps writing depth');
   assert.deepEqual(craftRestored.spacecraftDepthWrite,craftBefore.spacecraftDepthWrite,'Reverse traversal restores spacecraft depth writes exactly');
   assert.equal(craftRestored.spacecraftOpacity,craftBefore.spacecraftOpacity,'Reverse traversal restores spacecraft opacity exactly');
   await checkpoint(p,.22);
   if(mobile)await p.locator('#payload-control').tap();else await p.locator('#payload-control').click();
   assert.ok(await p.locator('#payload-tip').isVisible());assert.match(await p.locator('#payload-tip').textContent(),/ไม่ใช่ยานหรืออุปกรณ์ของ AgriScope/);
   const boundaryState=await checkpoint(p,.56),matrix=boundaryState.nativeJourney.registration.homography;
   await assertUploadedRegistration(p,boundaryState);
   const hotspotPositions=await p.locator('#field-hotspots button').evaluateAll(elements=>elements.map(element=>({x:parseFloat(element.style.left),y:parseFloat(element.style.top)})));
   assert.equal(hotspotPositions.length,2);
   for(const [index,[x,z]] of [[-2.12,-1.84],[.95,.25]].entries()){
    const divisor=matrix[6]*x+matrix[7]*z+matrix[8];
    const expectedX=Math.min(viewport.width-80,Math.max(24,(matrix[0]*x+matrix[1]*z+matrix[2])/divisor*viewport.width));
    const expectedY=Math.min(viewport.height-90,Math.max(110,(matrix[3]*x+matrix[4]*z+matrix[5])/divisor*viewport.height));
    assert.ok(Math.abs(hotspotPositions[index].x-expectedX)<.01&&Math.abs(hotspotPositions[index].y-expectedY)<.01,'Hotspots share the native parcel projective mapping');
   }
   const boundary=p.locator('[data-hotspot="boundary"]');
   if(mobile)await boundary.tap();else await boundary.focus();
   assert.match(await p.locator('#hotspot-detail').textContent(),/ขอบเขตเดียวกัน/);
   const comparisonState=await checkpoint(p,.76);await assertUploadedRegistration(p,comparisonState);const comparison=p.locator('#comparison-slider');
   if(mobile){const bounds=await comparison.boundingBox();assert.ok(bounds);await p.touchscreen.tap(bounds.x+bounds.width*.85,bounds.y+bounds.height/2);}
   else{await comparison.focus();await p.keyboard.press('End');}
   assert.ok((await state(p)).evidence.comparison>.66,'Keyboard/touch changes the dated comparison');
   report.checks.push(`${viewport.width}: payload disclosure, registered field hotspots and ${mobile?'touch':'keyboard'} comparison control`);
  }
  // Real eased input, pause, and a direction reversal inside the former pop.
  for(const progress of [.405,.435,.449431,.452550,.465,.469,.449431,.415]){
   await p.evaluate(progress=>{const root=document.querySelector('.cinematic'),journey=document.querySelector('#journey');window.scrollTo({top:root.offsetTop+progress*(journey.offsetHeight-innerHeight),behavior:'instant'});},progress);
   await settled(p,progress);
   await p.waitForFunction(()=>{const root=document.querySelector('.cinematic'),journey=document.querySelector('#journey');const actual=(scrollY-root.offsetTop)/(journey.offsetHeight-innerHeight);return Math.abs(window.__agriscope.snapshot().p-actual)<.000001;});
   const paused=await state(p);await p.waitForTimeout(200);const still=await state(p);
   assert.equal(still.p,paused.p,'Paused descent settles without time drift');
   assert.ok(await p.locator('#title').isVisible(),'Thai narrative stays visible through descent');
  }
  report.checks.push(`${viewport.width}: dense transition reverse state, eased input, pauses and direction change`);
  assert.equal(await p.locator('#rail button:visible').count(),labRoute?10:mobile?5:10);
  // Exercise ordinary animated scrolling independently of exact checkpoint capture.
  await checkpoint(p,0);await p.locator('#begin').click();await settled(p,.86);
  assert.ok(new URL(p.url()).hash==='#field');assert.equal(await p.locator('#inspect-field').evaluate(el=>el===document.activeElement),true);
  const panel=await p.locator('#field-panel').boundingBox();assert.ok(panel.y>=100&&panel.x>=0&&panel.x+panel.width<=viewport.width);assert.ok(panel.y+panel.height<=viewport.height-50);
  await p.locator('#inspect-field').click();assert.equal(await p.locator('#sample-status').textContent(),'ข้อมูลยังไม่พอ');
  assert.equal(await p.locator('#before-value').textContent(),'—');assert.equal(await p.locator('#after-value').textContent(),'—');
  assert.equal((await state(p)).evidence.delta,null);assert.equal((await state(p)).evidence.commonSupport,0);
  assert.doesNotMatch(await p.locator('#title').textContent(),/ควรตรวจแปลงต่อ|ลดลง/);assert.match(await p.locator('#title').textContent(),/ข้อมูลยังไม่พอ/);
  assert.doesNotMatch(await p.locator('#description').textContent(),/ควรตรวจ|ลดลง/);
  assert.doesNotMatch(await p.locator('#sample-explanation').textContent(),/ควรตรวจ|ลดลง/);
  assert.equal(await p.locator('.map-legend').isVisible(),false);
  await save(p,`${viewport.width}x${viewport.height}-insufficient-data`);
  await checkpoint(p,.76);assert.equal((await state(p)).evidence.status,'NOT_ASSESSABLE');assert.equal(await p.locator('.map-legend').isVisible(),false);assert.match(await p.locator('#title').textContent(),/ยังเปรียบเทียบไม่ได้/);
  const resized=mobile?{width:390,height:844}:{width:1276,height:800};await p.setViewportSize(resized);await checkpoint(p,.86);
  assert.equal((await state(p)).evidence.status,'NOT_ASSESSABLE');assert.match(await p.locator('#title').textContent(),/ข้อมูลยังไม่พอ/);assert.doesNotMatch(await p.locator('#description').textContent(),/ควรตรวจ|ลดลง/);
  await p.setViewportSize(viewport);await checkpoint(p,.86);await p.locator('#inspect-field').click();assert.equal((await state(p)).evidence.delta,-.26);assert.match(await p.locator('#title').textContent(),/ผลนี้ควรตรวจแปลงต่อ/);
  await p.locator('#rail button').first().click();await settled(p,0);
  await p.locator('#rail button').nth(3).click();await settled(p,.36);
  const geo=await p.locator('#geo').boundingBox();assert.ok(geo.x>=0&&geo.x+geo.width<=viewport.width&&geo.y>=100);
  await p.locator('#motion').click();await staticReady(p);await p.locator('#resume').click();await ready(p);assert.equal(await p.locator('#rail button').count(),10);
  await checkpoint(p,.76);await p.setViewportSize({width:viewport.height,height:viewport.width});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok((await state(p)).camera.every(Number.isFinite));
  await p.setViewportSize(viewport);await checkpoint(p,labRoute?.95:.76);
  if(!labRoute)await p.locator('#how-it-works').scrollIntoViewIfNeeded();
  await save(p,`${viewport.width}x${viewport.height}-product-handoff`);
  assert.equal(await p.locator('#features').count(),0);assert.equal(await p.locator('#farm-insight').count(),0);
  report.viewports.push({viewport,captures,checks:['10 exact forward and reverse scroll checkpoints','Animated sample shortcut and reverse chapter navigation',labRoute?'10 chapter controls at every viewport':'5 mobile phases / 10 desktop shots','Shared-field dated comparison and truthful missing-data state','Motion stop/resume; resize','Concise home sections, no repeated field sample']});
  console.log(`PASS ${viewport.width}×${viewport.height}: 10 shots + reverse + controls`);await ctx.close();
 }
 const reduced=await browser.newContext({viewport:viewports[2],reducedMotion:'reduce'});contexts.push(reduced);let p=await reduced.newPage();monitor(p);
 const reducedNativeRequests=[];
 p.on('request',request=>{if(new URL(request.url()).pathname.includes('/cinematic/models/native-descent/'))reducedNativeRequests.push(request.url());});
 await p.goto(`${url}?qa=1`);await staticReady(p);
 assert.equal(await p.locator('.cinematic canvas').count(),0);assert.equal(await p.locator('#motion').getAttribute('aria-pressed'),'true');
 assert.deepEqual(reducedNativeRequests,[],'Reduced motion entry requests no native models or environment');
 await save(p,'reduced-motion');await p.keyboard.press('Tab');assert.equal(await p.locator('.cinematic .skip').evaluate(el=>el===document.activeElement),true);
 await p.locator('#resume').click();await ready(p);await p.locator('#motion').click();await staticReady(p);
 report.checks.push('OS reduced motion: no initial GPU, readable sample and keyboard skip, explicit 3D opt-in/resume');await reduced.close();
 const nojs=await browser.newContext({viewport:viewports[2],javaScriptEnabled:false});contexts.push(nojs);p=await nojs.newPage();await p.goto(url);
 assert.ok(await p.locator('#fallback').isVisible());assert.equal(await p.locator('.cinematic canvas').count(),0);assert.equal(await p.locator('#motion').isVisible(),false);
 assert.equal(await p.locator('#fallback .text-link').getAttribute('href'),'/login?mode=register');await save(p,'no-javascript');report.checks.push('No JavaScript: SSR fallback preserves field dates, values and registration CTA');await nojs.close();
 const nativeFailures=new Map([
  ...NATIVE_ASSET_MANIFEST.map(asset=>[`native-${asset.id}`,`**${asset.url}`]),
  ...nativeModules.map(file=>[file,`**/cinematic/${file}`]),
 ]);
 const failures=['webgl','texture','regional-map','surface-map','mesh','module',...(labRoute?[...nativeFailures.keys(),'native-identity']:[])];
 for(const failure of failures){
  const ctx=await browser.newContext({viewport:viewports[2]});contexts.push(ctx);p=await ctx.newPage();monitor(p,false);let intercepted=0;
  const failureErrors=[];
  p.on('console',message=>{if(message.type()==='error')failureErrors.push(message.text());});
  if(failure==='webgl')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;window.__blockedWebgl=0;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl')){window.__blockedWebgl++;return null;}return original.call(this,type,...args);};});
  if(failure==='texture')await p.route('**/cinematic/textures/earth-day.jpg',r=>{intercepted++;return r.abort();});
  if(failure==='regional-map')await p.route('**/cinematic/textures/regional-landscape.png',r=>{intercepted++;return r.fulfill({status:404,body:'Unavailable'});});
  if(failure==='surface-map')await p.route('**/cinematic/textures/surfaces/metal-normal.png',r=>{intercepted++;return r.fulfill({status:404,body:'Unavailable'});});
  if(failure==='mesh')await p.route('**/cinematic/models/spacecraft.mesh.json',r=>{intercepted++;return r.fulfill({status:404,body:'Unavailable'});});
  if(nativeFailures.has(failure))await p.route(nativeFailures.get(failure),r=>{intercepted++;return r.abort();});
  if(failure==='native-identity')await p.route('**/cinematic/models/native-descent/orbit.glb',async route=>{
   const response=await route.fetch();assert.ok(response.ok());
   const original=await response.body(),corrupted=Buffer.from(original);corrupted[corrupted.length-1]^=1;
   assert.equal(corrupted.length,original.length);assert.equal(corrupted.equals(original),false);intercepted++;
   await route.fulfill({response,body:corrupted});
  });
  if(failure==='module')await p.route(labRoute?'**/cinematic/lab-main.js':'**/cinematic/main.js',r=>{intercepted++;return r.abort();});
  await p.goto(`${url}?qa=1`);
  if(failure==='module'||nativeModules.includes(failure)){
   await p.waitForFunction(()=>document.querySelector('#fallback-reason')?.textContent.startsWith('โหลดประสบการณ์ 3D ไม่สำเร็จ'),null,{timeout:30000});assert.equal(intercepted,1);
  }else{await staticReady(p);if(failure==='webgl')assert.ok(await p.evaluate(()=>window.__blockedWebgl>0));else assert.equal(intercepted,1);}
  if(failure==='native-identity')assert.match(failureErrors.join('\n'),/orbit identity mismatch/,'Same-length native corruption fails digest identity verification');
  assert.ok(await p.locator('#fallback').isVisible());assert.equal(await p.locator('#loading').isVisible(),false);assert.equal(await p.locator('#resume').isVisible(),false);
  await save(p,`fallback-${failure}`);report.checks.push(`${failure} failure: confirmed interception, readable fallback, useful entry CTA and no loading/dead controls`);await ctx.close();
 }
 const ctx=await browser.newContext({viewport:viewports[0]});contexts.push(ctx);p=await ctx.newPage();monitor(p);await p.goto(`${url}?qa=1`);await ready(p);
 await p.evaluate(()=>document.querySelector('.cinematic canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await staticReady(p);
 report.checks.push('Context loss returns to readable static content');await p.goto(`${url}?qa=1`);await ready(p);
 if(labRoute){await checkpoint(p,.95);await p.locator('.field-handoff').click();}
 else{await p.locator('#how-it-works').scrollIntoViewIfNeeded();await p.getByRole('link',{name:'เริ่มติดตามแปลงของคุณ',exact:true}).click();}
 await p.waitForURL('**/login?mode=register');
 assert.equal(await p.evaluate(()=>!!window.__agriscope),false);assert.equal(await p.locator('.cinematic canvas').count(),0);
 await p.goBack();await ready(p);assert.equal(await p.locator('#rail button').count(),10);
 report.checks.push('Next.js navigation disposes the scene; back mounts exactly one canvas and rail');await ctx.close();
 assert.deepEqual(report.errors,[],'No normal runtime/shader errors');report.status='PASS';console.log(`PASS ${report.checks.length} fallback/lifecycle checks`);
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);}finally{await writeFile(resolve(evidence,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
