#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};

const buildLogPath = valueFor('--build-log');
const sceneManifestPath = valueFor('--scene-manifest');
const maxHomepageKb = Number(process.env.CINEMATIC_MAX_FIRST_LOAD_KB || 130);
const maxSceneJsKb = Number(process.env.CINEMATIC_MAX_SCENE_JS_KB || 4);
const maxTextureKb = Number(process.env.CINEMATIC_MAX_TEXTURE_KB || 250);
const maxPosterKb = Number(process.env.CINEMATIC_MAX_POSTER_KB || 120);

if (!buildLogPath) {
  console.error('Usage: node scripts/check-cinematic-budget.mjs --build-log <next-build.log> [--scene-manifest <json>]');
  process.exit(2);
}

const buildLog = fs.readFileSync(buildLogPath, 'utf8');
const routeMatch = buildLog.match(/^[┌├└]\s+○\s+\/\s+[^\n]*?\s+(\d+)\s+kB\s*$/m);
if (!routeMatch) {
  console.error('Cinematic budget: could not find the homepage `/` First Load JS row in the Next build output.');
  process.exit(1);
}

const homepageFirstLoadKb = Number(routeMatch[1]);
console.log(`homepage / First Load JS: ${homepageFirstLoadKb} kB (limit ${maxHomepageKb} kB)`);
if (homepageFirstLoadKb > maxHomepageKb) {
  console.error(`Cinematic budget exceeded: homepage First Load JS ${homepageFirstLoadKb} kB > ${maxHomepageKb} kB.`);
  process.exit(1);
}

if (!sceneManifestPath) {
  console.log('per-scene budget: deferred until a ten-scene asset manifest is supplied');
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(sceneManifestPath, 'utf8'));
if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== 10) {
  console.error('Cinematic budget: scene manifest must contain exactly 10 scenes.');
  process.exit(1);
}
if (manifest.residentTextures > 2) {
  console.error(`Cinematic budget: resident textures ${manifest.residentTextures} > 2.`);
  process.exit(1);
}
if (manifest.webglContexts !== 1) {
  console.error(`Cinematic budget: WebGL contexts ${manifest.webglContexts} != 1.`);
  process.exit(1);
}

let failed = false;
for (const scene of manifest.scenes) {
  const jsKb = scene.jsBytes / 1024;
  const textureKb = scene.textureBytes / 1024;
  const posterKb = scene.posterBytes / 1024;
  console.log(`${scene.id}: js=${jsKb.toFixed(2)} kB texture=${textureKb.toFixed(2)} kB poster=${posterKb.toFixed(2)} kB`);
  if (jsKb > maxSceneJsKb) {
    console.error(`${scene.id}: JS ${jsKb.toFixed(2)} kB > ${maxSceneJsKb} kB.`);
    failed = true;
  }
  if (textureKb > maxTextureKb) {
    console.error(`${scene.id}: texture ${textureKb.toFixed(2)} kB > ${maxTextureKb} kB.`);
    failed = true;
  }
  if (posterKb > maxPosterKb) {
    console.error(`${scene.id}: poster ${posterKb.toFixed(2)} kB > ${maxPosterKb} kB.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('Cinematic budget: PASS');
