import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import {NATIVE_ASSET_MANIFEST,assertAssetIdentity} from '../../apps/web/public/cinematic/native-journey-manifest.js';
import {LEGACY_FIELD_CORNERS,nativeStageWeights,nativeTakeoverWeight,nativeTimeFromProgress,projectiveMap} from '../../apps/web/public/cinematic/native-timeline.js';
import {PARCEL_IDENTITIES,solveHomography} from '../../apps/web/public/cinematic/native-journey.js';

const root=resolve(new URL('../..',import.meta.url).pathname);

test('native manifest matches copied GLB/HDR bytes',()=>{
 assert.equal(NATIVE_ASSET_MANIFEST.length,5);
 for(const asset of NATIVE_ASSET_MANIFEST){
  const path=resolve(root,'apps/web/public',asset.url.replace(/^\/cinematic\//,'cinematic/'));
  const bytes=readFileSync(path);
  assert.equal(bytes.byteLength,asset.byte_length,asset.id);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.id);
  assert.deepEqual(assertAssetIdentity(asset,{sha256:asset.sha256,byte_length:asset.byte_length}),{id:asset.id,url:asset.url,kind:asset.kind,sha256:asset.sha256,byte_length:asset.byte_length});
 }
});

test('native absolute time and takeover are bounded and reversible',()=>{
 assert.equal(nativeTimeFromProgress(0),0);
 assert.equal(nativeTimeFromProgress(.30),0);
 assert.equal(nativeTimeFromProgress(.56),12);
 assert.equal(nativeTimeFromProgress(1),12);
 assert.equal(nativeTakeoverWeight(.30),0);
 assert.equal(nativeTakeoverWeight(.33),1);
 assert.equal(nativeTakeoverWeight(.29),0);
 assert.equal(nativeTakeoverWeight(.34),1);
 for(const p of [0,.30,.31,.33,.42,.56,1])assert.equal(nativeTimeFromProgress(p),nativeTimeFromProgress(p));
 assert.equal(nativeStageWeights(3.69).orbit,1);
 assert.equal(nativeStageWeights(3.81).regional,1);
 assert.equal(nativeStageWeights(7.69).regional,1);
 assert.equal(nativeStageWeights(7.81).field,1);
});

test('one homography maps legacy parcel corners and shared projected points',()=>{
 const target=[{x:.549,y:.587},{x:.736,y:.68},{x:.559,y:.759},{x:.403,y:.627}];
 const matrix=solveHomography(LEGACY_FIELD_CORNERS,target);
 LEGACY_FIELD_CORNERS.forEach((point,index)=>{
  const projected=projectiveMap(point,matrix);
  assert.ok(Math.abs(projected.x-target[index].x)<1e-8,`${index} x`);
  assert.ok(Math.abs(projected.y-target[index].y)<1e-8,`${index} y`);
 });
 const center=projectiveMap([0,0],matrix);
 assert.ok(center.x>.45&&center.x<.70);
 assert.ok(center.y>.60&&center.y<.74);
});

test('native parcel identity set remains fixed across seeks',()=>{
 assert.deepEqual(PARCEL_IDENTITIES,{top:{object:'V17 hero rice plot 0 2',vertex:3},right:{object:'V17 hero rice plot 5 2',vertex:2},bottom:{object:'V17 hero rice plot 5 0',vertex:1},left:{object:'V17 hero rice plot 0 0',vertex:0}});
});
