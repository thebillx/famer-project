// SHA-bound native descent inputs.  The digest is checked against the exact
// ArrayBuffer passed to GLTFLoader/RGBELoader before parsing.
export const NATIVE_ASSET_MANIFEST = Object.freeze([
 {id:'orbit',kind:'glb',url:'/cinematic/models/native-descent/orbit.glb',sha256:'15705fd6e820be7ce07f058614fae70fd8e979bcffd3672a235ccad9ee80bfdd',byte_length:2524292,start:0,duration:4.5,camera:'CAM_SHOT_01_DESKTOP_EARTH_VALUE',source_camera:'DATA_CAM_SHOT_01_DESKTOP_EARTH_VALUE',animation:'CAM_SHOT_01_DESKTOP_EARTH_VALUE'},
 {id:'regional',kind:'glb',url:'/cinematic/models/native-descent/regional.glb',sha256:'094a139f754543ff91258357d95520ef52a138f8ce2505cd5c3715cf75df6565',byte_length:2195860,start:3,duration:5.5,camera:'Regional camera',source_camera:'Camera',animation:'Regional camera'},
 {id:'field',kind:'glb',url:'/cinematic/models/native-descent/field.glb',sha256:'5031a03e50fad6584ab38c6b7aa707953630aa0da1cac3c5b101bfe0bfc5e56e',byte_length:8212900,start:7,duration:5,camera:'V12 locked camera',source_camera:'V12 camera.001',animation:'V12 locked camera'},
 {id:'clouds',kind:'glb',url:'/cinematic/models/native-descent/clouds.glb',sha256:'a3ab1b25ba91727e29b150db5bd860aefd0b80631bb843327fe5e2208bf15681',byte_length:1453272,start:0,duration:12,camera:'Continuous cloud passage camera',source_camera:'Camera',animation:'Cloud passage 1 bank'},
 {id:'field-world',kind:'hdr',url:'/cinematic/models/native-descent/field-world.hdr',sha256:'979e0552cbfb720d5341a3c167658568572dc9a86d3f694b812e212aa49dd0f6',byte_length:4677061},
]);

export const NATIVE_ASSET_TOTAL = NATIVE_ASSET_MANIFEST.length;
export const NATIVE_GLTF_TOTAL = NATIVE_ASSET_MANIFEST.filter(asset => asset.kind === 'glb').length;

export function manifestAsset(id) {
 const asset = NATIVE_ASSET_MANIFEST.find(candidate => candidate.id === id);
 if (!asset) throw new Error(`Unknown native asset: ${id}`);
 return asset;
}

export function assertAssetIdentity(asset, actual) {
 if (!actual || actual.sha256 !== asset.sha256 || actual.byte_length !== asset.byte_length) {
  throw new Error(`${asset.id} identity mismatch: expected ${asset.sha256}/${asset.byte_length}, got ${actual?.sha256 ?? 'missing'}/${actual?.byte_length ?? 'missing'}`);
 }
 return {id:asset.id,url:asset.url,kind:asset.kind,sha256:actual.sha256,byte_length:actual.byte_length};
}
