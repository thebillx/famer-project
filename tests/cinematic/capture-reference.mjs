import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const output=process.argv[2];
if(!output)throw new Error('Pass an evidence output directory.');
const sourceUrl='https://edolus.com/';
const viewport={width:1440,height:900};
const report={status:'RUNNING',sourceUrl,viewport,captureMethod:'Playwright Chromium; settled sequence frames are saved at each PageDown step. A scene is named only when its heading is rendered, stable and inside the viewport. Step position and hidden page text are not treated as scene identity.',browser:null,captures:[],candidates:[],unverified:[],unavailable:[],limitations:['Reference captures use a 1440×900 browser viewport; they do not establish physical-device or non-headless parity.','Edolus is a visual reference only. No image assets or code are copied.','Unclassified candidate frames preserve rendered content for visual review when the site does not expose a stable visible scene heading to automation.']};
await mkdir(output,{recursive:true});
let browser;
async function captureVisible(page,{marker,name,content}){
  await page.waitForTimeout(1800);
  const visibleMarker=await stableVisibleMarker(page,marker);
  assert.ok(visibleMarker,`Expected a stable, rendered, in-viewport Edolus heading ${marker}.`);
  const path=resolve(output,`${name}.png`);
  await page.screenshot({path,fullPage:false,timeout:60000});
  report.captures.push({name,path:`reference/${name}.png`,sourceUrl:page.url(),viewport,visibleIdentity:marker,visibleMarker,content});
}
async function visibleMarkerState(page,marker){
 return page.evaluate(value=>{
  const normalize=text=>text?.replace(/\s+/g,' ').trim().toLocaleUpperCase()||'';
  const nodes=Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"],body *'))
   .filter(node=>normalize(node.innerText)===normalize(value)||normalize(node.innerText).includes(normalize(value)));
  nodes.sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height);
  for(const node of nodes){
   const rect=node.getBoundingClientRect(),style=getComputedStyle(node),opacity=Number.parseFloat(style.opacity||'1');
   const inViewport=rect.width>0&&rect.height>0&&rect.right>0&&rect.left<innerWidth&&rect.bottom>0&&rect.top<innerHeight;
   if(inViewport&&style.visibility==='visible'&&style.display!=='none'&&opacity>=.9)return {text:value,opacity,bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
  }
  return null;
 },marker);
}
async function stableVisibleMarker(page,marker,{timeoutMs=8000}={}){
 const started=Date.now();
 while(Date.now()-started<timeoutMs){
  const first=await visibleMarkerState(page,marker);
  if(first){await page.waitForTimeout(700);const second=await visibleMarkerState(page,marker);
   if(second&&Math.abs(first.bounds.x-second.bounds.x)<2&&Math.abs(first.bounds.y-second.bounds.y)<2&&Math.abs(first.bounds.width-second.bounds.width)<2&&Math.abs(first.bounds.height-second.bounds.height)<2)return second;
  }
  await page.waitForTimeout(350);
 }
 return null;
}
async function waitForStablePageText(page,{stableMs=1300,timeoutMs=9000}={}){
 const started=Date.now();let previous=null,stableSince=started;
 while(Date.now()-started<timeoutMs){
  const current=(await page.locator('body').innerText()).trim();
  if(current!==previous){previous=current;stableSince=Date.now();}
  if(Date.now()-stableSince>=stableMs)return {stable:true,elapsedMs:Date.now()-started,text:current};
  await page.waitForTimeout(350);
 }
 return {stable:false,elapsedMs:Date.now()-started,text:previous||''};
}
async function advanceTo(page,marker,{maxSteps=10}={}){
  await page.mouse.move(viewport.width/2,viewport.height/2);
  for(let step=0;step<maxSteps;step++){
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(1800);
    const settle=await waitForStablePageText(page);
    const number=report.candidates.length+1;
    const candidateName=`sequence-step-${String(number).padStart(2,'0')}`;
    const path=resolve(output,`candidates/${candidateName}.png`);
    await mkdir(resolve(output,'candidates'),{recursive:true});
    const pageText=(await page.locator('body').innerText()).trim().replace(/\s+/g,' ').slice(0,500);
    await page.screenshot({path,fullPage:false,timeout:60000});
    report.candidates.push({name:candidateName,path:`reference/candidates/${candidateName}.png`,sourceUrl:page.url(),viewport,sceneIdentity:'unclassified visual candidate; inspect rendered pixels',pageTextStable:settle.stable,pageTextStableForMs:1300,settleElapsedMs:settle.elapsedMs,visiblePageText:pageText});
    if(await stableVisibleMarker(page,marker,{timeoutMs:1800}))return step+1;
  }
  return -1;
}
try{
  const launch={headless:true,args:process.env.CINEMATIC_SOFTWARE_WEBGL==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]};
  if(!process.env.CI&&!process.env.CINEMATIC_CHROMIUM)launch.channel='chrome';
  if(process.env.CINEMATIC_CHROMIUM)launch.executablePath=process.env.CINEMATIC_CHROMIUM;
  browser=await chromium.launch(launch);report.browser=browser.version();
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  await page.goto(sourceUrl,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>{
    const cta=document.querySelector('#custom-cta');
    return cta&&getComputedStyle(cta).opacity==='1'&&getComputedStyle(cta).pointerEvents==='auto';
  },null,{timeout:60000});
  await page.evaluate(()=>document.querySelector('#custom-cta')?.click());
  await page.waitForFunction(()=>document.body.innerText.includes('SCROLL TO BEGIN'),null,{timeout:30000});
  if(await advanceTo(page,'URBAN SYSTEMS')<0){
    report.unverified.push({scene:'urban-systems aerial terrain',reason:'No stable visible URBAN SYSTEMS heading was verified; inspect unclassified candidate frames.'});
  }else await captureVisible(page,{marker:'URBAN SYSTEMS',name:'urban-systems-aerial-terrain',content:'Heading verified in the viewport; inspect the screenshot for the rendered terrain and atmosphere composition.'});

  if(await advanceTo(page,'COMPUTE_CORE')<0){
    report.unverified.push({scene:'compute-core hardware reference',reason:'No stable visible COMPUTE_CORE heading was verified; inspect unclassified candidate frames.'});
  }else await captureVisible(page,{marker:'COMPUTE_CORE',name:'compute-core-hardware',content:'Heading verified in the viewport; this reference category is compute hardware, not an orbital spacecraft.'});

  for(const scene of ['Earth limb','orbital spacecraft','atmospheric spacecraft'])report.unverified.push({scene,reason:'Rendered candidate frames are included, but this scene has no stable visible text marker and was not automatically classified. Inspect the candidate images before treating the scene as verified.'});
  if(!report.candidates.length&&!report.captures.length)report.unavailable.push({scene:'reference frames',reason:'The browser produced no rendered screenshots from the source page.'});
  report.status=report.captures.length||report.candidates.length?'PASS_WITH_CANDIDATES':'UNAVAILABLE';
}catch(error){
  report.status='UNAVAILABLE';report.failure=error.message;
  for(const scene of ['Earth limb','orbital spacecraft','atmospheric spacecraft'])report.unverified.push({scene,reason:'The automated browser could not verify this scene identity; inspect any candidate screenshots.'});
  if(!report.candidates.length&&!report.captures.length)report.unavailable.push({scene:'reference frames',reason:'Reference browser access or rendering failed before a screenshot was captured.'});
}
finally{await browser?.close();await writeFile(resolve(output,'reference-report.json'),JSON.stringify(report,null,2));}
if(report.status==='UNAVAILABLE')process.exitCode=1;
console.log(`${report.status}: ${report.captures.length} scenes with visible headings, ${report.candidates.length} unclassified candidates, ${report.unverified.length} scenes needing visual review`);
