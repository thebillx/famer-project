import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const url=process.env.CINEMATIC_URL||'http://127.0.0.1:5180/';
const evidence=process.env.CINEMATIC_EVIDENCE;
if(!evidence)throw new Error('Set CINEMATIC_EVIDENCE to an evidence directory outside the repository.');
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.CINEMATIC_HEADED!=='1'});
const report={url,browser:browser.version(),viewports:[],checks:[],errors:[],warnings:[],limitations:['Mobile viewport/touch emulation; no physical-device testing','No production API or satellite acquisitions exercised','Illustrative terrain/metrics from supplied prototype']};
const fallbackOnly=process.argv.includes('--fallback-only');
const runtimeFailure='อุปกรณ์นี้แสดงภาพ 3D ไม่ได้ คุณยังอ่านขั้นตอนติดตามแปลงด้านล่างได้';
const moduleFailure='โหลดประสบการณ์ 3D ไม่สำเร็จ คุณยังอ่านขั้นตอนติดตามแปลงด้านล่างได้';
const reducedReason='แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ';
async function staticReady(p,reason){
 await p.waitForFunction(reason=>{const s=window.__agriscope?.snapshot();return s?.ready&&s.mode==='static'&&s.reason===reason;},reason,{timeout:30000});
 assert.equal(await p.locator('#fallback-reason').textContent(),reason);
 assert.ok(await p.locator('#fallback').isVisible());
 assert.ok(!await p.locator('#loading').isVisible());
 assert.equal(await p.locator('.cinematic').evaluate(el=>el.classList.contains('preparing')),false);
 assert.equal(await p.locator('#rail').evaluate(el=>el.inert),true);
 for(const canvas of await p.locator('.cinematic canvas').all())assert.equal(await canvas.isVisible(),false);
}
const points=[0,.10,.22,.34,.46,.57,.65,.75,.86,.95];
const viewports=[{width:1440,height:900},{width:1276,height:1285},{width:390,height:844},{width:375,height:667}];
const contexts=[];
function monitor(p,normal=true){p.on('pageerror',e=>{if(normal)report.errors.push(e.message)});p.on('console',m=>{if(normal&&m.type()==='error'&&!m.text().includes('favicon.ico'))report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text())});}
async function ready(p){await p.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='webgl',{timeout:30000});const s=await state(p);assert.equal(s.mode,'webgl');assert.equal(s.webgl,true);assert.equal(await p.locator('.cinematic canvas').count(),1);}
async function state(p){return p.evaluate(()=>window.__agriscope.snapshot());}
async function checkpoint(p,progress){
 const actual=await p.evaluate(progress=>{const root=document.querySelector('.cinematic'),section=root.querySelector('#journey'),range=section.offsetHeight-innerHeight;scrollTo(0,root.offsetTop+progress*range);return (scrollY-root.offsetTop)/range;},progress);
 await p.waitForFunction(actual=>Math.abs(window.__agriscope.snapshot().p-actual)<.000002,actual,{timeout:15000});return state(p);
}
const save=(p,name)=>p.screenshot({path:resolve(evidence,`${name}.png`)});
try{
 if(!fallbackOnly)for(const viewport of viewports){
  const mobile=viewport.width<760,ctx=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});contexts.push(ctx);const p=await ctx.newPage();monitor(p);await p.goto(`${url}?qa=1`);await ready(p);
  const captures=[];
  for(let i=0;i<points.length;i++){
   const s=await checkpoint(p,points[i]);assert.equal(s.shot,i+1);assert.ok(s.drawCalls>5&&s.triangles>1000);assert.ok(s.camera.every(Number.isFinite));assert.equal(await p.locator('#fallback').isVisible(),false);if(points[i]<.89)assert.equal(await p.locator('#field-panel').isVisible(),false,'Sample panel stays hidden until handoff');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   await save(p,`${viewport.width}x${viewport.height}-shot-${String(i+1).padStart(2,'0')}`);captures.push(s);
  }
  for(let i=9;i>=0;i--){const s=await checkpoint(p,points[i]),a=captures[i];for(const key of ['camera','look','attitude','beamPosition','beamAttitude'])s[key].forEach((v,k)=>assert.ok(Math.abs(v-a[key][k])<.002));for(const key of ['terrain','beam','shot'])assert.equal(s[key],a[key]);for(const key of ['cloudOpacity','cloudRotation','earthOpacity','atmosphere','terrainOpacity','beamOpacity','fog','fieldOpacity'])assert.ok(Math.abs(s[key]-a[key])<.0001);}
  const left=await checkpoint(p,.54999),right=await checkpoint(p,.55001);assert.ok(Math.hypot(...right.camera.map((v,k)=>v-left.camera[k]))<.1,'No .55 camera jump');
  await checkpoint(p,0);await p.locator('#begin').click();await p.waitForFunction(()=>Math.abs(window.__agriscope.snapshot().p-.22)<.0002);assert.ok(new URL(p.url()).hash==='#mission');
  await p.locator('#rail button').nth(5).click();await p.waitForFunction(()=>Math.abs(window.__agriscope.snapshot().p-.57)<.0002);
  const geo=await p.locator('#geo').boundingBox();assert.ok(geo.x>=0&&geo.x+geo.width<=viewport.width,'Coordinates stay in viewport');
  await p.locator('#rail button').nth(9).click();await p.waitForFunction(()=>Math.abs(window.__agriscope.snapshot().p-.95)<.0002);
  const panel=await p.locator('#field-panel').boundingBox();assert.ok(panel.y>=86&&panel.x>=0&&panel.x+panel.width<=viewport.width);assert.ok(panel.y+panel.height<=viewport.height-50,'Panel fits');
  await p.locator('#inspect-field').click();assert.equal(await p.locator('#inspect-field').getAttribute('aria-expanded'),'true');assert.ok(await p.locator('#trend').isVisible());await save(p,`${viewport.width}x${viewport.height}-sample-expanded`);await p.locator('#inspect-field').click();assert.equal(await p.locator('#inspect-field').getAttribute('aria-expanded'),'false');
  await p.locator('#motion').click();assert.ok(await p.locator('#fallback').isVisible());assert.equal(await p.locator('#motion').getAttribute('aria-pressed'),'true');await p.locator('#resume').click();await ready(p);assert.equal(await p.locator('#rail button').count(),10);
  report.viewports.push({viewport,captures,checks:['10 forward + 10 reverse checkpoints','.55 continuity','Beginning button','Chapter navigation','Coordinate/panel bounds','Expand/collapse sample trend','Motion stop/resume']});
  console.log(`PASS ${viewport.width}×${viewport.height}: 10 shots, reverse visits and controls`);
  // Product sections must not be covered by sticky scene chrome.
  await p.locator('#how-it-works').scrollIntoViewIfNeeded();assert.ok(await p.locator('#how-it-works').isVisible());await save(p,`${viewport.width}x${viewport.height}-product-handoff`);
  await ctx.close();
 }
 const reduced=await browser.newContext({viewport:viewports[2],reducedMotion:'reduce'});contexts.push(reduced);let p=await reduced.newPage();monitor(p);await p.goto(`${url}?qa=1`);await staticReady(p,reducedReason);assert.equal(await p.locator('.cinematic canvas').count(),0);assert.ok(await p.locator('#motion').isVisible());assert.equal(await p.locator('#motion').getAttribute('aria-pressed'),'true');assert.ok(await p.locator('#resume').isVisible());await save(p,'reduced-motion');await p.keyboard.press('Tab');assert.ok(await p.locator('.cinematic .skip').evaluate(el=>el===document.activeElement));
 await p.locator('#motion').click();await ready(p);assert.equal(await p.locator('#motion').getAttribute('aria-pressed'),'false');await p.locator('#motion').click();await staticReady(p,'เปิดโหมดลดการเคลื่อนไหว แสดงขั้นตอนติดตามแปลงแทนการเดินทาง 3D');await p.locator('#resume').click();await ready(p);report.checks.push('OS reduced motion: mounted terminal state, no initial GPU creation, Thai fallback, keyboard skip, functional motion/resume controls');await reduced.close();
 const nojs=await browser.newContext({viewport:viewports[2],javaScriptEnabled:false});contexts.push(nojs);p=await nojs.newPage();await p.goto(url);assert.ok(await p.locator('#fallback').isVisible());assert.ok(await p.locator('#fallback .fallback-steps').isVisible());assert.equal(await p.locator('#fallback a').getAttribute('href'),'/login');assert.equal(await p.locator('#motion').isVisible(),false);assert.equal(await p.locator('#resume').isVisible(),false);assert.equal(await p.locator('.cinematic canvas').count(),0);assert.equal(await p.locator('#loading').isVisible(),false);await save(p,'no-javascript');report.checks.push('No JavaScript: readable SSR fallback, login handoff, no dead enhancement controls');await nojs.close();
 for(const failure of ['webgl','texture','module']){
  const ctx=await browser.newContext({viewport:viewports[2]});contexts.push(ctx);p=await ctx.newPage();monitor(p,false);let intercepted=0;
  if(failure==='webgl')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;window.__blockedWebgl=0;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl')){window.__blockedWebgl++;return null;}return original.call(this,type,...args)};});
  if(failure==='texture')await p.route('**/cinematic/textures/earth-day.jpg',r=>{intercepted++;return r.abort()});
  if(failure==='module')await p.route('**/cinematic/main.js',r=>{intercepted++;return r.abort()});
  await p.goto(`${url}?qa=1`);
  if(failure==='module'){
   await p.waitForFunction(reason=>document.querySelector('#fallback-reason')?.textContent===reason,moduleFailure,{timeout:30000});assert.equal(intercepted,1);assert.equal(await p.evaluate(()=>!!window.__agriscope),false);assert.equal(await p.locator('.cinematic canvas').count(),0);
  }else{
   await staticReady(p,runtimeFailure);
   if(failure==='texture'){assert.equal(intercepted,1);assert.equal(await p.locator('.cinematic canvas').count(),1);}
   else{assert.ok(await p.evaluate(()=>window.__blockedWebgl>0));assert.equal(await p.locator('.cinematic canvas').count(),0);}
  }
  assert.ok(await p.locator('#fallback').isVisible());assert.ok(await p.locator('#fallback .fallback-steps').isVisible());assert.equal(await p.locator('#loading').isVisible(),false);assert.equal(await p.locator('.cinematic').evaluate(el=>el.classList.contains('preparing')),false);assert.equal(await p.locator('#motion').isVisible(),false);assert.equal(await p.locator('#resume').isVisible(),false);await save(p,`fallback-${failure}`);report.checks.push(`${failure} failure: confirmed interception/blocked context and exact post-hydration failure reason, readable fallback, no loading/dead controls`);await ctx.close();
 }
 if(!fallbackOnly){
 const ctx=await browser.newContext({viewport:viewports[0]});contexts.push(ctx);p=await ctx.newPage();monitor(p);await p.goto(`${url}?qa=1`);await ready(p);
 await p.evaluate(()=>document.querySelector('.cinematic canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));assert.ok(await p.locator('#fallback').isVisible());report.checks.push('Context loss switches to fallback');
 await p.goto(`${url}?qa=1`);await ready(p);
 // App-router navigation uses an existing Next.js Link rather than a document reload.
 await p.locator('#how-it-works').scrollIntoViewIfNeeded();await p.getByRole('link',{name:'สร้างบัญชีหรือเข้าสู่ระบบ',exact:true}).click();await p.waitForURL('**/login');assert.equal(await p.evaluate(()=>!!window.__agriscope),false);assert.equal(await p.locator('.cinematic canvas').count(),0);assert.equal(await p.locator('body').getAttribute('class'),null);
 await p.goBack();await ready(p);assert.equal(await p.locator('.cinematic canvas').count(),1);assert.equal(await p.locator('#rail button').count(),10);report.checks.push('Next.js client navigation disposes scene; back navigation mounts exactly one canvas/rail');await ctx.close();
 }
 assert.deepEqual(report.errors,[],'Normal journeys have no runtime/shader errors');report.status='PASS';console.log(`PASS ${report.checks.length} fallback/lifecycle checks${fallbackOnly?' (focused fallback run)':''}`);
}catch(e){report.status='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;}finally{await writeFile(resolve(evidence,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
