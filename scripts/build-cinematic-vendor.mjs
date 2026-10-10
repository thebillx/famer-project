// Reproduce the local vendor from the supplied, already-installed toolchain.
// Usage: node scripts/build-cinematic-vendor.mjs /absolute/path/to/prototype
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const toolchain = process.argv[2];
if (!toolchain) throw new Error('Provide the existing prototype toolchain path; this script never installs dependencies.');
const require = createRequire(resolve(toolchain, 'package.json'));
const threeRoot = resolve(dirname(require.resolve('three')), '..');
const { version } = JSON.parse(await readFile(resolve(threeRoot, 'package.json'), 'utf8'));
if (version !== '0.170.0') throw new Error(`Expected supplied Three.js 0.170.0, got ${version}`);
const { build } = require('esbuild');
const addons = [
 ['RoomEnvironment','environments/RoomEnvironment.js'],
 ['EffectComposer','postprocessing/EffectComposer.js'],
 ['RenderPass','postprocessing/RenderPass.js'],
 ['UnrealBloomPass','postprocessing/UnrealBloomPass.js'],
 ['OutputPass','postprocessing/OutputPass.js'],
 ['RoundedBoxGeometry','geometries/RoundedBoxGeometry.js'],
 ['mergeGeometries','utils/BufferGeometryUtils.js'],
];
const input = `export * from ${JSON.stringify(resolve(threeRoot,'build/three.module.js'))};\n` + addons.map(([name,path]) => `export {${name}} from ${JSON.stringify(resolve(threeRoot,'examples/jsm',path))};`).join('\n');
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({stdin:{contents:input,resolveDir:threeRoot,loader:'js'},bundle:true,format:'esm',minify:true,legalComments:'inline',outfile:resolve(repository,'apps/web/public/cinematic/vendor.js')});
await writeFile(resolve(repository,'apps/web/public/cinematic/THREE-LICENSE.txt'), await readFile(resolve(threeRoot,'LICENSE')));
