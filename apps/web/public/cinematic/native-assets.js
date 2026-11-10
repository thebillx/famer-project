import * as THREE from './vendor.js';
import {NATIVE_ASSET_MANIFEST, assertAssetIdentity} from './native-journey-manifest.js';

function assetUrl(path) {
  const base = globalThis.document?.baseURI || globalThis.location?.href || 'http://localhost/';
  return new URL(path, base).href;
}

function abortIfNeeded(signal) {
  if (signal.aborted) {
    throw signal.reason || new DOMException('The native journey load was aborted', 'AbortError');
  }
}

function normalizedName(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function createResourceOwner() {
  const roots = new Set();
  const parsers = new Set();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const shadows = new Set();
  let disposed = false;

  function collectMaterial(material) {
    if (!material) return;
    materials.add(material);
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
  }

  function collectRoot(root) {
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        collectMaterial(material);
      }
      if (object.shadow) shadows.add(object.shadow);
      if (object.skeleton?.boneTexture) textures.add(object.skeleton.boneTexture);
    });
  }

  function collectParser(parser) {
    for (const resource of parser.associations?.keys() || []) {
      if (resource.isTexture) textures.add(resource);
      if (resource.isMaterial) collectMaterial(resource);
      if (resource.isObject3D) collectRoot(resource);
    }
  }

  return {
    ownParser(parser) {
      parsers.add(parser);
    },
    ownGLTF(gltf) {
      for (const root of gltf.scenes || [gltf.scene]) {
        roots.add(root);
        collectRoot(root);
      }
      if (gltf.parser) {
        parsers.add(gltf.parser);
        collectParser(gltf.parser);
      }
    },
    ownTexture(texture) {
      textures.add(texture);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      roots.forEach(collectRoot);
      parsers.forEach(collectParser);
      const images = new Set();
      for (const texture of textures) {
        for (const image of Array.isArray(texture.image) ? texture.image : [texture.image]) {
          if (typeof image?.close === 'function') images.add(image);
        }
      }
      shadows.forEach(shadow => shadow.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      images.forEach(image => image.close());
      roots.clear();
      parsers.clear();
      geometries.clear();
      materials.clear();
      textures.clear();
      shadows.clear();
    },
  };
}

function expectedTextureSlots(material) {
  const pbr = material.pbrMetallicRoughness || {};
  const slots = [['map', pbr.baseColorTexture]];
  if (material.extensions?.KHR_materials_unlit) return slots;
  const specular = material.extensions?.KHR_materials_specular || {};
  return slots.concat([
    ['roughnessMap', pbr.metallicRoughnessTexture],
    ['metalnessMap', pbr.metallicRoughnessTexture],
    ['normalMap', material.normalTexture],
    ['aoMap', material.occlusionTexture],
    ['emissiveMap', material.emissiveTexture],
    ['specularIntensityMap', specular.specularTexture],
    ['specularColorMap', specular.specularColorTexture],
  ]);
}

function checkTextures(gltf, id) {
  const materials = new Set();
  for (const scene of gltf.scenes || [gltf.scene]) {
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    });
  }
  let expected = 0;
  let loaded = 0;
  for (const material of materials) {
    const index = gltf.parser?.associations.get(material)?.materials;
    const definition = gltf.parser?.json.materials?.[index];
    if (!definition) throw new Error(`Native ${id} material has no source association`);
    for (const [slot, textureInfo] of expectedTextureSlots(definition)) {
      if (!textureInfo) continue;
      expected++;
      const texture = material[slot];
      const image = texture?.image;
      if (texture?.isTexture && image?.width > 0 && image?.height > 0) loaded++;
    }
  }
  if (expected === 0) throw new Error(`Native ${id} has no authored textures`);
  if (loaded !== expected) {
    throw new Error(`Native ${id} texture validation failed (${loaded}/${expected})`);
  }
  return {expected, loaded};
}

function assertGLTF(definition, gltf) {
  const camera = gltf.cameras?.find(candidate => candidate.isPerspectiveCamera);
  if (!camera) throw new Error(`Native ${definition.id} is missing a perspective camera`);
  if (normalizedName(camera.name) !== normalizedName(definition.camera)) {
    throw new Error(`Native ${definition.id} camera mismatch`);
  }
  if (!gltf.animations?.length) {
    throw new Error(`Native ${definition.id} is missing animation data`);
  }
  const duration = Math.max(...gltf.animations.map(animation => animation.duration));
  if (!Number.isFinite(duration) || Math.abs(duration - definition.duration) > .001) {
    throw new Error(`Native ${definition.id} duration ${duration} does not match ${definition.duration}`);
  }
  if (!gltf.animations.some(animation => normalizedName(animation.name) === normalizedName(definition.animation))) {
    throw new Error(`Native ${definition.id} animation ${definition.animation} is missing`);
  }
  return {camera, duration, textures: checkTextures(gltf, definition.id)};
}

async function fetchBytes(definition, signal) {
  abortIfNeeded(signal);
  const response = await fetch(assetUrl(definition.url), {cache: 'no-store', signal});
  if (!response.ok) {
    throw new Error(`Native asset request failed in ${definition.id} (${response.status})`);
  }
  const bytes = await response.arrayBuffer();
  abortIfNeeded(signal);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  abortIfNeeded(signal);
  const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const identity = assertAssetIdentity(definition, {sha256, byte_length: bytes.byteLength});
  return {bytes, identity};
}

async function loadGLB(definition, signal, resources) {
  const {bytes, identity} = await fetchBytes(definition, signal);
  const loader = new THREE.GLTFLoader();
  loader.register(parser => {
    resources.ownParser(parser);
    return {name: 'NativeAssetResources'};
  });
  const gltf = await loader.parseAsync(bytes, new URL('.', assetUrl(definition.url)).href);
  // Parsing cannot be cancelled. Own its result before checking cancellation or metadata.
  resources.ownGLTF(gltf);
  abortIfNeeded(signal);
  const metadata = assertGLTF(definition, gltf);
  return {definition, gltf, metadata, identity};
}

async function loadHDR(definition, signal, resources) {
  const {bytes, identity} = await fetchBytes(definition, signal);
  const parsed = new THREE.RGBELoader().setDataType(THREE.HalfFloatType).parse(bytes);
  if (!parsed?.width || !parsed?.height || !parsed?.data?.length) {
    throw new Error('Native HDR environment is empty');
  }
  const texture = new THREE.DataTexture(
    parsed.data, parsed.width, parsed.height, THREE.RGBAFormat, THREE.HalfFloatType,
  );
  resources.ownTexture(texture);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  abortIfNeeded(signal);
  return {definition, texture, identity};
}

export async function loadNativeAssets({signal, onAssetLoaded = () => {}} = {}) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', relayAbort, {once: true});
  if (signal?.aborted) relayAbort();
  const resources = createResourceOwner();
  let firstFailure;
  try {
    const pending = NATIVE_ASSET_MANIFEST.map(async definition => {
      try {
        return definition.kind === 'glb'
          ? await loadGLB(definition, controller.signal, resources)
          : await loadHDR(definition, controller.signal, resources);
      } catch (error) {
        firstFailure ||= error;
        controller.abort(error);
        throw error;
      }
    });
    const settled = await Promise.allSettled(pending);
    if (firstFailure) throw firstFailure;
    abortIfNeeded(controller.signal);
    const loaded = settled.map(result => result.value);
    const assets = new Map();
    const identities = loaded.map(item => item.identity);
    for (const item of loaded) {
      if (item.definition.kind === 'glb') assets.set(item.definition.id, item);
    }
    for (const identity of identities) {
      abortIfNeeded(controller.signal);
      onAssetLoaded(identity);
    }
    abortIfNeeded(controller.signal);
    return {
      assets,
      environment: loaded.find(item => item.definition.id === 'field-world').texture,
      identities,
      dispose: resources.dispose,
    };
  } catch (error) {
    resources.dispose();
    throw error;
  } finally {
    signal?.removeEventListener('abort', relayAbort);
  }
}
