import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';

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
const labRoute=new URL(url).pathname.includes('/cinematic-lab');
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
const handoffReferencePath=join(output,'motion','chapter-10-handoff-browser.png');
const rawVideoDir=join(output,'motion','raw-capture');
const timing={captureOperations:[],frameProbes:[],motionStages:[]};
let browser;
let motionContext;
let hashes=[];
let actualMotionDurationSeconds=null;
let rawMotionPtsWindow=null;
let endpointComparison=null;
let startComparison=null;
let interactionClip=null;
let handoffProof=null;

function probeVideo(path){
  return JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=start_time,duration','-of','json',path],{encoding:'utf8'})).format;
}

async function compareMotionFrame(page,referencePath,encodedPath,atEnd){
  const args=atEnd?['-sseof','-0.08','-i',videoPath]:['-i',videoPath];
  // Write full-resolution PNGs directly: detailed Earth frames can exceed
  // execFileSync's stdout buffer without indicating an encoding failure.
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args,'-frames:v','1','-update','1',encodedPath]);
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

function matchReferencePts(rawVideoPath,referencePath,{last=false,afterPts=-Infinity,region=null,label='browser endpoint',meanThreshold=10,maximumChangedPixelFraction=.12}={}){
  // Playwright's WebM clock is independent from Date.now(). Locate the actual
  // browser reference on the recorded presentation timeline. Whole-frame
  // endpoints retain the strict default. Interaction references use a recorded
  // UI region and explicit thresholds because WebM colour response is more
  // visible when a small dark panel is enlarged for comparison.
  const width=360,height=225,bytesPerFrame=width*height*3;
  const crop=region?`crop=${region.width}:${region.height}:${region.x}:${region.y},`:'';
  const artworkFilter=`${crop}scale=${width}:${height}:flags=area,format=rgb24`;
  const reference=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',referencePath,'-vf',artworkFilter,'-frames:v','1','-f','rawvideo','pipe:1'],{maxBuffer:bytesPerFrame*2});
  const format=probeVideo(rawVideoPath);
  const sampleBufferBytes=Math.ceil((Number(format.duration)+2)*4)*bytesPerFrame;
  const samples=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',rawVideoPath,'-vf',`fps=4,${artworkFilter}`,'-f','rawvideo','pipe:1'],{maxBuffer:sampleBufferBytes});
  assert.equal(reference.length,bytesPerFrame,'Browser endpoint reference decodes to one RGB sample.');
  assert.equal(samples.length%bytesPerFrame,0,'Raw motion samples align to full decoded RGB frames.');
  const frameCount=samples.length/bytesPerFrame,streamStart=Number(format.start_time||0),matches=[];
  const referenceMean=reference.reduce((sum,value)=>sum+value,0)/reference.length;
  for(let index=0;index<frameCount;index++){
    const offset=index*bytesPerFrame;
    let error=0,channels=0,sampleMean=0,pixelsOver36=0;
    // Include the moving artwork so the loading view cannot match just because
    // both it and the orbit chapter have a mostly-black background.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const referenceIndex=(y*width+x)*3,sampleIndex=offset+referenceIndex;
      let maxDifference=0;
      for(let c=0;c<3;c++){const sample=samples[sampleIndex+c],difference=Math.abs(sample-reference[referenceIndex+c]);error+=difference;maxDifference=Math.max(maxDifference,difference);sampleMean+=sample;channels++;}
      if(maxDifference>36)pixelsOver36++;
    }
    const mean=error/channels;
    sampleMean/=channels;
    const changedPixelFraction=pixelsOver36/(width*height);
    const pts=streamStart+index/4;
    if(pts>=afterPts&&mean<meanThreshold&&changedPixelFraction<maximumChangedPixelFraction&&sampleMean>=Math.max(referenceMean*.5,8))matches.push({index,pts,artworkRegionMeanAbsoluteChannelDifference:mean,artworkRegionMeanChannelValue:sampleMean,pixelsOver36:changedPixelFraction,sampleFps:4});
  }
  const match=last?matches.at(-1):matches[0];
  assert.ok(match,`Could not locate ${label} in the decoded WebM presentation timeline.`);
  let runStart=match.index,runEnd=match.index;
  while(matches.some(candidate=>candidate.index===runStart-1))runStart--;
  while(matches.some(candidate=>candidate.index===runEnd+1))runEnd++;
  return {...match,heldSeconds:(runEnd-runStart)/4,matchStartPts:streamStart+runStart/4,matchEndPts:streamStart+runEnd/4,threshold:meanThreshold,maximumChangedPixelFraction,minimumMeanChannelValue:Math.max(referenceMean*.5,8),matchedRegion:region||'complete viewport'};
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
  await page.goto(`${url}?qa=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__agriscope?.snapshot()?.ready&&window.__agriscope.snapshot().mode==='webgl',null,{timeout:60000});
  assert.equal(await page.locator('.cinematic canvas').count(),1);
}

async function seek(page,progress){
  await page.evaluate(value=>window.__agriscope.seekCheckpoint(value),progress);
  await page.waitForFunction(value=>Math.abs(window.__agriscope.snapshot().p-value)<.0003,progress,{timeout:30000});
  return page.evaluate(()=>window.__agriscope.snapshot());
}

async function renderedStateFor(page,progress){
  const expected=await page.evaluate(value=>({
    shot:window.__agriscope.SHOTS.reduce((current,shot,index)=>value>=shot.p-.025?index+1:current,1),
    beat:(window.__agriscope.BEATS||[]).filter(beat=>value>=beat.p).at(-1)?.id||null,
  }),progress);
  const started=Date.now();
  await page.waitForFunction(({progress,expected})=>{
    const state=window.__agriscope?.snapshot();
    return state&&Math.abs(state.p-progress)<.0003&&state.shot===expected.shot&&(!expected.beat||state.beat===expected.beat);
  },{progress,expected},{timeout:90000});
  return {elapsedMs:Date.now()-started,expected,snapshot:await page.evaluate(()=>window.__agriscope.snapshot())};
}

async function visibleRegion(page,selectors,padding=18){
  const boxes=[];
  for(const selector of selectors){
    const locator=page.locator(selector);
    assert.ok(await locator.isVisible(),`${selector} must be visible in the recorded state.`);
    const box=await locator.boundingBox();
    assert.ok(box,`${selector} must have a visible recording region.`);
    boxes.push(box);
  }
  const viewport=page.viewportSize();
  assert.ok(viewport,'The interaction recording must have a fixed viewport.');
  const left=Math.max(0,Math.floor(Math.min(...boxes.map(box=>box.x))-padding));
  const top=Math.max(0,Math.floor(Math.min(...boxes.map(box=>box.y))-padding));
  const right=Math.min(viewport.width,Math.ceil(Math.max(...boxes.map(box=>box.x+box.width))+padding));
  const bottom=Math.min(viewport.height,Math.ceil(Math.max(...boxes.map(box=>box.y+box.height))+padding));
  return {x:left,y:top,width:right-left,height:bottom-top};
}

async function captureStateReference(page,id,selectors,matchOptions){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const region=await visibleRegion(page,selectors);
  const relativePath=`motion/state-${id}-browser.png`;
  await page.screenshot({path:join(output,relativePath),timeout:60000});
  return {id,browserReferencePath:relativePath,absoluteReferencePath:join(output,relativePath),region,matchOptions};
}

function proveRecordedStateSequence(videoPath,references,{decodedFrames=false}={}){
  let afterPts=-Infinity;
  return references.map(reference=>{
    const match=matchReferencePts(videoPath,reference.absoluteReferencePath,{afterPts,region:reference.region,label:`interaction state ${reference.id}`,...reference.matchOptions});
    assert.ok(match.heldSeconds>=.75,`${reference.id} appears for only ${match.heldSeconds.toFixed(2)} seconds in ${videoPath}.`);
    afterPts=match.matchEndPts+.25;
    const encodedFramePath=decodedFrames?`motion/state-${reference.id}-encoded.png`:null;
    const encodedFramePts=(match.matchStartPts+match.matchEndPts)/2;
    if(encodedFramePath)execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',videoPath,'-ss',String(encodedFramePts),'-frames:v','1','-update','1',join(output,encodedFramePath)]);
    return {id:reference.id,browserReferencePath:reference.browserReferencePath,encodedFramePath,encodedFramePts,region:reference.region,match};
  });
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

async function measureFrames(page,progress,recording){
  await seek(page,progress);
  const started=Date.now();
  const sample=await page.evaluate(progress=>new Promise(resolve=>{
    const intervals=[],submission=[],start=performance.now();let previous=start;
    const frame=now=>{
      intervals.push(now-previous);previous=now;
      const t=performance.now();
      // Force the same small deterministic camera sweep in both source versions.
      window.__agriscope.seekCheckpoint(progress+Math.sin((now-start)/700)*.003);
      submission.push(performance.now()-t);
      if(now-start<2400)requestAnimationFrame(frame);
      else resolve({intervalsMs:intervals,renderSubmissionMs:submission,elapsedMs:now-start,renderer:window.__agriscope.snapshot().gpu});
    };requestAnimationFrame(frame);
  }),progress);
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),at=q=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)};};
  const intervalClassification={droppedFrameIntervals:sample.intervalsMs.filter(value=>value>25).length,stalledFrameIntervals:sample.intervalsMs.filter(value=>value>50).length,severeStallIntervals:sample.intervalsMs.filter(value=>value>100).length,estimatedMissedVsyncs:sample.intervalsMs.reduce((total,value)=>total+Math.max(0,Math.round(value/(1000/60))-1),0),thresholdsMs:{dropped:25,stalled:50,severe:100}};
  timing.frameProbes.push({progress,recording,viewport:page.viewportSize(),hostElapsedMs:Date.now()-started,...sample,intervalStatsMs:stats(sample.intervalsMs),intervalClassification,submissionStatsMs:stats(sample.renderSubmissionMs),interpretation:'rAF intervals and synchronous seek/render submission time; not GPU execution time or a hardware benchmark.'});
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

async function captureLabInteractions(){
  const rawDir=join(output,'motion','raw-interactions');
  const finalPath=join(output,'motion','agriscope-lab-interactions.webm');
  await mkdir(rawDir,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:rawDir,size:{width:1440,height:900}}});
  const page=await context.newPage();monitor(page);await ready(page);
  const video=page.video(),references=[],holdMs=1600;
  await seek(page,.22);
  const payload=await page.locator('#payload-control').boundingBox();
  assert.ok(payload,'The payload control must be visible for the interaction recording.');
  await page.mouse.move(payload.x-90,payload.y+20);await page.waitForTimeout(500);await page.mouse.move(payload.x+20,payload.y+20,{steps:18});
  await page.mouse.click(payload.x+20,payload.y+20);
  await page.waitForFunction(()=>window.__agriscope.snapshot().payloadExpanded&&!document.querySelector('#payload-tip').hidden);
  assert.equal(await page.locator('#payload-control').getAttribute('aria-expanded'),'true','Pointer input expands the payload disclosure.');
  references.push(await captureStateReference(page,'payload-open',['#payload-control','#payload-tip'],{meanThreshold:22,maximumChangedPixelFraction:.15}));
  await page.waitForTimeout(holdMs);await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!window.__agriscope.snapshot().payloadExpanded&&document.querySelector('#payload-tip').hidden);

  await seek(page,.56);
  await page.locator('[data-hotspot="boundary"]').click();
  await page.waitForFunction(()=>window.__agriscope.snapshot().activeHotspot==='boundary'&&!document.querySelector('#hotspot-detail').hidden&&document.querySelector('#hotspot-detail').textContent.trim().length>0);
  assert.ok(await page.locator('#hotspot-detail').isVisible(),'The boundary hotspot tooltip must be visible in the recording.');
  references.push(await captureStateReference(page,'boundary-hotspot',['[data-hotspot="boundary"]','#hotspot-detail'],{meanThreshold:18,maximumChangedPixelFraction:.10}));
  await page.waitForTimeout(holdMs);await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__agriscope.snapshot().activeHotspot===null&&document.querySelector('#hotspot-detail').hidden);

  await seek(page,.76);
  const slider=page.locator('#comparison-slider');await slider.focus();await page.keyboard.press('Home');
  await page.waitForFunction(()=>window.__agriscope.snapshot().evidence.comparison===0&&document.querySelector('#comparison-slider').value==='0');
  assert.match(await page.locator('#comparison-output').textContent(),/ก่อน/,'The Home key exposes the before comparison endpoint.');
  references.push(await captureStateReference(page,'comparison-before',['#comparison-control'],{meanThreshold:27,maximumChangedPixelFraction:.12}));
  await page.waitForTimeout(holdMs);await page.keyboard.press('End');
  await page.waitForFunction(()=>window.__agriscope.snapshot().evidence.comparison===1&&document.querySelector('#comparison-slider').value==='100');
  assert.match(await page.locator('#comparison-output').textContent(),/หลัง/,'The End key exposes the after comparison endpoint.');
  references.push(await captureStateReference(page,'comparison-after',['#comparison-control'],{meanThreshold:28,maximumChangedPixelFraction:.13}));
  await page.waitForTimeout(holdMs);

  await seek(page,.86);await page.locator('#inspect-field').click();
  await page.waitForFunction(()=>{const state=window.__agriscope.snapshot(),root=document;return state.evidence.status==='NOT_ASSESSABLE'&&root.querySelector('#before-value').textContent==='—'&&root.querySelector('#after-value').textContent==='—'&&root.querySelector('.map-legend').hidden;});
  assert.equal(await page.locator('#sample-status').textContent(),'ข้อมูลยังไม่พอ','The recording visibly identifies insufficient data.');
  references.push(await captureStateReference(page,'not-assessable',['#field-panel'],{meanThreshold:20.5,maximumChangedPixelFraction:.11}));
  await page.waitForTimeout(holdMs);await page.locator('#inspect-field').click();
  await page.waitForFunction(()=>{const state=window.__agriscope.snapshot(),root=document;return state.evidence.status==='NEEDS_INSPECTION'&&root.querySelector('#before-value').textContent==='0.68'&&root.querySelector('#after-value').textContent==='0.42'&&!root.querySelector('.map-legend').hidden;});
  assert.equal(await page.locator('#sample-status').textContent(),'ควรตรวจต่อ','The valid demonstration is restored visibly.');
  references.push(await captureStateReference(page,'valid-restored',['#field-panel'],{meanThreshold:20.5,maximumChangedPixelFraction:.11}));
  await page.waitForTimeout(holdMs);
  await context.close();
  const rawPath=await video.path();await copyFile(rawPath,finalPath);
  const durationSeconds=Number(probeVideo(finalPath).duration);
  assert.ok(Number.isFinite(durationSeconds)&&durationSeconds>=7,'The interaction recording must retain the complete unretimed demonstrations.');
  const rawStates=proveRecordedStateSequence(rawPath,references);
  const finalStates=proveRecordedStateSequence(finalPath,references,{decodedFrames:true});
  const states=references.map((reference,index)=>({
    id:reference.id,
    browserReferencePath:reference.browserReferencePath,
    encodedFramePath:finalStates[index].encodedFramePath,
    encodedFramePts:finalStates[index].encodedFramePts,
    region:reference.region,
    matchOptions:reference.matchOptions,
    rawMatch:rawStates[index].match,
    finalMatch:finalStates[index].match,
  }));
  return {path:'motion/agriscope-lab-interactions.webm',rawPath:relative(output,rawPath),durationSeconds,playbackSpeedMultiplier:1,minimumProvenStateHoldSeconds:.75,states,sequence:'Pointer parallax and payload disclosure; field hotspot; keyboard NDVI comparison endpoints; NOT_ASSESSABLE state; restored valid state.'};
}

async function sourceHashes(){
  const paths=[...new Set(gitPaths())].sort();
  const deletedArgs=baseSha
    ? ['diff','--name-only','--no-renames','--diff-filter=D',`${baseSha}...${headSha}`]
    : ['ls-files','--deleted'];
  const deleted=new Set(execFileSync('git',deletedArgs,{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean));
  const hashes=[];
  for(const path of paths)hashes.push(deleted.has(path)
    ? {path,state:'deleted',sha256:null,bytes:0}
    : await sha256(path));
  return hashes;
}

async function runtimeManifest(){
  const rootPath='apps/web/public/cinematic',paths=[];
  const walk=async relative=>{
    for(const entry of await readdir(join(root,relative),{withFileTypes:true})){
      const child=join(relative,entry.name);
      if(entry.isDirectory())await walk(child);
      else if(entry.isFile())paths.push(child);
    }
  };
  await walk(rootPath);
  return Promise.all(paths.sort().map(sha256));
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
    assert.equal(points.length,10,'The product journey retains ten navigation chapters.');
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
      const screenshotStarted=Date.now();
      await page.screenshot({path,timeout:60000});
      timing.captureOperations.push({viewport:viewport.name,shot:index+1,operation:'screenshot',elapsedMs:Date.now()-screenshotStarted});
      shots.push({number:index+1,name:shotNames[index],path});
      captures.push({shot:index+1,progress:snapshot.p,renderer:{mode:snapshot.mode,gpu:snapshot.gpu||null,drawCalls:snapshot.drawCalls,triangles:snapshot.triangles,softwareWebGL},assets:{model:snapshot.model,land:snapshot.land,regionalWorld:snapshot.regionalWorld||null,scene4Hero:snapshot.scene4Hero||null,descentAtmosphere:snapshot.descentAtmosphere||null}});
    }
    const beats=await page.evaluate(()=>window.__agriscope.BEATS||[]);
    if(!process.env.BASELINE_REASON){
      assert.equal(beats.length,19,'The current cinematic lab evidence covers exactly 19 internal beats.');
      assert.equal(new Set(beats.map(beat=>beat.id)).size,19,'The current cinematic lab evidence has one stable identifier per beat.');
    }
    if(beats.length){
      await mkdir(join(output,viewport.name,'beats'),{recursive:true});
      for(const beat of beats){
        const snapshot=await seek(page,beat.p);
        await page.screenshot({path:join(output,viewport.name,'beats',`${beat.id}.png`),timeout:60000});
        captures.push({beat:beat.id,viewport:viewport.name,progress:snapshot.p,renderer:{gpu:snapshot.gpu,drawCalls:snapshot.drawCalls,triangles:snapshot.triangles,softwareWebGL}});
      }
    }
    if(!viewport.mobile)for(const progress of [.095,.18,.30,.42,.56])await measureFrames(page,progress,false);
    if(!viewport.mobile&&!checkpointsOnly){
      await seek(page,.86);
      await page.locator('#inspect-field').click();
      assert.equal(await page.locator('#sample-status').textContent(),'ข้อมูลยังไม่พอ');
      assert.equal((await page.evaluate(()=>window.__agriscope.snapshot())).evidence.status,'NOT_ASSESSABLE');
      await page.screenshot({path:join(output,viewport.name,'insufficient-data.png'),timeout:60000});
      await page.locator('#inspect-field').click();
    }
    if(viewport.mobile){
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
      if(!process.env.BASELINE_REASON){
        assert.match(await page.locator('#title').textContent(),/ข้อมูลยังไม่พอ/,'The summary narrative follows NOT_ASSESSABLE.');
        assert.doesNotMatch(await page.locator('#description').textContent(),/ลดลง|ควรตรวจ/,'The narrative must not retain a valid-data conclusion.');
        assert.doesNotMatch(await page.locator('#sample-explanation').textContent(),/ลดลง|ควรตรวจ/,'The panel must not retain a valid-data conclusion.');
        assert.equal(await page.locator('.map-legend').isVisible(),false,'No change legend is shown without common support.');
        await page.locator('#rail button[aria-label^="ช่วง 7:"]').click();
        await page.waitForFunction(()=>Math.abs(window.__agriscope.snapshot().p-.65)<.003,null,{timeout:10000});
        assert.equal((await page.evaluate(()=>window.__agriscope.snapshot())).evidence.status,'NOT_ASSESSABLE');
        assert.match(await page.locator('#title').textContent(),/ตรวจคุณภาพก่อนเปรียบเทียบ/,'Reverse chapter navigation keeps the insufficient-data narrative.');
        await page.setViewportSize({width:800,height:900});
        await seek(page,.86);
        assert.equal((await page.evaluate(()=>window.__agriscope.snapshot())).evidence.status,'NOT_ASSESSABLE');
        assert.match(await page.locator('#title').textContent(),/ข้อมูลยังไม่พอ/,'Desktop resize keeps the insufficient-data narrative.');
        assert.doesNotMatch(await page.locator('#description').textContent(),/ลดลง|ควรตรวจ/);
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await seek(page,.86);
      }
      await page.screenshot({path:join(output,viewport.name,'insufficient-data.png'),timeout:60000});
      await page.locator('#inspect-field').click();
      assert.equal(await page.locator('#sample-status').textContent(),'ควรตรวจต่อ','The valid demonstration is restored after toggling back.');
      let touchComparison=null;
      if(labRoute){
        await seek(page,.76);
        const comparisonControl=page.locator('#comparison-slider'),comparisonBox=await comparisonControl.boundingBox();
        assert.ok(comparisonBox,'The mobile comparison slider remains visible to touch users.');
        await comparisonControl.tap({position:{x:comparisonBox.width*.84,y:comparisonBox.height/2}});
        touchComparison=(await page.evaluate(()=>window.__agriscope.snapshot())).evidence.comparison;
        assert.ok(touchComparison>.65,'Touch input changes the dated comparison state.');
        await page.locator('#rail button[aria-label^="ช่วง 7:"]').tap();
      }else{
        await page.locator('#rail button[aria-label^="ช่วง 7:"]').click();
      }
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
      mobileInteractionReport={insufficientData:{status:'NOT_ASSESSABLE',before:'—',after:'—',delta:null,validExampleRestored:true},...(labRoute?{touchComparison:{comparison:touchComparison,input:'touch emulation'}}:{}),chapterNavigation:{targetShot:7,input:labRoute?'touch emulation':'click'},registrationCta};
    }
    await makeContactSheet(page,viewport.name,shots);
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
  report.rendererSamples=captures;report.interactions={mobile:mobileInteractionReport,fallbacks:fallbackChecks};
  if(labRoute){interactionClip=await captureLabInteractions();report.interactions.labClip=interactionClip;}
  await mkdir(rawVideoDir,{recursive:true});
  const probeContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:join(rawVideoDir,'timing-probe'),size:{width:1440,height:900}}});
  try{const probePage=await probeContext.newPage();await ready(probePage);const points=await probePage.evaluate(()=>window.__agriscope.SHOTS.map(shot=>shot.p));for(const progress of [.095,.18,.30,.42,.56])await measureFrames(probePage,progress,true);}finally{await probeContext.close();}
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
  const redesigned=await motionPage.evaluate(()=>Boolean(window.__agriscope.BEATS));
  const sequence=redesigned?[
    {to:.095,move:3500,hold:900},{to:.18,move:3000,hold:900},
    {to:.22,move:2200,hold:1500},{to:.30,move:3500,hold:1600},
    {to:.36,move:3000,hold:1000},{to:.46,move:3500,hold:1000},
    {to:.56,move:3000,hold:1500},{to:.76,move:2800,hold:1200},
    {to:.95,move:2800,hold:1500},{to:.56,move:4000,hold:900},
    {to:.30,move:4500,hold:900},{to:.18,move:3500,hold:900},
    {to:0,move:4500,hold:1200},
  ]:[
    {to:points[4],move:3000,hold:2000},{to:points[5],move:1750,hold:2000},
    {to:points[7],move:2250,hold:2000},{to:points[8],move:1500,hold:1500},
    {to:points[9],move:1900,hold:2000},{to:points[5],move:3000,hold:2000},
    {to:0,move:2500,hold:1000},
  ];
  const motionStartedAt=Date.now();
  const navigationCount={value:0};motionPage.on('framenavigated',frame=>{if(frame===motionPage.mainFrame())navigationCount.value++;});
  let handoffReference=null;
  for(const stage of sequence){
    const started=Date.now();await animateToProgress(motionPage,stage.to,stage.move);const moved=Date.now();
    const settled=await renderedStateFor(motionPage,stage.to);
    if(stage.to===.95){
      assert.equal(settled.snapshot.shot,10,'The forward journey must visibly reach chapter 10 before reversing.');
      assert.ok(settled.snapshot.p>=.925,'The rendered journey must enter the application handoff range before reversing.');
      assert.ok(await motionPage.locator('#narrative').isVisible(),'The chapter 10 narrative must remain visible.');
      assert.match(await motionPage.locator('#title').textContent(),/เริ่มติดตามแปลงของคุณ/,'The rendered narrative must identify the application handoff chapter.');
      assert.match(await motionPage.locator('#rail button[aria-current="true"]').getAttribute('aria-label'),/^ช่วง 10:/,'The navigation rail must visibly identify chapter 10.');
      const handoff=motionPage.locator('#field-panel .field-handoff');
      assert.ok(await handoff.isVisible(),'The desktop application handoff CTA must be visible before reversal.');
      assert.equal(await handoff.getAttribute('href'),'/login?mode=register');
      handoffReference={
        absoluteReferencePath:handoffReferencePath,
        browserReferencePath:'motion/chapter-10-handoff-browser.png',
        region:await visibleRegion(motionPage,['#title']),
        matchOptions:{meanThreshold:25,maximumChangedPixelFraction:.12},
      };
      await motionPage.screenshot({path:handoffReferencePath,timeout:60000});
    }
    const holdStarted=Date.now();await motionPage.waitForTimeout(stage.hold);
    timing.motionStages.push({...stage,actualMoveMs:moved-started,settlingMs:settled.elapsedMs,settledState:{p:settled.snapshot.p,shot:settled.snapshot.shot,beat:settled.snapshot.beat},actualHoldMs:Date.now()-holdStarted});
  }
  assert.ok(handoffReference,'The redesigned journey sequence must include a chapter 10 handoff stage.');
  assert.equal(navigationCount.value,0,'The production page must not reload during the recording.');
  // Software recording can stall between frames while the runtime's bounded
  // damping is still converging. Wait for natural motion; never seek the endpoint
  // or retime away the settling interval. Match the focused browser suite budget.
  const settlingStarted=Date.now();
  timing.finalSettling={before:await motionPage.evaluate(()=>window.__agriscope.snapshot()),timeoutMs:90000};
  try{
    await motionPage.waitForFunction(()=>{const state=window.__agriscope.snapshot();return state.p<.0003&&state.shot===1;},null,{timeout:90000});
  }finally{
    timing.finalSettling.elapsedMs=Date.now()-settlingStarted;
    timing.finalSettling.after=await motionPage.evaluate(()=>window.__agriscope.snapshot()).catch(()=>null);
  }
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
  timing.rawVideoPath=rawVideoPath;timing.requestedMotionWindowSeconds=requestedDurationSeconds;
  await writeFile(join(output,'timing-diagnostics.json'),JSON.stringify(timing,null,2));
  const rawFormat=probeVideo(rawVideoPath);
  const rawStartSeconds=Number(rawFormat.start_time||0),rawDurationSeconds=Number(rawFormat.duration);
  assert.ok(Number.isFinite(rawDurationSeconds)&&rawDurationSeconds>0,'Raw browser recording must contain a valid presentation timeline.');
  const firstEndpoint=matchReferencePts(rawVideoPath,startReferencePath);
  const lastEndpoint=matchReferencePts(rawVideoPath,endpointReferencePath,{last:true});
  const rawHandoffMatch=matchReferencePts(rawVideoPath,handoffReference.absoluteReferencePath,{region:handoffReference.region,label:'chapter 10 handoff',...handoffReference.matchOptions});
  assert.ok(rawHandoffMatch.heldSeconds>=1,`Chapter 10 appears for only ${rawHandoffMatch.heldSeconds.toFixed(2)} seconds in the raw encoded stream.`);
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
  const playbackSpeedMultiplier=1;
  rawMotionPtsWindow={startSeconds:clipStartSeconds,endSeconds:clipEndSeconds,rawStartSeconds,rawDurationSeconds,measuredMotionWindowSeconds:requestedDurationSeconds,measuredPresentationWindowSeconds:measuredPtsWindowSeconds,initialEndpointAlignmentSeconds:initialFrameAlignmentSeconds,initialEndpointMatch:firstEndpoint,finalEndpointMatch:lastEndpoint,finalOrbitChapterHoldSeconds:lastEndpoint.heldSeconds};
  // Trim the measured browser journey against its matched presentation times.
  timing.rawMotionPtsWindow=rawMotionPtsWindow;
  await writeFile(join(output,'timing-diagnostics.json'),JSON.stringify(timing,null,2));
  const encodingStarted=Date.now();
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',rawVideoPath,'-vf',`trim=start=${clipStartSeconds}:end=${clipEndSeconds},setpts=PTS-STARTPTS`,'-an','-c:v','libvpx-vp9','-crf','32','-b:v','0',videoPath],{stdio:'pipe'});
  timing.encodingElapsedMs=Date.now()-encodingStarted;
  actualMotionDurationSeconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',videoPath],{encoding:'utf8'}).trim());
  assert.ok(Number.isFinite(actualMotionDurationSeconds),'ffprobe must return the final recording duration.');
  assert.ok(actualMotionDurationSeconds>=30,'Motion recording preserves the complete journey.');
  assert.ok(Math.abs(actualMotionDurationSeconds-measuredPtsWindowSeconds)<.25,'Encoded duration preserves the measured presentation timeline at original speed.');
  const encodedFinalMatch=matchReferencePts(videoPath,endpointReferencePath,{last:true});
  assert.ok(encodedFinalMatch.heldSeconds>=3,`Final orbit appears for only ${encodedFinalMatch.heldSeconds.toFixed(2)} seconds in the encoded WebM.`);
  const encodedHandoffMatch=matchReferencePts(videoPath,handoffReference.absoluteReferencePath,{region:handoffReference.region,label:'chapter 10 handoff',...handoffReference.matchOptions});
  assert.ok(encodedHandoffMatch.heldSeconds>=1,`Chapter 10 appears for only ${encodedHandoffMatch.heldSeconds.toFixed(2)} seconds in the final encoded WebM.`);
  const handoffEncodedFramePath=join(output,'motion','chapter-10-handoff-encoded.png');
  const handoffEncodedFramePts=(encodedHandoffMatch.matchStartPts+encodedHandoffMatch.matchEndPts)/2;
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',videoPath,'-ss',String(handoffEncodedFramePts),'-frames:v','1','-update','1',handoffEncodedFramePath]);
  handoffProof={browserReferencePath:handoffReference.browserReferencePath,encodedFramePath:'motion/chapter-10-handoff-encoded.png',encodedFramePts:handoffEncodedFramePts,region:handoffReference.region,matchOptions:handoffReference.matchOptions,rawMatch:rawHandoffMatch,finalMatch:encodedHandoffMatch};
  const endpointVerifier=await browser.newPage({viewport:{width:1440,height:900}});
  startComparison=await compareMotionFrame(endpointVerifier,startReferencePath,startEncodedFramePath,false);
  endpointComparison=await compareMotionFrame(endpointVerifier,endpointReferencePath,endpointEncodedFramePath,true);
  await endpointVerifier.close();
  // Retain the raw recording, including on success, for independent timestamp review.
  report.motion={path:'motion/agriscope-forward-reverse.webm',durationSeconds:actualMotionDurationSeconds,captureWindowSeconds:requestedDurationSeconds,rawPresentationTimeWindow:rawMotionPtsWindow,playbackSpeedMultiplier,chapter10Handoff:handoffProof,initialEndpoint:{shot:initialOrbitSnapshot.shot,progress:initialOrbitSnapshot.p,encodedFrameComparison:startComparison,encodedFramePath:'motion/orbit-start-encoded.png',browserReferencePath:'motion/orbit-start-browser.png'},finalEndpoint:{shot:finalOrbitSnapshot.shot,progress:finalOrbitSnapshot.p,requestedHoldSeconds:4,rawChapterHoldSeconds:lastEndpoint.heldSeconds,encodedChapterHoldSeconds:encodedFinalMatch.heldSeconds,encodedFrameComparison:endpointComparison,encodedFramePath:'motion/orbit-endpoint-encoded.png',browserReferencePath:'motion/orbit-endpoint-browser.png'},sequence:redesigned?'Forward flyby, wing, payload, activation/corridor, Thailand, descent and field; visible application handoff; full reverse with original-speed holds.':'Historical ten-chapter traversal.'};
  report.rendererSamples=captures;
  report.interactions={mobile:mobileInteractionReport,fallbacks:fallbackChecks,...(interactionClip?{labClip:interactionClip}:{})};
  report.status=report.errors.length===0&&report.failedRequests.length===0?'PASS':'FAIL';
  if(report.status==='FAIL')process.exitCode=1;
  }
}catch(error){
  report.status='FAIL';report.failure=error.stack||String(error);process.exitCode=1;
}finally{
  if(motionContext)await motionContext.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  await writeFile(join(output,'timing-diagnostics.json'),JSON.stringify(timing,null,2)+'\n');
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
    captureMethod:{screenshots:'Playwright Chromium screenshots at the ten existing seekCheckpoint shot positions; contact sheets composed from those PNGs in Chromium.',motion:`${motionDescription} Raw WebM trim boundaries are found by matching the complete browser orbit frame against decoded raw-stream frames sampled at 4 fps on the presentation-time clock; wall-clock offsets are not used. The final encoded frame is compared across the full viewport with a browser capture after a 4-second orbit hold.`,baselineOnly:checkpointsOnly},
    playbackSpeedMultiplier:report.motion?.playbackSpeedMultiplier??null,
    rawMotionPtsWindow,
    timingDiagnostics:'timing-diagnostics.json',
    initialEncodedFrameComparison:startComparison,
    finalEncodedFrameComparison:endpointComparison,
    renderingLimitations:[`Renderer mode: ${softwareReported?'software WebGL / SwiftShader':'see renderer metadata; hardware acceleration was not benchmarked'}.`,'Small-mobile dimensions are browser viewport/touch emulation, not a physical device.','Journey values are synthetic public examples; no private data or live satellite service is used.'],
    interactionClip,
    blenderDerivativeProvenance:{
      scene4MasterSha256:'5ef375387e51165c45e41f08db19c737b40709207e80a901443c3e35bd9f35c5',
      archivedHeroMilestoneReference:{sha256:'20f30c80278b04a91428b33f4633f18531662a3c2411bea5dfe255737cc967c7',exporterInput:false,equivalenceClaimed:false},
      heroEditableDerivative:{file:'AgriScope-Runtime-Art-Transfer-hero.blend',sha256:'76344b57671cb43e798434a5757446cc0069bb9d68207bfccab24b43c7ffed18',bytes:290537078,packedDependencies:23},
      externalManifest:'runtime-art-transfer-manifest.json',
      note:'The editable Blender derivative and its object-level manifest are delivered outside Git. The runtime export is bound to the Scene 4 master; the archived Hero milestone is an independent integrity reference. Runtime source bytes are independently listed in runtimeAssetManifest.',
    },
  };
  const runtimeAssets=await runtimeManifest();
  const directAssets=runtimeAssets.filter(asset=>/\.(?:js|json|jpg|png|ttf)$/i.test(asset.path)&&!asset.path.endsWith('/batch.js'));
  const shotSamples=(report.rendererSamples||[]).filter(sample=>sample.shot);
  const ranges=values=>values.length?{minimum:Math.min(...values),maximum:Math.max(...values)}:null;
  const costReport={
    measuredFrom:checkedOutSha,
    bytes:{publicCinematicFootprint:runtimeAssets.reduce((sum,asset)=>sum+asset.bytes,0),directUncompressedTransferCandidates:directAssets.reduce((sum,asset)=>sum+asset.bytes,0),note:'Static file bytes before HTTP compression. Next.js framework chunks, caches and the Blender-only masters are outside this count.'},
    files:{publicCinematic:runtimeAssets.length,directTransferCandidates:directAssets.length,largest:directAssets.toSorted((a,b)=>b.bytes-a.bytes).slice(0,10)},
    renderer:{gpu:[...new Set(shotSamples.map(sample=>sample.renderer?.gpu).filter(Boolean))],drawCalls:ranges(shotSamples.map(sample=>sample.renderer?.drawCalls).filter(Number.isFinite)),triangles:ranges(shotSamples.map(sample=>sample.renderer?.triangles).filter(Number.isFinite)),sampleCount:shotSamples.length,note:'Ranges are actual ten-shot desktop/mobile captures and vary with scene visibility. They are not full Blender-master costs.'},
    scene4Derivatives:{
      regional:{path:'apps/web/public/cinematic/models/scene4-regional.mesh.json',sha256:'2abfb8fca677075c087359a8148ca4fcc704860a874bdf5e33e6774fd137f470',bytes:774811,triangles:42234,vertices:25071,batches:6},
      hero:{path:'apps/web/public/cinematic/models/scene4-hero.mesh.json',sha256:'2b6bd63d50336983b866b4bf66a9339a8933cde2b70e28f781467056510539e9',bytes:2517582,triangles:98743,vertices:99407,batches:12,editableDerivativeSha256:'76344b57671cb43e798434a5757446cc0069bb9d68207bfccab24b43c7ffed18',editableDerivativeBytes:290537078},
      sourceMasterSha256:'5ef375387e51165c45e41f08db19c737b40709207e80a901443c3e35bd9f35c5',archivedHeroMilestoneReference:{sha256:'20f30c80278b04a91428b33f4633f18531662a3c2411bea5dfe255737cc967c7',exporterInput:false,equivalenceClaimed:false},combinedBytes:3292393,combinedTriangles:140977,combinedBatches:18,
    },
    masterBoundary:'Full editable Blender masters remain external and their browser decode/frame costs are unmeasured. The lab includes source-bound regional and Hero Field runtime derivatives (3,292,393 combined bytes, 140,977 triangles, 18 batches); their editable derivatives and manifest remain delivery provenance.',
  };
  reviewInfo.runtimeAssetManifest=runtimeAssets;
  reviewInfo.costReport='cost-report.json';
  await writeFile(join(output,'cost-report.json'),JSON.stringify(costReport,null,2)+'\n');
  await writeFile(join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(output,'review-info.json'),JSON.stringify(reviewInfo,null,2)+'\n');
}

if(report.status==='PASS')console.log(`PASS: ten-shot desktop/mobile evidence at ${output}`);
else console.error(`FAIL: cinematic evidence capture; inspect ${join(output,'browser-report.json')}`);
