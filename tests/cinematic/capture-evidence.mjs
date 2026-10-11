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
const checkpointsOnly=process.env.CINEMATIC_CHECKPOINTS_ONLY==='1';
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
const endpointReferencePath=join(output,'motion','orbit-endpoint-browser.png');
const endpointEncodedFramePath=join(output,'motion','orbit-endpoint-encoded.png');
const startReferencePath=join(output,'motion','orbit-start-browser.png');
const startEncodedFramePath=join(output,'motion','orbit-start-encoded.png');
const rawVideoDir=join(output,'motion','.raw-capture');
let browser;
let motionContext;
let hashes=[];
let actualMotionDurationSeconds=null;
let rawMotionPtsWindow=null;
let endpointComparison=null;
let startComparison=null;

function probeVideo(path){
  return JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=start_time,duration','-of','json',path],{encoding:'utf8'})).format;
}

async function compareMotionFrame(page,referencePath,encodedPath,atEnd){
  const args=atEnd?['-sseof','-0.08','-i',videoPath]:['-i',videoPath];
  const frame=execFileSync('ffmpeg',['-hide_banner','-loglevel','error',...args,'-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1']);
  await writeFile(encodedPath,frame);
  const [reference,encoded]=await Promise.all([readFile(referencePath),readFile(encodedPath)]);
  await page.setContent(`<img id="reference" src="data:image/png;base64,${reference.toString('base64')}"><img id="encoded" src="data:image/png;base64,${encoded.toString('base64')}">`);
  const comparison=await page.evaluate(async()=>{
    const load=image=>image.complete&&image.naturalWidth>0?Promise.resolve():new Promise((resolve,reject)=>{image.onload=()=>resolve();image.onerror=reject;});
    const reference=document.querySelector('#reference'),encoded=document.querySelector('#encoded');
    await Promise.all([load(reference),load(encoded)]);
    if(reference.naturalWidth!==encoded.naturalWidth||reference.naturalHeight!==encoded.naturalHeight)throw new Error('Encoded endpoint dimensions differ from the browser endpoint.');
    const canvas=document.createElement('canvas');canvas.width=reference.naturalWidth;canvas.height=reference.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(reference,0,0);const a=context.getImageData(0,0,canvas.width,canvas.height).data;
    context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(encoded,0,0);const b=context.getImageData(0,0,canvas.width,canvas.height).data;
    let total=0,changed=0,channels=0;
    for(let i=0;i<a.length;i+=4){let pixel=0;for(let c=0;c<3;c++){const delta=Math.abs(a[i+c]-b[i+c]);pixel=Math.max(pixel,delta);total+=delta;channels++;}if(pixel>36)changed++;}
    return {width:canvas.width,height:canvas.height,meanAbsoluteChannelDifference:total/channels,pixelsOver36:changed/(canvas.width*canvas.height)};
  });
  assert.ok(comparison.meanAbsoluteChannelDifference<10,`Encoded ${atEnd?'final':'initial'} video frame does not match the browser orbit frame (mean pixel difference ${comparison.meanAbsoluteChannelDifference.toFixed(2)}).`);
  assert.ok(comparison.pixelsOver36<.12,`Encoded ${atEnd?'final':'initial'} video frame differs across too much of the frame (${(comparison.pixelsOver36*100).toFixed(1)}% pixels).`);
  return comparison;
}

function matchReferencePts(rawVideoPath,referencePath,{last=false}={}){
  // Playwright's WebM clock is independent from Date.now(). Locate the actual
  // browser endpoint on the recorded presentation timeline before trimming.
  // Compare the unobstructed Earth surface, not chapter copy or the center of
  // the artwork: the loading title can overlap both of those dark regions.
  const width=270,height=88,bytesPerFrame=width*height*3;
  const artworkFilter=`crop=1080:350:350:530,scale=${width}:${height}:flags=area,format=rgb24`;
  const reference=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',referencePath,'-vf',artworkFilter,'-frames:v','1','-f','rawvideo','pipe:1'],{maxBuffer:bytesPerFrame*2});
  const samples=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',rawVideoPath,'-vf',`fps=4,${artworkFilter}`,'-f','rawvideo','pipe:1'],{maxBuffer:1024*1024*64});
  assert.equal(reference.length,bytesPerFrame,'Browser endpoint reference decodes to one RGB sample.');
  assert.equal(samples.length%bytesPerFrame,0,'Raw motion samples align to full decoded RGB frames.');
  const frameCount=samples.length/bytesPerFrame,format=probeVideo(rawVideoPath),streamStart=Number(format.start_time||0),matches=[];
  const referenceMean=reference.reduce((sum,value)=>sum+value,0)/reference.length;
  for(let index=0;index<frameCount;index++){
    const offset=index*bytesPerFrame;
    let error=0,channels=0,sampleMean=0;
    // Include the moving artwork so the loading view cannot match just because
    // both it and the orbit chapter have a mostly-black background.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const referenceIndex=(y*width+x)*3,sampleIndex=offset+referenceIndex;
      for(let c=0;c<3;c++){const sample=samples[sampleIndex+c];error+=Math.abs(sample-reference[referenceIndex+c]);sampleMean+=sample;channels++;}
    }
    const mean=error/channels;
    sampleMean/=channels;
    if(mean<12&&sampleMean>=Math.max(referenceMean*.5,8))matches.push({index,pts:streamStart+index/4,artworkRegionMeanAbsoluteChannelDifference:mean,artworkRegionMeanChannelValue:sampleMean,sampleFps:4});
  }
  const match=last?matches.at(-1):matches[0];
  assert.ok(match,`Could not locate the ${last?'final':'initial'} browser endpoint in the raw WebM presentation timeline.`);
  let runStart=match.index,runEnd=match.index;
  while(matches.some(candidate=>candidate.index===runStart-1))runStart--;
  while(matches.some(candidate=>candidate.index===runEnd+1))runEnd++;
  return {...match,heldSeconds:(runEnd-runStart)/4,matchStartPts:streamStart+runStart/4,matchEndPts:streamStart+runEnd/4,threshold:12,minimumMeanChannelValue:Math.max(referenceMean*.5,8),matchedRegion:'unobstructed Earth surface'};
}

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
  page.on('requestfailed',request=>{
    const error=request.failure()?.errorText||'request failed';
    // Route changes and Next.js HMR intentionally cancel in-flight requests.
    if(error!=='net::ERR_ABORTED')report.failedRequests.push({url:request.url(),error});
  });
  page.on('response',response=>{
    if(response.status()>=400&&!response.url().includes('favicon.ico'))report.failedRequests.push({url:response.url(),status:response.status()});
  });
}

async function ready(page){
  await page.goto(`${url}?qa=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='webgl',null,{timeout:60000});
  assert.equal(await page.locator('.cinematic canvas').count(),1);
}

async function seek(page,progress){
  await page.evaluate(value=>window.__agriscope.seekCheckpoint(value),progress);
  await page.waitForFunction(value=>Math.abs(window.__agriscope.snapshot().p-value)<.0003,progress,{timeout:30000});
  return page.evaluate(()=>window.__agriscope.snapshot());
}

async function verifyMotionFallbacks(){
  const viewport={width:375,height:667};
  const reducedContext=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const reducedPage=await reducedContext.newPage();
  await reducedPage.emulateMedia({reducedMotion:'reduce'});
  await reducedPage.goto(`${url}?qa=1`,{waitUntil:'domcontentloaded'});
  await reducedPage.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='static',null,{timeout:60000});
  assert.ok(await reducedPage.locator('#fallback').isVisible(),'Reduced-motion users retain the readable fallback.');
  await reducedPage.locator('#resume').click();
  await reducedPage.waitForFunction(()=>window.__agriscope?.snapshot()?.mode==='webgl',null,{timeout:60000});
  await reducedContext.close();

  const failureContext=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await failureContext.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(typeof type==='string'&&type.toLowerCase().includes('webgl'))return null;
      return getContext.call(this,type,...args);
    };
  });
  const failurePage=await failureContext.newPage();
  await failurePage.goto(`${url}?qa=1`,{waitUntil:'domcontentloaded'});
  await failurePage.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='static'&&window.__agriscope.snapshot().reason&&document.querySelector('#fallback')&&!document.querySelector('#fallback').hidden,null,{timeout:60000});
  assert.match(await failurePage.locator('#fallback-reason').textContent(),/3D/,'A WebGL failure retains the readable text fallback.');
  await failureContext.close();
  return {reducedMotion:{fallbackVisible:true,resumeReturnsToWebGL:true},rendererFailure:{staticFallbackVisible:true}};
}

function contactSheetHtml(title,images){
  const cells=images.map(({label,data})=>`<article><strong>${label}</strong><img src="data:image/png;base64,${data}" /></article>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#08111a;color:#e8ede8;font:15px system-ui}h1{margin:0 0 16px;color:#e4bd82;font-size:21px;letter-spacing:.08em}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}article{padding:9px;background:#101c26;border:1px solid #33424c}strong{display:block;margin:0 0 8px}img{display:block;width:100%;height:auto}</style><h1>${title}</h1><main class="grid">${cells}</main>`;
}

async function makeContactSheet(page,name,shots){
  const originalViewport=page.viewportSize();
  const images=[];
  for(const shot of shots){
    const data=(await readFile(shot.path)).toString('base64');
    images.push({label:`SHOT ${String(shot.number).padStart(2,'0')} · ${shot.name}`,data});
  }
  await page.setViewportSize(name==='desktop'?{width:1440,height:900}:{width:900,height:850});
  await page.setContent(contactSheetHtml(`${name.toUpperCase()} · AGRISCOPE TEN SHOTS`,images));
  await page.waitForFunction(()=>[...document.images].length===10&&[...document.images].every(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:join(output,name,'contact-sheet.png'),fullPage:true,timeout:60000});
  if(originalViewport)await page.setViewportSize(originalViewport);
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
  let mobileInteractionReport=null;
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
      if(viewport.mobile&&index>=6&&!checkpointsOnly){
        assert.ok(await page.locator('#narrative.mobile-chapter').isVisible(),`Mobile chapter ${index+1} keeps its heading visible.`);
        const chapter=await page.evaluate(()=>({title:document.querySelector('#title').textContent,description:document.querySelector('#description').textContent,chapter:document.querySelector('#narrative').getBoundingClientRect().toJSON(),panel:document.querySelector('#evidence-panel').getBoundingClientRect().toJSON(),summary:document.querySelector('#field-panel').getBoundingClientRect().toJSON()}));
        assert.ok(chapter.title.trim()&&chapter.description.trim(),`Mobile chapter ${index+1} has concise explanatory copy.`);
        if(index===6||index===7)assert.ok(chapter.panel.top-chapter.chapter.bottom>18,'The chapter heading leaves a clear gap above the comparison panel.');
        if(index===8){
          assert.match(chapter.title,/ผลนี้ควรตรวจแปลงต่อ/);
          assert.match(chapter.description,/ไม่บอกสาเหตุ/);
          assert.ok(await page.locator('#inspect-field').isVisible(),'Insufficient-data example stays reachable from the summary.');
        }
        if(index===9){
          assert.ok(await page.locator('#chapter-cta').isVisible(),'The final mobile shot exposes its primary register CTA.');
          assert.equal(await page.locator('#chapter-cta').getAttribute('href'),'/login?mode=register');
          assert.ok(chapter.summary.height<=230,'The final mobile summary stays compact to preserve visible field area.');
        }
      }
      const path=join(output,viewport.name,`shot-${String(index+1).padStart(2,'0')}.png`);
      await page.screenshot({path,timeout:60000});
      shots.push({number:index+1,name:shotNames[index],path});
      captures.push({shot:index+1,progress:snapshot.p,renderer:{mode:snapshot.mode,gpu:snapshot.gpu||null,drawCalls:snapshot.drawCalls,triangles:snapshot.triangles,softwareWebGL},assets:{model:snapshot.model,land:snapshot.land}});
    }
    await makeContactSheet(page,viewport.name,shots);
    if(viewport.mobile){
      await ready(page);
      await seek(page,.86);
      assert.equal((await page.evaluate(()=>window.__agriscope.snapshot())).evidence.delta,-.26,'The valid example retains its synthetic change result.');
      await page.locator('#inspect-field').click();
      assert.equal(await page.locator('#sample-status').textContent(),'ข้อมูลยังไม่พอ');
      assert.equal(await page.locator('#before-value').textContent(),'—');
      assert.equal(await page.locator('#after-value').textContent(),'—');
      const insufficient=(await page.evaluate(()=>window.__agriscope.snapshot())).evidence;
      assert.equal(insufficient.delta,null,'Insufficient data has no change metric.');
      assert.equal(insufficient.status,'NOT_ASSESSABLE');
      assert.equal(insufficient.commonSupport,0);
      await page.screenshot({path:join(output,viewport.name,'insufficient-data.png'),timeout:60000});
      await page.locator('#inspect-field').click();
      assert.equal(await page.locator('#sample-status').textContent(),'ควรตรวจต่อ','The valid demonstration is restored after toggling back.');
      await page.locator('#rail button[aria-label^="ช่วง 7:"]').click();
      await page.waitForFunction(()=>Math.abs(window.__agriscope.snapshot().p-.65)<.003,null,{timeout:10000});
      assert.equal((await page.evaluate(()=>window.__agriscope.snapshot())).shot,7,'Mobile chapter navigation selects the date-quality chapter.');
      await seek(page,.95);
      let registrationCta='not checked in baseline';
      if(!checkpointsOnly){
        await page.locator('#chapter-cta').click();
        await page.waitForURL(/\/login\?mode=register/,{timeout:30000});
        assert.match(page.url(),/mode=register/,'The prominent final CTA opens registration mode.');
        registrationCta={href:'/login?mode=register',navigation:'PASS'};
      }
      mobileInteractionReport={insufficientData:{status:'NOT_ASSESSABLE',before:'—',after:'—',delta:null,validExampleRestored:true},chapterNavigation:{targetShot:7},registrationCta};
    }
    report.viewports.push({name:viewport.name,width:viewport.width,height:viewport.height,mobileEmulation:viewport.mobile,shots:10});
    await context.close();
  }

  const fallbackChecks=await verifyMotionFallbacks();

  if(checkpointsOnly){
    report.motionOmitted='Baseline checkpoints only; the complete motion recording is captured from the reviewed head.';
    report.rendererSamples=captures;
    report.interactions={mobile:mobileInteractionReport,fallbacks:fallbackChecks};
    report.status=report.errors.length===0&&report.failedRequests.length===0?'PASS':'FAIL';
    if(report.status==='FAIL')process.exitCode=1;
  }else{
  await mkdir(rawVideoDir,{recursive:true});
  motionContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:rawVideoDir,size:{width:1440,height:900}}});
  const motionPage=await motionContext.newPage();monitor(motionPage);await ready(motionPage);
  await motionPage.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await motionPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await motionPage.waitForTimeout(1500);
  const initialOrbitSnapshot=await motionPage.evaluate(()=>window.__agriscope.snapshot());
  assert.equal(initialOrbitSnapshot.shot,1,'Motion must begin on the first orbit shot.');
  assert.ok(initialOrbitSnapshot.p<.0003,'Motion must begin at progress zero.');
  await motionPage.screenshot({path:startReferencePath,timeout:60000});
  const points=await motionPage.evaluate(()=>window.__agriscope.SHOTS.map(shot=>shot.p));
  const sequence=[
    {to:points[4],move:3000,hold:2000},
    {to:points[5],move:1750,hold:2000},
    {to:points[7],move:2250,hold:2000},
    {to:points[8],move:1500,hold:1500},
    {to:points[9],move:1900,hold:2000},
    {to:points[5],move:3000,hold:2000},
    {to:0,move:2500,hold:1000},
  ];
  const motionStartedAt=Date.now();
  for(const stage of sequence){await animateToProgress(motionPage,stage.to,stage.move);await motionPage.waitForTimeout(stage.hold);}
  await motionPage.waitForFunction(()=>{const state=window.__agriscope.snapshot();return state.p<.0003&&state.shot===1;},null,{timeout:10000});
  await motionPage.waitForTimeout(4000);
  await motionPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const finalOrbitSnapshot=await motionPage.evaluate(()=>window.__agriscope.snapshot());
  assert.equal(finalOrbitSnapshot.shot,1,'Motion must finish at the first orbit shot.');
  assert.ok(finalOrbitSnapshot.p<.0003,'Motion must hold the orbit endpoint at progress zero.');
  await motionPage.screenshot({path:endpointReferencePath,timeout:60000});
  const motionEndedAt=Date.now();
  const motionVideo=motionPage.video();
  await motionContext.close();motionContext=undefined;
  const rawVideoPath=await motionVideo.path();
  const requestedDurationSeconds=(motionEndedAt-motionStartedAt)/1000;
  // Leave room for WebM/container frame-duration rounding so ffprobe's
  // measured output remains strictly below the 45-second evidence cap.
  const outputDurationLimitSeconds=44.8;
  const rawFormat=probeVideo(rawVideoPath);
  const rawStartSeconds=Number(rawFormat.start_time||0),rawDurationSeconds=Number(rawFormat.duration);
  assert.ok(Number.isFinite(rawDurationSeconds)&&rawDurationSeconds>0,'Raw browser recording must contain a valid presentation timeline.');
  const firstEndpoint=matchReferencePts(rawVideoPath,startReferencePath);
  const lastEndpoint=matchReferencePts(rawVideoPath,endpointReferencePath,{last:true});
  assert.ok(lastEndpoint.heldSeconds>=3,`Final orbit appears for only ${lastEndpoint.heldSeconds.toFixed(2)} seconds in the raw encoded stream.`);
  // ffmpeg's decoded trim boundary can include the preceding source frame at
  // an exact fps-sampled PTS. Start one sample inside the proven orbit hold,
  // then compare the first encoded frame against the browser reference below.
  const initialFrameAlignmentSeconds=1/4;
  assert.ok(firstEndpoint.heldSeconds>=initialFrameAlignmentSeconds,`Initial orbit match lasts only ${firstEndpoint.heldSeconds.toFixed(2)} seconds.`);
  const clipStartSeconds=firstEndpoint.pts+initialFrameAlignmentSeconds;
  const clipEndSeconds=Math.min(rawStartSeconds+rawDurationSeconds,lastEndpoint.pts+.24);
  const measuredPtsWindowSeconds=clipEndSeconds-clipStartSeconds;
  assert.ok(measuredPtsWindowSeconds>=30,`Matched browser endpoints leave less than 30 seconds of complete journey (${measuredPtsWindowSeconds.toFixed(2)}s).`);
  const playbackSpeedMultiplier=Math.max(1,measuredPtsWindowSeconds/outputDurationLimitSeconds);
  assert.ok(playbackSpeedMultiplier<=1.35,`Matched WebM journey is too long to preserve a slow pace; required playback speed multiplier ${playbackSpeedMultiplier.toFixed(2)} exceeds 1.35.`);
  const ptsScale=1/playbackSpeedMultiplier;
  rawMotionPtsWindow={startSeconds:clipStartSeconds,endSeconds:clipEndSeconds,rawStartSeconds,rawDurationSeconds,measuredMotionWindowSeconds:requestedDurationSeconds,measuredPresentationWindowSeconds:measuredPtsWindowSeconds,initialEndpointAlignmentSeconds:initialFrameAlignmentSeconds,initialEndpointMatch:firstEndpoint,finalEndpointMatch:lastEndpoint,finalOrbitChapterHoldSeconds:lastEndpoint.heldSeconds};
  // Trim the measured browser journey against its matched presentation times.
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',rawVideoPath,'-vf',`trim=start=${clipStartSeconds}:end=${clipEndSeconds},setpts=(PTS-STARTPTS)*${ptsScale}`,'-an','-c:v','libvpx-vp9','-crf','32','-b:v','0',videoPath],{stdio:'pipe'});
  actualMotionDurationSeconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',videoPath],{encoding:'utf8'}).trim());
  assert.ok(Number.isFinite(actualMotionDurationSeconds),'ffprobe must return the final recording duration.');
  assert.ok(actualMotionDurationSeconds>=30&&actualMotionDurationSeconds<=45,`Motion recording must be 30–45 seconds; received ${actualMotionDurationSeconds.toFixed(2)} seconds.`);
  const encodedFinalMatch=matchReferencePts(videoPath,endpointReferencePath,{last:true});
  assert.ok(encodedFinalMatch.heldSeconds>=3,`Final orbit appears for only ${encodedFinalMatch.heldSeconds.toFixed(2)} seconds in the encoded WebM.`);
  const endpointVerifier=await browser.newPage({viewport:{width:1440,height:900}});
  startComparison=await compareMotionFrame(endpointVerifier,startReferencePath,startEncodedFramePath,false);
  endpointComparison=await compareMotionFrame(endpointVerifier,endpointReferencePath,endpointEncodedFramePath,true);
  await endpointVerifier.close();
  await rm(rawVideoDir,{recursive:true,force:true});
  report.motion={path:'motion/agriscope-forward-reverse.webm',durationSeconds:actualMotionDurationSeconds,captureWindowSeconds:requestedDurationSeconds,rawPresentationTimeWindow:rawMotionPtsWindow,playbackSpeedMultiplier,initialEndpoint:{shot:initialOrbitSnapshot.shot,progress:initialOrbitSnapshot.p,encodedFrameComparison:startComparison,encodedFramePath:'motion/orbit-start-encoded.png',browserReferencePath:'motion/orbit-start-browser.png'},finalEndpoint:{shot:finalOrbitSnapshot.shot,progress:finalOrbitSnapshot.p,requestedHoldSeconds:4,rawChapterHoldSeconds:lastEndpoint.heldSeconds,encodedChapterHoldSeconds:encodedFinalMatch.heldSeconds,encodedFrameComparison:endpointComparison,encodedFramePath:'motion/orbit-endpoint-encoded.png',browserReferencePath:'motion/orbit-endpoint-browser.png'},sequence:'Slow forward descent; pauses at descent, boundary, NDVI, summary and handoff; reverse to boundary then orbit.'};
  report.rendererSamples=captures;
  report.interactions={mobile:mobileInteractionReport,fallbacks:fallbackChecks};
  report.status=report.errors.length===0&&report.failedRequests.length===0?'PASS':'FAIL';
  if(report.status==='FAIL')process.exitCode=1;
  }
}catch(error){
  report.status='FAIL';report.failure=error.stack||String(error);process.exitCode=1;
}finally{
  if(motionContext)await motionContext.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(report.status==='PASS')await rm(rawVideoDir,{recursive:true,force:true}).catch(()=>{});
  await mkdir(output,{recursive:true});
  const checkedOutSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(hashes.length===0)hashes=await sourceHashes().catch(error=>[{error:String(error)}]);
  const softwareReported=report.rendererSamples?.some(sample=>/swiftshader|software|llvmpipe/i.test(sample.renderer.gpu||''))??softwareWebGL;
  const motionDescription=report.motion
    ? `Playwright Chromium recording of the complete forward/reverse journey; playback was ${report.motion.playbackSpeedMultiplier>1?`uniformly retimed ${report.motion.playbackSpeedMultiplier.toFixed(3)}×`:'not retimed'}; ffprobe measured ${actualMotionDurationSeconds??'unavailable'} seconds.`
    : report.motionOmitted||'Playwright Chromium recording was not completed.';
  const reviewInfo={
    checkedOutSha,
    baseSha:baseSha||null,
    sourceAndAssetHashes:hashes,
    viewportSizes:viewports.map(({name,width,height,mobile})=>({name,width,height,mobileEmulation:mobile})),
    motionDurationSeconds:actualMotionDurationSeconds,
    captureMethod:{screenshots:'Playwright Chromium screenshots at the ten existing seekCheckpoint shot positions; contact sheets composed from those PNGs in Chromium.',motion:`${motionDescription} Raw WebM trim boundaries are found by matching the unobstructed Earth surface in the browser orbit frame against decoded raw-stream frames sampled at 4 fps on the presentation-time clock; wall-clock offsets are not used. The final encoded frame is compared across the full viewport with a browser capture after a 4-second orbit hold.`,baselineOnly:checkpointsOnly},
    playbackSpeedMultiplier:report.motion?.playbackSpeedMultiplier??null,
    rawMotionPtsWindow,
    initialEncodedFrameComparison:startComparison,
    finalEncodedFrameComparison:endpointComparison,
    renderingLimitations:[`Renderer mode: ${softwareReported?'software WebGL / SwiftShader':'see renderer metadata; hardware acceleration was not benchmarked'}.`,'Small-mobile dimensions are browser viewport/touch emulation, not a physical device.','Journey values are synthetic public examples; no private data or live satellite service is used.'],
  };
  await writeFile(join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(output,'review-info.json'),JSON.stringify(reviewInfo,null,2)+'\n');
}

if(report.status==='PASS')console.log(`PASS: ten-shot desktop/mobile evidence at ${output}`);
else console.error(`FAIL: cinematic evidence capture; inspect ${join(output,'browser-report.json')}`);
