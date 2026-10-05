import { loadElevation } from './elevation.js';
import { createMesh } from './mesh.js';
import { TerrainRenderer } from './renderer.js';
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
let renderer, data, loading=false;
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
  loading=true; retry.hidden=true; message.hidden=false; message.classList.remove('error');
  state.textContent='読み込み中'; status.textContent='標高データを取得しています…'; slider.disabled=true;
  try {
    if (!renderer) renderer=new TerrainRenderer(document.querySelector('#terrain'),showError);
    updateStereo();
    data=await loadElevation((done,total)=>status.textContent=`標高データを取得しています… ${done} / ${total}`);
    renderer.setMesh(createMesh(data,Number(slider.value)));
    document.querySelector('#extent').textContent=`${((data.size-1)*data.spacing).toFixed(1)} km四方`;
    state.textContent=`${data.tileCount}タイル取得済み`;
    message.hidden=true; slider.disabled=false;
  } catch (error) { showError(error, Boolean(renderer) && !renderer.lost); }
  finally { loading=false; }
}
slider.addEventListener('input',()=>{
  const value=Number(slider.value);
  factor.textContent=`${value.toFixed(1)}×`;
  if (data && renderer && !renderer.lost) renderer.setMesh(createMesh(data,value));
});
document.querySelector('#reset').addEventListener('click',()=>renderer?.reset());
retry.addEventListener('click',load);
load();
