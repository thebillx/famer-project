#!/usr/bin/env node
/** Export the locked static-review cameras from the production timeline.
 *
 * This deliberately imports the browser timeline instead of maintaining a
 * second set of camera coordinates in Blender.  The scene-state values below
 * mirror main.js and are regression checked against the QA browser snapshot.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as THREE from '../../../apps/web/public/cinematic/vendor.js';
import {sampleCamera,sampleSpacecraft,smooth} from '../../../apps/web/public/cinematic/timeline.js';

const root=resolve(import.meta.dirname,'../../..');
const output=resolve(process.argv[2]??resolve(import.meta.dirname,'camera-contract.json'));
const files=['apps/web/public/cinematic/timeline.js','apps/web/public/cinematic/main.js'];
const sha256=file=>createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex');
const locked=[
  {shot:1,progress:0,slug:'earth-value'},
  {shot:3,progress:.22,slug:'spacecraft-payload'},
  {shot:4,progress:.36,slug:'thailand-lock'},
  {shot:5,progress:.46,slug:'atmospheric-descent'},
  {shot:6,progress:.56,slug:'sample-field-boundary'},
  {shot:10,progress:.95,slug:'application-handoff'},
];
const viewports=[
  {name:'desktop',width:1440,height:900,textSafe:{left:64,top:102,right:720,bottom:836}},
  {name:'mobile',width:375,height:667,textSafe:{left:20,top:82,right:355,bottom:638}},
];

function state(progress){
  const craft=sampleSpacecraft(progress);
  const position=craft.position.toArray(),attitude=craft.quaternion;
  const descent=smooth(.41,.56,progress),agriculturalLight=smooth(.43,.57,progress);
  return {
    spacecraft:{visible:progress<.50,position,quaternion:attitude.toArray(),deployment:craft.deployment,activation:craft.activation},
    earth:{surfaceVisible:progress<.455,cloudVisible:progress<.49,
      cloudOpacity:.38*(1-smooth(.35,.49,progress)),cloudRotation:.008*smooth(.20,.49,progress),
      cloudShadowOpacity:.16*(1-smooth(.35,.49,progress)),
      thailandFocusOpacity:progress<.455?.72*smooth(.31,.355,progress)*(1-smooth(.425,.455,progress)):0,
      atmosphereOpacity:1-smooth(.41,.53,progress)},
    terrain:{visible:progress>=.405,localDetail:smooth(.385,.455,progress),flatten:.92*smooth(.465,.59,progress)},
    lighting:{sun:2.4-.12*agriculturalLight,fill:.66+.12*agriculturalLight,
      hemisphere:.56+.12*agriculturalLight,environment:.70+.08*agriculturalLight},
    atmosphere:{fogDensity:.00055+descent*.0073,
      backgroundMix:descent,from:'#060d15',to:'#13282f',fogFrom:'#101c29',fogTo:'#354b50'},
  };
}

const cameras=[];
for(const lock of locked)for(const viewport of viewports){
  const camera=sampleCamera(lock.progress,viewport.width/viewport.height);
  cameras.push({...lock,viewport:viewport.name,width:viewport.width,height:viewport.height,
    position:camera.position.toArray(),target:camera.target.toArray(),fov:camera.fov,roll:camera.roll,
    textSafe:viewport.textSafe,scene:state(lock.progress)});
}

const contract={
  schema:1,
  coordinateSystem:'Runtime right-handed coordinates (x right, y up, z forward); Blender conversion is (x,-z,y).',
  narrativeSequenceLocked:false,
  motionPolishExcluded:false,
  generatedFrom:Object.fromEntries(files.map(file=>[file,sha256(file)])),
  thailandAnchor:{latitude:15.87,longitude:100.99,source:'apps/web/public/cinematic/earth.js'},
  cameras,
};
writeFileSync(output,JSON.stringify(contract,null,2)+'\n');
console.log(`Wrote ${output} with ${cameras.length} locked camera records.`);
