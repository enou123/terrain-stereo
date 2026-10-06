import { loadMapTexture, textureKey } from './texture.js?v=0.13.0';
import { setupViewerUI } from './viewer-ui.js?v=0.13.0';
import { LocationMap } from './map.js?v=0.13.0';
import { LOCATION, loadElevation, terrainExtent } from './elevation.js?v=0.13.0';
import { createMesh } from './mesh.js?v=0.13.0';
import { TerrainRenderer } from './renderer.js?v=0.13.0';
const viewerUI=setupViewerUI();
const message=document.querySelector('#message'), status=document.querySelector('#status');
const retry=document.querySelector('#retry'), state=document.querySelector('#data-state');
const slider=document.querySelector('#exaggeration'), factor=document.querySelector('#factor');
const modeSelect=document.querySelector('#view-mode'), strengthSlider=document.querySelector('#stereo-strength');
const qualitySelect=document.querySelector('#quality');
const contoursToggle=document.querySelector('#contours');
const sunSettings=document.querySelector('#sun-settings'), sunAzimuth=document.querySelector('#sun-azimuth'), sunAltitude=document.querySelector('#sun-altitude');
const surfaceSelect=document.querySelector('#surface');
const sunAzimuthValue=document.querySelector('#sun-azimuth-value'), sunAltitudeValue=document.querySelector('#sun-altitude-value');
const savedSun=(()=>{try{return JSON.parse(localStorage.getItem('terrain-stereo-sun')||'{}')}catch{return {}}})();
sunAzimuth.value=String(Number.isFinite(savedSun.azimuth)?Math.max(0,Math.min(359,savedSun.azimuth)):315);
sunAltitude.value=String(Number.isFinite(savedSun.altitude)?Math.max(5,Math.min(85,savedSun.altitude)):35);
function updateSun(){
  const azimuth=Number(sunAzimuth.value), altitude=Number(sunAltitude.value);
  const directions=['北','北東','東','南東','南','南西','西','北西'];
  sunAzimuthValue.textContent=directions[Math.round(azimuth/45)%8];sunAltitudeValue.textContent=`${altitude}°`;
  renderer?.setSun(azimuth,altitude);
  try{localStorage.setItem('terrain-stereo-sun',JSON.stringify({azimuth,altitude}))}catch{}
}
sunAzimuth.addEventListener('input',updateSun);sunAltitude.addEventListener('input',updateSun);
const textureStatus=document.querySelector('#texture-status'), textureRetry=document.querySelector('#texture-retry');
let textureCache=null, textureController=null, textureRequest=0, activeTextureKey=null;
async function updateTexture() {
  const request=++textureRequest;
  textureController?.abort();textureController=null;
  textureRetry.hidden=true;textureStatus.hidden=true;
  const surface=surfaceSelect.value, label=surface==='photo' ? '航空写真' : '地図画像';
  if(!['map','photo'].includes(surface) || !data || renderer?.lost) return;
  const key=textureKey(data.location,surface);
  textureRetry.textContent=`${label}を再読み込み`;
  if(textureCache?.key===key) {
    if(activeTextureKey!==key) {renderer.setTexture(textureCache.canvas,surface);activeTextureKey=key;}
    updateSurface();return;
  }
  const controller=new AbortController();textureController=controller;
  const timeout=setTimeout(()=>controller.abort(),25000);
  textureStatus.hidden=false;textureStatus.textContent=`${label}を読み込み中…`;
  try {
    const canvas=await loadMapTexture(data.location,controller.signal,surface);
    if(request!==textureRequest) return;
    textureCache={key,canvas};renderer.setTexture(canvas,surface);activeTextureKey=key;
    textureStatus.hidden=true;updateSurface();
  } catch(error) {
    if(request!==textureRequest) return;
    textureStatus.hidden=false;textureStatus.textContent=(controller.signal.aborted ? `${label}の通信がタイムアウトしました。` : error.message)+' 地形は標高の色で表示しています。';
    textureRetry.hidden=false;
  } finally {clearTimeout(timeout);if(request===textureRequest)textureController=null;}
}
textureRetry.addEventListener('click',updateTexture);
contoursToggle.addEventListener('change',()=>renderer?.setContours(contoursToggle.checked));
const qualityNames={standard:'標準',high:'高精細',ultra:'最高精細'};
let requestedQuality='standard', resetView=true;
const modeNames={mono:'通常3D',parallel:'平行法',cross:'交差法',anaglyph:'赤シアン'};
const guides={
  mono:'1つの地形を自由に回転して眺めます。',
  parallel:'遠くを見るように視線を平行にし、左右の画像を重ねて中央に見える地形を眺めます。',
  cross:'視線を交差させ、右眼で左の画像、左眼で右の画像を見ると中央の地形が立体に見えます。',
  anaglyph:'赤シアン眼鏡が必要です。左眼に赤、右眼にシアンのレンズを合わせてください。'
};
let profile, renderer, data, loading=false, selectedLocation={...LOCATION}, requestedLocation={...LOCATION};
const showTerrain=document.querySelector('#show-terrain');
const places={ishizuchi:{latitude:33.767,longitude:133.115},fuji:{latitude:35.3606,longitude:138.7274},aso:{latitude:32.884,longitude:131.104},daisetsu:{latitude:43.6636,longitude:142.8541},yakushima:{latitude:30.3361,longitude:130.5044}};
const coordinates=location=>`${location.latitude.toFixed(4)}° N / ${location.longitude.toFixed(4)}° E`;
const locationName=location=>{
  const name=Object.keys(places).find(key=>Math.abs(places[key].latitude-location.latitude)<.0001 && Math.abs(places[key].longitude-location.longitude)<.0001);
  return name ? document.querySelector(`#map-place option[value="${name}"]`).textContent+'周辺' : coordinates(location);
};
const map=new LocationMap(document.querySelector('#location-map'),LOCATION,location=>{
  selectedLocation=location;
  document.querySelector('#selected-extent').textContent=`表示範囲：約${terrainExtent(location.latitude,location.zoom).toFixed(1)} km四方（地図の縮尺と連動）`;
  document.querySelector('#selected-location').textContent=coordinates(location);
  document.querySelector('#map-place').value=Object.keys(places).find(key=>Math.abs(places[key].latitude-location.latitude)<.0001 && Math.abs(places[key].longitude-location.longitude)<.0001)||'';
});
document.querySelector('#map-zoom-in').addEventListener('click',()=>map.setZoom(map.zoom+1));
document.querySelector('#map-zoom-out').addEventListener('click',()=>map.setZoom(map.zoom-1));
document.querySelector('#map-place').addEventListener('change',event=>{if(places[event.target.value]) map.setCenter(places[event.target.value]);});
showTerrain.addEventListener('click',()=>{
  if(loading) return;
  requestedLocation={...selectedLocation}; requestedQuality=qualitySelect.value; resetView=true; load();
  document.querySelector('#workspace').scrollIntoView({behavior:'auto',block:'start'});
});
function updateSurface() {
  const photo=surfaceSelect.value==='photo', mapped=surfaceSelect.value==='map', shaded=surfaceSelect.value==='shading', anaglyph=modeSelect.value==='anaglyph';
  renderer?.setSurface(surfaceSelect.value);
  sunSettings.hidden=false;
  document.querySelector('#surface-guide').textContent=(photo ? '国土地理院の航空写真を地形に重ねます。撮影時期は地域で異なり、最新の状況とは限りません。' : mapped ? '国土地理院の地図を地形に重ねます。画像は選択時に取得し、地形の画質とは別の細かさです。' : shaded ? '標高の色を使わず、斜面の向きによる明暗で尾根や谷を眺めます。' : '色は標高、陰影は斜面の向きを表します。')+(anaglyph ? '赤シアン表示では白黒の明るさで表します。' : '');
  document.querySelector('#elevation-legend').hidden=photo || mapped || shaded || anaglyph;
}
surfaceSelect.addEventListener('change',()=>{updateSurface();updateTexture();});
function updateStereo() {
  const mode=modeSelect.value, strength=Number(strengthSlider.value);
  renderer?.setStereo(mode,strength);
  document.querySelector('#mode-label').textContent=`● ${modeNames[mode]}`;
  document.querySelector('#stereo-guide').textContent=guides[mode];
  document.querySelector('#stereo-settings').hidden=mode==='mono';
  document.querySelector('#stereo-factor').textContent=strength.toFixed(1);
  document.querySelector('#eye-labels').hidden=mode!=='parallel' && mode!=='cross';
  document.querySelector('#left-eye').textContent=mode==='cross' ? '右眼用' : '左眼用';
  document.querySelector('#right-eye').textContent=mode==='cross' ? '左眼用' : '右眼用';
  updateSurface();
}
modeSelect.addEventListener('change',updateStereo);
strengthSlider.addEventListener('input',updateStereo);
function showError(error, canRetry=true) {
  message.hidden=false; message.classList.add('error');
  status.textContent=`${error.message} ${canRetry ? '通信環境を確認して、もう一度お試しください。' : 'WebGL 対応ブラウザでページを再読み込みしてください。'}`;
  retry.hidden=!canRetry; state.textContent='表示できません';
}
qualitySelect.addEventListener('change',()=>{
  if (loading) return;
  requestedQuality=qualitySelect.value;
  requestedLocation={...(data?.location || requestedLocation)};
  resetView=false;
  load();
});
async function load() {
  if (loading) return;
  loading=true; showTerrain.disabled=true; showTerrain.textContent='地形を読み込み中…'; retry.hidden=true; message.hidden=false; message.classList.remove('error');
  state.textContent='読み込み中'; status.textContent='標高データを取得しています…'; slider.disabled=true; qualitySelect.disabled=true;
  try {
    if (!renderer) renderer=new TerrainRenderer(document.querySelector('#terrain'),showError);
    if (!renderer.uintIndices) {
      for (const option of qualitySelect.options) option.disabled=option.value!=='standard';
    }
    if (!renderer.contoursSupported) {
      contoursToggle.checked=false;
      contoursToggle.disabled=true;
      document.querySelector('#contours-guide').textContent='この端末は等高線の描画に対応していません。3D地形は引き続き操作できます。';
    }
    renderer.setContours(contoursToggle.checked);
    updateSun();
    updateStereo();
    const nextData=await loadElevation((done,total)=>status.textContent=`標高データを取得しています… ${done} / ${total}`,requestedLocation,requestedQuality);
    renderer.setMesh(createMesh(nextData,Number(slider.value)));
    const newKey=textureKey(nextData.location,renderer.textureSurface || 'map');
    if(activeTextureKey!==newKey) {renderer.setTexture(null);activeTextureKey=null;}
    data=nextData;
    profile?.setData(data);
    updateSurface();updateTexture();
    if(resetView) renderer.reset();
    document.querySelector('#quality-guide').textContent=`${qualityNames[data.quality]}：約${Math.round(data.spacing*1000)} m間隔で地形を表示。`+(data.sourceZoom===14 ? 'この縮尺では標高データの細かさの上限に達しています。' : '高い画質ほど通信量と描画の負荷が増えます。');
    if (data.fallbackTileCount) document.querySelector('#quality-guide').textContent += ' 一部の範囲は細かな標高データがないため、広域のデータで補完しています。補完部分の細かさは上記の間隔と異なります。';
    const name=locationName(data.location);
    document.querySelector('#loaded-location').textContent=name;
    document.querySelector('#terrain-location').textContent=name;
    document.querySelector('#terrain').setAttribute('aria-label',`${name}の3D地形。矢印キーで回転、プラス・マイナスキーでズーム。`);
    document.querySelector('#dem-scale').textContent=`DEM · ズーム${data.sourceZoom}`;
    document.querySelector('#extent').textContent=`${((data.size-1)*data.spacing).toFixed(1)} km四方`;
    state.textContent=`${data.tileCount}タイル取得済み`;
    message.hidden=true; slider.disabled=false;
  } catch (error) { showError(error, Boolean(renderer) && !renderer.lost); }
  finally { qualitySelect.disabled=false; slider.disabled=!data; loading=false; showTerrain.disabled=false; showTerrain.textContent='ここを立体表示'; }
}
slider.addEventListener('input',()=>{
  const value=Number(slider.value);
  factor.textContent=`${value.toFixed(1)}×`;
  if (data && renderer && !renderer.lost) renderer.setMesh(createMesh(data,value));
});
document.querySelector('#reset').addEventListener('click',()=>renderer?.reset());
retry.addEventListener('click',load);
load();

// Load section calculations/UI only when explicitly requested.
document.querySelector('#profile-start').addEventListener('click',async()=>{
  if(!data || loading || renderer?.lost)return;
  const button=document.querySelector('#profile-start');button.disabled=true;
  try {
    if(!profile) {
      const {SectionTool}=await import('./profile-ui.js?v=0.13.0');
      profile=new SectionTool(renderer,viewerUI);profile.setData(data);
    }
    profile.start();
  } catch {document.querySelector('#profile-status').textContent='断面図の準備に失敗しました。ページを再読み込みしてください。';}
  finally {button.disabled=false;}
});
