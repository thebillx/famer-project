// Compare the same capture protocol on two source trees; counters are not FPS.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=process.argv[2];
if(!root)throw new Error('Pass the evidence directory containing before/.');
const json=path=>readFile(path,'utf8').then(JSON.parse);
const [before,after,bt,at]=await Promise.all([
 json(join(root,'before/browser-report.json')),json(join(root,'browser-report.json')),
 json(join(root,'before/timing-diagnostics.json')),json(join(root,'timing-diagnostics.json')),
]);
const report={baselineSha:before.checkedOutSha,currentSha:after.checkedOutSha,
 browser:{before:before.browser,after:after.browser},
 limitations:['rAF intervals include browser scheduling and capture overhead, not isolated GPU time.','SwiftShader/emulated viewports do not establish hardware performance.','Screenshots and timing probes use the same harness and viewport on both builds.'],
 counters:[],timing:[]};
for(const [index,sample] of (after.rendererSamples||[]).entries()){
 const prior=before.rendererSamples?.[index];
 if(prior&&prior.shot===sample.shot)report.counters.push({shot:sample.shot,viewport:index<10?'desktop':'small-mobile',before:prior.renderer,after:sample.renderer});
}
for(const sample of at.frameProbes||[]){
 const prior=bt.frameProbes?.find(p=>p.progress===sample.progress&&p.recording===sample.recording&&JSON.stringify(p.viewport)===JSON.stringify(sample.viewport));
 if(prior)report.timing.push({progress:sample.progress,recording:sample.recording,viewport:sample.viewport,sameRenderer:sample.renderer===prior.renderer,before:{interval:prior.intervalStatsMs,submission:prior.submissionStatsMs},after:{interval:sample.intervalStatsMs,submission:sample.submissionStatsMs}});
}
report.captureOverhead={before:bt.captureOperations,after:at.captureOperations};
await mkdir(join(root,'comparison'),{recursive:true});
await writeFile(join(root,'comparison/renderer-comparison.json'),JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({...(!process.env.CI?{channel:'chrome'}:{}),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 for(const viewport of ['desktop','small-mobile']){
  const items=[];
  for(const shot of ['05','06','07'])for(const side of ['before','after']){
   const file=join(root,...(side==='before'?['before']:[]),viewport,`shot-${shot}.png`);
   items.push(`<figure><figcaption>${side.toUpperCase()} · SHOT ${shot}</figcaption><img src="data:image/png;base64,${(await readFile(file)).toString('base64')}"></figure>`);
  }
  await page.setContent(`<style>body{margin:0;padding:20px;background:#09131b;color:white;font:16px system-ui}main{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0}img{width:100%}figcaption{padding:8px}</style><h1>${viewport} · Matched terrain shots 5, 6 and 7</h1><main>${items.join('')}</main>`);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await page.screenshot({path:join(root,'comparison',`${viewport}-before-after.png`),fullPage:true});
 }
}finally{await browser.close();}
console.log('PASS matched comparisons and renderer timing report');
