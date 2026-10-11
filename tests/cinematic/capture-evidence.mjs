import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const output=process.env.CINEMATIC_EVIDENCE;
if(!output)throw new Error('Set CINEMATIC_EVIDENCE to a directory for the review artifact.');
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const headSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const expectedHead=process.env.CINEMATIC_EXPECTED_HEAD;
const baseSha=process.env.CINEMATIC_BASE_SHA;
if(expectedHead)assert.equal(headSha,expectedHead,'Evidence must describe the exact PR head checkout.');
const url=process.env.CINEMATIC_URL||'http://127.0.0.1:5184/';
const softwareWebGL=process.env.CINEMATIC_SOFTWARE_WEBGL==='1';
const viewports=[
  {name:'desktop',width:1440,height:900,mobile:false},
  {name:'small-mobile',width:375,height:667,mobile:true},
];
const report={status:'RUNNING',url,checkedOutSha:headSha,browser:null,softwareWebGL,viewports:[],errors:[],warnings:[],failedRequests:[],limitations:[
  'Headless Chromium uses the renderer recorded below; CI WebGL is configured for SwiftShader software rendering.',
  'Small-mobile capture uses 375×667 viewport/touch emulation, not a physical device.',
  'The public journey uses synthetic offline examples; no satellite API or private farm data is accessed.',
]};
const videoPath=join(output,'motion','agriscope-forward-reverse.webm');
const rawVideoDir=join(output,'motion','.raw-capture');
let browser;
let motionContext;
let hashes=[];
let actualMotionDurationSeconds=null;

function gitPaths(){
  if(baseSha)return execFileSync('git',['diff','--name-only','--no-renames',`${baseSha}...${headSha}`],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  return execFileSync('git',['status','--porcelain','-uall','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).map(x=>x.slice(3));
}

async function sha256(path){
  const {createHash}=await import('node:crypto');
  const bytes=await readFile(join(root,path));
  return {path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}

function monitor(page){
  page.on('pageerror',error=>report.errors.push({type:'pageerror',message:error.message}));
  page.on('console',message=>{
    // Failed-resource console messages omit their URL; HTTP failures are captured with URLs below.
    if(message.type()==='error'&&!message.text().includes('favicon.ico')&&!message.text().startsWith('Failed to load resource:'))report.errors.push({type:'console',message:message.text()});
    if(message.type()==='warning')report.warnings.push(message.text());
  });
  page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText||'request failed'}));
  page.on('response',response=>{
    if(response.status()>=400&&!response.url().includes('favicon.ico'))report.failedRequests.push({url:response.url(),status:response.status()});
  });
}

async function ready(page){
  await page.goto(`${url}?qa=1`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='webgl',null,{timeout:60000});
  assert.equal(await page.locator('.cinematic canvas').count(),1);
}

async function seek(page,progress){
  await page.evaluate(value=>window.__agriscope.seekCheckpoint(value),progress);
  await page.waitForFunction(value=>Math.abs(window.__agriscope.snapshot().p-value)<.0003,progress,{timeout:30000});
  return page.evaluate(()=>window.__agriscope.snapshot());
}

function contactSheetHtml(title,images){
  const cells=images.map(({label,data})=>`<article><strong>${label}</strong><img src="data:image/png;base64,${data}" /></article>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#08111a;color:#e8ede8;font:15px system-ui}h1{margin:0 0 16px;color:#e4bd82;font-size:21px;letter-spacing:.08em}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}article{padding:9px;background:#101c26;border:1px solid #33424c}strong{display:block;margin:0 0 8px}img{display:block;width:100%;height:auto}</style><h1>${title}</h1><main class="grid">${cells}</main>`;
}

async function makeContactSheet(page,name,shots){
  const images=[];
  for(const shot of shots){
    const data=(await readFile(shot.path)).toString('base64');
    images.push({label:`SHOT ${String(shot.number).padStart(2,'0')} · ${shot.name}`,data});
  }
  await page.setViewportSize(name==='desktop'?{width:1440,height:900}:{width:900,height:850});
  await page.setContent(contactSheetHtml(`${name.toUpperCase()} · AGRISCOPE TEN SHOTS`,images));
  await page.waitForFunction(()=>[...document.images].length===10&&[...document.images].every(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:join(output,name,'contact-sheet.png'),fullPage:true,timeout:60000});
}

async function animateToProgress(page,progress,durationMs){
  await page.evaluate(({progress,durationMs})=>{
    const max=Math.max(1,document.querySelector('#journey').offsetHeight-innerHeight);
    const start=scrollY,target=max*progress,started=performance.now();
    return new Promise(resolve=>{
      const frame=now=>{
        const t=Math.min(1,(now-started)/durationMs);
        const eased=t<.5?2*t*t:1-((-2*t+2)**2)/2;
        window.scrollTo(0,start+(target-start)*eased);
        if(t<1)requestAnimationFrame(frame);else resolve();
      };
      requestAnimationFrame(frame);
    });
  },{progress,durationMs});
}

async function sourceHashes(){
  const paths=[...new Set(gitPaths())].sort();
  const hashes=[];
  for(const path of paths)hashes.push(await sha256(path));
  return hashes;
}

try{
  await mkdir(output,{recursive:true});
  for(const viewport of viewports)await mkdir(join(output,viewport.name),{recursive:true});
  await mkdir(join(output,'motion'),{recursive:true});
  hashes=await sourceHashes();
  const launchOptions={headless:true};
  if(!process.env.CI&&!process.env.CINEMATIC_CHROMIUM)launchOptions.channel='chrome';
  if(process.env.CINEMATIC_CHROMIUM)launchOptions.executablePath=process.env.CINEMATIC_CHROMIUM;
  if(softwareWebGL)launchOptions.args=['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  browser=await chromium.launch(launchOptions);
  report.browser=browser.version();
  const shotNames=['Earth / value','Spacecraft','Payload','Thailand','Descent','Field boundary','Dates / quality','NDVI comparison','Inspection summary','Application handoff'];
  const captures=[];
  for(const viewport of viewports){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,isMobile:viewport.mobile,hasTouch:viewport.mobile});
    const page=await context.newPage();monitor(page);await ready(page);
    const points=await page.evaluate(()=>window.__agriscope.SHOTS.map(shot=>shot.p));
    assert.equal(points.length,10,'The journey must expose ten shots.');
    const shots=[];
    for(let index=0;index<points.length;index++){
      const snapshot=await seek(page,points[index]);
      assert.equal(snapshot.shot,index+1);
      assert.equal(snapshot.mode,'webgl');
      assert.ok(snapshot.camera.every(Number.isFinite));
      assert.ok(snapshot.drawCalls>0&&snapshot.triangles>0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow.');
      const path=join(output,viewport.name,`shot-${String(index+1).padStart(2,'0')}.png`);
      await page.screenshot({path,timeout:60000});
      shots.push({number:index+1,name:shotNames[index],path});
      captures.push({shot:index+1,progress:snapshot.p,renderer:{mode:snapshot.mode,gpu:snapshot.gpu||null,drawCalls:snapshot.drawCalls,triangles:snapshot.triangles,softwareWebGL},assets:{model:snapshot.model,land:snapshot.land}});
    }
    await makeContactSheet(page,viewport.name,shots);
    report.viewports.push({name:viewport.name,width:viewport.width,height:viewport.height,mobileEmulation:viewport.mobile,shots:10});
    await context.close();
  }

  await mkdir(rawVideoDir,{recursive:true});
  const recordingStartedAt=Date.now();
  motionContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:rawVideoDir,size:{width:1440,height:900}}});
  const motionPage=await motionContext.newPage();monitor(motionPage);await ready(motionPage);
  await motionPage.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await motionPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const points=await motionPage.evaluate(()=>window.__agriscope.SHOTS.map(shot=>shot.p));
  const sequence=[
    {to:points[4],move:3500,hold:2000},
    {to:points[5],move:2000,hold:2000},
    {to:points[7],move:3000,hold:2000},
    {to:points[8],move:2000,hold:1500},
    {to:points[9],move:2500,hold:2000},
    {to:points[5],move:3500,hold:2000},
    {to:0,move:3000,hold:1000},
  ];
  const motionStartedAt=Date.now();
  for(const stage of sequence){await animateToProgress(motionPage,stage.to,stage.move);await motionPage.waitForTimeout(stage.hold);}
  const motionEndedAt=Date.now();
  const motionVideo=motionPage.video();
  await motionContext.close();motionContext=undefined;
  const rawVideoPath=await motionVideo.path();
  const trimStartSeconds=(motionStartedAt-recordingStartedAt)/1000;
  const requestedDurationSeconds=(motionEndedAt-motionStartedAt)/1000;
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(trimStartSeconds),'-i',rawVideoPath,'-t',String(requestedDurationSeconds),'-an','-c:v','libvpx-vp9','-crf','32','-b:v','0',videoPath],{stdio:'pipe'});
  actualMotionDurationSeconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',videoPath],{encoding:'utf8'}).trim());
  assert.ok(Number.isFinite(actualMotionDurationSeconds),'ffprobe must return the final recording duration.');
  assert.ok(actualMotionDurationSeconds>=30&&actualMotionDurationSeconds<=45,`Motion recording must be 30–45 seconds; received ${actualMotionDurationSeconds.toFixed(2)} seconds.`);
  await rm(rawVideoDir,{recursive:true,force:true});
  report.motion={path:'motion/agriscope-forward-reverse.webm',durationSeconds:actualMotionDurationSeconds,sequence:'Slow forward descent; pauses at descent, boundary, NDVI, summary and handoff; reverse to boundary then orbit.'};
  report.rendererSamples=captures;
  report.status=report.errors.length===0&&report.failedRequests.length===0?'PASS':'FAIL';
  if(report.status==='FAIL')process.exitCode=1;
}catch(error){
  report.status='FAIL';report.failure=error.stack||String(error);process.exitCode=1;
}finally{
  if(motionContext)await motionContext.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  await rm(rawVideoDir,{recursive:true,force:true}).catch(()=>{});
  await mkdir(output,{recursive:true});
  const checkedOutSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(hashes.length===0)hashes=await sourceHashes().catch(error=>[{error:String(error)}]);
  const softwareReported=report.rendererSamples?.some(sample=>/swiftshader|software|llvmpipe/i.test(sample.renderer.gpu||''))??softwareWebGL;
  const reviewInfo={
    checkedOutSha,
    baseSha:baseSha||null,
    sourceAndAssetHashes:hashes,
    viewportSizes:viewports.map(({name,width,height,mobile})=>({name,width,height,mobileEmulation:mobile})),
    motionDurationSeconds:actualMotionDurationSeconds,
    captureMethod:{screenshots:'Playwright Chromium screenshots at the ten existing seekCheckpoint shot positions; contact sheets composed from those PNGs in Chromium.',motion:`Playwright Chromium recording trimmed to the requestAnimationFrame-driven forward/reverse journey; ffprobe measured ${actualMotionDurationSeconds??'unavailable'} seconds after trimming and setup removal.`},
    renderingLimitations:[`Renderer mode: ${softwareReported?'software WebGL / SwiftShader':'see renderer metadata; hardware acceleration was not benchmarked'}.`,'Small-mobile dimensions are browser viewport/touch emulation, not a physical device.','Journey values are synthetic public examples; no private data or live satellite service is used.'],
  };
  await writeFile(join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(output,'review-info.json'),JSON.stringify(reviewInfo,null,2)+'\n');
}

if(report.status==='PASS')console.log(`PASS: ten-shot desktop/mobile evidence at ${output}`);
else console.error(`FAIL: cinematic evidence capture; inspect ${join(output,'browser-report.json')}`);
