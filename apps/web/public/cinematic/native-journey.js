import * as THREE from './vendor.js';
import {loadNativeAssets} from './native-assets.js';
import {
  LEGACY_FIELD_CORNERS, clamp, nativeStageWeights, nativeTakeoverWeight,
  nativeTimeFromProgress, projectiveMap,
} from './native-timeline.js';

const AUTHORED_ASPECT = 16 / 9;
const EXPOSURE = 2 ** .15;
const ARRIVAL_BEACON = 'V17 arrival beacon';
// Vertex identities are bound to the exact field GLB in the asset manifest.
export const PARCEL_IDENTITIES = Object.freeze({
  top: {object: 'V17 hero rice plot 0 2', vertex: 3},
  right: {object: 'V17 hero rice plot 5 2', vertex: 2},
  bottom: {object: 'V17 hero rice plot 5 0', vertex: 1},
  left: {object: 'V17 hero rice plot 0 0', vertex: 0},
});

function normalizedName(name) {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function findNamed(scene, name) {
  const expected = normalizedName(name);
  let result;
  scene.traverse(object => {
    if (normalizedName(object.name) === expected) result = object;
  });
  if (!result) throw new Error(`Native object is missing: ${name}`);
  return result;
}

function configureMaterials(clip) {
  const landscape = clip.definition.id === 'field' || clip.definition.id === 'regional';
  const configured = new Set();
  clip.scene.updateMatrixWorld(true);
  clip.gltf.scene.traverse(object => {
    if (object.isMesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const unlit = materials.some(material => material.isMeshBasicMaterial);
      for (const material of materials) {
        if (configured.has(material)) continue;
        configured.add(material);
        if (material.alphaTest > 0) material.alphaToCoverage = true;
        if (material.isMeshBasicMaterial || clip.definition.id === 'clouds') {
          material.toneMapped = false;
          material.fog = false;
        } else if (landscape && material.isMeshStandardMaterial) {
          // Offscreen targets bypass the renderer's tone mapper. Preserve the
          // accepted reader's AgX PBR output before the final sRGB conversion.
          material.onBeforeCompile = shader => {
            shader.uniforms.toneMappingExposure = {value: EXPOSURE};
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>',
              `#include <common>\n${THREE.ShaderChunk.tonemapping_pars_fragment}`,
            ).replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);');
          };
          material.customProgramCacheKey = () => 'native-field-agx-v1';
          material.needsUpdate = true;
        }
        if (clip.definition.id === 'clouds') material.depthWrite = false;
      }
      object.castShadow = clip.definition.id !== 'clouds' && !unlit && !materials.some(material => material.transparent);
      object.receiveShadow = clip.definition.id !== 'clouds' && !unlit;
    }
    if (landscape && object.isDirectionalLight) {
      const direction = object.target.getWorldPosition(new THREE.Vector3())
        .sub(object.getWorldPosition(new THREE.Vector3())).normalize();
      const center = new THREE.Vector3(15, 0, -145);
      const position = center.clone().addScaledVector(direction, -1500);
      object.parent.worldToLocal(position);
      object.position.copy(position);
      clip.scene.add(object.target);
      object.target.position.copy(center);
      object.castShadow = true;
      object.shadow.mapSize.set(2048, 2048);
      Object.assign(object.shadow.camera, {left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 3000});
      object.shadow.bias = -.00005;
      object.shadow.normalBias = .3;
      object.shadow.camera.updateProjectionMatrix();
    }
  });
}

function createClip(asset, environment) {
  const scene = new THREE.Scene();
  scene.add(asset.gltf.scene);
  scene.background = asset.definition.id === 'clouds' ? null : new THREE.Color(0x01050b);
  if (asset.definition.id === 'regional' || asset.definition.id === 'field') {
    scene.environment = environment;
    scene.environmentRotation.y = Math.PI / 2;
    scene.environmentIntensity = .4;
    scene.add(new THREE.HemisphereLight(0xfff0cf, 0x324529, .7));
  }
  const camera = asset.metadata.camera;
  camera.aspect = AUTHORED_ASPECT;
  camera.updateProjectionMatrix();
  const mixer = new THREE.AnimationMixer(asset.gltf.scene);
  const actions = asset.gltf.animations.map(animation => {
    const action = mixer.clipAction(animation);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    return action;
  });
  const clip = {...asset, scene, camera, mixer, actions, localTime: 0};
  configureMaterials(clip);
  return clip;
}

function seekClip(clip, time) {
  const localTime = clamp(time - clip.definition.start, 0, clip.definition.duration);
  for (const action of clip.actions) {
    action.reset();
    action.enabled = true;
    action.paused = false;
    action.play();
  }
  clip.mixer.setTime(localTime);
  clip.scene.updateMatrixWorld(true);
  clip.localTime = localTime;
}

function instancePalms(field) {
  const groups = new Map();
  field.scene.updateMatrixWorld(true);
  field.gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    let ancestor = object.parent;
    while (ancestor && !normalizedName(ancestor.name).includes('v17destinationpalms')) ancestor = ancestor.parent;
    if (!ancestor) return;
    const key = `${object.geometry.uuid}/${object.material.uuid}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(object);
  });
  const instances = [];
  for (const meshes of groups.values()) {
    const source = meshes[0];
    const batch = new THREE.InstancedMesh(source.geometry, source.material, meshes.length);
    batch.name = `Native palm batch ${instances.length + 1}`;
    batch.castShadow = source.castShadow;
    batch.receiveShadow = source.receiveShadow;
    batch.frustumCulled = false;
    meshes.forEach((mesh, index) => {
      batch.setMatrixAt(index, mesh.matrixWorld);
      mesh.visible = false;
    });
    batch.instanceMatrix.needsUpdate = true;
    // This wrapper scene has an identity transform, so these world matrices
    // preserve every source palm and every material primitive exactly.
    field.scene.add(batch);
    instances.push(batch);
  }
  if (instances.length !== 4 || instances.some(batch => batch.count !== 22)) {
    throw new Error('Native palm batching does not match the verified field asset');
  }
  return instances;
}

function screenPoint(point, camera) {
  const projected = point.clone().project(camera);
  return {x: projected.x * .5 + .5, y: .5 - projected.y * .5};
}

function plateTarget(clip, name, point) {
  seekClip(clip, clip.definition.start);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(point.x * 2 - 1, 1 - point.y * 2), clip.camera);
  const hit = ray.intersectObject(findNamed(clip.gltf.scene, name), false)[0];
  if (!hit) throw new Error(`Native target is outside its plate: ${name}`);
  return hit.point;
}

function parcelVertices(field) {
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 6; column++) findNamed(field.gltf.scene, `V17 hero rice plot ${column} ${row}`);
  }
  return Object.fromEntries(Object.entries(PARCEL_IDENTITIES).map(([key, identity]) => {
    const mesh = findNamed(field.gltf.scene, identity.object);
    if (!mesh.geometry?.attributes.position || identity.vertex >= mesh.geometry.attributes.position.count) {
      throw new Error(`Native parcel vertex is missing: ${identity.object}`);
    }
    return [key, {mesh, vertex: identity.vertex}];
  }));
}

export function solveHomography(from, to) {
  const rows = [];
  const values = [];
  for (let index = 0; index < 4; index++) {
    const [x, y] = from[index];
    const {x: u, y: v} = to[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(u, v);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) throw new Error('Native parcel registration is degenerate');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    [values[column], values[pivot]] = [values[pivot], values[column]];
    const divisor = rows[column][column];
    for (let entry = column; entry < 8; entry++) rows[column][entry] /= divisor;
    values[column] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let entry = column; entry < 8; entry++) rows[row][entry] -= factor * rows[column][entry];
      values[row] -= factor * values[column];
    }
  }
  return [values.slice(0, 3), values.slice(3, 6), [...values.slice(6), 1]];
}

function createOverlay(boundary, evidenceMesh, evidenceUniforms) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const registration = {value: new THREE.Matrix3()};
  const vertexShader = `
    uniform mat3 registration;
    varying float column;
    void main() {
      vec3 mapped = registration * vec3(position.x, position.z, 1.0);
      vec2 point = mapped.xy / mapped.z;
      column = (floor((position.x + 2.46) / 4.86 * 8.0) + .5) / 8.0;
      gl_Position = vec4(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, 0.0, 1.0);
    }
  `;
  const boundaryMaterial = new THREE.ShaderMaterial({
    uniforms: {registration, opacity: {value: 0}, color: {value: boundary.material.color.clone()}},
    vertexShader,
    fragmentShader: `
      uniform float opacity;
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const boundaryMesh = new THREE.LineLoop(boundary.geometry, boundaryMaterial);
  boundaryMesh.frustumCulled = false;
  const evidenceMaterial = new THREE.ShaderMaterial({
    uniforms: {...evidenceUniforms, registration}, vertexShader,
    fragmentShader: `
      varying float column;
      uniform float comparison;
      uniform float opacity;
      uniform vec3 before;
      uniform vec3 after;
      void main() {
        float weight = smoothstep(column - .065, column + .065, comparison);
        gl_FragColor = vec4(mix(before, after, weight), opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const comparisonMesh = new THREE.Mesh(evidenceMesh.geometry, evidenceMaterial);
  comparisonMesh.frustumCulled = false;
  scene.add(comparisonMesh, boundaryMesh);
  return {scene, camera, registration, boundaryMesh, comparisonMesh, boundaryMaterial, evidenceMaterial};
}

export async function createNativeJourney({renderer, signal, onAssetLoaded, boundary, evidenceMesh, evidenceUniforms}) {
  const assets = await loadNativeAssets({signal, onAssetLoaded});
  const renderTargets = [];
  const ownedMaterials = [];
  const instances = [];
  const mixers = [];
  let disposed = false;
  let environmentTarget;
  let compositeGeometry;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mixer of mixers) mixer.stopAllAction();
    for (const instance of instances) instance.dispose();
    for (const target of renderTargets) target.dispose();
    for (const material of ownedMaterials) material.dispose();
    compositeGeometry?.dispose();
    environmentTarget?.dispose();
    assets.dispose();
  }
  try {
    // Finish environment convolution during loading, before the user scrolls.
    const generator = new THREE.PMREMGenerator(renderer);
    try { environmentTarget = generator.fromEquirectangular(assets.environment); }
    finally { generator.dispose(); }
    const clips = new Map();
    for (const [id, asset] of assets.assets) {
      const clip = createClip(asset, environmentTarget.texture);
      clips.set(id, clip);
      mixers.push(clip.mixer);
    }
    const field = clips.get('field');
    instances.push(...instancePalms(field));
    const vertices = parcelVertices(field);
    const beacon = findNamed(field.gltf.scene, ARRIVAL_BEACON);
    const targets = {
      orbit: plateTarget(clips.get('orbit'), 'Matte orbit distant backdrop', {x: .46875, y: .5}),
      regional: plateTarget(clips.get('regional'), 'Matte regional distant backdrop', {x: .71, y: .41}),
    };
    const overlay = createOverlay(boundary, evidenceMesh, evidenceUniforms);
    ownedMaterials.push(overlay.boundaryMaterial, overlay.evidenceMaterial);
    const samples = Math.min(4, renderer.capabilities.maxSamples);
    function makeTarget() {
      const target = new THREE.WebGLRenderTarget(1280, 720, {
        samples, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
        depthBuffer: true, stencilBuffer: false,
      });
      renderTargets.push(target);
      return target;
    }
    const stageTargets = {orbit: makeTarget(), regional: makeTarget(), field: makeTarget()};
    const cloudTarget = makeTarget();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        legacyTexture: {value: stageTargets.orbit.texture},
        orbitTexture: {value: stageTargets.orbit.texture},
        regionalTexture: {value: stageTargets.regional.texture},
        fieldTexture: {value: stageTargets.field.texture},
        cloudTexture: {value: cloudTarget.texture},
        nativeWeight: {value: 0}, stageWeights: {value: new THREE.Vector3(1, 0, 0)},
        fitScale: {value: new THREE.Vector2(1, 1)}, fitOffset: {value: new THREE.Vector2()},
        portraitField: {value: 0},
        toneMappingExposure: {value: renderer.toneMappingExposure},
      },
      vertexShader: `
        varying vec2 screenUv;
        void main() { screenUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        #include <tonemapping_pars_fragment>
        uniform sampler2D legacyTexture;
        uniform sampler2D orbitTexture;
        uniform sampler2D regionalTexture;
        uniform sampler2D fieldTexture;
        uniform sampler2D cloudTexture;
        uniform float nativeWeight;
        uniform vec3 stageWeights;
        uniform vec2 fitScale;
        uniform vec2 fitOffset;
        uniform float portraitField;
        varying vec2 screenUv;
        void main() {
          vec3 legacy = ACESFilmicToneMapping(texture2D(legacyTexture, screenUv).rgb);
          vec2 nativeUv = (screenUv - fitOffset) / fitScale;
          vec3 nativeColor = vec3(.0003, .0015, .0033);
          if (all(greaterThanEqual(nativeUv, vec2(0.0))) && all(lessThanEqual(nativeUv, vec2(1.0)))) {
            vec3 staged = texture2D(orbitTexture, nativeUv).rgb * stageWeights.x
              + texture2D(regionalTexture, nativeUv).rgb * stageWeights.y
              + texture2D(fieldTexture, nativeUv).rgb * stageWeights.z;
            vec4 cloud = texture2D(cloudTexture, nativeUv);
            nativeColor = staged * (1.0 - cloud.a) + cloud.rgb;
            // Portrait data controls sit below the authored field image. A
            // soft foreground falloff joins it to their dark background.
            float foreground = mix(1.0, smoothstep(0.0, .16, nativeUv.y), portraitField);
            nativeColor = mix(vec3(.0003, .0015, .0033), nativeColor, foreground);
          }
          gl_FragColor = vec4(mix(legacy, nativeColor, nativeWeight), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    });
    ownedMaterials.push(material);
    compositeGeometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(compositeGeometry, material);
    quad.frustumCulled = false;
    const compositeScene = new THREE.Scene();
    compositeScene.add(quad);
    const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let width = 1280, height = 720, pixelRatio = 1;
    let progress = 0, time = 0, weight = 0;
    let crop, homography, targetCss, visualCamera;
    const fieldPoints = [];
    function sourceToCss(point) {
      return {x: crop.offsetX + point.x * crop.displayWidth, y: crop.offsetY + point.y * crop.displayHeight};
    }
    function updateRegistration() {
      fieldPoints.length = 0;
      for (const {mesh, vertex} of Object.values(vertices)) {
        const point = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, vertex).applyMatrix4(mesh.matrixWorld);
        fieldPoints.push(screenPoint(point, field.camera));
      }
      const stageWeights = nativeStageWeights(time);
      const screenTargets = {
        orbit: screenPoint(targets.orbit, clips.get('orbit').camera),
        regional: screenPoint(targets.regional, clips.get('regional').camera),
        field: screenPoint(beacon.getWorldPosition(new THREE.Vector3()), field.camera),
      };
      const target = {x: 0, y: 0};
      for (const id of ['orbit', 'regional', 'field']) {
        target.x += screenTargets[id].x * stageWeights[id];
        target.y += screenTargets[id].y * stageWeights[id];
      }
      // Crop from the authored image. At the narrowest aspect, retain enough
      // image width for the complete parcel, with a small clear margin.
      const fieldSpan = Math.max(...fieldPoints.map(point => point.x)) - Math.min(...fieldPoints.map(point => point.x));
      const coverHeight = Math.max(height, width / AUTHORED_ASPECT);
      const fittedHeight = Math.min(coverHeight, width / (AUTHORED_ASPECT * (fieldSpan + .035)));
      const displayHeight = coverHeight + (fittedHeight - coverHeight) * stageWeights.field;
      const displayWidth = displayHeight * AUTHORED_ASPECT;
      const offsetX = Math.min(0, Math.max(width - displayWidth, width * .5 - target.x * displayWidth));
      const centeredOffsetY = (height - displayHeight) / 2;
      // Keep one stable portrait composition from arrival through the final
      // chapter, with the parcel between the heading and comparison controls.
      const portrait = width < 760 && height > width;
      const fieldOffsetY = portrait ? height * .39 - screenTargets.field.y * displayHeight : centeredOffsetY;
      const offsetY = centeredOffsetY + (fieldOffsetY - centeredOffsetY) * stageWeights.field;
      crop = {
        mode: portrait && stageWeights.field > 0 ? 'fit-parcel' : 'cover',
        u0: Math.max(0, -offsetX / displayWidth), u1: Math.min(1, (width - offsetX) / displayWidth),
        v0: Math.max(0, -offsetY / displayHeight), v1: Math.min(1, (height - offsetY) / displayHeight),
        offsetX, offsetY, displayWidth, displayHeight,
      };
      material.uniforms.fitScale.value.set(displayWidth / width, displayHeight / height);
      // Screen UV starts at the bottom, while DOM and sourceToCss start at top.
      material.uniforms.fitOffset.value.set(offsetX / width, (height - offsetY - displayHeight) / height);
      material.uniforms.portraitField.value = portrait ? stageWeights.field : 0;
      targetCss = sourceToCss(target);
      homography = solveHomography(LEGACY_FIELD_CORNERS, fieldPoints.map(point => {
        const css = sourceToCss(point);
        return {x: css.x / width, y: css.y / height};
      }));
      overlay.registration.value.set(...homography.flat());
      const activeId = stageWeights.field >= .5 ? 'field' : stageWeights.regional >= .5 ? 'regional' : 'orbit';
      const camera = clips.get(activeId).camera;
      visualCamera = {
        position: camera.getWorldPosition(new THREE.Vector3()).toArray(),
        quaternion: camera.getWorldQuaternion(new THREE.Quaternion()).toArray(),
        fov: camera.fov, aspect: camera.aspect,
      };
    }
    function resize(nextWidth, nextHeight, nextRatio = 1) {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      pixelRatio = nextRatio;
      const targetWidth = Math.min(1920, Math.ceil(Math.max(width, height * AUTHORED_ASPECT) * pixelRatio));
      for (const target of renderTargets) target.setSize(targetWidth, Math.ceil(targetWidth / AUTHORED_ASPECT));
      updateRegistration();
    }
    function applyFrame(frame) {
      if (disposed) throw new Error('Native journey has been disposed');
      progress = frame.progress;
      time = nativeTimeFromProgress(progress);
      weight = nativeTakeoverWeight(progress);
      for (const clip of clips.values()) seekClip(clip, time);
      if (frame.width !== width || frame.height !== height || frame.pixelRatio !== pixelRatio) {
        resize(frame.width, frame.height, frame.pixelRatio);
      } else updateRegistration();
      const weights = nativeStageWeights(time);
      material.uniforms.nativeWeight.value = weight;
      material.uniforms.stageWeights.value.set(weights.orbit, weights.regional, weights.field);
      overlay.boundaryMesh.visible = frame.boundaryVisible && weights.field > 0;
      overlay.boundaryMaterial.uniforms.opacity.value = frame.boundaryOpacity;
      overlay.comparisonMesh.visible = frame.evidenceVisible && !frame.insufficient && weights.field > 0;
      return {nativeWeight: weight, nativeTime: time, visualCamera, targetCss, crop};
    }
    function render(composer) {
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      const previousColor = renderer.getClearColor(new THREE.Color());
      const previousAlpha = renderer.getClearAlpha();
      try {
        if (weight < 1) {
          composer.render();
          material.uniforms.legacyTexture.value = composer.readBuffer.texture;
        }
        if (weight > 0) {
          const weights = nativeStageWeights(time);
          for (const id of ['orbit', 'regional', 'field']) {
            if (weights[id] === 0) continue;
            renderer.setRenderTarget(stageTargets[id]);
            renderer.autoClear = true;
            renderer.render(clips.get(id).scene, clips.get(id).camera);
          }
          const clouds = clips.get('clouds');
          renderer.setRenderTarget(cloudTarget);
          renderer.setClearColor(0, 0);
          renderer.autoClear = true;
          renderer.render(clouds.scene, clouds.camera);
        }
        renderer.setRenderTarget(null);
        renderer.autoClear = true;
        renderer.render(compositeScene, compositeCamera);
        if (weight > 0) {
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(overlay.scene, overlay.camera);
        }
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(previousColor, previousAlpha);
        renderer.autoClear = previousAutoClear;
      }
    }
    function snapshot() {
      const weights = material.uniforms.stageWeights.value;
      return {
        ready: true, assets: assets.identities,
        local_times: Object.fromEntries([...clips].map(([id, clip]) => [id, clip.localTime])),
        stage_weights: {orbit: weights.x, regional: weights.y, field: weights.z},
        palmInstances: instances.map(instance => ({name: instance.name, count: instance.count})),
        nativeWeight: weight, nativeTime: time, crop, visualCamera, targetCss,
        registration: {
          homography: homography.flat(), elements: [...overlay.registration.value.elements],
          identities: PARCEL_IDENTITIES, target: ARRIVAL_BEACON,
        },
      };
    }
    for (const clip of clips.values()) seekClip(clip, 0);
    resize(width, height, pixelRatio);
    return {
      applyFrame, render, resize, snapshot, dispose,
      projectFieldPoint(x, z) {
        const point = projectiveMap([x, z], homography);
        return {x: point.x * width, y: point.y * height};
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
