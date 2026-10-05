import { LocationMap } from './map.js?v=0.3.0';
import { LOCATION, loadElevation } from './elevation.js?v=0.3.0';
import { createMesh } from './mesh.js?v=0.3.0';
import { TerrainRenderer } from './renderer.js?v=0.3.0';
const message=document.querySelector('#message'), status=document.querySelector('#status');
const retry=document.querySelector('#retry'), state=document.querySelector('#data-state');
const slider=document.querySelector('#exaggeration'), factor=document.querySelector('#factor');
const modeSelect=document.querySelector('#view-mode'), strengthSlider=document.querySelector('#stereo-strength');
const modeNames={mono:'通常3D',parallel:'平行法',cross:'交差法',anaglyph:'赤シアン'};
const guides={
  mono:'1つの地形を自由に回転して眺めます。',
  parallel:'遠くを見るように視線を平行にし、左右の画像を重ねて中央に見える地形を眺めます。',
  cross:'視線を交差させ、右眼で左の画像、左眼で右の画像を見ると中央の地形が立体に見えます。',
  anaglyph:'赤シアン眼鏡が必要です。左眼に赤、右眼にシアンのレンズを合わせてください。'
};
let renderer, data, loading=false, selectedLocation={...LOCATION}, requestedLocation={...LOCATION};
const showTerrain=document.querySelector('#show-terrain');
const places={ishizuchi:{latitude:33.767,longitude:133.115},fuji:{latitude:35.3606,longitude:138.7274},aso:{latitude:32.884,longitude:131.104},daisetsu:{latitude:43.6636,longitude:142.8541},yakushima:{latitude:30.3361,longitude:130.5044}};
const coordinates=location=>`${location.latitude.toFixed(4)}° N / ${location.longitude.toFixed(4)}° E`;
const locationName=location=>{
  const name=Object.keys(places).find(key=>Math.abs(places[key].latitude-location.latitude)<.0001 && Math.abs(places[key].longitude-location.longitude)<.0001);
  return name ? document.querySelector(`#map-place option[value="${name}"]`).textContent+'周辺' : coordinates(location);
};
const map=new LocationMap(document.querySelector('#location-map'),LOCATION,location=>{
  selectedLocation=location; document.querySelector('#selected-location').textContent=coordinates(location);
  document.querySelector('#map-place').value=Object.keys(places).find(key=>Math.abs(places[key].latitude-location.latitude)<.0001 && Math.abs(places[key].longitude-location.longitude)<.0001)||'';
});
document.querySelector('#map-zoom-in').addEventListener('click',()=>map.setZoom(map.zoom+1));
document.querySelector('#map-zoom-out').addEventListener('click',()=>map.setZoom(map.zoom-1));
document.querySelector('#map-place').addEventListener('change',event=>{if(places[event.target.value]) map.setCenter(places[event.target.value]);});
showTerrain.addEventListener('click',()=>{
  if(loading) return;
  requestedLocation={...selectedLocation}; load();
  document.querySelector('#viewer').scrollIntoView({behavior:'auto',block:'start'});
});
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
}
modeSelect.addEventListener('change',updateStereo);
strengthSlider.addEventListener('input',updateStereo);
function showError(error, canRetry=true) {
  message.hidden=false; message.classList.add('error');
  status.textContent=`${error.message} ${canRetry ? '通信環境を確認して、もう一度お試しください。' : 'WebGL 対応ブラウザでページを再読み込みしてください。'}`;
  retry.hidden=!canRetry; state.textContent='表示できません';
}
async function load() {
  if (loading) return;
  loading=true; showTerrain.disabled=true; showTerrain.textContent='地形を読み込み中…'; retry.hidden=true; message.hidden=false; message.classList.remove('error');
  state.textContent='読み込み中'; status.textContent='標高データを取得しています…'; slider.disabled=true;
  try {
    if (!renderer) renderer=new TerrainRenderer(document.querySelector('#terrain'),showError);
    updateStereo();
    data=await loadElevation((done,total)=>status.textContent=`標高データを取得しています… ${done} / ${total}`,requestedLocation);
    renderer.setMesh(createMesh(data,Number(slider.value)));
    renderer.reset();
    const name=locationName(data.location);
    document.querySelector('#loaded-location').textContent=name;
    document.querySelector('#terrain-location').textContent=name;
    document.querySelector('#terrain').setAttribute('aria-label',`${name}の3D地形。矢印キーで回転、プラス・マイナスキーでズーム。`);
    document.querySelector('#extent').textContent=`${((data.size-1)*data.spacing).toFixed(1)} km四方`;
    state.textContent=`${data.tileCount}タイル取得済み`;
    message.hidden=true; slider.disabled=false;
  } catch (error) { showError(error, Boolean(renderer) && !renderer.lost); }
  finally { loading=false; showTerrain.disabled=false; showTerrain.textContent='ここを立体表示'; }
}
slider.addEventListener('input',()=>{
  const value=Number(slider.value);
  factor.textContent=`${value.toFixed(1)}×`;
  if (data && renderer && !renderer.lost) renderer.setMesh(createMesh(data,value));
});
document.querySelector('#reset').addEventListener('click',()=>renderer?.reset());
retry.addEventListener('click',load);
load();
