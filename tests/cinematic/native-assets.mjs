import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from '../../apps/web/public/cinematic/vendor.js';
import {loadNativeAssets} from '../../apps/web/public/cinematic/native-assets.js';
import {NATIVE_ASSET_MANIFEST} from '../../apps/web/public/cinematic/native-journey-manifest.js';

const sourceBytes = new Map(NATIVE_ASSET_MANIFEST.map(definition => {
  const buffer = readFileSync(new URL(`../../apps/web/public${definition.url}`, import.meta.url));
  return [definition.id, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)];
}));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

function pendingFetch(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  });
}

// Use real pinned bytes and source metadata, with small decoded objects for lifecycle tests.
function decodedFixture(definition, bytes) {
  const jsonLength = new DataView(bytes).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  const materialIndex = json.materials.findIndex(material => material.pbrMetallicRoughness?.baseColorTexture);
  const counts = {geometry: 0, material: 0, texture: 0, shadow: 0, image: 0};
  const image = {width: 1, height: 1, close() { counts.image++; }};
  const texture = new THREE.Texture(image);
  const material = new THREE.MeshBasicMaterial({map: texture});
  const geometry = new THREE.PlaneGeometry();
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const light = new THREE.DirectionalLight();
  light.shadow.map = new THREE.WebGLRenderTarget(1, 1);
  light.shadow.map.addEventListener('dispose', () => counts.shadow++);
  scene.add(light);
  const camera = new THREE.PerspectiveCamera();
  camera.name = definition.camera;
  scene.add(camera);
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  const parser = {
    json,
    associations: new Map([[material, {materials: materialIndex}], [texture, {textures: 0}]]),
  };
  const gltf = {
    scene,
    scenes: [scene],
    cameras: [camera],
    animations: [new THREE.AnimationClip(definition.animation, definition.duration, [])],
    parser,
  };
  return {gltf, counts, material};
}

function installDecoders(t, {beforeParseReturn = async () => {}, onHDR = () => {}} = {}) {
  const decoded = new Map();
  t.mock.method(THREE.GLTFLoader.prototype, 'parseAsync', async function(bytes) {
    const definition = NATIVE_ASSET_MANIFEST.find(asset => asset.byte_length === bytes.byteLength);
    const fixture = decodedFixture(definition, bytes);
    decoded.set(definition.id, fixture);
    this.pluginCallbacks.at(-1)(fixture.gltf.parser);
    await beforeParseReturn(definition, fixture);
    return fixture.gltf;
  });
  t.mock.method(THREE.RGBELoader.prototype, 'parse', function(bytes) {
    assert.equal(bytes, sourceBytes.get('field-world'));
    assert.equal(this.type, THREE.HalfFloatType);
    onHDR();
    return {width: 1, height: 1, data: new Uint16Array(4)};
  });
  return decoded;
}

function installFetch(t, handler = () => null) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const definition = NATIVE_ASSET_MANIFEST.find(asset => new URL(url).pathname === asset.url);
    assert.ok(definition);
    assert.equal(options.cache, 'no-store');
    requests.push({definition, signal: options.signal});
    const response = await handler(definition, options.signal);
    return response || {ok: true, arrayBuffer: async () => sourceBytes.get(definition.id)};
  });
  return requests;
}

function assertDisposed(fixture) {
  assert.deepEqual(fixture.counts, {geometry: 1, material: 1, texture: 1, shadow: 1, image: 1});
}

test('native asset ownership preserves successful resources until idempotent disposal', async t => {
  const decoded = installDecoders(t);
  const requests = installFetch(t);
  const controller = new AbortController();
  const removal = t.mock.method(controller.signal, 'removeEventListener');
  const loadedIdentities = [];
  const result = await loadNativeAssets({signal: controller.signal, onAssetLoaded: identity => loadedIdentities.push(identity)});
  assert.equal(requests.length, 5);
  assert.equal(result.assets.size, 4);
  assert.deepEqual(result.identities, loadedIdentities);
  assert.deepEqual(result.identities.map(identity => identity.id), NATIVE_ASSET_MANIFEST.map(asset => asset.id));
  assert.equal(result.environment.type, THREE.HalfFloatType);
  assert.equal(result.environment.format, THREE.RGBAFormat);
  assert.equal(result.environment.colorSpace, THREE.LinearSRGBColorSpace);
  assert.equal(result.environment.mapping, THREE.EquirectangularReflectionMapping);
  assert.equal(result.environment.flipY, true);
  assert.equal(result.environment.minFilter, THREE.LinearFilter);
  assert.equal(result.environment.magFilter, THREE.LinearFilter);
  assert.equal(result.environment.generateMipmaps, false);
  assert.equal(removal.mock.callCount(), 1);
  for (const fixture of decoded.values()) assert.equal(fixture.counts.texture, 0);
  let environmentDisposals = 0;
  result.environment.addEventListener('dispose', () => environmentDisposals++);
  controller.abort();
  assert.equal(requests[0].signal.aborted, false);
  result.dispose();
  result.dispose();
  for (const fixture of decoded.values()) assertDisposed(fixture);
  assert.equal(environmentDisposals, 1);
});

test('asset failure aborts sibling fetches and releases already parsed assets', async t => {
  const orbitReady = deferred();
  const hdrReady = deferred();
  const decoded = installDecoders(t, {
    beforeParseReturn: async definition => { if (definition.id === 'orbit') orbitReady.resolve(); },
    onHDR: () => hdrReady.resolve(),
  });
  const requests = installFetch(t, async (definition, signal) => {
    if (definition.id === 'regional') {
      await Promise.all([orbitReady.promise, hdrReady.promise]);
      return {ok: false, status: 503};
    }
    if (definition.id === 'field' || definition.id === 'clouds') return pendingFetch(signal);
    return null;
  });
  const disposedTextures = [];
  const originalDispose = THREE.DataTexture.prototype.dispose;
  t.mock.method(THREE.DataTexture.prototype, 'dispose', function() {
    disposedTextures.push(this);
    originalDispose.call(this);
  });
  await assert.rejects(loadNativeAssets(), /regional \(503\)/);
  assertDisposed(decoded.get('orbit'));
  assert.equal(disposedTextures.length, 1);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(request => request.signal.aborted));
});

test('abort during GLTF parsing waits for its result and releases it', async t => {
  const parsing = deferred();
  const finishParsing = deferred();
  const decoded = installDecoders(t, {
    beforeParseReturn: async () => {
      parsing.resolve();
      await finishParsing.promise;
    },
  });
  installFetch(t, (definition, signal) => definition.id === 'orbit' ? null : pendingFetch(signal));
  const controller = new AbortController();
  const removal = t.mock.method(controller.signal, 'removeEventListener');
  let settled = false;
  const operation = loadNativeAssets({signal: controller.signal});
  operation.then(() => { settled = true; }, () => { settled = true; });
  await parsing.promise;
  controller.abort(new DOMException('Cancelled while parsing', 'AbortError'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  finishParsing.resolve();
  await assert.rejects(operation, /Cancelled while parsing/);
  assertDisposed(decoded.get('orbit'));
  assert.equal(removal.mock.callCount(), 1);
});

test('a missing source-declared texture rejects and disposes the decoded GLTF', async t => {
  const decoded = installDecoders(t, {
    beforeParseReturn: async (definition, fixture) => { fixture.material.map = null; },
  });
  installFetch(t, (definition, signal) => definition.id === 'orbit' ? null : pendingFetch(signal));
  await assert.rejects(loadNativeAssets(), /orbit texture validation failed \(0\/1\)/);
  assertDisposed(decoded.get('orbit'));
});

test('a failed exact-byte identity check prevents decoding', async t => {
  const decoded = installDecoders(t);
  const requests = installFetch(t, (definition, signal) => {
    if (definition.id === 'orbit') {
      const changed = sourceBytes.get('orbit').slice(0);
      new Uint8Array(changed)[changed.byteLength - 1] ^= 1;
      return {ok: true, arrayBuffer: async () => changed};
    }
    return pendingFetch(signal);
  });
  await assert.rejects(loadNativeAssets(), /orbit identity mismatch/);
  assert.equal(decoded.size, 0);
  assert.ok(requests.every(request => request.signal.aborted));
});
