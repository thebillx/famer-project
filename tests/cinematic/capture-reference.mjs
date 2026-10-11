import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const output=process.argv[2];
if(!output)throw new Error('Pass an evidence output directory.');
const sourceUrl='https://edolus.com/';
const viewport={width:1440,height:900};
const report={status:'RUNNING',sourceUrl,viewport,captureMethod:'Playwright with headless Chromium',browser:null,captures:[],limitations:['Reference frames are captured headlessly at a fixed desktop viewport. They do not establish physical-device or non-headless rendering parity.']};
await mkdir(output,{recursive:true});
let browser;
try{
  const launch={headless:true,args:process.env.CINEMATIC_SOFTWARE_WEBGL==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]};
  if(!process.env.CI&&!process.env.CINEMATIC_CHROMIUM)launch.channel='chrome';
  if(process.env.CINEMATIC_CHROMIUM)launch.executablePath=process.env.CINEMATIC_CHROMIUM;
  browser=await chromium.launch(launch);report.browser=browser.version();
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  await page.goto(sourceUrl,{waitUntil:'domcontentloaded',timeout:60000});
  // The splash can temporarily stop rendering its percentage before the
  // interactive CTA is ready. Wait for the actual CTA to become interactive.
  await page.waitForFunction(()=>{
    const cta=document.querySelector('#custom-cta');
    return cta&&getComputedStyle(cta).opacity==='1'&&getComputedStyle(cta).pointerEvents==='auto';
  },null,{timeout:60000});
  // The CTA is a custom animated div, not a button. Calling its native DOM
  // click avoids Playwright's moving-target timeout while preserving the
  // site's real click handler.
  await page.evaluate(()=>{
    const cta=document.querySelector('#custom-cta');
    if(!cta)throw new Error('Edolus interactive CTA was not found.');
    cta.click();
  });
  await page.waitForFunction(()=>document.body.innerText.includes('SCROLL TO BEGIN'),null,{timeout:30000});
  await page.waitForTimeout(1800);
  let wheelDeltaY=0;
  for(const [name,delta] of [['earth-orbit',null],['spacecraft-close',1100],['atmospheric-interface',1800]]){
    if(delta!==null){await page.mouse.wheel(0,delta);wheelDeltaY+=delta;await page.waitForTimeout(1800);}
    const path=resolve(output,`${name}.png`);await page.screenshot({path,fullPage:false,timeout:60000});
    report.captures.push({name,path:`reference/${name}.png`,sourceUrl:page.url(),viewport,wheelDeltaY});
  }
  assert.equal(report.captures.length,3);report.status='PASS';
}catch(error){report.status='UNAVAILABLE';report.failure=error.message;process.exitCode=1;}
finally{await browser?.close();await writeFile(resolve(output,'reference-report.json'),JSON.stringify(report,null,2));}
console.log(`${report.status}: Edolus reference captures ${report.captures.length}/3`);
