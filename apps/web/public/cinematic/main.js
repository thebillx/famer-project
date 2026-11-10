import * as THREE from './vendor.js';
import {buildSpacecraft} from './spacecraft.js';
import {buildEarth,buildStarfield} from './earth.js';
import {loadMeshData,loadSurfaceMaps} from './mesh-assets.js';
import {spaceEnvironment} from './space-light.js';
import {SHOTS,sampleCamera,sampleSpacecraft,clamp,smooth} from './timeline.js';

const HASH_PROGRESS = {orbit:0,mission:.34,field:.95};

// One instance owns its listeners, animation frame and GPU resources.
export function mountJourney(root) {
  const controller = new AbortController();
  const listen = (element,event,handler,options={}) => element.addEventListener(event,handler,{...options,signal:controller.signal});
  const $ = id => root.querySelector(`#${id}`);
  const params = new URLSearchParams(location.search);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const diagnostic = params.has('qa');
  const resources = new Set();
  const state = {};
  let renderer,composer,scene,camera,earth,spacecraft,stars,craftFill;
  let disposed = false, initializing = false, active = false, assetEpoch = 0;
  let reduced = media.matches || params.get('motion') === 'reduce';
  let progress = 0, target = 0, raf = 0, last = 0, frames = 0, shotIndex = -1;
  let focusField = false;

  const range = () => Math.max(1,$('journey').offsetHeight-innerHeight);
  const moveTo = (p,behavior='instant') => scrollTo({top:root.offsetTop+clamp(p)*range(),behavior});
  const getProgress = () => clamp((scrollY-root.offsetTop)/range());
  function writeDiagnostics(extra) {
    Object.assign(state,extra);
    if(diagnostic) $('diagnostics').textContent = JSON.stringify(state);
  }

  function showElement(element,opacity,focusTarget) {
    if(opacity < .5 && element.contains(document.activeElement)) {
      focusTarget.focus({preventScroll:true});
    }
    element.style.opacity = opacity;
    element.style.visibility = opacity > 0 ? 'visible' : 'hidden';
    element.inert = opacity < .5;
  }

  function fallback(reason,voluntary=false) {
    active = false;
    cancelAnimationFrame(raf);
    root.classList.remove('preparing');
    root.classList.add('static-mode');
    $('fallback').hidden = false;
    if($('field-panel').contains(document.activeElement) || $('rail').contains(document.activeElement)) {
      $('fallback').focus({preventScroll:true});
    }
    $('rail').inert = true;
    $('field-panel').inert = true;
    root.querySelector('.skip').href = '#fallback';
    $('loading').hidden = true;
    $('fallback-reason').textContent = reason;
    $('motion').textContent = 'เปิดประสบการณ์ 3D';
    $('motion').setAttribute('aria-pressed',String(voluntary));
    $('resume').hidden = !voluntary;
    $('motion').hidden = !voluntary;
    focusField = false;
    moveTo(0);
    writeDiagnostics({ready:true,mode:'static',reason});
  }

  function releaseResources() {
    assetEpoch++;
    const geometries = new Set(), materials = new Set(), textures = new Set(resources);
    scene?.traverse(object => {
      if(object.geometry) geometries.add(object.geometry);
      object.shadow?.map?.dispose();
      for(const material of (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)) {
        materials.add(material);
        for(const value of Object.values(material)) if(value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    composer?.passes.forEach(pass => pass.dispose?.());
    composer?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    resources.clear();
    $('rail').replaceChildren();
    renderer = composer = scene = camera = earth = spacecraft = stars = craftFill = undefined;
  }

  function resizeViewport() {
    renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760 ? 1.25 : 1.5));
    renderer.setSize(innerWidth,innerHeight);
    composer.setSize(innerWidth,innerHeight);
    camera.aspect = innerWidth/innerHeight;
    writeDiagnostics({renderPixelRatio:renderer.getPixelRatio()});
  }

  function renderScene() {
    renderer.info.reset();
    composer.render();
    writeDiagnostics({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
  }

  function apply(p) {
    const key = sampleCamera(p,innerWidth/innerHeight);
    // Account for the browser rounding an anchor's scroll offset to a CSS pixel.
    const shot = SHOTS.reduce((current,item,index) => p+1/range()>=item.p ? index : current,0);
    camera.position.copy(key.position);
    camera.fov = key.fov;
    camera.lookAt(key.target);
    camera.rotateZ(key.roll);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const craft = sampleSpacecraft(p);
    spacecraft.position.copy(craft.position);
    spacecraft.quaternion.copy(craft.quaternion);
    spacecraft.userData.apply?.(craft);
    const cameraSide = key.position.clone().sub(craft.position).normalize();
    craftFill.position.copy(craft.position).addScaledVector(cameraSide,5.5).add(new THREE.Vector3(-2,2,0));
    earth.userData.clouds.rotation.y = .008*smooth(.20,.90,p);
    earth.userData.highClouds.rotation.y = .006+.012*smooth(.20,.90,p);
    earth.userData.cloudShadow.rotation.y = earth.userData.clouds.rotation.y-.0018;

    const activeRail = $('rail').children[shot];
    const fieldOpacity = smooth(.88,.95,p);
    showElement($('field-panel'),fieldOpacity,activeRail);
    showElement($('narrative'),1-smooth(.84,.88,p),activeRail);
    showElement($('begin'),1-smooth(.035,.065,p),activeRail);
    if(focusField && fieldOpacity>=.5) {
      $('inspect-field').focus({preventScroll:true});
      focusField = false;
    }

    const instrumentVisible = shot===4 && p<.88;
    const instrument = $('instrument');
    instrument.style.opacity = instrumentVisible ? 1-smooth(.85,.88,p) : 0;
    instrument.style.visibility = instrumentVisible ? 'visible' : 'hidden';
    const payload = spacecraft.localToWorld(spacecraft.userData.payloadPosition.clone()).project(camera);
    instrument.style.left = `${clamp((payload.x*.5+.5)*innerWidth-27,24,innerWidth-230)}px`;
    instrument.style.top = `${clamp((-payload.y*.5+.5)*innerHeight-27,110,innerHeight*.48)}px`;

    if(shot!==shotIndex) {
      shotIndex = shot;
      const item = SHOTS[shot];
      $('eyebrow').textContent = `${String(shot+1).padStart(2,'0')} / 05 · ${item.name}`;
      if(shot===0) $('title').innerHTML = 'มองเห็นความเปลี่ยนแปลง<br><span>จากวงโคจรถึงแปลงจริง</span>';
      else $('title').textContent = item.thai;
      $('description').textContent = item.text;
      $('chapter').textContent = `${item.name} / ${String(shot+1).padStart(2,'0')}`;
    }
    [...$('rail').children].forEach((button,index) => button.setAttribute('aria-current',String(index===shot)));
    $('bottom-left').firstChild.textContent = p<.08 ? 'SCROLL TO EXPLORE ' : p>=.88 ? 'FROM ORBIT TO YOUR FIELD ' : 'EARTH OBSERVATION / THAILAND ';
    writeDiagnostics({
      p:+p.toFixed(6),shot:shot+1,camera:camera.position.toArray(),look:key.target.toArray(),fov:camera.fov,roll:key.roll,
      attitude:spacecraft.quaternion.toArray(),spacecraftPosition:spacecraft.position.toArray(),spacecraftVisible:spacecraft.visible,
      earthOpacity:earth.userData.surface.material.opacity,atmosphere:earth.userData.atmosphere.material.uniforms.opacity.value,
      cloudOpacity:earth.userData.clouds.material.opacity,cloudRotation:earth.userData.clouds.rotation.y,
      starsVisible:stars.visible,starsOpacity:stars.material.opacity,fieldOpacity,viewport:[innerWidth,innerHeight],
    });
  }

  function animate(time) {
    if(!active) return;
    raf = requestAnimationFrame(animate);
    if(document.hidden) return;
    const dt = Math.max(0,Math.min((time-last)/1000,.1));
    last = time;
    target = getProgress();
    const next = progress+(target-progress)*(1-Math.exp(-10*dt));
    const previous = progress;
    progress = Math.abs(target-next)<.00002 ? target : next;
    if(progress!==previous || focusField || frames++<3) {
      apply(progress);
      renderScene();
    }
  }

  function activate(initial=progress) {
    root.classList.remove('static-mode','preparing');
    $('fallback').hidden = true;
    $('loading').hidden = true;
    $('rail').inert = false;
    $('motion').hidden = false;
    root.querySelector('.skip').href = '#field';
    resizeViewport();
    moveTo(initial);
    target = getProgress();
    progress = target;
    apply(progress);
    renderScene();
    active = true;
    last = performance.now();
    writeDiagnostics({ready:true,mode:'webgl'});
    animate(last);
  }

  async function init() {
    if(disposed || initializing) return;
    if(renderer && composer) { activate(); return; }
    initializing = true;
    const epoch = ++assetEpoch;
    root.classList.add('preparing');
    $('loading').hidden = false;
    try {
      renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = .98;
      renderer.info.autoReset = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      $('scene-root').appendChild(renderer.domElement);
      listen(renderer.domElement,'webglcontextlost',event => {
        event.preventDefault();
        if(active && !disposed) fallback('การแสดงผล 3D หยุดชั่วคราว กรุณาโหลดหน้าใหม่เพื่อเริ่มอีกครั้ง');
      });
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060d15);
      camera = new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.08,450);
      const loader = new THREE.TextureLoader();
      let loaded = 0;
      const complete = () => {
        if(!disposed && epoch===assetEpoch) $('loading-progress').style.width = `${++loaded/5*100}%`;
      };
      const textures = await Promise.all(['earth-day.jpg','earth-clouds.jpg','earth-night.png'].map(async file => {
        const texture = await loader.loadAsync(`/cinematic/textures/${file}`);
        if(disposed || epoch!==assetEpoch) texture.dispose();
        else resources.add(texture);
        complete();
        return texture;
      }));
      if(disposed || epoch!==assetEpoch) return;
      const ship = await loadMeshData('spacecraft',controller.signal);
      complete();
      if(disposed || epoch!==assetEpoch) return;
      const surfaceMaps = await loadSurfaceMaps([ship],loader);
      for(const set of Object.values(surfaceMaps)) for(const texture of Object.values(set)) {
        if(disposed || epoch!==assetEpoch) texture.dispose();
        else resources.add(texture);
      }
      complete();
      if(disposed || epoch!==assetEpoch) return;
      const [day,clouds,night] = textures;
      textures.forEach(texture => {
        texture.colorSpace = texture===clouds ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
      });
      const environment = spaceEnvironment(renderer);
      scene.environment = environment.texture;
      scene.environmentIntensity = .70;
      resources.add(environment);
      scene.add(new THREE.HemisphereLight(0xb3d8ee,0x1b2618,.56));
      const sun = new THREE.DirectionalLight(0xffead4,1.85);
      sun.position.set(-30,30,18);
      sun.castShadow = true;
      sun.shadow.mapSize.set(innerWidth<760 ? 1024 : 2048,innerWidth<760 ? 1024 : 2048);
      Object.assign(sun.shadow.camera,{near:1,far:120,left:-19,right:19,top:25,bottom:-19});
      sun.shadow.bias = -.00012;
      sun.shadow.normalBias = .003;
      sun.shadow.radius = 5;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7faed2,1.05);
      fill.position.set(20,18,-15);
      scene.add(fill);
      craftFill = new THREE.PointLight(0xc4dded,90,22,2);
      scene.add(craftFill);
      earth = buildEarth({day,clouds,night});
      earth.userData.surface.material.opacity = 1;
      earth.userData.atmosphere.material.uniforms.opacity.value = 1;
      earth.userData.clouds.material.opacity = .30;
      earth.userData.highClouds.material.opacity = .12;
      earth.userData.cloudShadow.material.opacity = .12;
      earth.userData.thailandFocus.visible = false;
      scene.add(earth);
      stars = buildStarfield();
      stars.material.opacity = .78;
      scene.add(stars);
      spacecraft = buildSpacecraft(ship,surfaceMaps);
      scene.add(spacecraft);
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene,camera));
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.10,.35,1.5));
      composer.addPass(new THREE.OutputPass());
      for(const [index,shot] of SHOTS.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label',`ช็อต ${index+1}: ${shot.thai}`);
        button.innerHTML = '<i></i>';
        listen(button,'click',() => moveTo(shot.p,'smooth'));
        $('rail').appendChild(button);
      }
      const hashProgress = HASH_PROGRESS[location.hash.slice(1)];
      const initial = params.has('shot') ? SHOTS[clamp(Math.floor(Number(params.get('shot'))||1)-1,0,SHOTS.length-1)].p
        : params.has('p') ? clamp(Number(params.get('p'))||0) : hashProgress ?? getProgress();
      const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
      writeDiagnostics({assets:5,model:spacecraft.userData.asset,gpu:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),devicePixelRatio,renderPixelRatio:renderer.getPixelRatio(),browser:navigator.userAgent});
      if(!reduced) activate(initial);
    } catch(error) {
      if(!disposed) {
        releaseResources();
        console.error('[AgriScope]',error);
        fallback('อุปกรณ์นี้แสดงภาพ 3D ไม่ได้ คุณยังอ่านวิธีติดตามแปลงและดูข้อมูลตัวอย่างได้');
      }
    } finally {
      initializing = false;
    }
  }

  const resume = () => {
    reduced = false;
    $('motion').textContent = 'ลดการเคลื่อนไหว';
    $('motion').setAttribute('aria-pressed','false');
    init();
  };
  listen(window,'resize',() => {
    if(!renderer || !active) return;
    resizeViewport();
    progress = target = getProgress();
    apply(progress);
    renderScene();
  });
  listen(window,'scroll',() => { target = getProgress(); },{passive:true});
  listen(document,'visibilitychange',() => { last = performance.now(); });
  listen($('motion'),'click',() => {
    if(reduced) resume();
    else { reduced = true; fallback('เปิดโหมดลดการเคลื่อนไหว แสดงวิธีติดตามแปลงและข้อมูลตัวอย่าง',true); }
  });
  listen($('resume'),'click',resume);
  listen(media,'change',event => {
    reduced = event.matches;
    if(reduced) fallback('แสดงวิธีติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);
    else resume();
  });
  listen(root.querySelector('.loading-skip'),'click',event => {
    event.preventDefault();
    reduced = true;
    fallback('ติดตามแปลงด้วยข้อมูลดาวเทียม ก่อนลงตรวจพื้นที่จริง',true);
    $('fallback').focus({preventScroll:true});
  });
  listen($('inspect-field'),'click',() => {
    const trend = $('trend');
    trend.hidden = !trend.hidden;
    $('inspect-field').setAttribute('aria-expanded',String(!trend.hidden));
    $('inspect-field').textContent = trend.hidden ? 'ดูแนวโน้มแปลงตัวอย่าง' : 'ซ่อนแนวโน้มแปลงตัวอย่าง';
  });
  for(const link of root.querySelectorAll('a[href^="#"]')) listen(link,'click',event => {
    const id = link.getAttribute('href').slice(1), checkpoint = HASH_PROGRESS[id];
    if(checkpoint===undefined) return;
    event.preventDefault();
    if(reduced || !active) { $('fallback').focus({preventScroll:true}); return; }
    focusField = id==='field';
    moveTo(checkpoint,'smooth');
    history.replaceState(null,'',`#${id}`);
  });
  const diagnostics = {
    snapshot:() => structuredClone(state),sampleCamera,SHOTS,
    seekCheckpoint:p => {
      if(!active) throw new Error('Journey is not active');
      moveTo(p);
      progress = target = getProgress();
      apply(progress);
      renderScene();
      return structuredClone(state);
    },
  };
  if(diagnostic) window.__agriscope = diagnostics;
  if(reduced) fallback('แสดงขั้นตอนติดตามแปลงตามการตั้งค่าลดการเคลื่อนไหวของคุณ',true);
  else init();
  return () => {
    disposed = true;
    active = false;
    controller.abort();
    cancelAnimationFrame(raf);
    if(window.__agriscope===diagnostics) delete window.__agriscope;
    releaseResources();
  };
}
