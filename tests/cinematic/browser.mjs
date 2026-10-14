import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const url=process.env.CINEMATIC_URL||'http://127.0.0.1:5180/';
const evidence=process.env.CINEMATIC_EVIDENCE;
if(!evidence)throw new Error('Set CINEMATIC_EVIDENCE to a directory outside the repository.');
await mkdir(evidence,{recursive:true});
const software=process.env.CINEMATIC_SOFTWARE_WEBGL==='1';
const browser=await chromium.launch({
 ...(process.env.CINEMATIC_CHROMIUM?{executablePath:process.env.CINEMATIC_CHROMIUM}:{channel:'chrome'}),
 headless:process.env.CINEMATIC_HEADED!=='1',
 args:software?['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[],
});
const viewports=[{width:1440,height:900},{width:1276,height:1285},{width:390,height:844},{width:375,height:667}];
const report={url,browser:browser.version(),softwareWebGL:software,viewports:[],checks:[],errors:[],warnings:[],limitations:['Mobile viewport/touch emulation; no physical-device testing','Public evidence reuses synthetic offline fixture values; no satellite API or private data','Checkpoint captures seek the exact document scroll position; animated user controls are checked separately']};
const contexts=[];
const state=p=>p.evaluate(()=>window.__agriscope.snapshot());
const save=(p,name)=>p.screenshot({path:resolve(evidence,`${name}.png`),timeout:120000});
function monitor(p,normal=true){
 p.on('pageerror',e=>{if(normal)report.errors.push(e.message);});
 p.on('console',m=>{if(normal&&m.type()==='error'&&!m.text().includes('favicon.ico'))report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
}
async function ready(p){
 await p.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='webgl',null,{timeout:60000});
 assert.equal(await p.locator('.cinematic canvas').count(),1);
 assert.equal((await state(p)).assets,6);
 assert.match((await state(p)).model.generator,/Blender 4\.5/);
}
async function checkpoint(p,progress){return p.evaluate(progress=>window.__agriscope.seekCheckpoint(progress),progress);}
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
  const p=await ctx.newPage();monitor(p);await p.goto(`${url}?qa=1`);await ready(p);
  const points=await p.evaluate(()=>window.__agriscope.SHOTS.map(s=>s.p)),captures=[];
  for(let i=0;i<points.length;i++){
   const s=await checkpoint(p,points[i]);assert.equal(s.shot,i+1);
   assert.ok(s.drawCalls>5&&s.drawCalls<=(s.p<.5?84:58),'Bounded visible draw calls');assert.ok(s.triangles>1000);assert.ok(s.camera.every(Number.isFinite));
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
     const x=clamp((point.x*.5+.5)*viewport.width+(index===2?-27:18),24,viewport.width-(index===2?230:210));
     const y=clamp((-point.y*.5+.5)*viewport.height+(index===2?-27:-24),110,viewport.height*(index===2?.48:.56));
     return Math.abs(parseFloat(element.style.left)-x)<.01&&Math.abs(parseFloat(element.style.top)-y)<.01;
    },{state:s,viewport,index:i});
    assert.ok(aligned,'Instrument/Thailand label projects with the current camera, not the previous frame');
   }
   await save(p,`${viewport.width}x${viewport.height}-shot-${String(i+1).padStart(2,'0')}`);captures.push(s);
  }
  for(let i=9;i>=0;i--){
   const s=await checkpoint(p,points[i]),a=captures[i];
   for(const key of ['camera','look','attitude','spacecraftPosition','beamPosition','beamAttitude'])s[key].forEach((v,k)=>assert.ok(Math.abs(v-a[key][k])<.0001,`Reverse ${key}`));
   for(const key of ['terrain','beam','shot'])assert.equal(s[key],a[key]);
   for(const key of ['localDetail','flatten','cloudOpacity','cloudRotation','atmosphere','beamOpacity','fog','fieldOpacity','evidenceOpacity'])assert.ok(Math.abs(s[key]-a[key])<.00001,`Reverse ${key}`);
   assert.deepEqual(s.evidence,a.evidence);
  }
  const transitionPoints=[.385,.397,.4049,.4051,.415,.425,.433,.445,.4549,.4551,.465,.475,.48];
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
  // Real eased input, pause, and a direction reversal inside the former pop.
  for(const progress of [.405,.435,.415]){
   await p.evaluate(progress=>{const root=document.querySelector('.cinematic'),journey=document.querySelector('#journey');window.scrollTo({top:root.offsetTop+progress*(journey.offsetHeight-innerHeight),behavior:'instant'});},progress);
   await settled(p,progress);
   await p.waitForFunction(()=>{const root=document.querySelector('.cinematic'),journey=document.querySelector('#journey');const actual=(scrollY-root.offsetTop)/(journey.offsetHeight-innerHeight);return Math.abs(window.__agriscope.snapshot().p-actual)<.000001;});
   const paused=await state(p);await p.waitForTimeout(200);const still=await state(p);
   assert.equal(still.p,paused.p,'Paused descent settles without time drift');
   assert.ok(await p.locator('#title').isVisible(),'Thai narrative stays visible through descent');
  }
  report.checks.push(`${viewport.width}: dense transition reverse state, eased input, pauses and direction change`);
  assert.equal(await p.locator('#rail button:visible').count(),mobile?5:10);
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
  await p.setViewportSize(viewport);await checkpoint(p,.76);
  await p.locator('#how-it-works').scrollIntoViewIfNeeded();await save(p,`${viewport.width}x${viewport.height}-product-handoff`);
  assert.equal(await p.locator('#features').count(),0);assert.equal(await p.locator('#farm-insight').count(),0);
  report.viewports.push({viewport,captures,checks:['10 exact forward and reverse scroll checkpoints','Animated sample shortcut and reverse chapter navigation','5 mobile phases / 10 desktop shots','Shared-field dated comparison and truthful missing-data state','Motion stop/resume; resize','Concise home sections, no repeated field sample']});
  console.log(`PASS ${viewport.width}×${viewport.height}: 10 shots + reverse + controls`);await ctx.close();
 }
 const reduced=await browser.newContext({viewport:viewports[2],reducedMotion:'reduce'});contexts.push(reduced);let p=await reduced.newPage();monitor(p);await p.goto(`${url}?qa=1`);await staticReady(p);
 assert.equal(await p.locator('.cinematic canvas').count(),0);assert.equal(await p.locator('#motion').getAttribute('aria-pressed'),'true');
 await save(p,'reduced-motion');await p.keyboard.press('Tab');assert.equal(await p.locator('.cinematic .skip').evaluate(el=>el===document.activeElement),true);
 await p.locator('#resume').click();await ready(p);await p.locator('#motion').click();await staticReady(p);
 report.checks.push('OS reduced motion: no initial GPU, readable sample and keyboard skip, explicit 3D opt-in/resume');await reduced.close();
 const nojs=await browser.newContext({viewport:viewports[2],javaScriptEnabled:false});contexts.push(nojs);p=await nojs.newPage();await p.goto(url);
 assert.ok(await p.locator('#fallback').isVisible());assert.equal(await p.locator('.cinematic canvas').count(),0);assert.equal(await p.locator('#motion').isVisible(),false);
 assert.equal(await p.locator('#fallback .text-link').getAttribute('href'),'/login?mode=register');await save(p,'no-javascript');report.checks.push('No JavaScript: SSR fallback preserves field dates, values and registration CTA');await nojs.close();
 for(const failure of ['webgl','texture','surface-map','mesh','module']){
  const ctx=await browser.newContext({viewport:viewports[2]});contexts.push(ctx);p=await ctx.newPage();monitor(p,false);let intercepted=0;
  if(failure==='webgl')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;window.__blockedWebgl=0;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl')){window.__blockedWebgl++;return null;}return original.call(this,type,...args);};});
  if(failure==='texture')await p.route('**/cinematic/textures/earth-day.jpg',r=>{intercepted++;return r.abort();});
  if(failure==='surface-map')await p.route('**/cinematic/textures/surfaces/metal-normal.png',r=>{intercepted++;return r.fulfill({status:404,body:'Unavailable'});});
  if(failure==='mesh')await p.route('**/cinematic/models/spacecraft.mesh.json',r=>{intercepted++;return r.fulfill({status:404,body:'Unavailable'});});
  if(failure==='module')await p.route('**/cinematic/main.js',r=>{intercepted++;return r.abort();});
  await p.goto(`${url}?qa=1`);
  if(failure==='module'){
   await p.waitForFunction(()=>document.querySelector('#fallback-reason')?.textContent.startsWith('โหลดประสบการณ์ 3D ไม่สำเร็จ'),null,{timeout:30000});assert.equal(intercepted,1);
  }else{await staticReady(p);if(failure==='webgl')assert.ok(await p.evaluate(()=>window.__blockedWebgl>0));else assert.equal(intercepted,1);}
  assert.ok(await p.locator('#fallback').isVisible());assert.equal(await p.locator('#loading').isVisible(),false);assert.equal(await p.locator('#resume').isVisible(),false);
  await save(p,`fallback-${failure}`);report.checks.push(`${failure} failure: confirmed interception, readable fallback, useful entry CTA and no loading/dead controls`);await ctx.close();
 }
 const ctx=await browser.newContext({viewport:viewports[0]});contexts.push(ctx);p=await ctx.newPage();monitor(p);await p.goto(`${url}?qa=1`);await ready(p);
 await p.evaluate(()=>document.querySelector('.cinematic canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await staticReady(p);
 report.checks.push('Context loss returns to readable static content');await p.goto(`${url}?qa=1`);await ready(p);
 await p.locator('#how-it-works').scrollIntoViewIfNeeded();await p.getByRole('link',{name:'เริ่มติดตามแปลงของคุณ',exact:true}).click();await p.waitForURL('**/login?mode=register');
 assert.equal(await p.evaluate(()=>!!window.__agriscope),false);assert.equal(await p.locator('.cinematic canvas').count(),0);
 await p.goBack();await ready(p);assert.equal(await p.locator('#rail button').count(),10);
 report.checks.push('Next.js navigation disposes the scene; back mounts exactly one canvas and rail');await ctx.close();
 assert.deepEqual(report.errors,[],'No normal runtime/shader errors');report.status='PASS';console.log(`PASS ${report.checks.length} fallback/lifecycle checks`);
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);}finally{await writeFile(resolve(evidence,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
