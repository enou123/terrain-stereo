import { loadMapTexture, textureKey } from './texture.js?v=0.26.4';
import { setupViewerUI } from './viewer-ui.js?v=0.26.4';
import { LocationMap } from './map.js?v=0.26.4';
import { LOCATION, loadElevation, terrainExtent } from './elevation.js?v=0.26.4';
import { createMesh } from './mesh.js?v=0.26.4';
import { TerrainRenderer } from './renderer.js?v=0.26.4';
import { createShareUrl, readSharedView } from './share.js?v=0.26.4';
import { flightTourPose } from './controls.js?v=0.26.4';
import { fetchGeologyLegend, fetchGeologyPoint } from './geology-legend.js?v=0.26.4';
import { setupAppTour } from './tour.js?v=0.26.4';
const viewerUI=setupViewerUI();
const sharedView=readSharedView(window.location.search);
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
sunAzimuth.value=String(sharedView?.sunAzimuth ?? (Number.isFinite(savedSun.azimuth)?Math.max(0,Math.min(359,savedSun.azimuth)):315));
sunAltitude.value=String(sharedView?.sunAltitude ?? (Number.isFinite(savedSun.altitude)?Math.max(5,Math.min(85,savedSun.altitude)):35));
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
let texturePromise=Promise.resolve(true);
async function updateTexture() {
  const request=++textureRequest;
  textureController?.abort();textureController=null;
  textureRetry.hidden=true;textureStatus.hidden=true;
  const surface=surfaceSelect.value, label=surface==='photo' ? '航空写真' : surface==='geology' ? '地質図' : '地図画像';
  if(!['map','photo','geology'].includes(surface) || !data || renderer?.lost) return true;
  const key=textureKey(data.location,surface);
  textureRetry.textContent=`${label}を再読み込み`;
  if(textureCache?.key===key) {
    if(activeTextureKey!==key) {renderer.setTexture(textureCache.canvas,surface);activeTextureKey=key;}
    updateSurface();return true;
  }
  const controller=new AbortController();textureController=controller;
  const timeout=setTimeout(()=>controller.abort(),25000);
  textureStatus.hidden=false;textureStatus.textContent=`${label}を読み込み中…`;
  try {
    const canvas=await loadMapTexture(data.location,controller.signal,surface);
    if(request!==textureRequest) return;
    textureCache={key,canvas};renderer.setTexture(canvas,surface);activeTextureKey=key;
    textureStatus.hidden=true;updateSurface();return true;
  } catch(error) {
    if(request!==textureRequest) return;
    textureStatus.hidden=false;textureStatus.textContent=(controller.signal.aborted ? `${label}の通信がタイムアウトしました。` : error.message)+' 地形は標高の色で表示しています。';
    textureRetry.hidden=false;
    return false;
  } finally {clearTimeout(timeout);if(request===textureRequest)textureController=null;}
}
textureRetry.addEventListener('click',()=>{texturePromise=updateTexture();});

const geologyLegendButton=document.querySelector('#geology-legend-open'), geologyLegendPanel=document.querySelector('#geology-legend-panel');
let geologyLegendKey='', geologyLegendController;
let geologyLegendPending, geologySelectionRequest=0, geologyPointController;
function setGeologyLegendOpen(open){
  geologyLegendPanel.hidden=!open;
  geologyLegendButton.setAttribute('aria-expanded',String(open));
  geologyLegendButton.querySelector('span').textContent=open?'−':'＋';
}
function geologyLegendRow(entry){
  const item=document.createElement('article');item.className='geology-legend-item';
  item.dataset.symbol=entry.symbol||'';item.dataset.value=entry.value;item.dataset.title=entry.title;
  const swatch=document.createElement('span');swatch.className='geology-swatch';swatch.style.backgroundColor=`#${entry.value}`;swatch.setAttribute('aria-hidden','true');
  const body=document.createElement('div'),title=document.createElement('strong'),age=document.createElement('span'),rock=document.createElement('small');
  title.textContent=entry.lithology_ja||entry.title;age.textContent=entry.formationAge_ja||'';rock.textContent=entry.group_ja?`大区分 · ${entry.group_ja}`:entry.title;
  body.append(title,age,rock);item.append(swatch,body);return item;
}
async function loadGeologyLegend(){
  if(!data)return;
  const location=data.location,extent=terrainExtent(location.latitude,location.zoom);
  const key=`${location.latitude}/${location.longitude}/${extent}`;
  if(geologyLegendKey===key){
    if(geologyLegendPanel.dataset.loaded==='true')return;
    if(geologyLegendPending)return geologyLegendPending;
  }
  geologyLegendController?.abort();
  const controller=new AbortController();geologyLegendController=controller;geologyLegendKey=key;
  const timeout=setTimeout(()=>controller.abort(),15000);
  const status=document.querySelector('#geology-legend-status'),list=document.querySelector('#geology-legend-list');
  status.hidden=false;status.textContent='表示範囲の凡例を読み込んでいます…';list.replaceChildren();geologyLegendPanel.dataset.loaded='false';
  const pending=(async()=>{
    try{
      const entries=await fetchGeologyLegend(location,extent,controller.signal);
      if(controller.signal.aborted)return;
      geologyLegendPanel.dataset.loaded='true';
      status.textContent=entries.length?`表示範囲で使われている地質区分 · ${entries.length}種類`:'この範囲の凡例情報は見つかりませんでした。';
      list.replaceChildren(...entries.map(geologyLegendRow));
    }catch(error){if(geologyLegendController===controller)status.textContent='凡例を読み込めませんでした。もう一度お試しください。';}
    finally{clearTimeout(timeout);}
  })();
  geologyLegendPending=pending;
  await pending;
  if(geologyLegendPending===pending)geologyLegendPending=null;
}
geologyLegendButton.addEventListener('click',()=>{
  const opening=geologyLegendPanel.hidden;setGeologyLegendOpen(opening);
  if(opening)loadGeologyLegend();
});
function clearGeologyHighlight(){
  for(const row of document.querySelectorAll('.geology-legend-item')){
    row.removeAttribute('aria-current');row.querySelector('.geology-selected-label')?.remove();
  }
}
function clearGeologySelection(){
  geologySelectionRequest++;geologyPointController?.abort();clearGeologyHighlight();
}
async function selectGeology(clientX,clientY){
  if(!data || loading || renderer?.lost || !renderer?.mesh || profile?.active || surfaceSelect.value!=='geology' || !textureStatus.hidden || !message.hidden)return;
  const request=++geologySelectionRequest,selectedData=data;
  geologyPointController?.abort();
  const {pickSurface}=await import('./profile.js?v=0.26.4');
  if(request!==geologySelectionRequest)return;
  const rect=renderer.canvas.getBoundingClientRect(),x=(clientX-rect.left)*renderer.canvas.width/rect.width,y=(clientY-rect.top)*renderer.canvas.height/rect.height;
  const camera=renderer.cameras(undefined,undefined,true).find(c=>x>=c.x&&x<c.x+c.width);
  const hit=camera&&pickSurface(x,y,camera,renderer.mesh);
  if(!hit)return;
  clearGeologyHighlight();
  const controller=new AbortController();geologyPointController=controller;
  const timeout=setTimeout(()=>controller.abort(),15000);
  viewerUI.setSettingsOpen(true);setGeologyLegendOpen(true);
  const status=document.querySelector('#geology-legend-status');
  try{
    const [entry]=await Promise.all([fetchGeologyPoint(selectedData.location,hit,controller.signal),loadGeologyLegend()]);
    if(request!==geologySelectionRequest || data!==selectedData || surfaceSelect.value!=='geology')return;
    clearGeologySelection();
    if(!entry){status.textContent='この地点の地質情報は見つかりませんでした。';return;}
    const list=document.querySelector('#geology-legend-list');
    let row=[...list.children].find(item=>entry.symbol?item.dataset.symbol===entry.symbol:item.dataset.value===entry.value&&item.dataset.title===entry.title);
    if(!row){row=geologyLegendRow(entry);list.append(row);}
    row.setAttribute('aria-current','true');
    const label=document.createElement('small');label.className='geology-selected-label';label.textContent='選択した地点';row.querySelector('div').prepend(label);
    status.textContent=`表示範囲で使われている地質区分 · ${list.children.length}種類。選択した地点の凡例を強調しています。`;
    row.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }catch(error){if(request===geologySelectionRequest)status.textContent='選択した地点の地質情報を取得できませんでした。もう一度タップしてください。';}
  finally{clearTimeout(timeout);}
}

contoursToggle.addEventListener('change',()=>renderer?.setContours(contoursToggle.checked));
const qualityNames={standard:'標準',high:'高精細',ultra:'最高精細'};
let requestedQuality=sharedView?.quality ?? 'standard', resetView=!sharedView, sharedQualityFallback=false;
const modeNames={mono:'通常3D',parallel:'平行法',cross:'交差法',anaglyph:'赤シアン'};
const guides={
  mono:'1つの地形を自由に回転して眺めます。',
  parallel:'遠くを見るように視線を平行にし、左右の画像を重ねて中央に見える地形を眺めます。',
  cross:'視線を交差させ、右眼で左の画像、左眼で右の画像を見ると中央の地形が立体に見えます。',
  anaglyph:'赤シアン眼鏡が必要です。左眼に赤、右眼にシアンのレンズを合わせてください。'
};
let profile, renderer, data, loading=false, flightMode=false, selectedLocation={...(sharedView?.location ?? LOCATION)}, requestedLocation={...(sharedView?.location ?? LOCATION)};
if(sharedView){
  qualitySelect.value=sharedView.quality; modeSelect.value=sharedView.mode; surfaceSelect.value=sharedView.surface;
  slider.value=String(sharedView.exaggeration); factor.textContent=`${sharedView.exaggeration.toFixed(1)}×`;
  strengthSlider.value=String(sharedView.strength); contoursToggle.checked=sharedView.contours;
}
const showTerrain=document.querySelector('#show-terrain');
const saveImage=document.querySelector('#save-image');
const places={ishizuchi:{latitude:33.767,longitude:133.115},fuji:{latitude:35.3606,longitude:138.7274},aso:{latitude:32.884,longitude:131.104},daisetsu:{latitude:43.6636,longitude:142.8541},yakushima:{latitude:30.3361,longitude:130.5044}};
const coordinates=location=>`${location.latitude.toFixed(4)}° N / ${location.longitude.toFixed(4)}° E`;
const locationName=location=>{
  const name=Object.keys(places).find(key=>Math.abs(places[key].latitude-location.latitude)<.0001 && Math.abs(places[key].longitude-location.longitude)<.0001);
  return name ? document.querySelector(`#map-place option[value="${name}"]`).textContent+'周辺' : coordinates(location);
};
const map=new LocationMap(document.querySelector('#location-map'),sharedView?.location ?? LOCATION,location=>{
  selectedLocation=location;
  document.querySelector('#selected-extent').textContent=`表示範囲：約${terrainExtent(location.latitude,location.mapZoom+1).toFixed(1)} km四方（地図の縮尺と連動）`;
  document.querySelector('#selected-location').textContent=coordinates(location);
  document.querySelector('#map-place').value=Object.keys(places).find(key=>Math.abs(places[key].latitude-location.latitude)<.0001 && Math.abs(places[key].longitude-location.longitude)<.0001)||'';
});
document.querySelector('#map-zoom-in').addEventListener('click',()=>map.setZoom(map.zoom+0.5));
document.querySelector('#map-zoom-out').addEventListener('click',()=>map.setZoom(map.zoom-0.5));
document.querySelector('#map-place').addEventListener('change',event=>{if(places[event.target.value]) map.setCenter(places[event.target.value]);});
showTerrain.addEventListener('click',()=>{
  if(loading) return;
  stopFlightTour();
  requestedLocation={...selectedLocation}; requestedQuality=qualitySelect.value; resetView=true; load();
  document.querySelector('#workspace').scrollIntoView({behavior:'auto',block:'start'});
});
function updateSurface() {
  const photo=surfaceSelect.value==='photo', mapped=surfaceSelect.value==='map', geology=surfaceSelect.value==='geology', shaded=surfaceSelect.value==='shading', anaglyph=modeSelect.value==='anaglyph';
  renderer?.setSurface(surfaceSelect.value);
  sunSettings.hidden=false;
  document.querySelector('#surface-guide').textContent=(photo ? '国土地理院の航空写真を地形に重ねます。撮影時期は地域で異なり、最新の状況とは限りません。' : mapped ? '国土地理院の地図を地形に重ねます。画像は選択時に取得し、地形の画質とは別の細かさです。' : geology ? '産総研・地質調査総合センターのシームレス地質図を重ねます。地質境界は概略で、地形の画質とは別に読み込みます。' : shaded ? '標高の色を使わず、斜面の向きによる明暗で尾根や谷を眺めます。' : '色は標高、陰影は斜面の向きを表します。')+(anaglyph ? '赤シアン表示では白黒の明るさで表します。' : '');
  document.querySelector('#elevation-legend').hidden=true;
  document.querySelector('#geology-legend').hidden=!geology;
  document.querySelector('#terrain').classList.toggle('geology-picking',geology);
}
surfaceSelect.addEventListener('change',()=>{clearGeologySelection();updateSurface();texturePromise=updateTexture();});
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
saveImage.addEventListener('click',async()=>{
  if(!renderer || !data || renderer.lost || !renderer.count)return;
  saveImage.disabled=true;
  try {
    // Render synchronously so WebGL's non-preserved drawing buffer is captured immediately.
    renderer.draw();
    const capture=document.createElement('canvas');capture.width=renderer.canvas.width;capture.height=renderer.canvas.height;
    const context=capture.getContext('2d');context.fillStyle='#14251e';context.fillRect(0,0,capture.width,capture.height);context.drawImage(renderer.canvas,0,0);
    const image=await new Promise((resolve,reject)=>capture.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG画像を作成できませんでした。')),'image/png'));
    const now=new Date(),stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),'-',String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0')].join('');
    const file=new File([image],`terrain-stereo-${stamp}.png`,{type:'image/png'});
    if(navigator.canShare?.({files:[file]}) && navigator.share) await navigator.share({files:[file],title:'terrain-stereo｜地形探訪の地形画像'});
    else {
      const url=URL.createObjectURL(image),link=document.createElement('a');link.href=url;link.download=file.name;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  } catch(error) {
    if(error.name!=='AbortError') {saveImage.textContent='失敗';saveImage.title=`画像を保存できませんでした。${error.message||''}`;setTimeout(()=>{saveImage.textContent='PNG';saveImage.title='立体視モードでは左右の画像をそのまま保存します'},3000);}
  } finally {saveImage.disabled=false;}
});
const shareView=document.querySelector('#share-view');
shareView.addEventListener('click',async()=>{
  if(!renderer || !data || renderer.lost || shareView.disabled)return;
  shareView.disabled=true;
  const original=shareView.textContent;
  try{
    const controls=renderer.controls;
    const url=createShareUrl(window.location.href,{
      location:data.location, camera:{yaw:controls.yaw,pitch:controls.pitch,distance:controls.distance,target:controls.target},
      exaggeration:Number(slider.value),mode:modeSelect.value,quality:data.quality,surface:surfaceSelect.value,
      strength:Number(strengthSlider.value),contours:contoursToggle.checked,
      sunAzimuth:Number(sunAzimuth.value),sunAltitude:Number(sunAltitude.value)
    });
    if(navigator.share) await navigator.share({title:'terrain-stereo｜地形探訪',url});
    else {
      let copied=false;
      try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);copied=true;}}catch{}
      if(!copied){
        const input=document.createElement('textarea');input.value=url;input.setAttribute('readonly','');
        input.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.append(input);input.select();
        copied=document.execCommand('copy');input.remove();
      }
      if(!copied) throw new Error('リンクをコピーできませんでした。');
    }
    shareView.textContent=navigator.share?'共有しました':'コピー済み';
    setTimeout(()=>{shareView.textContent=original;},2400);
  }catch(error){
    if(error.name!=='AbortError'){
      shareView.textContent='共有できません';shareView.title=error.message||'リンクの共有に失敗しました。';
      setTimeout(()=>{shareView.textContent=original;shareView.title='地形の場所と表示設定を共有';},3000);
    }
  }finally{shareView.disabled=false;}
});
qualitySelect.addEventListener('change',()=>{
  if (loading) return;
  requestedQuality=qualitySelect.value;
  requestedLocation={...(data?.location || requestedLocation)};
  resetView=false;
  load();
});
async function load() {
  if (loading) return false;
  let loaded=false;
  clearGeologySelection();geologyLegendController?.abort();geologyLegendKey='';geologyLegendPanel.dataset.loaded='false';setGeologyLegendOpen(false);
  stopFlightTour();
  loading=true; showTerrain.disabled=true; showTerrain.textContent='地形を読み込み中…'; retry.hidden=true; message.hidden=false; message.classList.remove('error');
  state.textContent='読み込み中'; status.textContent='標高データを取得しています…'; slider.disabled=true; qualitySelect.disabled=true;
  try {
    if (!renderer) {
      renderer=new TerrainRenderer(document.querySelector('#terrain'),showError);
      renderer.controls.setFlightMode(flightMode);
      if(sharedView){Object.assign(renderer.controls,{yaw:sharedView.camera.yaw,pitch:sharedView.camera.pitch,distance:sharedView.camera.distance,target:[...sharedView.camera.target]});}
    }
    if (!renderer.uintIndices) {
      for (const option of qualitySelect.options) option.disabled=option.value!=='standard';
      if(sharedView && requestedQuality!=='standard'){
        requestedQuality='standard';qualitySelect.value='standard';sharedQualityFallback=true;
      }
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
    updateSurface();texturePromise=updateTexture();
    if(resetView) renderer.reset();
    document.querySelector('#quality-guide').textContent=(sharedQualityFallback?'この端末では共有リンクの画質設定に対応していないため、標準画質で表示しています。 ':'')+`${qualityNames[data.quality]}：約${Math.round(data.spacing*1000)} m間隔で地形を表示。`+(data.sourceZoom===14 ? 'この縮尺では標高データの細かさの上限に達しています。' : '高い画質ほど通信量と描画の負荷が増えます。');
    if (data.fallbackTileCount) document.querySelector('#quality-guide').textContent += ' 一部の範囲は細かな標高データがないため、広域のデータで補完しています。補完部分の細かさは上記の間隔と異なります。';
    const name=locationName(data.location);
    document.querySelector('#loaded-location').textContent=name;
    document.querySelector('#terrain-location').textContent=name;
    document.querySelector('#terrain').setAttribute('aria-label',`${name}の3D地形。矢印キーで回転、プラス・マイナスキーでズーム。`);
    document.querySelector('#dem-scale').textContent=`DEM · ズーム${data.sourceZoom}`;
    document.querySelector('#extent').textContent=`${((data.size-1)*data.spacing).toFixed(1)} km四方`;
    state.textContent=`${data.tileCount}タイル取得済み`;
    message.hidden=true; slider.disabled=false;loaded=true;
  } catch (error) { showError(error, Boolean(renderer) && !renderer.lost); }
  finally { qualitySelect.disabled=false; slider.disabled=!data; loading=false; showTerrain.disabled=false; showTerrain.textContent='ここを立体表示'; }
  return loaded;
}
slider.addEventListener('input',()=>{
  const value=Number(slider.value);
  factor.textContent=`${value.toFixed(1)}×`;
  if (data && renderer && !renderer.lost) renderer.setMesh(createMesh(data,value));
});
document.querySelector('#reset').addEventListener('click',()=>{stopFlightTour();renderer?.reset();});
const flightToggle=document.querySelector('#flight-toggle'), flightPad=document.querySelector('#flight-pad');
const tourToggle=document.querySelector('#tour-toggle');
let tourFrame=null,tourStarted=0,tourBase=null,tourDuration=32000,tourPaused=false,tourPausedAt=null;
function stopFlightTour() {
  const wasTouring=tourFrame!==null;
  if(tourFrame!==null)cancelAnimationFrame(tourFrame);
  tourFrame=null;tourBase=null;tourToggle.setAttribute('aria-pressed','false');
  tourPaused=false;tourPausedAt=null;
  if(wasTouring&&flightMode)flightPad.hidden=false;
  tourToggle.setAttribute('aria-label','遊覧飛行を開始（約32秒）');tourToggle.textContent='遊覧飛行 · 約32秒';
}
function animateFlightTour(now) {
  if(!renderer||!tourBase)return;
  if(tourPaused){tourFrame=requestAnimationFrame(animateFlightTour);return;}
  if(tourPausedAt!==null){tourStarted+=now-tourPausedAt;tourPausedAt=null;}
  const progress=Math.min(1,(now-tourStarted)/tourDuration),pose=flightTourPose(tourBase,progress);
  Object.assign(renderer.controls,{yaw:pose.yaw,pitch:pose.pitch,distance:pose.distance,target:pose.target});
  renderer.requestDraw();
  if(progress>=1){stopFlightTour();return;}
  tourFrame=requestAnimationFrame(animateFlightTour);
}
function startFlightTour(duration=32000) {
  if(!renderer||!data||loading||renderer.lost)return false;
  if(!flightMode){flightMode=true;flightToggle.setAttribute('aria-pressed','true');flightToggle.textContent='■';flightToggle.setAttribute('aria-label','移動パッドを閉じる');flightPad.hidden=false;renderer.controls.setFlightMode(true);}
  const controls=renderer.controls;
  tourBase={yaw:controls.yaw,pitch:controls.pitch,distance:controls.distance,target:controls.target.slice()};
  tourDuration=duration;tourStarted=performance.now();tourToggle.setAttribute('aria-pressed','true');
  tourToggle.setAttribute('aria-label','遊覧飛行を停止');tourToggle.textContent='遊覧飛行中 · 停止';
  flightPad.hidden=true;
  document.querySelector('#terrain').focus({preventScroll:true});
  tourFrame=requestAnimationFrame(animateFlightTour);
  return true;
}
flightToggle.addEventListener('click',()=>{
  flightMode=!flightMode;flightToggle.setAttribute('aria-pressed',String(flightMode));
  flightToggle.textContent=flightMode?'■':'移動';flightToggle.setAttribute('aria-label',flightMode?'移動パッドを閉じる':'移動パッドを開く');flightToggle.title=flightMode?'移動パッドを閉じる':'移動パッドを開く';flightPad.hidden=!flightMode;
  renderer?.controls.setFlightMode(flightMode);
  if(!flightMode)stopFlightTour();
  if(flightMode)document.querySelector('#terrain').focus({preventScroll:true});
});
tourToggle.addEventListener('click',()=>tourFrame!==null?stopFlightTour():startFlightTour());
flightPad.querySelectorAll('[data-flight]').forEach(button=>button.addEventListener('click',()=>{stopFlightTour();renderer?.controls.fly(button.dataset.flight);}));
const terrainCanvas=document.querySelector('#terrain');
terrainCanvas.addEventListener('pointerdown',stopFlightTour);
const geologyPointers=new Set();let geologyTap;
terrainCanvas.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  geologyPointers.add(event.pointerId);
  geologyTap=geologyPointers.size===1&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
});
terrainCanvas.addEventListener('pointermove',event=>{if(geologyTap&&Math.hypot(event.clientX-geologyTap.x,event.clientY-geologyTap.y)>6)geologyTap=null;});
terrainCanvas.addEventListener('pointerup',event=>{
  const tap=geologyTap?.id===event.pointerId&&geologyPointers.size===1?geologyTap:null;
  geologyTap=null;geologyPointers.delete(event.pointerId);
  if(tap)selectGeology(event.clientX,event.clientY);
});
for(const type of ['pointercancel','lostpointercapture'])terrainCanvas.addEventListener(type,event=>{geologyTap=null;geologyPointers.delete(event.pointerId);});

terrainCanvas.addEventListener('wheel',stopFlightTour,{passive:true});
terrainCanvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','w','W','a','A','s','S','d','D','q','Q','e','E','r','R'].includes(event.key))stopFlightTour();});
retry.addEventListener('click',load);
load();

// Load section calculations/UI only when explicitly requested.
async function getProfileTool(){
  if(!data||loading||renderer?.lost)throw new Error('地形が読み込み中です。');
  if(!profile){const {SectionTool}=await import('./profile-ui.js?v=0.26.4');profile=new SectionTool(renderer,viewerUI);}
  profile.setData(data);return profile;
}
document.querySelector('#profile-start').addEventListener('click',async()=>{
  if(!data || loading || renderer?.lost)return;
  const button=document.querySelector('#profile-start');button.disabled=true;
  try {(await getProfileTool()).start();}
  catch {document.querySelector('#profile-status').textContent='断面図の準備に失敗しました。ページを再読み込みしてください。';}
  finally {button.disabled=false;}
});

let tourSnapshot=null;
const tourDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForTerrainReady(signal,timeout=180000){
  const started=performance.now();
  while(performance.now()-started<timeout){
    if(signal?.aborted)return false;
    if(!loading)return Boolean(data&&renderer&&!renderer.lost&&message.hidden);
    await tourDelay(100);
  }
  return false;
}
function applySelect(select,value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}
function tourAnimate(duration,update,api,signal){
  return new Promise((resolve,reject)=>{
    let elapsed=0,last=performance.now(),frame=0;
    const abort=()=>{cancelAnimationFrame(frame);resolve(false);};
    signal.addEventListener('abort',abort,{once:true});
    const tick=now=>{
      if(signal.aborted){signal.removeEventListener('abort',abort);resolve(false);return;}
      if(!api.isPaused())elapsed+=now-last;last=now;
      const t=Math.min(1,elapsed/duration);update(t);renderer?.requestDraw();
      if(t>=1){signal.removeEventListener('abort',abort);resolve(true);return;}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
  });
}
function animateRange(input,from,to,duration,api,signal){
  let lastDispatch=0;
  return tourAnimate(duration,t=>{
    if(performance.now()-lastDispatch<30&&t<1)return;
    lastDispatch=performance.now();input.value=String(from+(to-from)*t);input.dispatchEvent(new Event('input',{bubbles:true}));
  },api,signal);
}
function setTourCamera(pose){
  if(!renderer)return;Object.assign(renderer.controls,pose);renderer.controls.clamp();renderer.requestDraw();
}
function cameraPose(){
  const c=renderer.controls;return {yaw:c.yaw,pitch:c.pitch,distance:c.distance,target:c.target.slice()};
}
function updateTerrainLabels(){
  if(!data)return;
  const name=locationName(data.location);
  document.querySelector('#loaded-location').textContent=name;document.querySelector('#terrain-location').textContent=name;
  document.querySelector('#terrain').setAttribute('aria-label',`${name}の3D地形。矢印キーで回転、プラス・マイナスキーでズーム。`);
  document.querySelector('#dem-scale').textContent=`DEM · ズーム${data.sourceZoom}`;
  document.querySelector('#extent').textContent=`${((data.size-1)*data.spacing).toFixed(1)} km四方`;
}
async function captureTourState(){
  tourSnapshot={data,location:{...data.location},requestedLocation:{...requestedLocation},selectedLocation:{...selectedLocation},
    mapCenter:{...map.center},mapZoom:map.zoom,quality:data.quality,resetView,sharedQualityFallback,
    camera:cameraPose(),height:slider.value,mode:modeSelect.value,strength:strengthSlider.value,surface:surfaceSelect.value,
    contours:contoursToggle.checked,sunAzimuth:sunAzimuth.value,sunAltitude:sunAltitude.value,
    settingsOpen:!document.querySelector('#view-settings').hidden,flightMode,
    stateText:state.textContent,profile:profile?.captureState()||null,
    geologyOpen:!geologyLegendPanel.hidden,geologyPanelOpen:!geologyLegendPanel.hidden&&!document.querySelector('#geology-legend-panel').hidden,
    scrollX:window.scrollX,scrollY:window.scrollY};
}
function prepareTourTarget(selector){
  if(document.querySelector('#view-settings').contains(document.querySelector(selector)))viewerUI.setSettingsOpen(true);
}
function tourSetPaused(paused){
  if(paused===tourPaused)return;
  if(paused)tourPausedAt=performance.now();
  else if(tourPausedAt!==null){tourStarted+=performance.now()-tourPausedAt;tourPausedAt=null;}
  tourPaused=paused;
}
async function restoreTourState(){
  const saved=tourSnapshot;if(!saved)return;
  stopFlightTour();tourSetPaused(false);
  while(loading)await tourDelay(100);
  map.setView(saved.mapCenter,saved.mapZoom);
  selectedLocation={...saved.selectedLocation};requestedLocation={...saved.location};requestedQuality=saved.quality;
  qualitySelect.value=saved.quality;resetView=false;sharedQualityFallback=saved.sharedQualityFallback;
  const sameData=data===saved.data||JSON.stringify(data?.location)===JSON.stringify(saved.location)&&data?.quality===saved.quality;
  if(!sameData){
    const loaded=await load();
    if(!loaded){
      // The original DEM is already resident in memory; recover it without another network request.
      data=saved.data;profile?.setData(data);renderer.setMesh(createMesh(data,Number(saved.height)));
      message.hidden=true;message.classList.remove('error');state.textContent=saved.stateText;updateTerrainLabels();
    }
  }else{
    data=saved.data;message.hidden=true;message.classList.remove('error');state.textContent=saved.stateText;updateTerrainLabels();
  }
  document.querySelector('#map-place').value=Object.keys(places).find(key=>Math.abs(places[key].latitude-saved.mapCenter.latitude)<.0001&&Math.abs(places[key].longitude-saved.mapCenter.longitude)<.0001)||'';
  applySelect(modeSelect,saved.mode);strengthSlider.value=saved.strength;strengthSlider.dispatchEvent(new Event('input',{bubbles:true}));
  surfaceSelect.value=saved.surface;updateSurface();texturePromise=updateTexture();await texturePromise;
  slider.value=saved.height;slider.dispatchEvent(new Event('input',{bubbles:true}));
  contoursToggle.checked=saved.contours;contoursToggle.dispatchEvent(new Event('change',{bubbles:true}));
  sunAzimuth.value=saved.sunAzimuth;sunAltitude.value=saved.sunAltitude;updateSun();
  setTourCamera(saved.camera);
  if(profile){if(saved.profile)profile.restoreState(saved.profile,data);else profile.clear();}
  setGeologyLegendOpen(saved.geologyOpen);document.querySelector('#geology-legend-panel').hidden=!saved.geologyPanelOpen;
  if(saved.geologyPanelOpen)await loadGeologyLegend();
  if(flightMode!==saved.flightMode)flightToggle.click();
  flightPad.hidden=!saved.flightMode;viewerUI.setSettingsOpen(saved.settingsOpen);
  window.scrollTo(saved.scrollX,saved.scrollY);
  tourSnapshot=null;
}
async function demoTerrain(api,signal){
  applySelect(modeSelect,'mono');contoursToggle.checked=false;contoursToggle.dispatchEvent(new Event('change',{bubbles:true}));
  surfaceSelect.value='elevation';updateSurface();renderer.setSurface('elevation');
  const a=cameraPose(),duration=10500;
  const ok=await tourAnimate(duration,t=>{
    const angle=t*Math.PI*1.5;
    renderer.controls.yaw=a.yaw+angle;
    renderer.controls.pitch=Math.max(.25,Math.min(1.35,a.pitch+.12*Math.sin(t*Math.PI*2)));
    renderer.controls.distance=a.distance*(1-.26*Math.sin(Math.PI*t));
    renderer.controls.target=[a.target[0]+.22*Math.sin(angle),a.target[1]+.14*Math.sin(Math.PI*t),a.target[2]+.18*(1-Math.cos(angle))];
  },api,signal);
  if(!ok)throw new DOMException('Stopped','AbortError');
  return {message:'地形を回転し、ズームする実演を終えました。'};
}
async function demoHeight(api,signal){
  const start=Number(slider.value);
  if(!await animateRange(slider,start,3.0,3600,api,signal))throw new DOMException('Stopped','AbortError');
  if(!await animateRange(slider,3.0,start,2600,api,signal))throw new DOMException('Stopped','AbortError');
  return {message:'高さ強調を上げてから、開始時の倍率へ戻しました。'};
}
async function demoSun(api,signal){
  const start=Number(sunAzimuth.value),end=(start+180)%360;
  if(!await animateRange(sunAzimuth,start,end,3200,api,signal))throw new DOMException('Stopped','AbortError');
  if(!await animateRange(sunAzimuth,end,start,2600,api,signal))throw new DOMException('Stopped','AbortError');
  return {message:'太陽の方位を動かし、斜面の明暗が変わる様子を実演しました。'};
}
async function demoSurfaces(api,signal){
  const names=['elevation','shading','map','photo','geology'];let failed=[];
  for(const name of names){
    if(signal.aborted)throw new DOMException('Stopped','AbortError');
    applySelect(surfaceSelect,name);
    const ok=await texturePromise;
    if(!ok&&['map','photo','geology'].includes(name))failed.push(name);
    await api.wait(2400);
  }
  applySelect(surfaceSelect,'elevation');
  const restored=await texturePromise;
  if(!restored&&failed.length===0)failed.push('標高色');
  return failed.length?{message:`各表示を見比べ、標高の色に戻しました。一部の画像を取得できませんでした（${failed.join('・')}）。`}:{message:'各表示をゆっくり見比べ、標高の色に戻しました。'};
}
async function demoStereo(api,signal){
  for(const mode of ['mono','parallel','cross','anaglyph']){
    if(signal.aborted)throw new DOMException('Stopped','AbortError');
    applySelect(modeSelect,mode);await api.wait(1500);
  }
  return {message:'通常3D、平行法、交差法、赤シアンを切り替えました。'};
}
async function demoContours(api,signal){
  contoursToggle.checked=true;contoursToggle.dispatchEvent(new Event('change',{bubbles:true}));
  const a=cameraPose();
  await tourAnimate(5200,t=>{renderer.controls.yaw=a.yaw+t*.9;renderer.controls.distance=a.distance*(1-.1*Math.sin(Math.PI*t));},api,signal);
  if(signal.aborted)throw new DOMException('Stopped','AbortError');
  return {message:'100 m間隔の等高線を重ね、別方向からも見ました。'};
}
async function demoProfile(api,signal){
  applySelect(modeSelect,'mono');viewerUI.setSettingsOpen(true);
  const tool=await getProfileTool();tool.clear();tool.start();api.focus('#terrain');await api.wait(700);
  const {projectPoint,gridPosition,gridSample}=await import('./profile.js?v=0.26.4');
  if(signal.aborted)throw new DOMException('Stopped','AbortError');
  renderer.draw();const rect=terrainCanvas.getBoundingClientRect(),camera=renderer.cameras(undefined,undefined,true)[0];
  const candidates=[];
  for(let row=0;row<=14;row++)for(let col=0;col<=14;col++){
    const u=.15+col*.05,v=.15+row*.05;if(!Number.isFinite(gridSample(data,u,v)))continue;
    const p=projectPoint(gridPosition(renderer.mesh,{u,v}),camera);
    if(p.w<=0||p.z<-1||p.z>1||p.x<rect.width*.08||p.x>rect.width*.92||p.y<rect.height*.08||p.y>rect.height*.85)continue;
    candidates.push({u,v,x:rect.left+p.x*rect.width/terrainCanvas.width,y:rect.top+p.y*rect.height/terrainCanvas.height,rank:(p.x-rect.width/2)**2+(p.y-rect.height/2)**2});
  }
  candidates.sort((a,b)=>a.rank-b.rank);
  const pick=point=>{const count=tool.points.length;tool.select(point.x,point.y);return tool.points.length>count;};
  const first=candidates.find(pick);
  if(!first)throw new Error('断面図の始点を選べませんでした。');
  api.focus('#terrain');await api.wait(700);
  let second=null;
  for(const point of candidates){if(Math.hypot(point.u-first.u,point.v-first.v)<.3)continue;if(pick(point)){second=point;break;}}
  if(!second)throw new Error('断面図の終点を選べませんでした。');
  api.focus('#profile-chart');await api.wait(900);
  return {message:'地形上の2点を選び、実標高の断面図を作りました。'};
}
async function demoLocation(api,signal){
  viewerUI.setSettingsOpen(true);map.setCenter(places.fuji);
  document.querySelector('#map-place').value='fuji';api.focus('#map-place');
  await api.wait(600);api.focus('#show-terrain');await api.wait(400);showTerrain.click();api.focus('#terrain');
  const ready=await waitForTerrainReady(signal);
  if(!ready)throw new Error(message.hidden?'富士山の地形を読み込めませんでした。':'地形データの読み込みに失敗しました。');
  return {message:'富士山周辺の地形へ移動しました。別の山も地図や一覧から選べます。'};
}
async function demoFlight(api,signal){
  if(!startFlightTour(14000))throw new Error('遊覧飛行を開始できませんでした。');
  await api.wait(14500);if(signal.aborted)throw new DOMException('Stopped','AbortError');
  return {message:'山の上を一周する遊覧飛行を終えました。'};
}
const appTour=setupAppTour({
  waitForReady:()=>waitForTerrainReady(),retry:async()=>{const ok=await load();return ok||await waitForTerrainReady();},
  capture:captureTourState,restore:restoreTourState,
  prepare:prepareTourTarget,setPaused:tourSetPaused,
  stopDemo:()=>{stopFlightTour();flightPad.hidden=true;textureRequest++;textureController?.abort();textureController=null;textureStatus.hidden=true;textureRetry.hidden=true;if(profile?.active||profile?.points.length)profile.clear();},
  demoTerrain,demoHeight,demoSun,demoSurfaces,demoStereo,demoContours,demoProfile,demoLocation,demoFlight,
});
